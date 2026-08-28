"""Security and routing contracts for the Gateway news facade."""

from app.gateway.routers.news_proxy import _is_allowed_news_read


def test_news_proxy_allowlist_is_read_only_and_fail_closed() -> None:
    event_id = "97fe39f2-7e0c-4b30-af63-143d9f4f08d7"
    assert _is_allowed_news_read("feed", "GET") is True
    assert _is_allowed_news_read("rankings", "HEAD") is True
    assert _is_allowed_news_read("health", "GET") is True
    assert _is_allowed_news_read(f"events/{event_id}", "GET") is True

    assert _is_allowed_news_read("feed", "POST") is False
    assert _is_allowed_news_read("events/not-a-uuid", "GET") is False
    assert _is_allowed_news_read("internal/deerflow/portfolios", "GET") is False
    assert _is_allowed_news_read("openapi.json", "GET") is False
