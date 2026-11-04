"""Browser smoke test: the page loads without JavaScript errors and a new student can set up a planner.

Needs a running server and Playwright, so it only runs when BASE_URL is set:
    uv run website                       (in one terminal)
    BASE_URL=http://127.0.0.1:8000 PW_CHANNEL=msedge uv run --with pytest --with httpx --with playwright pytest tests/test_ui.py
PW_CHANNEL=msedge uses the Edge already on Windows; GitHub Actions uses Playwright's own Chromium.
"""

import os

import pytest

BASE_URL = os.environ.get("BASE_URL")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="set BASE_URL to run the browser test")


@pytest.fixture
def page():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None, headless=True)
        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        yield pg
        browser.close()


@pytest.mark.parametrize("board, cls, physics_first", [("ptb", "9", "Physical Quantities"), ("fbise", "10", "Heat Capacity")])
def test_new_student_setup(page, board, cls, physics_first):
    page.goto(BASE_URL, wait_until="networkidle")
    page.click('#setup .step[data-step="0"] [data-go="1"]')
    page.click(f'#boardChoices [data-board="{board}"]')
    page.click(f'#classChoices [data-cls="{cls}"]')
    page.click("#groupChoices button >> nth=0")
    page.click("#setupDone")
    page.wait_for_selector(".chapter")
    assert physics_first in page.text_content("#syllabus")
    assert page.evaluate("JSON.parse(localStorage.getItem('studynest-v2')).profile.board") == board
    assert page.errors == []


def test_phone_layout_has_no_sideways_scroll(page):
    page.set_viewport_size({"width": 390, "height": 800})
    page.goto(BASE_URL, wait_until="networkidle")
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
    assert page.errors == []


def test_demo_mode(page):
    page.goto(BASE_URL + "/?demo", wait_until="networkidle")
    page.wait_for_selector(".chapter")
    assert page.is_visible("#demoBar")
    assert "%" in page.text_content("#predict")
    assert page.locator("#badges li.on").count() >= 3
    # nothing from the demo is saved on the device
    assert page.evaluate("localStorage.getItem('studynest-v2')") is None
    page.click("#demoExit")
    page.wait_for_load_state("networkidle")
    assert not page.is_visible("#demoBar")
    assert page.errors == []


def test_arts_student_adds_own_chapters(page):
    page.goto(BASE_URL, wait_until="networkidle")
    page.click('#setup .step[data-step="0"] [data-go="1"]')
    page.click('#classChoices [data-cls="11"]')
    page.click('#groupChoices [data-group="arts"]')
    assert page.is_disabled("#stepGroupNext")
    page.click('#electiveChoices [data-el="el-civics"]')
    page.click('#electiveChoices [data-el="computer"]')
    page.click("#stepGroupNext")
    page.click("#setupDone")
    page.click('#sylSubjects [data-subj="el-civics"]')
    page.fill("#bookChapters", "1. Introduction to Civics\nCh 2: State and Government\nCitizenship")
    page.click('[data-act="book-save"]')
    page.wait_for_selector(".chapter >> text=State and Government")
    assert page.locator("#chapters .chapter").count() == 3
    assert page.evaluate("JSON.parse(localStorage.getItem('studynest-v2')).profile.electives") == ["el-civics", "computer"]
    assert page.errors == []


def test_two_devices_and_the_sync_status(make_user):
    """The offline conflict in real browsers: the phone's older tick must lose to the laptop's newer untick, on every device."""
    from playwright.sync_api import sync_playwright

    name, _, token = make_user()
    sign_in = f"localStorage.setItem('studynest-token', {token!r}); localStorage.setItem('studynest-user', {name!r});"
    status = "#syncStatus"
    tick = "#chapters .chapter >> nth=0 >> .toggle.read"

    def synced(pg):
        pg.wait_for_selector(f'{status}[data-state="synced"]', timeout=30_000)
        assert pg.text_content(status).strip() == "Changes saved"

    def is_ticked(pg):
        return "on" in pg.get_attribute(tick, "class").split()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None, headless=True)
        phone_ctx, laptop_ctx = browser.new_context(), browser.new_context()
        phone_ctx.add_init_script(sign_in)
        laptop_ctx.add_init_script(sign_in)
        phone, laptop = phone_ctx.new_page(), laptop_ctx.new_page()
        errors = []
        phone.on("pageerror", lambda e: errors.append(str(e)))
        laptop.on("pageerror", lambda e: errors.append(str(e)))

        phone.goto(BASE_URL, wait_until="networkidle")
        phone.click('#setup .step[data-step="0"] [data-go="1"]')
        phone.click('#boardChoices [data-board="ptb"]')
        phone.click('#classChoices [data-cls="9"]')
        phone.click("#groupChoices button >> nth=0")
        phone.click("#setupDone")
        phone.wait_for_selector(".chapter")
        synced(phone)
        laptop.goto(BASE_URL, wait_until="networkidle")
        laptop.wait_for_selector(".chapter")
        synced(laptop)
        laptop.set_viewport_size({"width": 360, "height": 700})  # the pill must not push a small phone sideways
        assert laptop.evaluate("document.documentElement.scrollWidth") <= 360
        laptop.set_viewport_size({"width": 1280, "height": 720})  # phone sizes show one tab at a time, which can hide the chapters

        # The phone goes offline and ticks the chapter: kept on the device, and the pill says so
        phone_ctx.set_offline(True)
        phone.wait_for_selector(f'{status}[data-state="offline"]')
        assert phone.text_content(status).strip() == "Saved locally"
        phone.click(tick)
        assert is_ticked(phone)
        assert phone.get_attribute(status, "data-state") == "offline"

        # A little later the laptop, online, ticks and unticks the same chapter, so its last action is "not read"
        laptop.wait_for_timeout(50)
        laptop.click(tick)
        synced(laptop)
        laptop.click(tick)
        assert laptop.get_attribute(status, "data-state") == "syncing"
        assert laptop.text_content(status).strip() == "Syncing..."
        synced(laptop)
        assert not is_ticked(laptop)

        # The phone comes back with its older change: it is discarded and the phone shows the laptop's state
        phone_ctx.set_offline(False)
        phone.wait_for_function("!Object.values(JSON.parse(localStorage.getItem('studynest-v2')).syl).some((p) => p.dirty)", timeout=30_000)
        synced(phone)
        assert not is_ticked(phone)

        # And it stays that way after both reload, even though the phone also uploaded its whole planner
        for pg in (phone, laptop):
            pg.reload(wait_until="networkidle")
            pg.wait_for_selector(".chapter")
            synced(pg)
            assert not is_ticked(pg)
        browser.close()
    assert errors == []
