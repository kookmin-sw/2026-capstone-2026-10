from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
LAYOUTS_DIR = BASE_DIR / "artifacts" / "layouts"


def load_layout(layout_path: Path) -> dict[str, Any]:
    with open(layout_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_layout(layout_data: dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(layout_data, f, ensure_ascii=False, indent=2)
    return output_path


def get_depth(raw: dict[str, Any]) -> float:
    depth = raw.get("depth", raw.get("height"))
    if depth is None:
        raise ValueError(f"Placement must contain depth or height: {raw}")
    return depth


def x_ranges_overlap(a: dict[str, Any], b: dict[str, Any]) -> bool:
    a_left = a["x"]
    a_right = a["x"] + a["width"]
    b_left = b["x"]
    b_right = b["x"] + b["width"]

    return min(a_right, b_right) > max(a_left, b_left)


def normalize_for_compaction(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw["id"],
        "space_type": raw["space_type"],
        "x": raw["x"],
        "y": raw["y"],
        "width": raw["width"],
        "depth": get_depth(raw),
        "zone": raw.get("zone", "private"),
    }


def is_entry_private_pair(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return (
        (a["space_type"] == "entrance" and b.get("zone") == "private")
        or (b["space_type"] == "entrance" and a.get("zone") == "private")
    )


def compact_placements_vertically(
    placements: list[dict[str, Any]],
    vertical_gap: float = 0.0,
) -> list[dict[str, Any]]:
    """
    x 좌표는 유지하고, y만 위로 최대한 끌어올린다.
    x 범위가 겹치는 기존 배치들만 blocker로 본다.
    """
    normalized = [normalize_for_compaction(p) for p in placements]
    normalized.sort(key=lambda p: (p["y"], p["x"]))

    placed: list[dict[str, Any]] = []

    for item in normalized:
        new_y = 0.0

        for blocker in placed:
            if not x_ranges_overlap(item, blocker):
                continue

            blocker_bottom = blocker["y"] + blocker["depth"]
            gap = max(vertical_gap, 1.0) if is_entry_private_pair(item, blocker) else vertical_gap
            new_y = max(new_y, blocker_bottom + gap)

        item["y"] = new_y
        placed.append(item)

    # 원래 placement 구조를 최대한 유지하면서 y만 갱신
    y_map = {p["id"]: p["y"] for p in placed}

    compacted: list[dict[str, Any]] = []
    for raw in placements:
        copied = dict(raw)
        copied["y"] = y_map[raw["id"]]
        compacted.append(copied)

    return compacted


def compact_layout_data(
    layout_data: dict[str, Any],
    vertical_gap: float = 0.0,
) -> dict[str, Any]:
    if layout_data.get("meta", {}).get("layout_type") in {
        "zoned_2d_v1",
        "flow_2d_v1",
        "linear_corridor_spine_v1",
        "l_shaped_corridor_spine_v1",
        "corridor_path_spine_v1",
    }:
        return layout_data

    placements = layout_data.get("placements", [])
    if not placements:
        raise ValueError("layout_data does not contain placements")

    compacted = compact_placements_vertically(placements, vertical_gap=vertical_gap)

    new_layout = dict(layout_data)
    new_layout["placements"] = compacted
    return new_layout


def compact_layout_file(
    layout_path: Path,
    output_path: Path | None = None,
    vertical_gap: float = 0.0,
) -> Path:
    layout_data = load_layout(layout_path)
    compacted = compact_layout_data(layout_data, vertical_gap=vertical_gap)

    if output_path is None:
        output_path = layout_path

    return save_layout(compacted, output_path)
