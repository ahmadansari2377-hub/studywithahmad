# Study with Ahmad

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

The server creates its tables (`users`, `auth_tokens`, `planner_data`, `login_failures`) on first start. You can also open `study.html` directly without the server, but then data is only saved in that browser.

## Put it online (Render, free)

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. Click **New → Blueprint**, choose this repository, and click **Apply**. Render reads `render.yaml`.
3. When it asks for **DATABASE_URL**, paste the same Neon URL that is in your `.env` file.
4. Wait for the first build (a few minutes). Your site will be at **https://study-with-ahmad.onrender.com**, or a similar link if that name is taken.

After that, every `git push` to `main` updates the live site automatically.

Good to know:
- The free plan sleeps after about 15 minutes without visitors. The next visit takes up to a minute to wake it up.
- If the build says Python 3.14 isn't available, add an environment variable `PYTHON_VERSION` with a full version number such as `3.14.0`.

## Security

- Passwords are stored as scrypt hashes, never as plain text.
- **Login limit:** after 3 wrong passwords, an account is locked for 15 minutes. One internet connection can make at most 10 wrong attempts per 15 minutes.
- Sign-ins expire after 30 days.
- The server only serves the four public files. `.env`, `.git` and the source code are never reachable from the web.

## Project files

| File | What it does |
|---|---|
| `study.html`, `study.css`, `study.js` | The planner (page, styles, behaviour) |
| `syllabus.js` | PTB chapter lists and starter flashcards |
| `src/website/server.py` | FastAPI server: accounts and planner storage in Postgres |
| `src/website/__init__.py` | `uv run website` entry point |

Chapter names follow the 2026–27 PTB editions. Always check them against your printed textbook. The official books are free at [pctb.punjab.gov.pk](https://pctb.punjab.gov.pk/).
