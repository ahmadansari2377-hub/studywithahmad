import re

from conftest import TEST_IP, auth

import website.server as srv


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


# ---------- Accounts ----------
def test_signup_checks_username_and_password(client):
    assert client.post("/api/signup", json={"username": "a", "password": "secret1"}).status_code == 400
    assert client.post("/api/signup", json={"username": "zz_test_short", "password": "123"}).status_code == 400
    assert client.post("/api/signup", json={"username": "zz_test_bad", "password": "secret1", "email": "nope"}).status_code == 400


def test_username_is_unique_ignoring_case(client, make_user):
    name, _, _ = make_user()
    r = client.post("/api/signup", json={"username": name.upper(), "password": "secret1"})
    assert r.status_code == 409


def test_signup_limit_per_connection(client, db, make_user):
    db.execute(
        "INSERT INTO signup_log (ip) SELECT %s FROM generate_series(1, %s)", (TEST_IP, srv.MAX_SIGNUPS_PER_HOUR)
    )
    db.commit()
    r = client.post("/api/signup", json={"username": "zz_test_limited", "password": "secret1"})
    assert r.status_code == 429
    db.execute("DELETE FROM signup_log WHERE ip = %s", (TEST_IP,))
    db.commit()
    make_user()  # works again once the window has passed


def test_login_and_lock_after_three_wrong_passwords(client, make_user):
    name, password, _ = make_user()
    assert client.post("/api/login", json={"username": name.upper(), "password": password}).status_code == 200
    codes = [client.post("/api/login", json={"username": name, "password": "wrong!"}).status_code for _ in range(3)]
    assert codes == [401, 401, 429]
    # locked even with the right password, until the 15 minutes pass
    assert client.post("/api/login", json={"username": name, "password": password}).status_code == 429


def test_me_and_logout(client, make_user):
    name, _, token = make_user(email="kid@example.com")
    me = client.get("/api/me", headers=auth(token)).json()
    assert me["username"] == name and me["email"].startswith("ki") and me["email"].endswith("@example.com")
    assert client.post("/api/logout", headers=auth(token)).status_code == 200
    assert client.get("/api/me", headers=auth(token)).status_code == 401


# ---------- Planner data ----------
def test_state_round_trip(client, make_user):
    _, _, token = make_user()
    assert client.get("/api/state", headers=auth(token)).json()["data"] is None
    data = {"profile": {"cls": 9, "group": "bio", "board": "fbise"}, "tasks": [{"text": "Read Ch 1"}]}
    assert client.put("/api/state", headers=auth(token), json={"data": data}).status_code == 200
    assert client.get("/api/state", headers=auth(token)).json()["data"] == data


def test_state_needs_sign_in_and_size_limit(client, make_user):
    assert client.get("/api/state").status_code == 401
    _, _, token = make_user()
    big = {"x": "a" * (srv.MAX_STATE_BYTES + 10)}
    assert client.put("/api/state", headers=auth(token), json={"data": big}).status_code == 413


# ---------- Password reset ----------
def test_reset_with_recovery_code(client):
    r = client.post("/api/signup", json={"username": "zz_test_rc" + srv.secrets.token_hex(3), "password": "secret1"})
    name, code = r.json()["username"], r.json()["recovery_code"]
    try:
        assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}", code)
        r = client.post("/api/reset", json={"username": name, "code": code.lower(), "password": "newpass1"})
        assert r.status_code == 200 and r.json()["recovery_code"] != code
        # each code works once
        assert client.post("/api/reset", json={"username": name, "code": code, "password": "again11"}).status_code == 401
        assert client.post("/api/login", json={"username": name, "password": "newpass1"}).status_code == 200
    finally:
        with srv.db() as conn:
            conn.execute("DELETE FROM users WHERE username = %s", (name,))
            conn.execute("DELETE FROM login_failures WHERE username = %s", (name.lower(),))


def test_reset_by_email(client, make_user, monkeypatch):
    sent = []
    monkeypatch.setenv("SMTP_USER", "site@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(srv, "send_mail", lambda to, subject, text: sent.append((to, text)))
    name, _, old_token = make_user(email="kid@example.com")

    r = client.post("/api/forgot", json={"username": name})
    assert r.status_code == 200 and r.json()["minutes"] == srv.EMAIL_CODE_MINUTES
    assert sent[-1][0] == "kid@example.com"
    code = re.search(r"\b(\d{6})\b", sent[-1][1]).group(1)
    assert client.post("/api/forgot", json={"username": name}).status_code == 429  # one email a minute

    assert client.post("/api/reset", json={"username": name, "code": "999999" if code != "999999" else "111111",
                                           "password": "newpass1"}).status_code == 401
    assert client.post("/api/reset", json={"username": name, "code": code, "password": "newpass1"}).status_code == 200
    assert client.get("/api/me", headers=auth(old_token)).status_code == 401  # other devices are signed out


def test_forgot_when_email_is_off_or_missing(client, make_user, monkeypatch):
    name, _, _ = make_user()
    monkeypatch.delenv("SMTP_USER", raising=False)
    assert client.post("/api/forgot", json={"username": name}).status_code == 503
    monkeypatch.setenv("SMTP_USER", "site@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    assert client.post("/api/forgot", json={"username": name}).status_code == 404  # no email on this account


def test_change_password_and_email(client, make_user):
    name, password, token = make_user()
    # a wrong current password is 403, not 401, so the app doesn't sign the student out
    assert client.post("/api/account/password", headers=auth(token), json={"old": "nope", "new": "abcdef"}).status_code == 403
    assert client.post("/api/account/password", headers=auth(token), json={"old": password, "new": "abcdef"}).status_code == 200
    assert client.get("/api/me", headers=auth(token)).status_code == 200  # this device stays signed in
    r = client.post("/api/account/email", headers=auth(token), json={"email": "me@example.com", "password": "abcdef"})
    assert r.status_code == 200 and r.json()["email"].endswith("@example.com")
    assert client.post("/api/account/email", headers=auth(token), json={"email": "", "password": "abcdef"}).json()["email"] == ""


# ---------- Files ----------
def test_only_public_files_are_served(client):
    assert client.get("/").status_code == 200
    assert client.get("/syllabus.js").status_code == 200
    for secret in (".env", "pyproject.toml", "src/website/server.py", "../.env", "app.py"):
        assert client.get("/" + secret).status_code == 404, secret
    assert client.get("/.well-known/assetlinks.json").json()[0]["target"]["package_name"] == "app.vercel.studywithahmad"
