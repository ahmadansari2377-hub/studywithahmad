"""Study with Ahmad server: serves the planner and stores each student's data in Postgres (Neon).

Run locally with:  uv run website   →  http://127.0.0.1:8000
On Vercel, app.py at the project root exposes this `app`, and files in public/ come from the CDN.
"""

import datetime as dt
import hashlib
import hmac
import http.client
import json
import os
import re
import secrets
import smtplib
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
import psycopg
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
MAX_IP_FAILS = 30          # ...and per internet connection (high enough for a whole school or event on one Wi-Fi)
LOCK_MINUTES = 15          # before trying again

# Only these files from public/ are served — never .env, .git or source code.
# (On Vercel the CDN serves public/ directly; this is the local / fallback path.)
PUBLIC_FILES = {
    "": ("index.html", "text/html"),
    "index.html": ("index.html", "text/html"),
    "study.css": ("study.css", "text/css"),
    "study.js": ("study.js", "text/javascript"),
    "syllabus.js": ("syllabus.js", "text/javascript"),
    "entrytests.js": ("entrytests.js", "text/javascript"),
    "solver.js": ("solver.js", "text/javascript"),
    "privacy": ("privacy.html", "text/html"),
    "privacy.html": ("privacy.html", "text/html"),
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
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE INDEX IF NOT EXISTS login_failures_ip_idx ON login_failures (ip, attempted_at);
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     DATE NOT NULL,
    count   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE TABLE IF NOT EXISTS email_resets (
    user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    tries      INT NOT NULL DEFAULT 0,
    ip         TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    message    TEXT NOT NULL,
    contact    TEXT NOT NULL DEFAULT '',
    page       TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS study_rooms (
    user_id  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    room     TEXT NOT NULL,
    subject  TEXT NOT NULL DEFAULT '',
    ends_at  TIMESTAMPTZ NOT NULL
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
    email: str = ""


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
    email = clean_email(body.email)
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE lower(username) = lower(%s)", (username,)).fetchone()
        if exists:
            raise HTTPException(409, "That username is taken — try another")
        try:
            user_id = conn.execute(
                "INSERT INTO users (username, password_hash, email) VALUES (%s, %s, %s) RETURNING id",
                (username, hash_password(body.password), email or None),
            ).fetchone()[0]
        except psycopg.errors.UniqueViolation:
            # "Ali" and "ali" signing up at the same moment: the lower(username) index lets only one through
            raise HTTPException(409, "That username is taken — try another") from None
        token = new_token(conn, user_id)
        code = new_recovery_code(conn, user_id)
    return {"token": token, "username": username, "recovery_code": code}


# ---------- Password recovery (no email needed) ----------
# Each account gets a one-time recovery code, shown once. Username + code sets a new password, and a fresh code
# replaces the used one. Only a hash of the code is stored.
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I mix-ups


def normalise_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", code.upper())


def new_recovery_code(conn, user_id: int) -> str:
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(12))
    conn.execute("UPDATE users SET recovery_hash = %s WHERE id = %s", (token_hash(raw), user_id))
    return "-".join(raw[i:i + 4] for i in range(0, 12, 4))


@app.post("/api/recovery-code")
def recovery_code(user: dict = Depends(current_user)):
    """A new code for a signed-in student (accounts made before codes existed, or a lost code)."""
    with db() as conn:
        return {"recovery_code": new_recovery_code(conn, user["id"])}


class ResetIn(BaseModel):
    username: str
    code: str
    password: str


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


def guard_attempts(conn, username: str, ip: str) -> int:
    """Raise 429 while this username+connection (or this connection overall) is locked; else return its failures.
    Counted per username AND connection, so someone else typing your username can't lock you out;
    the per-connection limit still stops password guessing."""
    conn.execute("DELETE FROM login_failures WHERE attempted_at < now() - interval '1 day'")
    user_fails, user_wait = conn.execute(
        """SELECT count(*), EXTRACT(EPOCH FROM min(attempted_at) + make_interval(mins => %s) - now())
           FROM login_failures WHERE username = %s AND ip = %s
           AND attempted_at > now() - make_interval(mins => %s)""",
        (LOCK_MINUTES, username, ip, LOCK_MINUTES),
    ).fetchone()
    ip_fails, ip_wait = conn.execute(
        """SELECT count(*), EXTRACT(EPOCH FROM min(attempted_at) + make_interval(mins => %s) - now())
           FROM login_failures WHERE ip = %s AND attempted_at > now() - make_interval(mins => %s)""",
        (LOCK_MINUTES, ip, LOCK_MINUTES),
    ).fetchone()
    if user_fails >= MAX_USER_FAILS or ip_fails >= MAX_IP_FAILS:
        wait = float(user_wait if user_fails >= MAX_USER_FAILS else ip_wait)
        raise HTTPException(429, f"Too many wrong attempts. Please try again in {minutes_word(wait)}.")
    return user_fails


def record_failure(conn, username: str, ip: str, user_fails: int, what: str):
    conn.execute("INSERT INTO login_failures (username, ip) VALUES (%s, %s)", (username, ip))
    conn.commit()  # keep the failure even though we raise below
    left = MAX_USER_FAILS - (user_fails + 1)
    if left <= 0:
        raise HTTPException(429, f"Wrong {what} 3 times — trying this account from here is paused for {LOCK_MINUTES} minutes.")
    raise HTTPException(401, f"Wrong username or {what} — {left} {'try' if left == 1 else 'tries'} left.")


@app.post("/api/login")
def login(body: Credentials, request: Request):
    username, ip = body.username.strip().lower(), client_ip(request)
    with db() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE created_at < now() - make_interval(days => %s)", (TOKEN_DAYS,))
        user_fails = guard_attempts(conn, username, ip)
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE lower(username) = %s", (username,)
        ).fetchone()
        if not row or not check_password(body.password, row[2]):
            record_failure(conn, username, ip, user_fails, "password")
        conn.execute("DELETE FROM login_failures WHERE username = %s", (username,))
        token = new_token(conn, row[0])
    return {"token": token, "username": row[1]}


@app.post("/api/reset")
def reset_password(body: ResetIn, request: Request):
    username, ip = body.username.strip().lower(), client_ip(request)
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    with db() as conn:
        user_fails = guard_attempts(conn, username, ip)
        row = conn.execute("SELECT id, username, recovery_hash FROM users WHERE lower(username) = %s", (username,)).fetchone()
        code = normalise_code(body.code)
        if len(code) == 6 and code.isdigit():  # the 6-digit code from a reset email
            if not row or not email_code_ok(conn, row[0], code):
                record_failure(conn, username, ip, user_fails, "email code")
        elif not row or not row[2] or len(code) != 12 or not hmac.compare_digest(token_hash(code), row[2]):
            record_failure(conn, username, ip, user_fails, "recovery code")
        conn.execute("DELETE FROM email_resets WHERE user_id = %s", (row[0],))
        conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.password), row[0]))
        conn.execute("DELETE FROM auth_tokens WHERE user_id = %s", (row[0],))  # sign out every other device
        conn.execute("DELETE FROM login_failures WHERE username = %s", (username,))
        token = new_token(conn, row[0])
        new_code = new_recovery_code(conn, row[0])  # each code works once
    return {"token": token, "username": row[1], "recovery_code": new_code}


# ---------- Password reset by email ----------
# Optional: a student can add an email; "Forgot password" then mails a 6-digit code (valid 15 minutes, 5 tries).
# Works once SMTP_USER and SMTP_PASSWORD are set (e.g. a Gmail address + a Google "App password").
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
EMAIL_CODE_MINUTES = 15


def clean_email(value: str) -> str:
    email = value.strip()
    if email and (len(email) > 120 or not EMAIL_RE.match(email)):
        raise HTTPException(400, "That email address doesn't look right")
    return email


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}{'•' * max(1, len(name) - 2)}@{domain}"


def mail_ready() -> bool:
    return bool(os.environ.get("SMTP_USER", "").strip() and os.environ.get("SMTP_PASSWORD", "").strip())


def send_mail(to: str, subject: str, text: str):
    user = os.environ["SMTP_USER"].strip()
    msg = EmailMessage()
    msg["From"] = os.environ.get("SMTP_FROM", "").strip() or f"Study with Ahmad <{user}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.environ.get("SMTP_PORT", "465"))
    # Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it
    password = os.environ["SMTP_PASSWORD"].strip().replace(" ", "")
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)


def email_code_ok(conn, user_id: int, code: str) -> bool:
    row = conn.execute(
        "UPDATE email_resets SET tries = tries + 1 WHERE user_id = %s AND created_at > now() - make_interval(mins => %s) "
        "RETURNING code_hash, tries",
        (user_id, EMAIL_CODE_MINUTES),
    ).fetchone()
    return bool(row) and row[1] <= 5 and hmac.compare_digest(token_hash(code), row[0])


class ForgotIn(BaseModel):
    username: str


@app.post("/api/forgot")
def forgot(body: ForgotIn, request: Request):
    """Email a 6-digit reset code to the address saved on this account."""
    username, ip = body.username.strip().lower(), client_ip(request)
    if not mail_ready():
        raise HTTPException(503, "Email reset isn't switched on yet. Use your recovery code, or tap \"Koi masla?\" to ask for help.")
    with db() as conn:
        sent = conn.execute("SELECT count(*) FROM email_resets WHERE ip = %s AND created_at > now() - interval '1 hour'", (ip,)).fetchone()[0]
        if sent >= 5:
            raise HTTPException(429, "Too many reset emails from this connection. Please try again in an hour.")
        row = conn.execute("SELECT id, email FROM users WHERE lower(username) = %s", (username,)).fetchone()
        if not row or not row[1]:
            raise HTTPException(404, "This account has no email saved, so use your recovery code instead.")
        last = conn.execute("SELECT EXTRACT(EPOCH FROM now() - created_at) FROM email_resets WHERE user_id = %s", (row[0],)).fetchone()
        if last and last[0] < 60:
            raise HTTPException(429, "We just sent a code. Check your inbox (and Spam), or try again in a minute.")
        code = f"{secrets.randbelow(10**6):06d}"
        conn.execute(
            """INSERT INTO email_resets (user_id, code_hash, ip) VALUES (%s, %s, %s)
               ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, tries = 0, ip = EXCLUDED.ip, created_at = now()""",
            (row[0], token_hash(code), ip),
        )
        try:
            send_mail(row[1], f"{code} is your Study with Ahmad reset code",
                      f"Assalam-o-Alaikum!\n\nYour code to set a new Study with Ahmad password is:\n\n    {code}\n\n"
                      f"It works for {EMAIL_CODE_MINUTES} minutes. If you didn't ask for this, ignore this email: "
                      "your password stays the same.\n\nStudy with Ahmad\nhttps://study-with-ahmad.vercel.app\n")
        except (OSError, smtplib.SMTPException) as err:
            print("Reset email failed:", type(err).__name__, err)
            conn.rollback()
            raise HTTPException(502, "Couldn't send the email just now. Please try again, or use your recovery code.") from None
    return {"sent_to": mask_email(row[1]), "minutes": EMAIL_CODE_MINUTES}


# ---------- Account settings (signed in) ----------
class EmailIn(BaseModel):
    email: str
    password: str


class PasswordIn(BaseModel):
    old: str
    new: str


def check_own_password(conn, user: dict, password: str):
    stored = conn.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],)).fetchone()[0]
    if not check_password(password, stored):
        raise HTTPException(403, "Your current password is wrong")  # not 401: that would sign the student out


@app.post("/api/account/email")
def set_email(body: EmailIn, user: dict = Depends(current_user)):
    email = clean_email(body.email)
    with db() as conn:
        check_own_password(conn, user, body.password)
        conn.execute("UPDATE users SET email = %s WHERE id = %s", (email or None, user["id"]))
    return {"email": mask_email(email) if email else ""}


@app.post("/api/account/password")
def change_password(body: PasswordIn, user: dict = Depends(current_user)):
    if len(body.new) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    with db() as conn:
        check_own_password(conn, user, body.old)
        conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.new), user["id"]))
        # sign out every other device, keep this one
        conn.execute("DELETE FROM auth_tokens WHERE user_id = %s AND token_hash <> %s", (user["id"], token_hash(user["token"])))
    return {"ok": True}


@app.post("/api/logout")
def logout(user: dict = Depends(current_user)):
    with db() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token_hash = %s", (token_hash(user["token"]),))
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    with db() as conn:
        email = conn.execute("SELECT email FROM users WHERE id = %s", (user["id"],)).fetchone()[0]
    return {"username": user["username"], "email": mask_email(email) if email else "", "email_reset": mail_ready()}


def admin_code():
    """For the site owner: `uv run reset-code <username>` prints a fresh recovery code for a student who lost theirs.
    Make sure it's really them first (e.g. through the contact they left in feedback)."""
    import sys

    if len(sys.argv) != 2:
        sys.exit("Usage: uv run reset-code <username>")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        conn.execute(SCHEMA)
        row = conn.execute("SELECT id, username FROM users WHERE lower(username) = lower(%s)", (sys.argv[1].strip(),)).fetchone()
        if not row:
            sys.exit(f"No account called {sys.argv[1]!r}")
        print(f"New recovery code for {row[1]}: {new_recovery_code(conn, row[0])}  (the old one no longer works)")


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


def gemini_request(path: str, payload: dict | None = None, timeout: int = 40) -> dict:
    req = urllib.request.Request(
        f"{GEMINI_BASE}/{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "x-goog-api-key": gemini_key()},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as err:
        detail = ""
        try:
            detail = json.loads(err.read()).get("error", {}).get("message", "")
        except Exception:
            pass
        raise GeminiError(err.code, detail) from None
    except (OSError, http.client.HTTPException) as err:  # URLError, timeouts, dropped connections
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
    image: str = ""  # optional photo of a textbook question, as a data: URL (the app shrinks it first)


# A photo of a question gets a tutor, not an answer key: the method and hints, while the student does the last step.
PHOTO_RULES = """
This message includes a PHOTO of a question from the student's book or paper. Act as a tutor, not an answer key:
1. Say in one line what the question asks and which topic/chapter it is from.
2. Explain the idea or law it needs, simply.
3. Show the method step by step, but STOP before the final answer: leave the last calculation or conclusion for the
   student and tell them to send you their answer so you can check it.
Only give the full final answer if the student has already tried (they say so, or send their own answer).
If the photo is unclear, ask them to retake it."""
IMAGE_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$")


@app.post("/api/ask")
def ask(body: AskIn, user: dict = Depends(current_user)):
    question = body.question.strip() or ("Help me understand this question." if body.image else "")
    if not question:
        raise HTTPException(400, "Type a question first")
    image = None
    if body.image:
        m = IMAGE_RE.match(body.image)
        if not m or len(m.group(2)) > 3_000_000:
            raise HTTPException(400, "That photo couldn't be read. Try a smaller JPG or PNG.")
        image = {"inlineData": {"mimeType": m.group(1), "data": m.group(2)}}
    if len(question) > 2000:
        raise HTTPException(400, "That question is too long. Please keep it under 2000 characters.")
    used = use_ai(user["id"])
    level = re.sub(r"[^\w .()-]", "", body.level)[:60] or "Matric or Intermediate"
    subject = re.sub(r"[^\w .()-]", "", body.subject)[:40]
    contents = [
        {"role": "model" if t.role == "model" else "user", "parts": [{"text": t.text[:3000]}]}
        for t in body.history[-6:]
    ] + [{"role": "user", "parts": ([image] if image else []) + [{"text": question}]}]
    payload = {
        "systemInstruction": {"parts": [{"text": BUDDY_PROMPT.format(
            level=level, subject=f", studying {subject}" if subject else "", language=LANGUAGES.get(body.language, "English"))
            + (PHOTO_RULES if image else "")}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1500},
    }
    answer = answer_text(generate_counted(payload, user["id"]))
    if not answer:
        answer = "I can't help with that one. Try asking about a chapter, a definition or a numerical from your syllabus."
    return {"answer": answer, "left": AI_DAILY_LIMIT - used}


def use_ai(user_id: int) -> int:
    """Count one AI request for today; refuse past the daily limit. Returns today's count."""
    with db() as conn:
        used = conn.execute(
            """INSERT INTO ai_usage (user_id, day, count) VALUES (%s, CURRENT_DATE, 1)
               ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1 RETURNING count""",
            (user_id,),
        ).fetchone()[0]
        if used > AI_DAILY_LIMIT:  # raising rolls the +1 back
            raise HTTPException(429, f"You've used Study Buddy {AI_DAILY_LIMIT} times today. It will be back tomorrow!")
    return used


def generate_counted(payload: dict, user_id: int, timeout: int = 40) -> dict:
    try:
        return generate(payload, timeout)
    except HTTPException:
        with db() as conn:  # a failed answer doesn't count against today's limit
            conn.execute("UPDATE ai_usage SET count = count - 1 WHERE user_id = %s AND day = CURRENT_DATE", (user_id,))
        raise


def answer_text(data: dict) -> str:
    candidate = (data.get("candidates") or [{}])[0]
    return "".join(p.get("text", "") for p in candidate.get("content", {}).get("parts", [])).strip()


# ---------- AI study plan ----------
PLAN_PROMPT = """You plan revision for a Punjab Board (PTB) {level} student. Today is {today}. Their exam "{exam}" is on {exam_date}.
They can study about {hours} hours a day. Target: {target}.

Chapters still to cover (subject id | chapter number | name | status):
{chapters}

Make a day-by-day plan from {today} for {days} days. Rules:
- Unread chapters first (most important and hardest early), then revision of read ones; leave the last 2 days before the exam
  (if inside the plan) for full-syllabus revision and past papers.
- Spread subjects so no day is only one subject; at most {per_day} items a day; a day off every 7th day is fine.
- Each item: subject id (exactly as given), chapter number (0 for mixed revision), a short task (under 12 words), minutes.
Reply with JSON only, shaped exactly:
{{"days":[{{"date":"YYYY-MM-DD","items":[{{"subject":"physics","chapter":3,"task":"Read and make notes","minutes":45}}]}}],"tips":["...","..."]}}
Give 2-3 short tips in {language}. Tasks in English."""


class PlanChapter(BaseModel):
    subject: str
    n: int
    name: str
    status: str = "unread"


class PlanIn(BaseModel):
    exam: str
    exam_date: str
    hours: float = 3
    target: str = ""
    level: str = ""
    language: str = "en"
    chapters: list[PlanChapter]


@app.post("/api/plan")
def plan(body: PlanIn, user: dict = Depends(current_user)):
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).date()  # Pakistan time
    try:
        exam_day = dt.date.fromisoformat(body.exam_date[:10])
    except ValueError:
        raise HTTPException(400, "Pick a valid exam date") from None
    if exam_day <= today:
        raise HTTPException(400, "The exam date should be in the future")
    if not body.chapters:
        raise HTTPException(400, "Every chapter is already revised. Nothing left to plan!")
    days = min((exam_day - today).days, 14)  # two weeks at a time keeps the answer quick; plan again later
    hours = max(0.5, min(body.hours, 12))
    clean = lambda s, n: re.sub(r"[^\w .,:()'&/-]", "", s)[:n]
    chapters = "\n".join(f"{clean(c.subject, 20)} | {c.n} | {clean(c.name, 70)} | {clean(c.status, 10)}" for c in body.chapters[:150])
    used = use_ai(user["id"])
    payload = {
        "contents": [{"role": "user", "parts": [{"text": PLAN_PROMPT.format(
            level=clean(body.level, 60) or "Matric/Inter", today=today, exam=clean(body.exam, 60) or "board exam",
            exam_date=exam_day, hours=hours, target=clean(body.target, 40) or "pass with good marks", chapters=chapters,
            days=days, per_day=max(2, min(5, round(hours * 60 / 45))), language=LANGUAGES.get(body.language, "English"))}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 8000, "responseMimeType": "application/json"},
    }
    raw = answer_text(generate_counted(payload, user["id"], timeout=110))  # a whole plan takes Gemini longer than a chat answer
    try:
        data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    except ValueError:
        raise HTTPException(502, "The AI plan came back garbled. Please try again.") from None
    known = {c.subject for c in body.chapters}
    out = []
    for d in data.get("days", [])[:days + 1]:
        try:
            date = dt.date.fromisoformat(str(d.get("date", ""))[:10])
        except ValueError:
            continue
        if not today <= date <= exam_day:
            continue
        items = [
            {"subject": str(i.get("subject", "")), "chapter": int(i.get("chapter") or 0),
             "task": str(i.get("task", ""))[:120], "minutes": max(10, min(int(i.get("minutes") or 45), 240))}
            for i in d.get("items", [])[:6] if str(i.get("subject", "")) in known and i.get("task")
        ]
        if items:
            out.append({"date": date.isoformat(), "items": items})
    if not out:
        raise HTTPException(502, "The AI couldn't make a plan this time. Please try again.")
    return {"days": out, "tips": [str(t)[:200] for t in data.get("tips", [])[:3]], "left": AI_DAILY_LIMIT - used}


# ---------- Feedback ("Koi masla? Batayein"); read it in the Neon SQL editor: SELECT * FROM feedback ORDER BY id DESC ----------
class FeedbackIn(BaseModel):
    message: str
    contact: str = ""
    page: str = ""


@app.post("/api/feedback")
def feedback(body: FeedbackIn, request: Request, authorization: str = Header(default="")):
    message = body.message.strip()
    if len(message) < 3:
        raise HTTPException(400, "Please write a few words")
    ip = client_ip(request)
    user_id = None
    if authorization.strip():
        try:
            user_id = current_user(authorization)["id"]
        except HTTPException:
            pass
    with db() as conn:
        recent = conn.execute("SELECT count(*) FROM feedback WHERE ip = %s AND created_at > now() - interval '1 hour'", (ip,)).fetchone()[0]
        if recent >= 5:
            raise HTTPException(429, "Thanks! We already got several messages from you. Please try again in an hour.")
        conn.execute(
            "INSERT INTO feedback (user_id, message, contact, page, ip) VALUES (%s, %s, %s, %s, %s)",
            (user_id, message[:2000], body.contact.strip()[:120], body.page.strip()[:60], ip),
        )
    return {"ok": True}


# ---------- Study rooms: who is focusing right now (opt-in, shown only while their timer runs) ----------
ROOM_RE = re.compile(r"^[a-z0-9-]{2,20}$")


class RoomIn(BaseModel):
    room: str
    subject: str = ""
    minutes: int = 25


def room_list(conn, room: str, me: int | None = None) -> dict:
    rows = conn.execute(
        """SELECT u.username, r.subject, CEIL(EXTRACT(EPOCH FROM r.ends_at - now()) / 60)::int, r.user_id
           FROM study_rooms r JOIN users u ON u.id = r.user_id
           WHERE r.room = %s AND r.ends_at > now() ORDER BY r.ends_at DESC LIMIT 50""",
        (room,),
    ).fetchall()
    return {"room": room, "people": [{"username": r[0], "subject": r[1], "left": r[2], "me": r[3] == me} for r in rows]}


@app.get("/api/room")
def get_room(room: str):
    if not ROOM_RE.match(room):
        raise HTTPException(400, "Unknown room")
    with db() as conn:
        return room_list(conn, room)


@app.post("/api/room/join")
def join_room(body: RoomIn, user: dict = Depends(current_user)):
    if not ROOM_RE.match(body.room):
        raise HTTPException(400, "Unknown room")
    minutes = max(1, min(body.minutes, 240))
    with db() as conn:
        conn.execute("DELETE FROM study_rooms WHERE ends_at < now() - interval '1 hour'")
        conn.execute(
            """INSERT INTO study_rooms (user_id, room, subject, ends_at) VALUES (%s, %s, %s, now() + make_interval(mins => %s))
               ON CONFLICT (user_id) DO UPDATE SET room = EXCLUDED.room, subject = EXCLUDED.subject, ends_at = EXCLUDED.ends_at""",
            (user["id"], body.room, re.sub(r"[^\w .()&-]", "", body.subject)[:30], minutes),
        )
        return room_list(conn, body.room, user["id"])


@app.post("/api/room/leave")
def leave_room(user: dict = Depends(current_user)):
    with db() as conn:
        conn.execute("DELETE FROM study_rooms WHERE user_id = %s", (user["id"],))
    return {"ok": True}


# ---------- Leaderboard (opt-in) ----------
@app.get("/api/leaderboard")
def leaderboard(cls: str = "", city: str = "", authorization: str = Header(default="")):
    """This week's focus minutes for students who switched the leaderboard on. Sample data never counts."""
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).date()
    monday = (today - dt.timedelta(days=today.weekday())).isoformat()
    where, args = ["p.data->'settings'->>'board' = 'true'"], [monday]
    if cls in ("9", "10", "11", "12"):
        where.append("p.data->'profile'->>'cls' = %s"); args.append(cls)
    if city.strip():
        where.append("lower(p.data->'settings'->>'city') = lower(%s)"); args.append(city.strip()[:30])
    with db() as conn:
        rows = conn.execute(
            f"""SELECT u.id, u.username, p.data->'profile'->>'cls', p.data->'settings'->>'city',
                       COALESCE(SUM((s->>'min')::int), 0) AS mins
                FROM planner_data p JOIN users u ON u.id = p.user_id
                LEFT JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(p.data->'sessions') = 'array' THEN p.data->'sessions' ELSE '[]'::jsonb END) s
                  ON s->>'date' >= %s AND s->>'date' <= to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD')
                     AND COALESCE(s->>'sample', 'false') <> 'true' AND (s->>'min') ~ '^[0-9]{{1,3}}$'
                WHERE {' AND '.join(where)}
                GROUP BY u.id, u.username, 3, 4
                ORDER BY mins DESC, u.username LIMIT 200""",
            args,
        ).fetchall()
    me_id = None
    if authorization.strip():
        try:
            me_id = current_user(authorization)["id"]
        except HTTPException:
            pass
    board = [{"rank": i + 1, "username": r[1], "cls": r[2], "city": (r[3] or "")[:30], "minutes": r[4], "me": r[0] == me_id}
             for i, r in enumerate(rows)]
    return {"week_of": monday, "top": board[:20], "me": next((b for b in board if b["me"]), None)}


def generate(payload: dict, timeout: int = 40) -> dict:
    """Try each model in turn: when Google says one is overloaded (500/503) or out of quota (429), the next usually works."""
    global _gemini_models
    busy = None
    for model in gemini_models():
        try:
            return gemini_request(f"models/{model}:generateContent", payload, timeout)
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
