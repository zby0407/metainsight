"""Apply the first-turn latency lifecycle hooks to an existing Gateway image.

The production Gateway carries deployment-specific branding, DSA automation,
and finance routes. Patching narrow, asserted anchors preserves those features
instead of replacing the complete application module with an upstream copy.
"""

import re
from pathlib import Path


path = Path("/app/backend/app/gateway/app.py")
source = path.read_text(encoding="utf-8")

constant_anchor = "_SHUTDOWN_HOOK_TIMEOUT_SECONDS = 5.0\n"
constant_block = constant_anchor + "_MCP_WARMUP_TIMEOUT_SECONDS = 75.0\n"

warm_anchor = '        logger.info("LangGraph runtime initialised")\n'
warm_block = (
    warm_anchor
    + "\n"
    + "        # Warm MCP discovery before readiness so the first request never\n"
    + "        # launches package-backed stdio servers on its critical path.\n"
    + "        try:\n"
    + "            from deerflow.mcp.cache import initialize_mcp_tools\n"
    + "\n"
    + "            mcp_tools = await asyncio.wait_for(\n"
    + "                initialize_mcp_tools(),\n"
    + "                timeout=_MCP_WARMUP_TIMEOUT_SECONDS,\n"
    + "            )\n"
    + '            logger.info("MCP tool catalog warmed successfully: %d tool(s)", len(mcp_tools))\n'
    + "        except TimeoutError:\n"
    + "            logger.warning(\n"
    + '                "MCP tool catalog warm-up exceeded %.1fs; Gateway will continue and retry lazily.",\n'
    + "                _MCP_WARMUP_TIMEOUT_SECONDS,\n"
    + "            )\n"
    + "        except Exception:\n"
    + '            logger.warning("MCP tool catalog warm-up failed; Gateway will retry lazily", exc_info=True)\n'
)

shutdown_anchor = '        except Exception:\n            logger.exception("Failed to stop channel service")\n'
shutdown_block = (
    shutdown_anchor
    + "\n"
    + "        # Global stdio MCP sessions stay warm for the Gateway lifetime.\n"
    + "        try:\n"
    + "            from deerflow.mcp.session_pool import get_session_pool\n"
    + "\n"
    + "            await asyncio.wait_for(\n"
    + "                get_session_pool().close_all(),\n"
    + "                timeout=_SHUTDOWN_HOOK_TIMEOUT_SECONDS,\n"
    + "            )\n"
    + "        except TimeoutError:\n"
    + "            logger.warning(\n"
    + '                "MCP session shutdown exceeded %.1fs; proceeding with worker exit.",\n'
    + "                _SHUTDOWN_HOOK_TIMEOUT_SECONDS,\n"
    + "            )\n"
    + "        except Exception:\n"
    + '            logger.exception("Failed to close MCP sessions")\n'
)

replacements = (
    ("_MCP_WARMUP_TIMEOUT_SECONDS", constant_anchor, constant_block),
    ("MCP tool catalog warmed successfully", warm_anchor, warm_block),
    ("Failed to close MCP sessions", shutdown_anchor, shutdown_block),
)
for marker, anchor, replacement in replacements:
    if marker in source:
        continue
    if source.count(anchor) != 1:
        raise RuntimeError(f"Expected one Gateway overlay anchor for {marker!r}")
    source = source.replace(anchor, replacement, 1)

source, timeout_replacements = re.subn(
    r"_MCP_WARMUP_TIMEOUT_SECONDS\s*=\s*[0-9.]+",
    "_MCP_WARMUP_TIMEOUT_SECONDS = 75.0",
    source,
)
if timeout_replacements != 1:
    raise RuntimeError("Expected exactly one MCP warm-up timeout constant")

path.write_text(source, encoding="utf-8")
