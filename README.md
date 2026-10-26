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

The server creates its tables (`users`, `auth_tokens`, `planner_data`) on first start. You can also open `study.html` directly without the server, but then data is only saved in that browser.

## Project files

| File | What it does |
|---|---|
| `study.html`, `study.css`, `study.js` | The planner (page, styles, behaviour) |
| `syllabus.js` | PTB chapter lists and starter flashcards |
| `src/website/server.py` | FastAPI server: accounts and planner storage in Postgres |
| `src/website/__init__.py` | `uv run website` entry point |

Chapter names follow the 2026–27 PTB editions. Always check them against your printed textbook. The official books are free at [pctb.punjab.gov.pk](https://pctb.punjab.gov.pk/).
