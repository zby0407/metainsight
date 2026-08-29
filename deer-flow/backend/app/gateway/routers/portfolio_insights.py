"""Explainable portfolio insight orchestration.

Pipeline: deterministic compute (stock-server EvidencePack) -> streamed AI
interpretation grounded on the pack -> persisted report. The AI layer can
only cite evidence ids from the pack; every number originates in the compute
layer. Follow-up questions are answered against the same persisted pack so
the conversation stays anchored to one evidence snapshot.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/portfolio-insights", tags=["portfolio-insights"])

_COMPUTE_TIMEOUT = httpx.Timeout(180.0, connect=10.0)
_SAVE_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_MAX_HISTORY_TURNS = 8

PACK_TYPES = ("review", "risk", "strategy", "sandbox")

SYSTEM_PROMPT = """你是 MetaInsight 投研系统的"解读层"。你只基于确定性计算产出的证据包做解读。

铁律：
1. 你输出中涉及证据的表述必须以 [编号] 引用：F=事实，R=规则，I=数据源，M=方法，G=缺口。
2. 禁止产生证据包之外的任何数字、事实或预测；不得补充"经验值"。
3. 证据包中存在缺口（G）时，必须在解读中明确披露。
4. 每一句结论性表述必须紧跟至少一个引用编号；无法引用证据的内容只能表述为方法说明（引用 M）。
5. 明确区分"确定性计算结果"与"你的解读"；解读措辞不得夸大（不使用"一定/肯定/必然"）。
6. 使用简体中文，直接输出解读内容，不复述规则本身。"""

TASK_PROMPTS = {
    "review": (
        "请解读本期间复盘证据包：先给总体表现，再讲归因要点（贡献最大与最小的标的及原因边界），"
        "然后说明触发的风险规则，最后列出证据缺口与注意事项。"
    ),
    "risk": (
        "请解读风险诊断证据包：逐项说明触发规则的含义与影响，未触发的规则汇总一句，"
        "最后披露证据缺口。不要给出证据包之外的处置指令。"
    ),
    "strategy": (
        "请解读策略候选证据包：按重要程度说明每条候选的触发逻辑与确定性预期效果，"
        "明确这些是规则生成的候选项而非交易指令，最后披露证据缺口。"
    ),
    "sandbox": (
        "请解读沙盘证据包：说明本次调整或情景设定，对比基线与实验的确定性结果，"
        "强调历史投影不代表未来收益，最后披露证据缺口。"
    ),
}

FOLLOWUP_TASK = (
    "用户正在针对某份已生成的洞察报告追问。请基于同一证据包回答，继续遵守引用铁律；"
    "如果问题超出证据包范围，明确说明证据包不覆盖该内容，不要编造。"
)


# ----------------------------------------------------------------------
# Request models
# ----------------------------------------------------------------------

class SandboxSpec(BaseModel):
    mode: Literal["what_if", "scenario"] = "what_if"
    adjustments: list[dict[str, Any]] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    proposed_weights: dict[str, float] = Field(default_factory=dict)


class InsightGenerateRequest(BaseModel):
    account_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=7, le=3650)
    sandbox: Optional[SandboxSpec] = None


class FollowUpMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class FollowUpRequest(BaseModel):
    pack_id: str
    question: str = Field(min_length=1, max_length=2000)
    history: list[FollowUpMessage] = Field(default_factory=list)


# ----------------------------------------------------------------------
# Upstream compute mapping
# ----------------------------------------------------------------------

def stock_base_url() -> str:
    import os

    return os.getenv("DSA_INTERNAL_API_URL", "http://stock-server:8000/api/v1").rstrip("/")


def build_compute_request(pack_type: str, body: InsightGenerateRequest) -> tuple[str, str, dict[str, Any]]:
    """Return (method, path, kwargs) for the stock-server compute endpoint."""
    if pack_type == "review":
        params: dict[str, Any] = {}
        if body.account_id is not None:
            params["account_id"] = body.account_id
        if body.start_date:
            params["start_date"] = body.start_date
        if body.end_date:
            params["end_date"] = body.end_date
        return "GET", "/portfolio/review", {"params": params}
    if pack_type == "risk":
        params = {}
        if body.account_id is not None:
            params["account_id"] = body.account_id
        return "GET", "/portfolio/risk-insight", {"params": params}
    if pack_type == "strategy":
        params = {}
        if body.account_id is not None:
            params["account_id"] = body.account_id
        return "GET", "/portfolio/strategy-candidates", {"params": params}
    if pack_type == "sandbox":
        sandbox = body.sandbox or SandboxSpec()
        if sandbox.mode == "scenario":
            payload = {
                "account_id": body.account_id,
                "start_date": sandbox.start_date or body.start_date,
                "end_date": sandbox.end_date or body.end_date,
                "proposed_weights": sandbox.proposed_weights,
            }
            if not payload["start_date"] or not payload["end_date"]:
                raise ValueError("sandbox scenario requires start_date and end_date")
            return "POST", "/portfolio/sandbox/scenario", {"json": payload}
        payload = {
            "account_id": body.account_id,
            "adjustments": sandbox.adjustments,
        }
        return "POST", "/portfolio/sandbox/what-if", {"json": payload}
    raise ValueError(f"Unsupported pack type: {pack_type}")


# ----------------------------------------------------------------------
# SSE + model helpers
# ----------------------------------------------------------------------

def sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def chunk_text(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "".join(parts)
    return ""


_MODEL_CACHE: dict[str, Any] = {}


def get_interpretation_model() -> Any:
    """Lazily create and cache the LLM used for grounded interpretation."""
    cached = _MODEL_CACHE.get("default")
    if cached is not None:
        return cached
    from deerflow.models import create_chat_model

    model = create_chat_model(None)
    _MODEL_CACHE["default"] = model
    return model


def build_interpretation_messages(pack_type: str, pack: dict[str, Any]) -> list[Any]:
    from langchain_core.messages import HumanMessage, SystemMessage

    task = TASK_PROMPTS.get(pack_type, "请解读该证据包。")
    pack_json = json.dumps(pack, ensure_ascii=False)
    return [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"{task}\n\n证据包：\n{pack_json}"),
    ]


def build_followup_messages(pack: dict[str, Any], question: str, history: list[FollowUpMessage]) -> list[Any]:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    pack_json = json.dumps(pack, ensure_ascii=False)
    messages: list[Any] = [
        SystemMessage(content=f"{SYSTEM_PROMPT}\n\n{FOLLOWUP_TASK}\n\n证据包：\n{pack_json}"),
    ]
    for message in history[-_MAX_HISTORY_TURNS:]:
        if message.role == "user":
            messages.append(HumanMessage(content=message.content))
        else:
            messages.append(AIMessage(content=message.content))
    messages.append(HumanMessage(content=question))
    return messages


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------

@router.post("/{pack_type}/generate")
async def generate_insight(
    pack_type: str,
    body: InsightGenerateRequest,
    request: Request,
) -> StreamingResponse:
    if pack_type not in PACK_TYPES:
        raise HTTPException(status_code=404, detail=f"Unsupported pack type: {pack_type}")
    await get_current_user_from_request(request)

    try:
        method, path, kwargs = build_compute_request(pack_type, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    url = f"{stock_base_url()}{path}"
    try:
        async with httpx.AsyncClient(timeout=_COMPUTE_TIMEOUT) as client:
            upstream = await client.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        logger.warning("Insight compute upstream unreachable (%s): %s", path, type(exc).__name__)
        raise HTTPException(status_code=502, detail="组合计算服务暂不可用") from exc

    if upstream.status_code >= 400:
        detail = "组合计算服务拒绝了本次请求"
        try:
            payload_error = upstream.json()
            if isinstance(payload_error, dict):
                detail = str(payload_error.get("message") or payload_error.get("detail") or detail)
        except ValueError:
            pass
        status_code = 400 if upstream.status_code < 500 else 502
        raise HTTPException(status_code=status_code, detail=detail)

    try:
        computed = upstream.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="组合计算服务返回了无效响应") from exc
    if not isinstance(computed, dict) or not isinstance(computed.get("pack"), dict):
        raise HTTPException(status_code=502, detail="组合计算服务返回了无效的证据包")

    async def stream() -> AsyncIterator[str]:
        yield sse_event("computed", computed)
        model = get_interpretation_model()
        messages = build_interpretation_messages(pack_type, computed["pack"])
        text_parts: list[str] = []
        try:
            async for chunk in model.astream(messages):
                text = chunk_text(chunk)
                if text:
                    text_parts.append(text)
                    yield sse_event("ai_delta", {"text": text})
        except Exception as exc:  # noqa: BLE001 - surface a readable SSE error
            logger.exception("Insight interpretation stream failed")
            yield sse_event("error", {"message": f"AI 解读生成失败：{exc}"})
            return

        interpretation = "".join(text_parts).strip()
        report_saved = False
        if interpretation:
            try:
                async with httpx.AsyncClient(timeout=_SAVE_TIMEOUT) as client:
                    save_response = await client.post(
                        f"{stock_base_url()}/portfolio/insight-reports",
                        json={"pack": computed["pack"], "ai_interpretation": interpretation},
                    )
                report_saved = save_response.status_code < 300
            except httpx.HTTPError:
                logger.warning("Insight report persistence failed for pack", exc_info=True)
        yield sse_event(
            "done",
            {"pack_id": computed["pack"].get("pack_id"), "report_saved": report_saved},
        )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/follow-up")
async def follow_up_insight(body: FollowUpRequest, request: Request) -> StreamingResponse:
    await get_current_user_from_request(request)

    url = f"{stock_base_url()}/portfolio/insight-reports/{body.pack_id}"
    try:
        async with httpx.AsyncClient(timeout=_SAVE_TIMEOUT) as client:
            upstream = await client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="组合计算服务暂不可用") from exc
    if upstream.status_code == 404:
        raise HTTPException(status_code=404, detail="未找到对应的洞察报告")
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="洞察报告读取失败")
    try:
        report = upstream.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="洞察报告格式无效") from exc

    pack = report.get("evidence_pack") if isinstance(report, dict) else None
    if not isinstance(pack, dict) or not pack:
        raise HTTPException(status_code=502, detail="洞察报告缺少证据包")

    async def stream() -> AsyncIterator[str]:
        model = get_interpretation_model()
        messages = build_followup_messages(pack, body.question, body.history)
        try:
            async for chunk in model.astream(messages):
                text = chunk_text(chunk)
                if text:
                    yield sse_event("ai_delta", {"text": text})
        except Exception as exc:  # noqa: BLE001
            logger.exception("Insight follow-up stream failed")
            yield sse_event("error", {"message": f"追问回答生成失败：{exc}"})
            return
        yield sse_event("done", {"pack_id": body.pack_id})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/reports")
async def list_reports(
    request: Request,
    pack_type: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    await get_current_user_from_request(request)
    params: dict[str, Any] = {"limit": limit}
    if pack_type:
        params["pack_type"] = pack_type
    if account_id is not None:
        params["account_id"] = account_id
    try:
        async with httpx.AsyncClient(timeout=_SAVE_TIMEOUT) as client:
            upstream = await client.get(f"{stock_base_url()}/portfolio/insight-reports", params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="组合计算服务暂不可用") from exc
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="洞察报告列表读取失败")
    payload = upstream.json()
    return payload if isinstance(payload, dict) else {"items": [], "total": 0}
