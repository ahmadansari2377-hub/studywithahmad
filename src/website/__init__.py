def main() -> None:
    import os

    import uvicorn

    # Locally: http://127.0.0.1:8000. On a host like Render, PORT is set and we listen publicly.
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST") or ("0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    print(f"Study with Ahmad running at http://{'127.0.0.1' if host == '0.0.0.0' else host}:{port}  (Ctrl+C to stop)")
    # Trust the host's proxy so login limits see each visitor's real IP address
    uvicorn.run("website.server:app", host=host, port=port, proxy_headers=True,
                forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"))
