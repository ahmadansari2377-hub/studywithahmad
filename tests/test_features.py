"""Paper checker, book page -> cards, practice papers, parent links, city board and push reminders.

Gemini is replaced by a fake `generate`, so these never call Google.
"""

import json

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from conftest import auth

import website.server as srv

PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="


@pytest.fixture
def fake_ai(monkeypatch):
    """fake_ai(answer_dict) makes Gemini "answer" with that JSON; returns the list of prompts it was sent."""
    sent = []

    def use(answer):
        def generate(payload, timeout=40):
            sent.append(payload)
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(answer) if isinstance(answer, dict) else answer}]}}]}
        monkeypatch.setattr(srv, "generate", generate)
        return sent

    return use


def ai_used(db, token):
    return db.execute(
        "SELECT COALESCE(SUM(count), 0) FROM ai_usage a JOIN auth_tokens t ON t.user_id = a.user_id WHERE t.token_hash = %s",
        (srv.token_hash(token),),
    ).fetchone()[0]


def test_paper_checker_marks_and_clamps(client, make_user, fake_ai, db):
    _, _, token = make_user()
    sent = fake_ai({"score": 9, "summary": "Good", "good": ["definition"], "missing": ["unit"], "mistakes": [], "improve": "Add units", "key_points": ["a", "b"]})
    r = client.post("/api/check", headers=auth(token), json={"question": "Define speed (5)", "answer": "distance per time", "marks": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["score"] == 5 and body["out_of"] == 5  # never above the question's marks
    assert body["missing"] == ["unit"] and body["left"] == srv.AI_DAILY_LIMIT - 1
    assert "Define speed" in sent[0]["contents"][0]["parts"][-1]["text"]
    # a photo answer is sent along as an image
    client.post("/api/check", headers=auth(token), json={"question": "Q", "answer_image": PHOTO, "marks": 2})
    assert "inlineData" in sent[1]["contents"][0]["parts"][0]


def test_paper_checker_needs_question_and_answer(client, make_user, fake_ai):
    _, _, token = make_user()
    fake_ai({"score": 1})
    assert client.post("/api/check", headers=auth(token), json={"answer": "x"}).status_code == 400
    assert client.post("/api/check", headers=auth(token), json={"question": "x"}).status_code == 400
    assert client.post("/api/check", json={"question": "x", "answer": "y"}).status_code == 401


def test_garbled_ai_answer_is_not_counted(client, make_user, fake_ai, db):
    _, _, token = make_user()
    fake_ai("sorry, no json here")
    assert client.post("/api/check", headers=auth(token), json={"question": "Q", "answer": "A"}).status_code == 502
    assert ai_used(db, token) == 0


def test_page_to_cards_drops_bad_mcqs(client, make_user, fake_ai):
    _, _, token = make_user()
    fake_ai({"topic": "Cells", "cards": [{"front": "Unit of life?", "back": "Cell"}, {"front": "no back"}],
             "mcqs": [{"q": "Q1", "options": ["a", "b", "c", "d"], "answer": 2, "why": "w"},
                      {"q": "Q2", "options": ["a", "b"], "answer": 0},
                      {"q": "Q3", "options": ["a", "b", "c", "d"], "answer": 7}]})
    r = client.post("/api/cards", headers=auth(token), json={"image": PHOTO, "subject": "Biology"})
    assert r.status_code == 200, r.text
    assert r.json()["cards"] == [{"front": "Unit of life?", "back": "Cell"}]
    assert [m["q"] for m in r.json()["mcqs"]] == ["Q1"]
    fake_ai({"error": "blurry photo"})
    r = client.post("/api/cards", headers=auth(token), json={"image": PHOTO})
    assert r.status_code == 422 and "blurry" in r.json()["detail"]
    assert client.post("/api/cards", headers=auth(token), json={"image": "not a photo"}).status_code == 400


def test_practice_paper(client, make_user, fake_ai):
    _, _, token = make_user()
    sent = fake_ai({"title": "Physics test", "mcqs": [{"q": "Q", "options": ["1", "2", "3", "4"], "answer": 1}],
                    "short": [{"q": "Define work", "marks": 2, "answer": "F x d"}], "long": [{"q": "Explain", "marks": "8"}]})
    r = client.post("/api/paper", headers=auth(token), json={"subject": "Physics", "chapters": ["Ch 1: Measurements"], "kind": "full", "board": "Federal Board"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["minutes"] == 150 and p["long"][0]["marks"] == 8 and p["short"][0]["answer"] == "F x d"
    prompt = sent[0]["contents"][0]["parts"][-1]["text"]
    assert "FBISE" in prompt and "Ch 1: Measurements" in prompt


def test_parent_link(client, make_user):
    name, _, token = make_user()
    client.put("/api/state", headers=auth(token), json={"data": {"tasks": [{"text": "secret task"}], "share": {"pct": 40, "streak": 3}}})
    assert client.get("/api/parent-link", headers=auth(token)).json()["active"] is False
    link = client.post("/api/parent-link", headers=auth(token)).json()["token"]
    view = client.get(f"/api/parent/{link}").json()
    assert view["username"] == name and view["share"] == {"pct": 40, "streak": 3}
    assert "secret task" not in json.dumps(view)  # only the summary, never the planner itself
    # a new link replaces the old one; switching off kills it
    link2 = client.post("/api/parent-link", headers=auth(token)).json()["token"]
    assert client.get(f"/api/parent/{link}").status_code == 404
    assert client.delete("/api/parent-link", headers=auth(token)).status_code == 200
    assert client.get(f"/api/parent/{link2}").status_code == 404


def test_city_board(client, make_user):
    from datetime import date
    _, _, token = make_user()
    today = date.today().isoformat()
    data = {"settings": {"board": True, "city": "  zz test city "}, "sessions": [{"date": today, "min": 25}, {"date": today, "min": 25, "sample": True}]}
    client.put("/api/state", headers=auth(token), json={"data": data})
    cities = client.get("/api/leaderboard/cities").json()["cities"]
    mine = next(c for c in cities if c["city"] == "Zz Test City")
    assert mine["students"] == 1 and mine["minutes"] in (0, 25)  # 0 if the server's Pakistan "today" is another day


# ---------- Push reminders ----------
def decrypt_push(body: bytes, receiver, auth_secret: bytes) -> bytes:
    """What the browser does (RFC 8291), to prove push_encrypt is right."""
    salt, keylen = body[:16], body[20]
    as_pub = body[21:21 + keylen]
    ua_pub = receiver.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = receiver.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    ikm = HKDF(hashes.SHA256(), 32, salt=auth_secret, info=b"WebPush: info\x00" + ua_pub + as_pub).derive(shared)
    cek = HKDF(hashes.SHA256(), 16, salt=salt, info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt=salt, info=b"Content-Encoding: nonce\x00").derive(ikm)
    return AESGCM(cek).decrypt(nonce, body[21 + keylen:], None).rstrip(b"\x02")


def test_push_encryption_round_trip():
    receiver = ec.generate_private_key(ec.SECP256R1())
    ua_pub = receiver.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    secret = b"0123456789abcdef"
    body = srv.push_encrypt(srv.b64u(ua_pub), srv.b64u(secret), b'{"title":"hi"}')
    assert decrypt_push(body, receiver, secret) == b'{"title":"hi"}'


def test_reminder_picks_one_nudge():
    today = "2026-10-29"
    assert srv.reminder_for({"streak": 5, "lastDay": "2026-10-28"}, today)["title"].startswith("🔥")
    assert "2 chapters" in srv.reminder_for({"streak": 5, "lastDay": today, "due": ["2026-10-01", "2026-10-29", "2026-11-05"]}, today)["body"]
    assert srv.reminder_for({"tasksDue": ["2026-10-20"]}, today)["title"].startswith("✅")
    assert srv.reminder_for({"due": ["2026-12-01"]}, today) is None
    assert srv.reminder_for("junk", today) is None


def test_cron_needs_secret_and_sends(client, make_user, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    assert client.get("/api/cron/remind").status_code == 401
    assert client.get("/api/cron/remind", headers={"Authorization": "Bearer wrong"}).status_code == 401

    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setenv("VAPID_PRIVATE_KEY", srv.b64u(key.private_numbers().private_value.to_bytes(32, "big")))
    assert client.get("/api/push/key").json()["key"] == srv.vapid_public(key)
    _, _, token = make_user()
    endpoint = "https://push.example.com/zz-test-" + token[:8]
    sub = {"endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}}
    assert client.post("/api/push/subscribe", headers=auth(token), json=sub).status_code == 200
    client.put("/api/state", headers=auth(token), json={"data": {"share": {"tasksDue": ["2000-01-01"]}}})
    calls = []
    monkeypatch.setattr(srv, "send_push", lambda s, msg: calls.append((s["endpoint"], msg)) or 410)
    r = client.get("/api/cron/remind", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200 and (endpoint, ) == tuple(e for e, _ in calls if e == endpoint)
    assert r.json()["removed"] >= 1  # 410 = the browser unsubscribed, so it's deleted
    with srv.db() as conn:
        assert conn.execute("SELECT 1 FROM push_subs WHERE endpoint = %s", (endpoint,)).fetchone() is None


# ---------- Gemini fallback (Study Buddy timing out when Google is overloaded) ----------
def test_generate_moves_on_after_503_and_timeout(monkeypatch):
    calls = []

    def fake_request(path, payload=None, timeout=40, network_errors=False):
        model = path.split("/")[1].split(":")[0]
        calls.append((model, timeout))
        if model == "big":
            raise srv.GeminiError(503, "high demand")
        if model == "older":
            raise srv.GeminiError(504, "no answer in time (TimeoutError)")
        return {"ok": model}

    monkeypatch.setattr(srv, "gemini_models", lambda: ["big", "older", "lite"])
    monkeypatch.setattr(srv, "gemini_request", fake_request)
    monkeypatch.setattr(srv, "_busy_until", {})
    monkeypatch.setattr(srv.time, "sleep", lambda s: None)
    assert srv.generate({}, timeout=30) == {"ok": "lite"}
    assert [m for m, _ in calls] == ["big", "older", "lite"]
    # the two that failed wait at the back of the line for a while
    calls.clear()
    assert srv.generate({}, timeout=30) == {"ok": "lite"}
    assert calls[0][0] == "lite"


def test_generate_stops_at_its_time_budget(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(srv.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(srv.time, "sleep", lambda s: None)

    def slow(path, payload=None, timeout=40, network_errors=False):
        clock[0] += timeout  # every model takes its whole timeout, then gives up
        raise srv.GeminiError(504, "no answer in time")

    monkeypatch.setattr(srv, "gemini_models", lambda: ["a", "b", "c", "d"])
    monkeypatch.setattr(srv, "gemini_request", slow)
    monkeypatch.setattr(srv, "_busy_until", {})
    with pytest.raises(srv.HTTPException) as e:
        srv.generate({}, timeout=30)
    assert e.value.status_code == 503 and clock[0] <= 60
