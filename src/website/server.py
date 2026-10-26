"""Study with Ahmad server: serves the planner and stores each student's data in Postgres (Neon).

Run with:  uv run website   →  http://127.0.0.1:8000
"""

import hashlib
import hmac
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
MAX_STATE_BYTES = 2_000_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,30}$")
TOKEN_DAYS = 30            # stay signed in for 30 days
MAX_USER_FAILS = 3         # wrong passwords allowed per account...
MAX_IP_FAILS = 10          # ...and per internet connection
LOCK_MINUTES = 15          # before trying again

# Only these files are served — never .env, .git or source code.
PUBLIC_FILES = {
    "": ("study.html", "text/html"),
    "study.html": ("study.html", "text/html"),
    "study.css": ("study.css", "text/css"),
    "study.js": ("study.js", "text/javascript"),
    "syllabus.js": ("syllabus.js", "text/javascript"),
}


def database_url() -> str:
    """DATABASE_URL from the environment, or from .env (keys like "data base url" are accepted)."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and re.sub(r"[^a-z]", "", key.lower()) == "databaseurl":
                return value.strip().strip("'\"")
    raise RuntimeError("No database URL found. Add DATABASE_URL=postgresql://... to .env")


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
"""

pool: ConnectionPool | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global pool
    pool = ConnectionPool(database_url(), min_size=1, max_size=5, open=True)
    with pool.connection() as conn:
        conn.execute(SCHEMA)
    yield
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
    with pool.connection() as conn:
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
    with pool.connection() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}


@app.post("/api/signup")
def signup(body: Credentials):
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3–30 letters, numbers, dots or underscores")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    with pool.connection() as conn:
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
    # uvicorn fills request.client from X-Forwarded-For when FORWARDED_ALLOW_IPS trusts the proxy
    return request.client.host if request.client else "unknown"


def minutes_word(seconds: float) -> str:
    m = max(1, round(seconds / 60))
    return f"{m} minute{'s' if m != 1 else ''}"


@app.post("/api/login")
def login(body: Credentials, request: Request):
    username, ip = body.username.strip().lower(), client_ip(request)
    with pool.connection() as conn:
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
    with pool.connection() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token_hash = %s", (token_hash(user["token"]),))
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return {"username": user["username"]}


@app.get("/api/state")
def get_state(user: dict = Depends(current_user)):
    with pool.connection() as conn:
        row = conn.execute("SELECT data, updated_at FROM planner_data WHERE user_id = %s", (user["id"],)).fetchone()
    if not row:
        return {"data": None, "updated_at": None}
    return {"data": row[0], "updated_at": row[1].isoformat()}


@app.put("/api/state")
def put_state(body: StateIn, user: dict = Depends(current_user)):
    if len(json.dumps(body.data)) > MAX_STATE_BYTES:
        raise HTTPException(413, "Planner data is too large")
    with pool.connection() as conn:
        updated = conn.execute(
            """INSERT INTO planner_data (user_id, data, updated_at) VALUES (%s, %s, now())
               ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
               RETURNING updated_at""",
            (user["id"], Jsonb(body.data)),
        ).fetchone()[0]
    return {"updated_at": updated.isoformat()}


# ---------- Pages ----------
@app.get("/{name:path}")
def page(name: str):
    if name not in PUBLIC_FILES:
        raise HTTPException(404, "Not found")
    file, media = PUBLIC_FILES[name]
    return FileResponse(ROOT / file, media_type=media, headers={"Cache-Control": "no-cache"})
