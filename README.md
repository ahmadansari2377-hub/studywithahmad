# Study with Ahmad

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fahmadansari2377-hub%2Fstudywithahmad&project-name=study-with-ahmad&repository-name=study-with-ahmad&env=DATABASE_URL&envDescription=Your%20Neon%20Postgres%20connection%20string%20(postgresql%3A%2F%2F...)&envLink=https%3A%2F%2Fconsole.neon.tech)

**Live:** https://study-with-ahmad.vercel.app

A study planner for **Matric (9th, 10th)** and **Intermediate (11th, 12th)** students of the Punjab Textbook Board (PTB / PCTB).

## Features

- **Syllabus:** every chapter of your PTB books (2026–27 editions) for Physics, Chemistry, Biology, Mathematics and Computer Science. Mark chapters as *Read* or *Revised*, or add them to your task list.
- **Focus timer:** Pomodoro sessions with a subject picked for each one.
- **Tasks:** due dates and priorities.
- **Weekly timetable:** the block happening right now is highlighted.
- **Exam countdowns.**
- **Flashcards:** starter revision cards for your class, plus your own.
- **Progress:** weekly chart, time per subject and a study calendar.
- **Accounts:** your planner is saved in a PostgreSQL database (Neon), so you can sign in on any device.
- **Dark mode**, and animations throughout (GSAP + Lenis).

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

## Security

- Passwords are stored as scrypt hashes, never as plain text.
- **Login limit:** after 3 wrong passwords, an account is locked for 15 minutes. One internet connection can make at most 10 wrong attempts per 15 minutes.
- Sign-ins expire after 30 days.
- The server only serves the four public files. `.env`, `.git` and the source code are never reachable from the web.

## Project files

| File | What it does |
|---|---|
| `public/index.html`, `public/study.css`, `public/study.js` | The planner (page, styles, behaviour) |
| `public/syllabus.js` | PTB chapter lists and starter flashcards |
| `src/website/server.py` | FastAPI server: accounts and planner storage in Postgres |
| `src/website/__init__.py` | `uv run website` entry point (local) |
| `app.py` | Vercel entry point |

Chapter names follow the 2026–27 PTB editions. Always check them against your printed textbook. The official books are free at [pctb.punjab.gov.pk](https://pctb.punjab.gov.pk/).
