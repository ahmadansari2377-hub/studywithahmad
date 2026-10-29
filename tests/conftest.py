"""Shared test setup.

The API tests need a real Postgres: DATABASE_URL from the environment (GitHub Actions starts an empty one) or from .env.
Every account they create is named zz_test_... and deleted afterwards, so running them against the live database is safe.

Run:  uv run --with pytest --with httpx pytest
"""

import os
import secrets
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fastapi.testclient import TestClient  # noqa: E402

import website.server as srv  # noqa: E402

TEST_IP = "testclient"  # what Starlette's TestClient reports as the visitor's address


@pytest.fixture(scope="session")
def client():
    with TestClient(srv.app) as c:
        if srv.pool is None:
            srv.connect()  # Neon may have been asleep: one more try
        if srv.pool is None:
            if os.environ.get("CI"):
                pytest.fail(f"no database: {srv.startup_error}")
            pytest.skip(f"no database: {srv.startup_error}")
        yield c


@pytest.fixture
def db(client):
    with srv.db() as conn:
        yield conn


@pytest.fixture
def make_user(client):
    """make_user(email="") -> (username, password, token). Deletes the accounts (and their limit rows) afterwards."""
    made = []

    def make(email="", password="secret1"):
        name = "zz_test_" + secrets.token_hex(4)
        r = client.post("/api/signup", json={"username": name, "password": password, "email": email})
        assert r.status_code == 200, r.text
        made.append(name)
        return name, password, r.json()["token"]

    yield make
    with srv.db() as conn:
        for name in made:
            conn.execute("DELETE FROM users WHERE username = %s", (name,))
            conn.execute("DELETE FROM login_failures WHERE username = %s", (name.lower(),))
        conn.execute("DELETE FROM signup_log WHERE ip = %s", (TEST_IP,))


def auth(token: str) -> dict:
    return {"Authorization": "Bearer " + token}
