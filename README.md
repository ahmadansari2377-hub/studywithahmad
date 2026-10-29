# Study with Ahmad

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fahmadansari2377-hub%2Fstudywithahmad&project-name=study-with-ahmad&repository-name=study-with-ahmad&env=DATABASE_URL&envDescription=Your%20Neon%20Postgres%20connection%20string%20(postgresql%3A%2F%2F...)&envLink=https%3A%2F%2Fconsole.neon.tech)

**Live:** https://study-with-ahmad.vercel.app

A study planner for **Matric (9th, 10th)** and **Intermediate (11th, 12th)** students of the **Punjab Board** (PTB / PCTB books) and the **Federal Board** (FBISE, National Book Foundation books).

## Features

- **Syllabus:** every chapter of your PTB or FBISE/NBF books (2026–27 editions) for Physics, Chemistry, Biology, Mathematics and Computer Science, plus English, Urdu, Islamiat, Pakistan Studies and Tarjama-tul-Quran. Pick the board in the first setup step. Mark chapters as *Read* or *Revised*, or add them to your task list.
- **Focus timer:** Pomodoro sessions with a subject picked for each one.
- **Tasks:** due dates and priorities.
- **Weekly timetable:** the block happening right now is highlighted.
- **Exam countdowns.**
- **Flashcards:** starter revision cards for your class, plus your own.
- **Progress:** weekly chart, time per subject and a study calendar.
- **Accounts:** your planner is saved in a PostgreSQL database (Neon), so you can sign in on any device.
- **AI Study Buddy** (Google Gemini): explanations, step-by-step numericals and board-style MCQs in English, Roman Urdu or Urdu; 40 requests per student per day.
- **AI study plan:** a day-by-day plan (two weeks at a time) from your unread chapters and exam date, added to Tasks in one tap.
- **Entry tests:** MDCAT, ECAT and ECAT (ICS) paper patterns, FSc chapter tracking, mock timers and practice MCQs.
- **Leaderboard:** opt-in weekly focus minutes, by class or city.
- **Password reset:** by a 6-digit email code (if the student added an email), or by the one-time recovery code. Signed-in students can add/change their email and change their password.
- **Urdu interface:** navigation, headings and main buttons in Urdu (footer switch).
- **Dark mode**, AMOLED black and five accent colours, and animations throughout (GSAP + Lenis).

Classes and groups: 9th/10th Science (Biology or Computer), and 11th/12th Pre-Medical, Pre-Engineering or ICS.

## Run it locally

You need [uv](https://docs.astral.sh/uv/) installed.

1. Create a `.env` file in the project folder with your database URL:

   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```

   **Never commit `.env`.** It is listed in `.gitignore`.

2. Start the server:

   ```
   uv run website
   ```

3. Open **http://127.0.0.1:8000**.

The server creates its tables (`users`, `auth_tokens`, `planner_data`, `login_failures`) on first start. You can also open `public/index.html` directly without the server, but then data is only saved in that browser.

## Put it online (Vercel, free)

**One click:** press the **Deploy with Vercel** button at the top. Vercel copies this repo to your GitHub, asks for `DATABASE_URL` (paste your Neon `postgresql://...` link) and publishes the site.

Or do it by hand:

1. Sign in at [vercel.com](https://vercel.com) with your GitHub account.
2. Go to [vercel.com/new](https://vercel.com/new), find the **website** repository and click **Import**.
3. Open **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: the same Neon URL that is in your `.env` file
4. Click **Deploy**. After about a minute your site is live at a link like **https://website-xxxx.vercel.app**. You can rename it under **Settings → Domains**, for example to `studywithahmad.vercel.app`.

After that, every `git push` to `main` updates the live site automatically.

How it runs on Vercel:
- Files in `public/` (the page, CSS and JS) are served from Vercel's CDN, so the page loads fast and never "sleeps".
- `app.py` exposes the FastAPI app, which runs as a Vercel Function for `/api/...` requests. The first request after a quiet period takes a second or two to start.
- Python 3.14 is read from `.python-version`, and dependencies come from `pyproject.toml` / `uv.lock`.
- Tip: in the Neon dashboard you can copy the **pooled** connection string (its host contains `-pooler`). It handles many short serverless connections better.

## Apps

The site's **Get the app** section offers:

- **Android:** `public/downloads/study-with-ahmad.apk`, a Trusted Web Activity built with [PWABuilder](https://www.pwabuilder.com) (package `app.vercel.studywithahmad`). `/.well-known/assetlinks.json` (served by `server.py`, because Vercel skips dot-folders in `public/`) lets it open full-screen without an address bar. The signing key lives in `android-signing/` on the owner's PC and is **never committed**: keep a backup, because every future update (and a Play Store upload, using the `.aab` file there) must be signed with the same key.
- **Windows:** `public/downloads/StudyWithAhmad.exe`, built from `desktop/StudyWithAhmad.cs` with `sh desktop/build.sh` (uses the C# compiler that ships with Windows). The first run installs it to `%LOCALAPPDATA%\Programs\StudyWithAhmad` with Desktop and Start menu shortcuts and opens the planner in an Edge/Chrome app window. `StudyWithAhmad.exe /uninstall` removes it.
- **Any device:** the site is a PWA (`manifest.webmanifest`, `sw.js`), so Chrome, Edge and Safari can install it directly. iPhone users use Share → Add to Home Screen.

## Password reset emails (Gmail, free)

1. Use a Gmail account for the site (2-Step Verification must be on).
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an app password named "Study with Ahmad" and copy the 16 letters.
3. In Vercel → **study-with-ahmad** → Settings → Environment Variables, add:
   - `SMTP_USER` = the Gmail address
   - `SMTP_PASSWORD` = the app password
4. Redeploy. "Forgot password → Email me a code" now works (Gmail allows about 500 emails a day).

Any other SMTP service works too: also set `SMTP_HOST`, `SMTP_PORT` (465 = SSL, 587 = STARTTLS) and optionally `SMTP_FROM`.

## Security

- Passwords are stored as scrypt hashes, never as plain text.
- **Login limit:** after 3 wrong passwords from the same connection, signing in to that account from there is paused for 15 minutes (so nobody can lock you out by typing your username). One internet connection can make at most 30 wrong attempts per 15 minutes.
- **Sign-up limit:** at most 40 new accounts per internet connection per hour. That stops bots filling the database, and still lets a whole class sign up on one Wi-Fi.
- If the database is asleep or unreachable when the server starts, it tries again on later requests (every 10 seconds at most), so sign-in comes back by itself.
- Usernames are unique regardless of capital letters (`Ali` and `ali` are the same account).
- Sign-ins expire after 30 days.
- The server only serves the four public files. `.env`, `.git` and the source code are never reachable from the web.

## Tests

```
uv run --with pytest --with httpx pytest
```

- `tests/test_api.py`: sign-up, login limits, planner saving, recovery-code and email resets, account settings, and that private files are never served. It uses `DATABASE_URL` (or `.env`); every test account is called `zz_test_...` and deleted afterwards.
- `tests/test_static.py`: JavaScript syntax and `tests/check_syllabus.js` (every board, class and group has a chapter list for each of its subjects).
- `tests/test_ui.py`: a browser test. Start `uv run website`, then run it with `BASE_URL=http://127.0.0.1:8000 PW_CHANNEL=msedge uv run --with pytest --with httpx --with playwright pytest tests/test_ui.py` (`msedge` uses the Edge already installed on Windows).

GitHub Actions (`.github/workflows/tests.yml`) runs all of them on every push, against an empty throwaway Postgres, never the live database. A red ✗ next to a commit on GitHub means something broke.

## Known limitations

- **Email reset needs the email settings below.** Without them, students reset with their recovery code. A student who lost both can send a **Koi masla?** message; after checking it's really them, run `uv run reset-code <username>` on your PC (uses `.env`) and give them the new code it prints.
- **Last save wins.** Each device uploads the whole planner, so if the same account is edited on a phone and a laptop at the same moment, the device that saves last overwrites the other. Changes made offline are kept and uploaded when the connection returns.
- **Shared Wi-Fi.** The 30-attempts-per-connection limit counts everyone behind the same public IP (for example a school or event network) together; it is set high enough for a busy room.

## Project files

| File | What it does |
|---|---|
| `public/index.html`, `public/study.css`, `public/study.js` | The planner (page, styles, behaviour) |
| `public/syllabus.js` | PTB and FBISE chapter lists and starter flashcards |
| `src/website/server.py` | FastAPI server: accounts and planner storage in Postgres |
| `src/website/__init__.py` | `uv run website` entry point (local) |
| `app.py` | Vercel entry point |

Chapter names follow the 2026–27 PTB and NBF (FBISE) editions. FBISE lists were gathered from study sites (studyplusplus.com, cross-checked with others) and the subject plan follows FBISE's Inclusive Scheme of Studies 2024 (Islamiat in 9th/11th, Pakistan Studies examined in 10th/12th). FBISE chapter ticks are saved separately from PTB ones. Always check them against your printed textbook. The official books are free at [pctb.punjab.gov.pk](https://pctb.punjab.gov.pk/).
