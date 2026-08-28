"""Authenticated, fail-closed facade for the shared news aggregation API."""

from __future__ import annotations

import os
import re

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

router = APIRouter(prefix="/api/v1/news", tags=["news"])

_EVENT_PATH_RE = re.compile(
    r"^events/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
_RESPONSE_HEADERS = {
    "cache-control",
    "content-type",
    "etag",
    "last-modified",
}


def _upstream_base_url() -> str:
    return os.getenv(
        "FINANCE_NEWS_INTERNAL_API_URL",
        "http://finance-api:8000/api/news",
    ).rstrip("/")


def _is_allowed_news_read(path: str, method: str) -> bool:
    if method.upper() not in {"GET", "HEAD"}:
        return False
    return path in {"feed", "rankings", "health"} or bool(_EVENT_PATH_RE.fullmatch(path))


@router.api_route("/{path:path}", methods=["GET", "HEAD"])
async def proxy_news(path: str, request: Request) -> Response:
    normalized_path = path.strip("/")
    if not _is_allowed_news_read(normalized_path, request.method):
        raise HTTPException(status_code=404, detail="News endpoint not found")

    headers = {name: value for name in ("accept", "if-none-match", "if-modified-since") if (value := request.headers.get(name))}
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=5.0),
            trust_env=False,
        ) as client:
            upstream = await client.request(
                request.method,
                f"{_upstream_base_url()}/{normalized_path}",
                params=list(request.query_params.multi_items()),
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="News aggregation service is unavailable",
        ) from exc

    response_headers = {name: value for name, value in upstream.headers.items() if name.lower() in _RESPONSE_HEADERS}
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )
