"""Cancel this account's queued/running TinyFish agent runs so the 2-run concurrency queue is free before a demo.
Usage: TINYFISH_API_KEY=... python3 scripts/cancel_agent_runs.py
Uses the REST API: GET /v1/runs, POST /v1/runs/batch/cancel (up to 100 ids per call).
"""
import json
import os
import sys
import urllib.request

KEY = os.environ.get("TINYFISH_API_KEY") or sys.exit("set TINYFISH_API_KEY")
BASE = "https://agent.tinyfish.ai/v1"
ACTIVE = ("PENDING", "QUEUED", "RUNNING", "IN_PROGRESS", "STARTED", "CREATED")


def call(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


runs = []
for page_param in ("?limit=100", "?page_size=100", ""):
    try:
        data = call("GET", "/runs" + page_param)
        runs = data.get("runs") or data.get("data") or data.get("items") or (data if isinstance(data, list) else [])
        if runs:
            break
    except Exception as e:  # noqa: BLE001
        print("list failed", page_param, type(e).__name__, str(e)[:120])
ids = [r.get("run_id") or r.get("id") for r in runs if str(r.get("status", "")).upper() in ACTIVE]
print(f"listed {len(runs)} runs, {len(ids)} active")
cancelled = 0
for i in range(0, len(ids), 100):
    chunk = ids[i:i + 100]
    try:
        out = call("POST", "/runs/batch/cancel", {"run_ids": chunk})
        cancelled += len(chunk)
        print("batch cancel ->", str(out)[:200])
    except Exception as e:  # noqa: BLE001
        print("batch cancel failed, trying one by one:", type(e).__name__, str(e)[:120])
        for rid in chunk:
            try:
                call("POST", f"/runs/{rid}/cancel")
                cancelled += 1
            except Exception as e2:  # noqa: BLE001
                print("cancel failed", rid, type(e2).__name__)
print(f"cancelled {cancelled}")
