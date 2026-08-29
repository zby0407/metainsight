"""Contracts for the explainable insight orchestration router."""

from __future__ import annotations

import json

import pytest

from app.gateway.routers.portfolio_insights import (
    FollowUpMessage,
    InsightGenerateRequest,
    SandboxSpec,
    SYSTEM_PROMPT,
    TASK_PROMPTS,
    build_compute_request,
    build_followup_messages,
    build_interpretation_messages,
    chunk_text,
    sse_event,
)


def test_build_compute_request_review_passes_period_params() -> None:
    body = InsightGenerateRequest(account_id=7, start_date="2026-08-01", end_date="2026-08-28")
    method, path, kwargs = build_compute_request("review", body)
    assert method == "GET"
    assert path == "/portfolio/review"
    assert kwargs["params"] == {
        "account_id": 7,
        "start_date": "2026-08-01",
        "end_date": "2026-08-28",
    }


def test_build_compute_request_risk_and_strategy() -> None:
    risk = build_compute_request("risk", InsightGenerateRequest())
    assert risk[:2] == ("GET", "/portfolio/risk-insight")
    strategy = build_compute_request("strategy", InsightGenerateRequest(account_id=3))
    assert strategy[:2] == ("GET", "/portfolio/strategy-candidates")
    assert strategy[2]["params"] == {"account_id": 3}


def test_build_compute_request_sandbox_what_if() -> None:
    body = InsightGenerateRequest(
        sandbox=SandboxSpec(mode="what_if", adjustments=[{"symbol": "600519", "delta_weight_pct": -5}])
    )
    method, path, kwargs = build_compute_request("sandbox", body)
    assert (method, path) == ("POST", "/portfolio/sandbox/what-if")
    assert kwargs["json"]["adjustments"] == [{"symbol": "600519", "delta_weight_pct": -5}]


def test_build_compute_request_sandbox_scenario_requires_dates() -> None:
    body = InsightGenerateRequest(sandbox=SandboxSpec(mode="scenario"))
    with pytest.raises(ValueError):
        build_compute_request("sandbox", body)


def test_build_compute_request_sandbox_scenario_payload() -> None:
    body = InsightGenerateRequest(
        sandbox=SandboxSpec(
            mode="scenario",
            start_date="2026-07-01",
            end_date="2026-08-01",
            proposed_weights={"600519": 0.3},
        )
    )
    method, path, kwargs = build_compute_request("sandbox", body)
    assert (method, path) == ("POST", "/portfolio/sandbox/scenario")
    assert kwargs["json"]["proposed_weights"] == {"600519": 0.3}


def test_build_compute_request_rejects_unknown_pack_type() -> None:
    with pytest.raises(ValueError):
        build_compute_request("forecast", InsightGenerateRequest())


def test_sse_event_is_parseable() -> None:
    raw = sse_event("ai_delta", {"text": "你好"})
    assert raw.startswith("event: ai_delta\n")
    data_line = [line for line in raw.splitlines() if line.startswith("data: ")][0]
    assert json.loads(data_line[len("data: ") :]) == {"text": "你好"}
    assert raw.endswith("\n\n")


class _FakeChunk:
    def __init__(self, content):
        self.content = content


def test_chunk_text_handles_string_and_blocks() -> None:
    assert chunk_text(_FakeChunk("abc")) == "abc"
    assert chunk_text(_FakeChunk([{"type": "text", "text": "x"}, "y"])) == "xy"
    assert chunk_text(_FakeChunk(None)) == ""


def test_interpretation_messages_carry_rules_and_pack() -> None:
    pack = {"pack_id": "p-1", "facts": [{"id": "F-1", "label": "a", "value": 1}]}
    messages = build_interpretation_messages("review", pack)
    assert len(messages) == 2
    assert "引用" in messages[0].content
    assert TASK_PROMPTS["review"] in messages[1].content
    assert "p-1" in messages[1].content


def test_system_prompt_forbids_new_numbers() -> None:
    assert "禁止产生证据包之外" in SYSTEM_PROMPT


def test_followup_messages_cap_history_and_map_roles() -> None:
    pack = {"pack_id": "p-2", "facts": []}
    history = [
        message
        for i in range(12)
        for message in (
            FollowUpMessage(role="user", content=f"q{i}"),
            FollowUpMessage(role="assistant", content=f"a{i}"),
        )
    ]
    messages = build_followup_messages(pack, "为什么回撤这么大？", history)
    # system + last 8 history messages + final question
    assert len(messages) == 1 + 8 + 1
    assert messages[-1].content == "为什么回撤这么大？"
