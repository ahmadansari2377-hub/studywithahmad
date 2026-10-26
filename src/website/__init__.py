def main() -> None:
    import uvicorn

    print("StudyNest running at http://127.0.0.1:8000  (Ctrl+C to stop)")
    uvicorn.run("website.server:app", host="127.0.0.1", port=8000)
