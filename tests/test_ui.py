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
