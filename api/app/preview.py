"""Live-preview URL extraction for TinyFish runs.

Agent: `StreamingUrlEvent.streaming_url` (SSE event type STREAMING_URL) and `Run.streaming_url` (while running).
ProgressEvent carries no screenshot. Research events have no documented live view; any streaming URL found in
their payloads is passed through. Browser API has no live-view URL (only a DevTools inspector via {base_url}/pages,
which grants control, so it is not exposed); screenshots are the Browser preview."""
from typing import Any

KEYS = ("streaming_url", "streamingUrl", "live_view_url", "liveViewUrl", "preview_url")


def extract_preview(event_or_run: Any) -> str | None:
    """Return an http(s)/ws(s) live-view URL from an agent event, run object, or dict; else None."""
    if event_or_run is None:
        return None
    for k in KEYS:
        v = getattr(event_or_run, k, None)
        if isinstance(v, str) and v.startswith(("http://", "https://", "ws://", "wss://")):
            return v
    d: Any = event_or_run if isinstance(event_or_run, dict) else None
    if d is None and hasattr(event_or_run, "model_dump"):
        try:
            d = event_or_run.model_dump(by_alias=False)
        except Exception:  # noqa: BLE001
            d = None
    if isinstance(d, dict):
        for k in KEYS:
            v = d.get(k)
            if isinstance(v, str) and v.startswith(("http://", "https://", "ws://", "wss://")):
                return v
        for k in ("data", "run", "payload"):
            if isinstance(d.get(k), dict):
                v = extract_preview(d[k])
                if v:
                    return v
    return None
