from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]

BLOCKS_DIR = BASE_DIR / "data" / "blocks"
PLAN_GEOMETRY_DIR = BASE_DIR / "artifacts" / "plan_geometry"

OUTER_WALL_THICKNESS = 0.2
INNER_WALL_THICKNESS = 0.1

EXTERIOR_OPENING_WIDTH = 1.2
INTERIOR_OPENING_WIDTH = 1.0
WINDOW_DEFAULT_WIDTH = 2.4
OPENING_MIN_MARGIN = 0.3

LABEL_NAME_MAP = {
    "entrance": "ENTRANCE",
    "living_room": "LIVING",
    "kitchen": "KITCHEN",
    "workspace": "WORK",
    "bedroom": "BEDROOM",
    "bathroom": "BATH",
    "connector": "CONNECTOR",
    "vertical_core": "CORE",
}

# 실제 opening을 허용할 공간 조합
ALLOWED_INTERNAL_CONNECTIONS = {
    frozenset(("entrance", "living_room")),
    frozenset(("entrance", "bedroom")),
    frozenset(("living_room", "kitchen")),
    frozenset(("living_room", "bedroom")),
    frozenset(("living_room", "workspace")),
    frozenset(("bedroom", "workspace")),
    frozenset(("connector", "entrance")),
    frozenset(("connector", "living_room")),
    frozenset(("connector", "kitchen")),
    frozenset(("connector", "bedroom")),
    frozenset(("connector", "workspace")),
    frozenset(("connector", "bathroom")),
    frozenset(("connector", "vertical_core")),
}

def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_layout(layout_path: Path) -> dict[str, Any]:
    return load_json(layout_path)


def load_block_definition(space_type: str) -> dict[str, Any]:
    path = BLOCKS_DIR / f"{space_type}.json"
    if not path.exists():
        raise FileNotFoundError(f"Block definition not found: {path}")
    return load_json(path)


def normalize_placement(raw: dict[str, Any]) -> dict[str, Any]:
    width = raw.get("width")
    depth = raw.get("depth", raw.get("height"))

    if width is None or depth is None:
        raise ValueError(f"Placement must contain width and depth/height: {raw}")

    return {
        "id": raw["id"],
        "space_type": raw["space_type"],
        "x": raw["x"],
        "y": raw["y"],
        "width": width,
        "depth": depth,
        "rotation": raw.get("rotation", 0),
    }


def build_space_polygon(space: dict[str, Any]) -> list[list[float]]:
    x = space["x"]
    y = space["y"]
    w = space["width"]
    d = space["depth"]

    return [
        [x, y],
        [x + w, y],
        [x + w, y + d],
        [x, y + d],
    ]


def build_edges(space: dict[str, Any], block_def: dict[str, Any]) -> list[dict[str, Any]]:
    x = space["x"]
    y = space["y"]
    w = space["width"]
    d = space["depth"]

    edge_meta = block_def.get("edges", {})

    return [
        {
            "space_id": space["id"],
            "space_type": space["space_type"],
            "side": "north",
            "x1": x,
            "y1": y,
            "x2": x + w,
            "y2": y,
            "edge_type": edge_meta.get("north", "solid"),
        },
        {
            "space_id": space["id"],
            "space_type": space["space_type"],
            "side": "east",
            "x1": x + w,
            "y1": y,
            "x2": x + w,
            "y2": y + d,
            "edge_type": edge_meta.get("east", "solid"),
        },
        {
            "space_id": space["id"],
            "space_type": space["space_type"],
            "side": "south",
            "x1": x,
            "y1": y + d,
            "x2": x + w,
            "y2": y + d,
            "edge_type": edge_meta.get("south", "solid"),
        },
        {
            "space_id": space["id"],
            "space_type": space["space_type"],
            "side": "west",
            "x1": x,
            "y1": y,
            "x2": x,
            "y2": y + d,
            "edge_type": edge_meta.get("west", "solid"),
        },
    ]


def is_vertical(edge: dict[str, Any]) -> bool:
    return edge["x1"] == edge["x2"]


def is_horizontal(edge: dict[str, Any]) -> bool:
    return edge["y1"] == edge["y2"]


def segment_length(edge: dict[str, Any]) -> float:
    if is_vertical(edge):
        return abs(edge["y2"] - edge["y1"])
    return abs(edge["x2"] - edge["x1"])


def overlap_1d(a1: float, a2: float, b1: float, b2: float) -> tuple[float, float] | None:
    lo = max(min(a1, a2), min(b1, b2))
    hi = min(max(a1, a2), max(b1, b2))
    if hi <= lo:
        return None
    return lo, hi


def find_shared_edges(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    shared_edges: list[dict[str, Any]] = []

    for i in range(len(edges)):
        e1 = edges[i]

        for j in range(i + 1, len(edges)):
            e2 = edges[j]

            if e1["space_id"] == e2["space_id"]:
                continue

            if is_vertical(e1) and is_vertical(e2):
                if e1["x1"] != e2["x1"]:
                    continue

                overlap = overlap_1d(e1["y1"], e1["y2"], e2["y1"], e2["y2"])
                if overlap is None:
                    continue

                y1, y2 = overlap
                shared_edges.append(
                    {
                        "space_a": e1["space_id"],
                        "space_type_a": e1["space_type"],
                        "side_a": e1["side"],
                        "edge_type_a": e1["edge_type"],
                        "space_b": e2["space_id"],
                        "space_type_b": e2["space_type"],
                        "side_b": e2["side"],
                        "edge_type_b": e2["edge_type"],
                        "x1": e1["x1"],
                        "y1": y1,
                        "x2": e1["x1"],
                        "y2": y2,
                    }
                )

            elif is_horizontal(e1) and is_horizontal(e2):
                if e1["y1"] != e2["y1"]:
                    continue

                overlap = overlap_1d(e1["x1"], e1["x2"], e2["x1"], e2["x2"])
                if overlap is None:
                    continue

                x1, x2 = overlap
                shared_edges.append(
                    {
                        "space_a": e1["space_id"],
                        "space_type_a": e1["space_type"],
                        "side_a": e1["side"],
                        "edge_type_a": e1["edge_type"],
                        "space_b": e2["space_id"],
                        "space_type_b": e2["space_type"],
                        "side_b": e2["side"],
                        "edge_type_b": e2["edge_type"],
                        "x1": x1,
                        "y1": e1["y1"],
                        "x2": x2,
                        "y2": e1["y1"],
                    }
                )

    return shared_edges


def subtract_intervals(
    base_start: float,
    base_end: float,
    cut_intervals: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    start = min(base_start, base_end)
    end = max(base_start, base_end)

    valid_cuts = []
    for c1, c2 in cut_intervals:
        lo = max(start, min(c1, c2))
        hi = min(end, max(c1, c2))
        if hi > lo:
            valid_cuts.append((lo, hi))

    if not valid_cuts:
        return [(start, end)]

    valid_cuts.sort()
    merged = [valid_cuts[0]]

    for lo, hi in valid_cuts[1:]:
        prev_lo, prev_hi = merged[-1]
        if lo <= prev_hi:
            merged[-1] = (prev_lo, max(prev_hi, hi))
        else:
            merged.append((lo, hi))

    remaining = []
    cursor = start

    for lo, hi in merged:
        if lo > cursor:
            remaining.append((cursor, lo))
        cursor = max(cursor, hi)

    if cursor < end:
        remaining.append((cursor, end))

    return remaining


def find_outer_edges(
    edges: list[dict[str, Any]],
    shared_edges: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    outer_edges: list[dict[str, Any]] = []

    for edge in edges:
        cut_intervals: list[tuple[float, float]] = []

        for shared in shared_edges:
            if is_vertical(edge):
                if shared["x1"] != shared["x2"]:
                    continue
                if edge["x1"] != shared["x1"]:
                    continue

                overlap = overlap_1d(edge["y1"], edge["y2"], shared["y1"], shared["y2"])
                if overlap is not None:
                    cut_intervals.append(overlap)

            elif is_horizontal(edge):
                if shared["y1"] != shared["y2"]:
                    continue
                if edge["y1"] != shared["y1"]:
                    continue

                overlap = overlap_1d(edge["x1"], edge["x2"], shared["x1"], shared["x2"])
                if overlap is not None:
                    cut_intervals.append(overlap)

        if is_vertical(edge):
            remaining = subtract_intervals(edge["y1"], edge["y2"], cut_intervals)
            for y1, y2 in remaining:
                outer_edges.append(
                    {
                        **edge,
                        "x1": edge["x1"],
                        "y1": y1,
                        "x2": edge["x2"],
                        "y2": y2,
                        "wall_kind": "outer",
                        "thickness": OUTER_WALL_THICKNESS,
                    }
                )

        elif is_horizontal(edge):
            remaining = subtract_intervals(edge["x1"], edge["x2"], cut_intervals)
            for x1, x2 in remaining:
                outer_edges.append(
                    {
                        **edge,
                        "x1": x1,
                        "y1": edge["y1"],
                        "x2": x2,
                        "y2": edge["y2"],
                        "wall_kind": "outer",
                        "thickness": OUTER_WALL_THICKNESS,
                    }
                )

    return outer_edges


def build_inner_walls(shared_edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inner_walls: list[dict[str, Any]] = []

    for shared in shared_edges:
        inner_walls.append(
            {
                "wall_kind": "inner",
                "space_a": shared["space_a"],
                "space_type_a": shared["space_type_a"],
                "side_a": shared["side_a"],
                "edge_type_a": shared["edge_type_a"],
                "space_b": shared["space_b"],
                "space_type_b": shared["space_type_b"],
                "side_b": shared["side_b"],
                "edge_type_b": shared["edge_type_b"],
                "x1": shared["x1"],
                "y1": shared["y1"],
                "x2": shared["x2"],
                "y2": shared["y2"],
                "thickness": INNER_WALL_THICKNESS,
            }
        )

    return inner_walls


def build_labels(spaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    type_counts = Counter(space["space_type"] for space in spaces)
    type_indices = defaultdict(int)

    labels: list[dict[str, Any]] = []

    for space in spaces:
        space_type = space["space_type"]
        base_text = LABEL_NAME_MAP.get(space_type, space_type.upper())

        if type_counts[space_type] > 1:
            type_indices[space_type] += 1
            text = f"{base_text} {type_indices[space_type]}"
        else:
            text = base_text

        labels.append(
            {
                "space_id": space["id"],
                "text": text,
                "x": space["x"] + space["width"] / 2,
                "y": space["y"] + space["depth"] / 2,
            }
        )

    return labels


def centered_segment_on_edge(
    edge: dict[str, Any],
    desired_length: float,
    min_margin: float = OPENING_MIN_MARGIN,
) -> tuple[float, float, float, float] | None:
    total = segment_length(edge)
    usable = total - (min_margin * 2)

    if usable <= 0.4:
        return None

    actual = min(desired_length, usable)
    center = (
        (edge["y1"] + edge["y2"]) / 2 if is_vertical(edge)
        else (edge["x1"] + edge["x2"]) / 2
    )
    half = actual / 2

    if is_vertical(edge):
        y1 = center - half
        y2 = center + half
        return edge["x1"], y1, edge["x2"], y2

    x1 = center - half
    x2 = center + half
    return x1, edge["y1"], x2, edge["y2"]


def build_outer_openings(outer_edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    openings: list[dict[str, Any]] = []

    for edge in outer_edges:
        edge_type = edge["edge_type"]

        if edge_type == "entry":
            segment = centered_segment_on_edge(edge, EXTERIOR_OPENING_WIDTH, min_margin=0.4)
            if segment is None:
                continue
            x1, y1, x2, y2 = segment
            openings.append(
                {
                    "kind": "opening",
                    "placement": "exterior",
                    "space_id": edge["space_id"],
                    "space_type": edge["space_type"],
                    "host_side": edge["side"],
                    "source_edge_type": edge_type,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

        elif edge_type == "window_preferred":
            target = min(WINDOW_DEFAULT_WIDTH, max(1.2, segment_length(edge) * 0.6))
            segment = centered_segment_on_edge(edge, target, min_margin=0.3)
            if segment is None:
                continue
            x1, y1, x2, y2 = segment
            openings.append(
                {
                    "kind": "window",
                    "placement": "exterior",
                    "space_id": edge["space_id"],
                    "space_type": edge["space_type"],
                    "host_side": edge["side"],
                    "source_edge_type": edge_type,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

    return openings


def is_allowed_internal_connection(space_type_a: str, space_type_b: str) -> bool:
    return frozenset((space_type_a, space_type_b)) in ALLOWED_INTERNAL_CONNECTIONS


def should_make_inner_opening(wall: dict[str, Any]) -> bool:
    edge_type_a = wall["edge_type_a"]
    edge_type_b = wall["edge_type_b"]
    space_type_a = wall["space_type_a"]
    space_type_b = wall["space_type_b"]

    if edge_type_a == "service" or edge_type_b == "service":
        return False

    if not is_allowed_internal_connection(space_type_a, space_type_b):
        return False

    # y축 압축 이후에는 원래 edge semantics가 바뀌므로
    # 허용된 공간 조합이면 opening 허용
    return True


def build_inner_openings(inner_walls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    openings: list[dict[str, Any]] = []

    for wall in inner_walls:
        if not should_make_inner_opening(wall):
            continue

        segment = centered_segment_on_edge(wall, INTERIOR_OPENING_WIDTH, min_margin=0.3)
        if segment is None:
            continue

        x1, y1, x2, y2 = segment
        openings.append(
            {
                "kind": "opening",
                "placement": "interior",
                "space_a": wall["space_a"],
                "space_type_a": wall["space_type_a"],
                "space_b": wall["space_b"],
                "space_type_b": wall["space_type_b"],
                "source_edge_type_a": wall["edge_type_a"],
                "source_edge_type_b": wall["edge_type_b"],
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            }
        )

    return openings


def build_openings(
    outer_edges: list[dict[str, Any]],
    inner_walls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    openings = []
    openings.extend(build_outer_openings(outer_edges))
    openings.extend(build_inner_openings(inner_walls))
    return openings


def build_plan_geometry(layout_data: dict[str, Any]) -> dict[str, Any]:
    raw_placements = layout_data.get("placements", [])
    if not raw_placements:
        raise ValueError("layout_data does not contain placements")

    spaces: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for raw in raw_placements:
        space = normalize_placement(raw)
        block_def = load_block_definition(space["space_type"])

        spaces.append(
            {
                **space,
                "polygon": build_space_polygon(space),
            }
        )
        edges.extend(build_edges(space, block_def))

    shared_edges = find_shared_edges(edges)
    outer_edges = find_outer_edges(edges, shared_edges)
    inner_walls = build_inner_walls(shared_edges)
    labels = build_labels(spaces)
    openings = build_openings(outer_edges, inner_walls)

    return {
        "spaces": spaces,
        "edges": edges,
        "shared_edges": shared_edges,
        "outer_edges": outer_edges,
        "inner_walls": inner_walls,
        "openings": openings,
        "labels": labels,
    }


def save_plan_geometry(plan_geometry: dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(plan_geometry, f, ensure_ascii=False, indent=2)
    return output_path


def convert_layout_file_to_plan_geometry(layout_path: Path) -> Path:
    layout_data = load_layout(layout_path)
    plan_geometry = build_plan_geometry(layout_data)

    output_name = f"{layout_path.stem}.plan_geometry.json"
    output_path = PLAN_GEOMETRY_DIR / output_name

    return save_plan_geometry(plan_geometry, output_path)