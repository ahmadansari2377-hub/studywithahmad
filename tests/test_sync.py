"""Last-Write-Wins chapter sync (/api/sync): what happens when two devices change the same chapter.

The main test is the offline case: a phone ticks a chapter while offline, a laptop unticks it later while online,
and only then does the phone reconnect and send its older change. The laptop's newer state must survive.

Times are fixed dates in the past, because the server pulls anything in the future back to "now".
"""

import datetime as dt

import pytest
from conftest import auth

CHAPTER = "9-physics-3"
NOON = "2026-01-15T12:00:00+00:00"
FIVE_PAST = "2026-01-15T12:05:00+00:00"


@pytest.fixture
def student(client, make_user):
    """(address of this student's /api/sync, their auth header)"""
    _, _, token = make_user()
    headers = auth(token)
    return f"/api/sync/{client.get('/api/me', headers=headers).json()['id']}", headers


def send(client, student, *changes):
    path, headers = student
    return client.post(path, headers=headers, json={"changes": list(changes)})


def stored(client, student, chapter=CHAPTER):
    path, headers = student
    rows = client.get(path, headers=headers).json()["chapters"]
    return next(r for r in rows if r["chapter_id"] == chapter)


def change(is_completed, updated_at, chapter=CHAPTER):
    return {"chapter_id": chapter, "is_completed": is_completed, "updated_at": updated_at}


def test_delayed_offline_change_does_not_overwrite_newer_one(client, student):
    # The chapter starts out incomplete
    start = send(client, student, change(False, "2026-01-15T09:00:00+00:00"))
    assert start.status_code == 200
    assert stored(client, student)["is_completed"] is False

    # 12:00: Device A marks it complete while offline, so this request is only built, not sent
    device_a_offline_change = change(True, NOON)

    # 12:05: Device B marks it incomplete while online, and that reaches the server straight away
    device_b = send(client, student, change(False, FIVE_PAST))
    assert device_b.status_code == 200
    assert device_b.json()["results"][0]["applied"] is True

    # Later: Device A comes back online and sends its 12:00 change
    device_a = send(client, student, device_a_offline_change)

    # Accepted without an error, but thrown away, and Device A is told what the real state is
    assert device_a.status_code == 200
    result = device_a.json()["results"][0]
    assert result["applied"] is False
    assert result["is_completed"] is False
    assert result["updated_at"] == FIVE_PAST

    # What is stored is still Device B's change, with Device B's time
    final = stored(client, student)
    assert final["is_completed"] is False
    assert dt.datetime.fromisoformat(final["updated_at"]) == dt.datetime.fromisoformat(FIVE_PAST)


def test_newer_change_is_saved_with_its_time(client, student):
    send(client, student, change(False, NOON))
    result = send(client, student, change(True, FIVE_PAST)).json()["results"][0]
    assert result["applied"] is True
    assert stored(client, student)["is_completed"] is True
    assert stored(client, student)["updated_at"] == FIVE_PAST


def test_same_change_sent_twice_is_harmless(client, student):
    """A device retries when the answer to its request got lost."""
    assert send(client, student, change(True, NOON)).json()["results"][0]["applied"] is True
    retry = send(client, student, change(True, NOON))
    assert retry.status_code == 200
    assert retry.json()["results"][0]["applied"] is False


def test_times_are_compared_across_time_zones(client, student):
    # 17:05 in Pakistan is 12:05 UTC, so a change at 12:00 UTC is older
    send(client, student, change(True, "2026-01-15T17:05:00+05:00"))
    older = send(client, student, change(False, "2026-01-15T12:00:00Z"))
    assert older.json()["results"][0]["applied"] is False

    # A clock reading that looks earlier (07:06) can be later: 07:06 in New York is 12:06 UTC
    newer = send(client, student, change(False, "2026-01-15T07:06:00-05:00"))
    assert newer.json()["results"][0]["applied"] is True
    assert stored(client, student)["updated_at"] == "2026-01-15T12:06:00+00:00"


def test_time_without_a_timezone_is_refused(client, student):
    r = send(client, student, change(True, "2026-01-15T12:00:00"))
    assert r.status_code == 422


@pytest.mark.parametrize("bad", ["yesterday", "", "2026-13-40T12:00:00Z", "0001-01-01T00:00:00+05:00"])
def test_unusable_times_are_refused_not_crashed_on(client, student, bad):
    assert send(client, student, change(True, bad)).status_code == 422


def test_clock_running_ahead_cannot_win_forever(client, student):
    """A phone set to next year must not pin the chapter: its time is pulled back to now, so a real later change still wins."""
    future = (dt.datetime.now(dt.UTC) + dt.timedelta(days=365)).isoformat()
    saved = send(client, student, change(True, future)).json()["results"][0]
    assert saved["applied"] is True
    assert dt.datetime.fromisoformat(saved["updated_at"]) <= dt.datetime.now(dt.UTC)

    later = (dt.datetime.now(dt.timezone(dt.timedelta(hours=5))) + dt.timedelta(seconds=1)).isoformat()
    # The server pulls this back to now as well, which is still after the first change
    assert send(client, student, change(False, later)).json()["results"][0]["applied"] is True
    assert stored(client, student)["is_completed"] is False


def test_one_batch_can_hold_winners_and_losers(client, student):
    send(client, student, change(True, FIVE_PAST, "9-physics-1"))
    results = send(
        client, student, change(False, NOON, "9-physics-1"), change(True, NOON, "9-physics-2")
    ).json()["results"]
    applied = {r["chapter_id"]: r["applied"] for r in results}
    assert applied == {"9-physics-1": False, "9-physics-2": True}


def test_cannot_touch_another_students_progress(client, student, make_user):
    path, _ = student
    _, _, other_token = make_user()
    other = auth(other_token)
    assert client.post(path, headers=other, json={"changes": [change(True, NOON)]}).status_code == 403
    assert client.get(path, headers=other).status_code == 403
    assert client.delete(path, headers=other).status_code == 403
    assert client.get(path).status_code == 401  # and not at all without signing in


def test_old_whole_planner_upload_cannot_bring_back_an_old_chapter(client, student):
    """The planner blob is still uploaded whole, so a stale device's blob must not beat the chapter's row when loading."""
    _, headers = student
    send(client, student, change(False, FIVE_PAST))
    stale_blob = {"tasks": [], "syl": {CHAPTER: {"r": True}, "9-physics-4": {"r": True}}}
    assert client.put("/api/state", headers=headers, json={"data": stale_blob}).status_code == 200

    syl = client.get("/api/state", headers=headers).json()["data"]["syl"]
    assert syl[CHAPTER]["r"] is False  # the row wins
    assert syl[CHAPTER]["t"] == FIVE_PAST
    assert syl["9-physics-4"] == {"r": True}  # a chapter with no row keeps its value from the blob


def test_clearing_removes_the_chapters(client, student):
    path, headers = student
    send(client, student, change(True, NOON))
    assert client.put("/api/state", headers=headers, json={"data": {"syl": {}}}).status_code == 200
    assert client.delete(path, headers=headers).status_code == 200
    assert client.get(path, headers=headers).json()["chapters"] == []
    assert client.get("/api/state", headers=headers).json()["data"]["syl"] == {}
