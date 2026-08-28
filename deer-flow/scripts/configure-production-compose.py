#!/usr/bin/env python3
"""Persist the active DeerFlow Compose inputs without printing secrets."""

from __future__ import annotations

import json
from pathlib import Path
import stat
import subprocess
import sys


def inspect(container: str) -> dict:
    output = subprocess.check_output(
        ["docker", "inspect", container],
        text=True,
    )
    return json.loads(output)[0]


def environment(value: dict) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in value["Config"].get("Env", []):
        key, separator, content = item.partition("=")
        if separator:
            result[key] = content
    return result


def mount_source(value: dict, destination: str) -> str:
    for mount in value.get("Mounts", []):
        if mount.get("Destination") == destination:
            return str(mount["Source"])
    raise SystemExit(f"active container is missing mount: {destination}")


def update_environment(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    result: list[str] = []
    seen: set[str] = set()
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            result.append(line)
            continue
        key = line.split("=", 1)[0]
        if key in updates:
            line = f"{key}={updates[key]}"
            seen.add(key)
        result.append(line)
    for key, value in updates.items():
        if key not in seen:
            result.append(f"{key}={value}")
    path.write_text("\n".join(result) + "\n")
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: configure-production-compose.py DEER_FLOW_ROOT")
    root = Path(sys.argv[1]).resolve()
    if not (root / "docker" / "docker-compose.yaml").is_file():
        raise SystemExit("invalid DeerFlow production root")

    frontend = inspect("deer-flow-frontend")
    gateway = inspect("deer-flow-gateway")
    frontend_environment = environment(frontend)
    gateway_environment = environment(gateway)
    auth_secret = frontend_environment.get("BETTER_AUTH_SECRET", "")
    internal_token = gateway_environment.get("DEER_FLOW_INTERNAL_AUTH_TOKEN", "")
    if len(auth_secret) < 16 or len(internal_token) < 16:
        raise SystemExit("active containers do not contain required auth secrets")

    skills_source = Path(mount_source(gateway, "/app/skills"))
    updates = {
        "BETTER_AUTH_SECRET": auth_secret,
        "DEER_FLOW_INTERNAL_AUTH_TOKEN": internal_token,
        "DEER_FLOW_CONFIG_PATH": mount_source(gateway, "/app/backend/config.yaml"),
        "DEER_FLOW_EXTENSIONS_CONFIG_PATH": mount_source(
            gateway, "/app/backend/extensions_config.json"
        ),
        "DEER_FLOW_HOME": mount_source(gateway, "/app/backend/.deer-flow"),
        "DEER_FLOW_REPO_ROOT": str(skills_source.parent),
    }
    update_environment(root / ".env", updates)


if __name__ == "__main__":
    main()
