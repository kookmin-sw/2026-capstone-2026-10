from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]
BLOCKS_DIR = BASE_DIR / "data" / "blocks"


def load_block_definition(space_type: str) -> dict[str, Any]:
    path = BLOCKS_DIR / f"{space_type}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_band(block_type: str, block_def: dict[str, Any], edge_preferences: dict[str, str]) -> str:
    """
    블록이 어떤 band(row)에 놓일지 결정한다.
    우선순위:
    1) edge_preferences
    2) family
    3) zone
    """
    pref = edge_preferences.get(block_type)
    family = block_def.get("family", "")
    zone = block_def.get("zone", "private")

    # 1. edge preference 우선
    if pref == "outer_edge":
        return "public"
    if pref == "core_zone":
        return "core"
    if pref == "connector_zone":
        return "connector"
    if pref == "private_inner_zone":
        return "private"
    if pref == "quiet_inner_zone":
        return "quiet"
    if pref == "service_inner_zone":
        return "private"   # 욕실은 private 쪽과 가깝게 둔다

    # 2. family 기준 기본 해석
    if family == "vertical_core":
        return "core"
    if family == "connector":
        return "connector"
    if family == "entrance_circulation":
        return "public"
    if family == "open_public":
        return "public"
    if family == "wet_core":
        # kitchen은 zone이 public, bathroom은 zone이 private라서
        # family만으로 판단하지 않고 zone도 같이 본다.
        if zone == "public":
            return "public"
        return "private"
    if family == "work_flexible":
        return "quiet"
    if family == "private":
        return "private"

    # 3. zone 기준 fallback
    if zone == "public":
        return "public"
    if zone == "semi_private":
        return "quiet"
    return "private"


def generate_layout_from_rules(rules: dict[str, Any]) -> dict[str, Any]:
    required_blocks = rules["required_blocks"]
    edge_preferences = rules.get("edge_preferences", {})

    placements: list[dict[str, Any]] = []

    # band별 x cursor
    cursors = {
        "public": 0,
        "core": 0,
        "connector": 0,
        "private": 0,
        "quiet": 0
    }

    # band별 y 위치
    bands_y = {
        "public": 0,
        "core": 8,
        "connector": 14,
        "private": 22,
        "quiet": 30
    }

    for idx, block_type in enumerate(required_blocks):
        block_def = load_block_definition(block_type)

        width = block_def["width"]
        depth = block_def["depth"]   # 평면에서 세로 길이로 사용
        zone = block_def["zone"]
        family = block_def.get("family", "unknown")
        fixed_core = block_def.get("fixed_core", False)

        band = resolve_band(block_type, block_def, edge_preferences)

        x = cursors[band]
        y = bands_y[band]

        cursors[band] += width

        placements.append({
            "id": f"{block_type}_{idx}",
            "space_type": block_type,
            "family": family,
            "fixed_core": fixed_core,
            "band": band,
            "x": x,
            "y": y,
            "width": width,
            "depth": depth,
            "height": depth,
            "zone": zone
        })

    layout = {
        "placements": placements,
        "meta": {
            "layout_type": "rule_based_v2_modular",
            "bands": bands_y
        }
    }

    return layout