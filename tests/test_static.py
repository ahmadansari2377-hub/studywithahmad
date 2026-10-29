"""Checks that need no database: JavaScript syntax and the syllabus data."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
node = shutil.which("node")


@pytest.mark.skipif(not node, reason="Node.js is not installed")
@pytest.mark.parametrize("name", sorted(p.name for p in (ROOT / "public").glob("*.js")))
def test_js_syntax(name):
    r = subprocess.run([node, "--check", str(ROOT / "public" / name)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


@pytest.mark.skipif(not node, reason="Node.js is not installed")
def test_syllabus_data():
    r = subprocess.run([node, str(ROOT / "tests" / "check_syllabus.js")], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
