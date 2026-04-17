from __future__ import annotations

import json
import re
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
WIDE_OPENING_RATIO = 0.72
WINDOW_DEFAULT_WIDTH = 2.4
OPENING_MIN_MARGIN = 0.3

LABEL_NAME_MAP = {
    "entrance": "ENTRANCE",
    "living_room": "LIVING",
    "kitchen": "KITCHEN",
    "workspace": "WORK",
    "bedroom": "BEDROOM",
    "master_bedroom": "MASTER",
    "child_bedroom": "CHILD BR",
    "bathroom": "BATH",
    "connector": "CONNECTOR",
    "vertical_core": "CORE",
}

# Soft pastel fill colours per space type — keep contrast low so wall lines read clearly
SPACE_FILL_COLORS: dict[str, str] = {
    "living_room":    "#fef9ec",   # warm ivory
    "kitchen":        "#fdf3d0",   # soft yellow
    "entrance":       "#fdebd0",   # light peach
    "bedroom":        "#e8f0fb",   # pale blue
    "master_bedroom": "#ddeaf8",   # slightly deeper blue
    "child_bedroom":  "#eef4fd",   # very light blue
    "bathroom":       "#e4f4f4",   # soft cyan/teal
    "workspace":      "#eaf5ea",   # light sage green
    "connector":      "#f5f5f5",   # near-white grey
    "vertical_core":  "#ececec",   # mid grey
}

# 실제 opening을 허용할 공간 조합
ALLOWED_INTERNAL_CONNECTIONS = {
    frozenset(("entrance", "living_room")),
    frozenset(("living_room", "kitchen")),
    frozenset(("living_room", "bedroom")),
    frozenset(("living_room", "master_bedroom")),
    frozenset(("living_room", "workspace")),
    frozenset(("bedroom", "workspace")),
    frozenset(("master_bedroom", "bathroom")),
    frozenset(("master_bedroom", "child_bedroom")),
    frozenset(("child_bedroom", "bathroom")),
    frozenset(("connector", "entrance")),
    frozenset(("connector", "living_room")),
    frozenset(("connector", "kitchen")),
    frozenset(("connector", "bedroom")),
    frozenset(("connector", "master_bedroom")),
    frozenset(("connector", "child_bedroom")),
    frozenset(("connector", "workspace")),
    frozenset(("connector", "bathroom")),
    frozenset(("connector", "vertical_core")),
}


# Shared edges in these pairs are treated as open-plan boundaries, not walls.
OPEN_INTERNAL_CONNECTIONS = {
    frozenset(("living_room", "kitchen")),
}

WIDE_INTERNAL_CONNECTIONS = {
    frozenset(("living_room", "kitchen")),
}

BLOCKED_INTERNAL_OPENING_PAIRS = {
    frozenset(("bedroom", "bedroom")),
    frozenset(("bathroom", "bathroom")),
}

CONNECTABLE_INTERNAL_EDGE_TYPES = {"connectable", "open", "opening"}
BLOCKING_INTERNAL_EDGE_TYPES = {"service"}

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

    placement = {
        "id": raw["id"],
        "space_type": raw["space_type"],
        "x": raw["x"],
        "y": raw["y"],
        "width": width,
        "depth": depth,
        "rotation": raw.get("rotation", 0),
    }

    if "role" in raw:
        placement["role"] = raw["role"]
    if raw.get("generated"):
        placement["generated"] = True

    return placement


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


def resolve_edge_meta(
    space: dict[str, Any],
    block_def: dict[str, Any],
    road_facing: str,
) -> dict[str, str]:
    edge_meta = dict(block_def.get("edges", {}))

    if space["space_type"] != "entrance":
        return edge_meta

    # Entrance is road-facing: its exterior entry opening follows the site road.
    for side, edge_type in list(edge_meta.items()):
        if edge_type == "entry":
            edge_meta[side] = "connectable"

    for side in ("north", "east", "south", "west"):
        edge_meta.setdefault(side, "connectable")

    edge_meta[road_facing] = "entry"
    return edge_meta


def rotate_edge_meta(edge_meta: dict[str, str], rotation: int) -> dict[str, str]:
    rotation = rotation % 360
    if rotation == 0:
        return edge_meta

    rotated: dict[str, str] = {}
    steps = (rotation // 90) % 4
    side_order = ["north", "east", "south", "west"]

    for old_side, edge_type in edge_meta.items():
        if old_side not in side_order:
            rotated[old_side] = edge_type
            continue
        new_side = side_order[(side_order.index(old_side) + steps) % 4]
        rotated[new_side] = edge_type

    return rotated


def build_edges(
    space: dict[str, Any],
    block_def: dict[str, Any],
    road_facing: str = "south",
) -> list[dict[str, Any]]:
    x = space["x"]
    y = space["y"]
    w = space["width"]
    d = space["depth"]

    edge_meta = resolve_edge_meta(space, block_def, road_facing)
    edge_meta = rotate_edge_meta(edge_meta, space.get("rotation", 0))

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


def shared_edge_to_boundary(shared: dict[str, Any], wall_kind: str) -> dict[str, Any]:
    return {
        "wall_kind": wall_kind,
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


def is_open_internal_connection(shared: dict[str, Any]) -> bool:
    pair = frozenset((shared["space_type_a"], shared["space_type_b"]))
    if pair not in OPEN_INTERNAL_CONNECTIONS:
        return False

    open_edge_types = {"connectable", "open", "opening"}
    return (
        shared["edge_type_a"] in open_edge_types
        and shared["edge_type_b"] in open_edge_types
    )


def build_access_edge_types(layout_data: dict[str, Any]) -> dict[frozenset[str], str]:
    access_edge_types: dict[frozenset[str], str] = {}
    for edge in layout_data.get("meta", {}).get("access_edges", []):
        from_id = edge.get("from")
        to_id = edge.get("to")
        edge_type = edge.get("type")
        if not from_id or not to_id or not edge_type:
            continue
        access_edge_types[frozenset((from_id, to_id))] = edge_type
    return access_edge_types


def get_access_edge_type(
    boundary: dict[str, Any],
    access_edge_types: dict[frozenset[str], str],
) -> str | None:
    return access_edge_types.get(frozenset((boundary["space_a"], boundary["space_b"])))


def split_shared_edges(
    shared_edges: list[dict[str, Any]],
    access_edge_types: dict[frozenset[str], str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    inner_walls: list[dict[str, Any]] = []
    open_edges: list[dict[str, Any]] = []
    access_edge_types = access_edge_types or {}

    for shared in shared_edges:
        access_type = get_access_edge_type(shared, access_edge_types)
        if access_type == "open" or is_open_internal_connection(shared):
            open_edges.append(shared_edge_to_boundary(shared, "open"))
        else:
            inner_walls.append(shared_edge_to_boundary(shared, "inner"))

    return inner_walls, open_edges


def label_base_for_space(space: dict[str, Any]) -> str:
    if str(space.get("role", "")).startswith("corridor_spine"):
        return "CORRIDOR"
    return LABEL_NAME_MAP.get(space["space_type"], space["space_type"].upper())


def _connector_base_id(space_id: str) -> str:
    """connector_3_a → connector_3  (strip trailing _[a-z] segment suffix)."""
    m = re.match(r"^(connector_[^_]+)_[a-z]$", space_id)
    return m.group(1) if m else space_id


def build_labels(
    spaces: list[dict[str, Any]],
    embedded_cores: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    embedded_cores = embedded_cores or []

    # ── Group multi-segment connectors by their shared base ID ──
    # e.g. connector_3_a, connector_3_b, connector_3_c → connector_3
    connector_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    non_connector_spaces: list[dict[str, Any]] = []

    for space in spaces:
        if space["space_type"] == "connector":
            base = _connector_base_id(space["id"])
            connector_groups[base].append(space)
        else:
            non_connector_spaces.append(space)

    # ── Count labels for non-connector spaces ──
    label_bases = [label_base_for_space(s) for s in non_connector_spaces]
    label_counts = Counter(label_bases)
    label_indices: dict[str, int] = defaultdict(int)

    labels: list[dict[str, Any]] = []

    # ── Non-connector spaces ──
    for space in non_connector_spaces:
        base_text = label_base_for_space(space)

        if label_counts[base_text] > 1:
            label_indices[base_text] += 1
            text = f"{base_text} {label_indices[base_text]}"
        else:
            text = base_text

        # Area in m²: grid unit = 0.5 m → 1 grid unit² = 0.25 m²
        area_m2 = round(space["width"] * space["depth"] * 0.25, 1)
        labels.append(
            {
                "space_id": space["id"],
                "text": text,
                "area_m2": area_m2,
                "x": space["x"] + space["width"] / 2,
                "y": space["y"] + space["depth"] / 2,
            }
        )

    # ── Connector groups: one label per functional corridor ──
    corridor_count = len(connector_groups)
    corridor_idx = 0
    for base_id, segments in connector_groups.items():
        # Centroid weighted by segment area
        total_area = sum(s["width"] * s["depth"] for s in segments)
        cx = sum((s["x"] + s["width"] / 2) * s["width"] * s["depth"] for s in segments) / total_area
        cy = sum((s["y"] + s["depth"] / 2) * s["width"] * s["depth"] for s in segments) / total_area
        # Text: numbered only if multiple distinct corridors
        corridor_idx += 1
        text = "CORRIDOR" if corridor_count == 1 else f"CORRIDOR {corridor_idx}"
        # Representative space_id (first segment)
        rep_id = sorted(s["id"] for s in segments)[0]
        # No area for corridors
        labels.append({"space_id": rep_id, "text": text, "x": cx, "y": cy})

    for core in embedded_cores:
        labels.append(
            {
                "space_id": core["id"],
                "host_space_id": core.get("host_space_id"),
                "text": "CORE",
                "x": core["x"] + core["width"] / 2,
                "y": core["y"] + core["depth"] / 2,
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

        elif edge_type in ("window_preferred", "window_required"):
            # window_required: 채광 필수 — 벽 길이의 더 넓은 비율로 창문 생성
            ratio = 0.8 if edge_type == "window_required" else 0.6
            target = min(WINDOW_DEFAULT_WIDTH, max(1.2, segment_length(edge) * ratio))
            segment = centered_segment_on_edge(edge, target, min_margin=0.3)
            if segment is None:
                continue
            x1, y1, x2, y2 = segment
            openings.append(
                {
                    "kind": "window",
                    "placement": "exterior",
                    "required": edge_type == "window_required",
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

        # exterior: 외벽이지만 창문 없음 (욕실 측면, 주방 서비스 벽 등)
        # solid, exterior 모두 opening 없이 그대로 외벽으로 렌더링됨

    return openings


def is_allowed_internal_connection(space_type_a: str, space_type_b: str) -> bool:
    return frozenset((space_type_a, space_type_b)) in ALLOWED_INTERNAL_CONNECTIONS


def is_wide_internal_connection(space_type_a: str, space_type_b: str) -> bool:
    return frozenset((space_type_a, space_type_b)) in WIDE_INTERNAL_CONNECTIONS


def is_blocked_internal_opening_pair(space_type_a: str, space_type_b: str) -> bool:
    return frozenset((space_type_a, space_type_b)) in BLOCKED_INTERNAL_OPENING_PAIRS


def get_space_zone(space_type: str) -> str:
    if space_type == "entrance":
        return "entry"

    try:
        block_def = load_block_definition(space_type)
    except FileNotFoundError:
        return "private"

    return block_def.get("zone", "private")


def is_private_space(space_type: str) -> bool:
    return get_space_zone(space_type) == "private"


def is_public_connector_space(space_type: str) -> bool:
    return get_space_zone(space_type) in {"public", "semi_private"} or space_type == "connector"


def is_entry_to_private_pair(space_type_a: str, space_type_b: str) -> bool:
    return (
        (space_type_a == "entrance" and is_private_space(space_type_b))
        or (space_type_b == "entrance" and is_private_space(space_type_a))
    )


def is_flow_allowed_by_zone(space_type_a: str, space_type_b: str) -> bool:
    if is_entry_to_private_pair(space_type_a, space_type_b):
        return False

    if space_type_a == "entrance" or space_type_b == "entrance":
        other = space_type_b if space_type_a == "entrance" else space_type_a
        return is_public_connector_space(other)

    return True


def both_edges_connectable(edge_type_a: str, edge_type_b: str) -> bool:
    return (
        edge_type_a in CONNECTABLE_INTERNAL_EDGE_TYPES
        and edge_type_b in CONNECTABLE_INTERNAL_EDGE_TYPES
    )


def should_make_inner_opening(wall: dict[str, Any]) -> bool:
    edge_type_a = wall["edge_type_a"]
    edge_type_b = wall["edge_type_b"]
    space_type_a = wall["space_type_a"]
    space_type_b = wall["space_type_b"]

    if is_wide_internal_connection(space_type_a, space_type_b):
        return True

    if is_blocked_internal_opening_pair(space_type_a, space_type_b):
        return False

    if not is_flow_allowed_by_zone(space_type_a, space_type_b):
        return False

    if (
        edge_type_a in BLOCKING_INTERNAL_EDGE_TYPES
        or edge_type_b in BLOCKING_INTERNAL_EDGE_TYPES
    ):
        return False

    if both_edges_connectable(edge_type_a, edge_type_b):
        return True

    return is_allowed_internal_connection(space_type_a, space_type_b)


def build_inner_openings(
    inner_walls: list[dict[str, Any]],
    access_edge_types: dict[frozenset[str], str] | None = None,
) -> list[dict[str, Any]]:
    openings: list[dict[str, Any]] = []
    access_edge_types = access_edge_types or {}
    use_access_edges = bool(access_edge_types)

    for wall in inner_walls:
        access_type = get_access_edge_type(wall, access_edge_types)

        if use_access_edges:
            if access_type is None or access_type == "open":
                continue

            if access_type == "wide_opening":
                desired_length = segment_length(wall) * WIDE_OPENING_RATIO
                min_margin = 0.45
                opening_kind = "wide_opening"
            elif access_type == "door":
                desired_length = INTERIOR_OPENING_WIDTH
                min_margin = 0.3
                opening_kind = "door"
            else:
                desired_length = INTERIOR_OPENING_WIDTH
                min_margin = 0.3
                opening_kind = "opening"
        else:
            if not should_make_inner_opening(wall):
                continue

            if is_wide_internal_connection(wall["space_type_a"], wall["space_type_b"]):
                desired_length = segment_length(wall) * WIDE_OPENING_RATIO
                min_margin = 0.45
                opening_kind = "wide_opening"
            else:
                desired_length = INTERIOR_OPENING_WIDTH
                min_margin = 0.3
                opening_kind = "opening"

        segment = centered_segment_on_edge(wall, desired_length, min_margin=min_margin)
        if segment is None:
            continue

        x1, y1, x2, y2 = segment
        openings.append(
            {
                "kind": opening_kind,
                "placement": "interior",
                "space_a": wall["space_a"],
                "space_type_a": wall["space_type_a"],
                "space_b": wall["space_b"],
                "space_type_b": wall["space_type_b"],
                "source_edge_type_a": wall["edge_type_a"],
                "source_edge_type_b": wall["edge_type_b"],
                "access_type": access_type,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            }
        )

    return openings


def build_fallback_windows(
    outer_edges: list[dict[str, Any]],
    openings: list[dict[str, Any]],
    raw_placements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """For rooms that require natural light but have no window, place a fallback
    window on the longest available exterior outer edge.

    This handles cases where the preferred window face (e.g. window_required on south)
    is interior due to corridor placement or rotation, but the room has other exterior
    faces available.
    """
    # spaces that already have a window
    spaces_with_windows = {o["space_id"] for o in openings if o["kind"] == "window"}

    # build a lookup: space_id → natural_light level ("required", "preferred", or falsy)
    natural_light_level = {
        p["id"]: p.get("natural_light", "none")
        for p in raw_placements
    }

    # skip these room types — they don't need fallback windows
    skip_types = {"entrance", "connector", "vertical_core"}

    fallback: list[dict[str, Any]] = []

    # group outer edges by space_id
    from collections import defaultdict
    edges_by_space: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in outer_edges:
        edges_by_space[edge["space_id"]].append(edge)

    for space_id, space_edges in edges_by_space.items():
        if space_id in spaces_with_windows:
            continue
        nl_level = natural_light_level.get(space_id, "none")
        if nl_level not in ("required", "preferred"):
            continue
        # find the space_type
        sample = space_edges[0]
        if sample["space_type"] in skip_types:
            continue

        # pick the longest exterior edge that can hold a window
        candidate_edges = [
            e for e in space_edges
            if e["edge_type"] in ("exterior", "connectable", "window_preferred", "window_required")
            and segment_length(e) >= 1.5
        ]
        if not candidate_edges:
            continue

        # prefer edges that are not "connectable" (already-interior edges shouldn't get windows)
        non_connectable = [e for e in candidate_edges if e["edge_type"] != "connectable"]
        pool = non_connectable if non_connectable else candidate_edges

        best_edge = max(pool, key=segment_length)
        ratio = 0.6 if nl_level == "required" else 0.45
        target = min(WINDOW_DEFAULT_WIDTH, max(1.0, segment_length(best_edge) * ratio))
        segment = centered_segment_on_edge(best_edge, target, min_margin=0.3)
        if segment is None:
            continue
        x1, y1, x2, y2 = segment
        fallback.append(
            {
                "kind": "window",
                "placement": "exterior",
                "required": nl_level == "required",
                "fallback": True,
                "space_id": best_edge["space_id"],
                "space_type": best_edge["space_type"],
                "host_side": best_edge["side"],
                "source_edge_type": best_edge["edge_type"],
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            }
        )

    return fallback


def build_openings(
    outer_edges: list[dict[str, Any]],
    inner_walls: list[dict[str, Any]],
    access_edge_types: dict[frozenset[str], str] | None = None,
    raw_placements: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    openings = []
    openings.extend(build_outer_openings(outer_edges))
    openings.extend(build_inner_openings(inner_walls, access_edge_types=access_edge_types))
    if raw_placements:
        openings.extend(build_fallback_windows(outer_edges, openings, raw_placements))
    return openings


def build_plan_geometry(layout_data: dict[str, Any]) -> dict[str, Any]:
    raw_placements = layout_data.get("placements", [])
    if not raw_placements:
        raise ValueError("layout_data does not contain placements")

    road_facing = layout_data.get("meta", {}).get("road_facing", "south")
    access_edge_types = build_access_edge_types(layout_data)
    spaces: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for raw in raw_placements:
        space = normalize_placement(raw)
        block_def = load_block_definition(space["space_type"])

        spaces.append(
            {
                **space,
                "polygon": build_space_polygon(space),
                "fill_color": SPACE_FILL_COLORS.get(space["space_type"], "#f8f8f8"),
            }
        )
        edges.extend(build_edges(space, block_def, road_facing=road_facing))

    shared_edges = find_shared_edges(edges)
    outer_edges = find_outer_edges(edges, shared_edges)
    inner_walls, open_edges = split_shared_edges(shared_edges, access_edge_types=access_edge_types)
    embedded_cores = layout_data.get("meta", {}).get("embedded_cores", [])
    labels = build_labels(spaces, embedded_cores=embedded_cores)
    openings = build_openings(
        outer_edges,
        inner_walls,
        access_edge_types=access_edge_types,
        raw_placements=raw_placements,
    )

    return {
        "spaces": spaces,
        "access_edges": layout_data.get("meta", {}).get("access_edges", []),
        "embedded_cores": embedded_cores,
        "edges": edges,
        "shared_edges": shared_edges,
        "outer_edges": outer_edges,
        "inner_walls": inner_walls,
        "open_edges": open_edges,
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
