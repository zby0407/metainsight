"""Unit tests for digest push helpers and policy filtering."""

from __future__ import annotations

from datetime import date

from app.gateway.digest_push import (
    INDEX_SYMBOLS,
    _compact,
    _fmt_pct,
    _fmt_price,
    _is_policy_item,
    _quote_field,
    iso_week_period,
    month_period,
    previous_month_period,
)


def test_policy_keyword_match() -> None:
    assert _is_policy_item("国务院发布新能源产业政策", "")
    assert _is_policy_item("市场快讯", "央行降准落地")
    assert _is_policy_item("国家发改委就管理办法公开征求意见", "")
    assert _is_policy_item("财政部公布预算收入数据", "")
    assert not _is_policy_item("某公司发布财报", "营收增长")


def test_period_helpers() -> None:
    assert month_period(date(2026, 8, 21)) == "2026-08"
    assert previous_month_period(date(2026, 8, 1)) == "2026-07"
    assert previous_month_period(date(2026, 1, 1)) == "2025-12"
    assert iso_week_period(date(2026, 8, 21)).startswith("2026-W")


def test_compact_and_pct() -> None:
    assert _fmt_pct(1.234) == "+1.23%"
    assert _fmt_pct(-0.5) == "-0.50%"
    assert _fmt_pct("x") == "-"
    assert _fmt_price(3874.231) == "3874.23"
    assert _quote_field({"current": 3200.1, "price": 11.4}, "current", "price") == 3200.1
    assert {symbol for symbol, _name in INDEX_SYMBOLS} == {
        "000001.SH",
        "399001.SZ",
        "399006.SZ",
    }
    assert len(_compact("a" * 20, 10)) == 10
    assert _compact("a" * 20, 10).endswith("…")
