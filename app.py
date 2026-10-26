"""Vercel entrypoint: Vercel looks for a FastAPI instance named `app` in app.py at the project root."""

import sys
from pathlib import Path

# The server lives in src/website/ (uv's src layout); make it importable on Vercel.
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from website.server import app  # noqa: E402

__all__ = ["app"]
