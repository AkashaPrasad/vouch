import httpx

_client: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(http2=True, timeout=10, headers={"user-agent": "vouch/0.1"}, follow_redirects=True)
    return _client


async def close_http() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
