"""Study with Ahmad server: serves the planner and stores each student's data in Postgres (Neon).

Run locally with:  uv run website   →  http://127.0.0.1:8000
On Vercel, app.py at the project root exposes this `app`, and files in public/ come from the CDN.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
ON_VERCEL = bool(os.environ.get("VERCEL"))
MAX_STATE_BYTES = 2_000_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,30}$")
TOKEN_DAYS = 30            # stay signed in for 30 days
MAX_USER_FAILS = 3         # wrong passwords allowed per account...
MAX_IP_FAILS = 10          # ...and per internet connection
LOCK_MINUTES = 15          # before trying again

# Only these files from public/ are served — never .env, .git or source code.
# (On Vercel the CDN serves public/ directly; this is the local / fallback path.)
PUBLIC_FILES = {
    "": ("index.html", "text/html"),
    "index.html": ("index.html", "text/html"),
    "study.css": ("study.css", "text/css"),
    "study.js": ("study.js", "text/javascript"),
    "syllabus.js": ("syllabus.js", "text/javascript"),
    "sw.js": ("sw.js", "text/javascript"),
    "manifest.webmanifest": ("manifest.webmanifest", "application/manifest+json"),
    "icons/icon-192.png": ("icons/icon-192.png", "image/png"),
    "icons/icon-512.png": ("icons/icon-512.png", "image/png"),
    "icons/icon-maskable-512.png": ("icons/icon-maskable-512.png", "image/png"),
    "icons/apple-touch-icon.png": ("icons/apple-touch-icon.png", "image/png"),
    "downloads/StudyWithAhmad.exe": ("downloads/StudyWithAhmad.exe", "application/vnd.microsoft.portable-executable"),
    "downloads/study-with-ahmad.apk": ("downloads/study-with-ahmad.apk", "application/vnd.android.package-archive"),
}

# Lets the Android app (public/downloads/study-with-ahmad.apk) open this site full-screen, without a URL bar.
# The fingerprint belongs to the signing key kept outside git in android-signing/.
ASSETLINKS = [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
        "namespace": "android_app",
        "package_name": "app.vercel.studywithahmad",
        "sha256_cert_fingerprints": [
            "3A:6E:3C:5A:5E:2F:2C:8F:D2:B9:44:4C:A5:6C:27:CF:EF:03:F1:4F:BE:89:60:76:B0:1F:E8:78:03:36:5F:E2"
        ],
    },
}]


def clean_url(value: str) -> str:
    """Pull the postgresql://... part out of whatever was pasted (quotes, "DATABASE_URL=", Neon's psql '...')."""
    match = re.search(r"postgres(?:ql)?://[^\s'\"]+", value)
    if not match:
        raise RuntimeError("DATABASE_URL is set but has no postgresql://... link in it")
    return match.group(0)


def database_url() -> str:
    """DATABASE_URL from the environment, or from .env (keys like "data base url" are accepted)."""
    if os.environ.get("DATABASE_URL", "").strip():
        return clean_url(os.environ["DATABASE_URL"])
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and re.sub(r"[^a-z]", "", key.lower()) == "databaseurl":
                return clean_url(value)
    raise RuntimeError("DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables (or in .env)")


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS planner_data (
    user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_failures (
    id           BIGSERIAL PRIMARY KEY,
    username     TEXT NOT NULL,
    ip           TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_user_idx ON login_failures (username, attempted_at);
CREATE INDEX IF NOT EXISTS login_failures_ip_idx ON login_failures (ip, attempted_at);
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     DATE NOT NULL,
    count   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
"""

pool: ConnectionPool | None = None
startup_error = ""


def db():
    """A pooled connection, or a readable 503 if the database never came up (instead of crashing the app)."""
    if pool is None:
        raise HTTPException(503, f"Database not connected: {startup_error}")
    return pool.connection()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global pool, startup_error
    try:
        # check_connection replaces connections that went stale while a serverless instance was idle
        pool = ConnectionPool(database_url(), min_size=1, max_size=5, open=True, timeout=15,
                              check=ConnectionPool.check_connection)
        with db() as conn:
            conn.execute(SCHEMA)
    except Exception as exc:
        if pool is not None:
            pool.close()
            pool = None
        # never echo the password back
        startup_error = re.sub(r"://[^@\s]*@", "://***@", f"{type(exc).__name__}: {exc}")
        print("Database startup failed:", startup_error)
    yield
    if pool is not None:
        pool.close()


app = FastAPI(title="Study with Ahmad", lifespan=lifespan)


# ---------- Passwords & tokens ----------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    _, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO auth_tokens (token_hash, user_id) VALUES (%s, %s)", (token_hash(token), user_id))
    return token


def current_user(authorization: str = Header(default="")) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Please sign in")
    with db() as conn:
        row = conn.execute(
            "SELECT u.id, u.username FROM auth_tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = %s AND t.created_at > now() - make_interval(days => %s)",
            (token_hash(token), TOKEN_DAYS),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Your session has expired — please sign in again")
    return {"id": row[0], "username": row[1], "token": token}


# ---------- API ----------
class Credentials(BaseModel):
    username: str
    password: str


class StateIn(BaseModel):
    data: dict


@app.get("/api/health")
def health():
    with db() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}


@app.post("/api/signup")
def signup(body: Credentials):
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3–30 letters, numbers, dots or underscores")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE lower(username) = lower(%s)", (username,)).fetchone()
        if exists:
            raise HTTPException(409, "That username is taken — try another")
        user_id = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id",
            (username, hash_password(body.password)),
        ).fetchone()[0]
        token = new_token(conn, user_id)
    return {"token": token, "username": username}


def client_ip(request: Request) -> str:
    if ON_VERCEL:
        # Vercel's edge sets these headers itself, so visitors can't fake them
        ip = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0]
        if ip.strip():
            return ip.strip()
    # Locally, uvicorn fills request.client (from X-Forwarded-For only when the proxy is trusted)
    return request.client.host if request.client else "unknown"


def minutes_word(seconds: float) -> str:
    m = max(1, round(seconds / 60))
    return f"{m} minute{'s' if m != 1 else ''}"


@app.post("/api/login")
def login(body: Credentials, request: Request):
    username, ip = body.username.strip().lower(), client_ip(request)
    with db() as conn:
        conn.execute("DELETE FROM login_failures WHERE attempted_at < now() - interval '1 day'")
        user_fails, user_wait = conn.execute(
            """SELECT count(*), EXTRACT(EPOCH FROM min(attempted_at) + make_interval(mins => %s) - now())
               FROM login_failures WHERE username = %s AND attempted_at > now() - make_interval(mins => %s)""",
            (LOCK_MINUTES, username, LOCK_MINUTES),
        ).fetchone()
        ip_fails, ip_wait = conn.execute(
            """SELECT count(*), EXTRACT(EPOCH FROM min(attempted_at) + make_interval(mins => %s) - now())
               FROM login_failures WHERE ip = %s AND attempted_at > now() - make_interval(mins => %s)""",
            (LOCK_MINUTES, ip, LOCK_MINUTES),
        ).fetchone()
        if user_fails >= MAX_USER_FAILS or ip_fails >= MAX_IP_FAILS:
            wait = float(user_wait if user_fails >= MAX_USER_FAILS else ip_wait)
            raise HTTPException(429, f"Too many wrong attempts. Please try again in {minutes_word(wait)}.")

        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE lower(username) = %s", (username,)
        ).fetchone()
        if not row or not check_password(body.password, row[2]):
            conn.execute("INSERT INTO login_failures (username, ip) VALUES (%s, %s)", (username, ip))
            conn.commit()  # keep the failure even though we raise below
            left = MAX_USER_FAILS - (user_fails + 1)
            if left <= 0:
                raise HTTPException(429, f"Wrong password 3 times — this account is locked for {LOCK_MINUTES} minutes.")
            raise HTTPException(401, f"Wrong username or password — {left} {'try' if left == 1 else 'tries'} left.")

        conn.execute("DELETE FROM login_failures WHERE username = %s", (username,))
        token = new_token(conn, row[0])
    return {"token": token, "username": row[1]}


@app.post("/api/logout")
def logout(user: dict = Depends(current_user)):
    with db() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token_hash = %s", (token_hash(user["token"]),))
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return {"username": user["username"]}


@app.get("/api/state")
def get_state(user: dict = Depends(current_user)):
    with db() as conn:
        row = conn.execute("SELECT data, updated_at FROM planner_data WHERE user_id = %s", (user["id"],)).fetchone()
    if not row:
        return {"data": None, "updated_at": None}
    return {"data": row[0], "updated_at": row[1].isoformat()}


@app.put("/api/state")
def put_state(body: StateIn, user: dict = Depends(current_user)):
    if len(json.dumps(body.data)) > MAX_STATE_BYTES:
        raise HTTPException(413, "Planner data is too large")
    with db() as conn:
        updated = conn.execute(
            """INSERT INTO planner_data (user_id, data, updated_at) VALUES (%s, %s, now())
               ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
               RETURNING updated_at""",
            (user["id"], Jsonb(body.data)),
        ).fetchone()[0]
    return {"updated_at": updated.isoformat()}


# ---------- AI Study Buddy (Google Gemini) ----------
AI_DAILY_LIMIT = 40        # questions per student per day, so one key can serve many students
GEMINI_BASE = os.environ.get("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta")
_gemini_models: list[str] = []

BUDDY_PROMPT = """You are "Study Buddy", a friendly tutor inside Study with Ahmad, a study planner for Punjab Board
(PTB / BISE) Matric and Intermediate students in Pakistan. The student is in {level}{subject}.

- Explain simply, the way a good Pakistani teacher would, using the PTB syllabus and board-exam style.
- For numericals: list the given values, the formula, then solve step by step with units, and box the final answer as **Answer: ...**.
- For "past paper" requests, write board-style MCQs (with answers) and short/long questions on the topic. Say they are practice
  questions in the board's style; never claim they appeared in a specific year's paper.
- Write maths as plain text (v = u + at, x^2, sqrt(2)); never use LaTeX.
- Keep answers short and scannable: short paragraphs, bullet points, **bold** for key terms. Stay under 300 words unless asked for more.
- Reply in {language}.
- Only help with studies. Politely steer anything else back to studying. Never help with cheating during a live exam."""
LANGUAGES = {"en": "English", "roman": "Roman Urdu (Urdu written in English letters)", "ur": "Urdu script"}


def gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
    if not key.strip():
        raise HTTPException(503, "Study Buddy isn't switched on yet (the site owner needs to add GEMINI_API_KEY).")
    return key.strip()


def gemini_request(path: str, payload: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{GEMINI_BASE}/{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "x-goog-api-key": gemini_key()},
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as err:
        detail = ""
        try:
            detail = json.loads(err.read()).get("error", {}).get("message", "")
        except Exception:
            pass
        raise GeminiError(err.code, detail) from None
    except (urllib.error.URLError, TimeoutError) as err:
        print(f"Gemini network error on {path.split('?')[0]}: {err!r}")
        raise HTTPException(504, f"Study Buddy couldn't reach Google ({type(err).__name__}). Please try again.") from None


class GeminiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def gemini_models() -> list[str]:
    """Models to try in order: GEMINI_MODEL if set, else the newest stable "flash" models this key can use,
    with a flash-lite as a backup for when Google says the bigger ones are overloaded (looked up once)."""
    global _gemini_models
    if os.environ.get("GEMINI_MODEL"):
        return [os.environ["GEMINI_MODEL"]]
    if not _gemini_models:
        names = [
            m["name"].removeprefix("models/")
            for m in gemini_request("models?pageSize=200").get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        ]
        # e.g. "gemini-2.5-flash" sorts above "gemini-2.0-flash"; shorter (stable) names win ties
        newest = lambda pool: sorted(pool, key=lambda n: ([float(x) for x in re.findall(r"\d+(?:\.\d+)?", n)[:1]] or [0], -len(n)), reverse=True)
        stable = [n for n in names if not re.search(r"image|tts|audio|live|exp|preview|thinking|\d{3}$", n)]
        flash = newest([n for n in stable if "flash" in n and "lite" not in n])
        lite = newest([n for n in stable if "flash-lite" in n])
        chain = list(dict.fromkeys(flash[:2] + lite[:1] + flash[2:3])) or newest([n for n in names if "flash" in n])[:3]
        if not chain:
            raise HTTPException(503, "No Gemini model is available for this API key.")
        _gemini_models = chain
    return _gemini_models


class Turn(BaseModel):
    role: str
    text: str


class AskIn(BaseModel):
    question: str
    level: str = ""
    subject: str = ""
    language: str = "en"
    history: list[Turn] = []


@app.post("/api/ask")
def ask(body: AskIn, user: dict = Depends(current_user)):
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Type a question first")
    if len(question) > 2000:
        raise HTTPException(400, "That question is too long. Please keep it under 2000 characters.")
    with db() as conn:
        used = conn.execute(
            """INSERT INTO ai_usage (user_id, day, count) VALUES (%s, CURRENT_DATE, 1)
               ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1 RETURNING count""",
            (user["id"],),
        ).fetchone()[0]
        if used > AI_DAILY_LIMIT:  # raising rolls the +1 back
            raise HTTPException(429, f"You've asked {AI_DAILY_LIMIT} questions today. Study Buddy will be back tomorrow!")

    level = re.sub(r"[^\w .()-]", "", body.level)[:60] or "Matric or Intermediate"
    subject = re.sub(r"[^\w .()-]", "", body.subject)[:40]
    contents = [
        {"role": "model" if t.role == "model" else "user", "parts": [{"text": t.text[:3000]}]}
        for t in body.history[-6:]
    ] + [{"role": "user", "parts": [{"text": question}]}]
    payload = {
        "systemInstruction": {"parts": [{"text": BUDDY_PROMPT.format(
            level=level, subject=f", studying {subject}" if subject else "", language=LANGUAGES.get(body.language, "English"))}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1500},
    }
    try:
        data = generate(payload)
    except HTTPException:
        with db() as conn:  # a failed answer doesn't count against today's questions
            conn.execute("UPDATE ai_usage SET count = count - 1 WHERE user_id = %s AND day = CURRENT_DATE", (user["id"],))
        raise

    candidate = (data.get("candidates") or [{}])[0]
    answer = "".join(p.get("text", "") for p in candidate.get("content", {}).get("parts", [])).strip()
    if not answer:
        answer = "I can't help with that one. Try asking about a chapter, a definition or a numerical from your syllabus."
    return {"answer": answer, "left": AI_DAILY_LIMIT - used}


def generate(payload: dict) -> dict:
    """Try each model in turn: when Google says one is overloaded (500/503) or out of quota (429), the next usually works."""
    global _gemini_models
    busy = None
    for model in gemini_models():
        try:
            return gemini_request(f"models/{model}:generateContent", payload)
        except GeminiError as err:
            # Vercel's runtime logs show this; the key is never part of Google's message
            print(f"Gemini error {err.status} on {model}: {err}")
            if err.status in (404, 429, 500, 503):
                busy = err
                if err.status == 404:
                    _gemini_models = []  # a model was retired; look the list up again next time
                time.sleep(0.4)
                continue
            if err.status in (400, 401, 403) and re.search(r"key|permission|disabled|not been used|billing", str(err), re.I):
                raise HTTPException(503, f"Study Buddy's API key isn't working ({err}). The site owner needs to check GEMINI_API_KEY.") from None
            raise HTTPException(502, f"Study Buddy couldn't answer that (Gemini {err.status}: {str(err)[:160]}). Please try again.") from None
    if busy and busy.status == 429:
        raise HTTPException(503, "Study Buddy has used up its free Google quota for now. Please try again in a few minutes.")
    raise HTTPException(503, "Google's AI is very busy right now. Please try again in a minute.")


# ---------- Pages ----------
@app.get("/.well-known/assetlinks.json")
def assetlinks():
    # Vercel's CDN skips dot-folders in public/, so the Android app's Digital Asset Links are served from here.
    return ASSETLINKS


@app.get("/{name:path}")
def page(name: str):
    if name not in PUBLIC_FILES or not (PUBLIC / PUBLIC_FILES[name][0]).is_file():
        raise HTTPException(404, "Not found")
    file, media = PUBLIC_FILES[name]
    return FileResponse(PUBLIC / file, media_type=media, headers={"Cache-Control": "no-cache"})
