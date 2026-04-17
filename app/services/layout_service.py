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


def overlaps(ax: int, ay: int, aw: int, ad: int,
             bx: int, by: int, bw: int, bd: int) -> bool:
    return not (ax + aw <= bx or bx + bw <= ax or
                ay + ad <= by or by + bd <= ay)


def shares_wall(ax: int, ay: int, aw: int, ad: int,
                bx: int, by: int, bw: int, bd: int) -> bool:
    """두 블록이 벽을 공유(직접 맞닿음)하는지 확인."""
    # 동서 방향 인접
    if ax + aw == bx or bx + bw == ax:
        return max(ay, by) < min(ay + ad, by + bd)
    # 남북 방향 인접
    if ay + ad == by or by + bd == ay:
        return max(ax, bx) < min(ax + aw, bx + bw)
    return False


def get_adjacency_score(a: str, b: str,
                        adjacency_preferences: list[dict[str, Any]]) -> int:
    for pref in adjacency_preferences:
        if (pref["from"] == a and pref["to"] == b) or \
           (pref["from"] == b and pref["to"] == a):
            return pref["score"]
    return 0


def is_private_zone(block_def: dict[str, Any]) -> bool:
    return block_def.get("zone", "private") == "private"


def touches_space(
    x: int,
    y: int,
    w: int,
    d: int,
    placed: list[dict[str, Any]],
    space_type: str,
) -> bool:
    return any(
        p["space_type"] == space_type
        and shares_wall(x, y, w, d, p["x"], p["y"], p["width"], p["depth"])
        for p in placed
    )


def get_candidate_positions(
    placed: list[dict[str, Any]],
    new_w: int,
    new_d: int,
) -> list[tuple[int, int]]:
    """
    기존 배치된 블록들에 인접하면서 겹치지 않는 후보 좌표 목록 반환.
    기존 블록들의 x/y 엣지 좌표 조합으로 후보를 생성한다.
    """
    if not placed:
        return [(0, 0)]

    xs: set[int] = set()
    ys: set[int] = set()
    for p in placed:
        px, py, pw, pd = p["x"], p["y"], p["width"], p["depth"]
        xs.update([px, px + pw, px + pw - new_w, px - new_w])
        ys.update([py, py + pd, py + pd - new_d, py - new_d])

    candidates: list[tuple[int, int]] = []
    for x in xs:
        for y in ys:
            if x < 0 or y < 0:
                continue
            adjacent = any(
                shares_wall(x, y, new_w, new_d,
                            p["x"], p["y"], p["width"], p["depth"])
                for p in placed
            )
            if not adjacent:
                continue
            no_overlap = not any(
                overlaps(x, y, new_w, new_d,
                         p["x"], p["y"], p["width"], p["depth"])
                for p in placed
            )
            if no_overlap:
                candidates.append((x, y))

    return candidates


def score_position(
    x: int, y: int, w: int, d: int,
    block_type: str,
    block_def: dict[str, Any],
    placed: list[dict[str, Any]],
    adjacency_preferences: list[dict[str, Any]],
    road_facing: str = "south",
) -> float:
    """
    좌표계: +y = 북쪽, -y = 남쪽, +x = 동쪽, -x = 서쪽

    road_facing: 도로가 향한 방향 (entrance가 노출되는 쪽)
      "south" → 도로가 남쪽 → entrance는 낮은 y, public 블록도 낮은 y 선호
      "north" → 도로가 북쪽 → entrance는 높은 y, public 블록도 높은 y 선호
      "east"  → 도로가 동쪽 → entrance는 높은 x
      "west"  → 도로가 서쪽 → entrance는 낮은 x
    """
    score = 0.0
    zone = block_def.get("zone", "private")

    # 1. 인접 adjacency 점수 합산
    for p in placed:
        if shares_wall(x, y, w, d, p["x"], p["y"], p["width"], p["depth"]):
            score += get_adjacency_score(
                block_type, p["space_type"], adjacency_preferences
            )

    # Private rooms should not attach directly to the entrance; keep a public buffer.
    if is_private_zone(block_def) and touches_space(x, y, w, d, placed, "entrance"):
        score -= 80

    # 2. zone 선호 위치 (도로 방향 기준)
    #    public = 도로쪽, private = 안쪽
    zone_weight = {"public": 1.5, "semi_private": 0.3, "private": 0.8}
    pub_w  = zone_weight["public"]
    semi_w = zone_weight["semi_private"]
    priv_w = zone_weight["private"]

    if road_facing == "south":
        # 도로=남(낮은y) → public은 낮은 y 선호, private은 높은 y 선호
        if zone == "public":       score -= y * pub_w
        elif zone == "semi_private": score -= y * semi_w
        elif zone == "private":    score += y * priv_w
    elif road_facing == "north":
        if zone == "public":       score += y * pub_w
        elif zone == "semi_private": score += y * semi_w
        elif zone == "private":    score -= y * priv_w
    elif road_facing == "east":
        if zone == "public":       score += x * pub_w
        elif zone == "semi_private": score += x * semi_w
        elif zone == "private":    score -= x * priv_w
    elif road_facing == "west":
        if zone == "public":       score -= x * pub_w
        elif zone == "semi_private": score -= x * semi_w
        elif zone == "private":    score += x * priv_w

    # 3. preferred_orientation: 태양 기준 (+y=북)
    #    "south" → 블록의 남쪽 면(낮은 y 엣지)이 외부에 노출되어야 유리
    #    "north" → 블록의 북쪽 면(높은 y 엣지)이 외부에 노출되어야 유리
    orient = block_def.get("preferred_orientation", "any")
    if orient == "south":
        # 남쪽 면 = y (블록 최솟값). 남쪽 면을 막는 블록은 y+depth == 현재 y
        south_blocked = any(
            p["y"] + p["depth"] == y and
            max(x, p["x"]) < min(x + w, p["x"] + p["width"])
            for p in placed
        )
        if not south_blocked:
            score += 4
    elif orient == "north":
        # 북쪽 면 = y+d. 북쪽 면을 막는 블록은 y == 현재 y+d
        north_blocked = any(
            p["y"] == y + d and
            max(x, p["x"]) < min(x + w, p["x"] + p["width"])
            for p in placed
        )
        if not north_blocked:
            score += 4

    # 4. 컴팩트함: 전체 footprint 증가를 최소화
    if placed:
        cur_max_x = max(p["x"] + p["width"] for p in placed)
        cur_max_y = max(p["y"] + p["depth"] for p in placed)
        new_max_x = max(cur_max_x, x + w)
        new_max_y = max(cur_max_y, y + d)
        footprint_delta = (new_max_x * new_max_y) - (cur_max_x * cur_max_y)
        score -= footprint_delta * 0.08

    return score


def placement_priority(block_type: str, block_def: dict[str, Any]) -> tuple:
    """
    배치 우선순위:
    1. entrance 항상 최우선 (건물 기준점)
    2. 나머지 fixed_core (kitchen, bathroom, vertical_core)
    3. plumbing 있는 블록
    4. zone 순 (public → semi_private → private)
    """
    is_entrance = 0 if block_type == "entrance" else 1
    fixed = 0 if block_def.get("fixed_core") else 1
    zone_order = {"public": 0, "semi_private": 1, "private": 2}
    zone = zone_order.get(block_def.get("zone", "private"), 2)
    plumbing = 0 if block_def.get("plumbing_required") else 1
    return (is_entrance, fixed, plumbing, zone)


def make_placement(
    original_idx: int,
    block_type: str,
    block_def: dict[str, Any],
    x: int,
    y: int,
    rotation: int = 0,
) -> dict[str, Any]:
    width = block_def["width"]
    depth = block_def["depth"]
    if rotation % 180 == 90:
        width, depth = depth, width

    return {
        "id": f"{block_type}_{original_idx}",
        "space_type": block_type,
        "family": block_def.get("family", "unknown"),
        "fixed_core": block_def.get("fixed_core", False),
        "x": x,
        "y": y,
        "width": width,
        "depth": depth,
        "height": depth,
        "rotation": rotation,
        "zone": block_def.get("zone", "private"),
        "plumbing_required": block_def.get("plumbing_required", False),
        "preferred_orientation": block_def.get("preferred_orientation", "any"),
        "natural_light": block_def.get("natural_light", "none"),
        "acoustic_insulation": block_def.get("acoustic_insulation", "low"),
    }


def make_sized_placement(
    original_idx: int,
    block_type: str,
    block_def: dict[str, Any],
    x: int,
    y: int,
    width: int,
    depth: int,
    role: str | None = None,
    generated: bool = False,
) -> dict[str, Any]:
    placement = make_placement(original_idx, block_type, block_def, x, y)
    placement["width"] = width
    placement["depth"] = depth
    placement["height"] = block_def.get("height", 3)
    if role is not None:
        placement["role"] = role
    if generated:
        placement["generated"] = True
    return placement


def with_custom_id(placement: dict[str, Any], custom_id: str) -> dict[str, Any]:
    copied = dict(placement)
    copied["id"] = custom_id
    return copied


def block_variant(block_def: dict[str, Any], rotation: int) -> dict[str, Any]:
    variant = dict(block_def)
    if rotation % 180 == 90:
        variant["width"], variant["depth"] = block_def["depth"], block_def["width"]
    return variant


def rotation_options(block_def: dict[str, Any]) -> list[int]:
    if not block_def.get("rotatable", False):
        return [0]
    if block_def["width"] == block_def["depth"]:
        return [0]
    return [0, 90]


def public_spine_order(item: tuple[int, str, dict[str, Any]]) -> tuple[int, int]:
    order = {
        "kitchen": 0,
        "living_room": 1,
        "vertical_core": 2,
        "connector": 3,
    }
    return (order.get(item[1], 10), item[0])


def private_cluster_order(item: tuple[int, str, dict[str, Any]]) -> tuple[int, int]:
    order = {
        "master_bedroom": 0,
        "bedroom": 1,
        "child_bedroom": 2,
        "bathroom": 3,
    }
    return (order.get(item[1], 10), item[0])


def opposite_side(side: str) -> str:
    return {
        "north": "south",
        "south": "north",
        "east": "west",
        "west": "east",
    }[side]


def tangent_axis(side: str) -> str:
    return "x" if side in {"north", "south"} else "y"


FLOW_SIDES = ("north", "east", "south", "west")
CORRIDOR_THICKNESS = 3


def is_living_like(block_type: str, block_def: dict[str, Any]) -> bool:
    return block_type == "living_room" or block_def.get("family") == "open_public"


def is_connector_like(block_type: str, block_def: dict[str, Any]) -> bool:
    return block_type == "connector" or block_def.get("family") == "connector"


def can_follow_entrance(block_type: str, block_def: dict[str, Any]) -> bool:
    return is_connector_like(block_type, block_def) or is_living_like(block_type, block_def)


def family_connects(a: dict[str, Any], b: dict[str, Any]) -> bool:
    a_family = a.get("family")
    b_family = b.get("family")
    return (
        b_family in a.get("connectable_to_families", [])
        or a_family in b.get("connectable_to_families", [])
    )


def block_center(placement: dict[str, Any]) -> tuple[float, float]:
    return (
        placement["x"] + placement["width"] / 2,
        placement["y"] + placement["depth"] / 2,
    )


def distance_between(a: dict[str, Any], b: dict[str, Any]) -> float:
    ax, ay = block_center(a)
    bx, by = block_center(b)
    return abs(ax - bx) + abs(ay - by)


def flow_connection_score(
    anchor: dict[str, Any],
    block_type: str,
    block_def: dict[str, Any],
    adjacency_preferences: list[dict[str, Any]],
) -> float:
    anchor_type = anchor["space_type"]
    anchor_family = anchor.get("family")
    anchor_zone = anchor.get("zone", "private")
    block_family = block_def.get("family")
    block_zone = block_def.get("zone", "private")

    score = get_adjacency_score(anchor_type, block_type, adjacency_preferences) * 14

    if family_connects(anchor, block_def):
        score += 34
    else:
        score -= 12

    if anchor_type == "entrance":
        if can_follow_entrance(block_type, block_def):
            score += 90
        else:
            score -= 220

    if is_connector_like(anchor_type, anchor):
        if block_zone == "private":
            score += 46
        elif block_zone == "semi_private":
            score += 34
        elif is_living_like(block_type, block_def):
            score += 38

    if is_living_like(anchor_type, anchor):
        if block_type == "kitchen":
            score += 68
        elif block_type == "bathroom":
            score -= 8
        elif block_zone == "semi_private":
            score += 36
        elif block_zone == "private":
            score += 28
        elif block_zone == "public":
            score += 24

    if anchor_family == "wet_core" and block_family == "wet_core":
        score += 24

    if anchor_zone == "private":
        if block_family == "wet_core":
            score += 30
        elif block_zone == "private":
            score += 10

    return score


def contact_relationship_score(
    candidate: dict[str, Any],
    placed: list[dict[str, Any]],
    adjacency_preferences: list[dict[str, Any]],
) -> float:
    score = 0.0
    candidate_type = candidate["space_type"]
    candidate_zone = candidate.get("zone", "private")
    candidate_family = candidate.get("family")

    for existing in placed:
        if not shares_wall(
            candidate["x"],
            candidate["y"],
            candidate["width"],
            candidate["depth"],
            existing["x"],
            existing["y"],
            existing["width"],
            existing["depth"],
        ):
            continue

        existing_type = existing["space_type"]
        existing_zone = existing.get("zone", "private")
        existing_family = existing.get("family")

        score += get_adjacency_score(
            candidate_type,
            existing_type,
            adjacency_preferences,
        ) * 9

        if candidate_type == existing_type:
            score -= 26

        if family_connects(existing, candidate):
            score += 16

        living_pair = (
            is_living_like(existing_type, existing)
            or is_living_like(candidate_type, candidate)
        )
        if living_pair:
            if candidate_type == "bathroom" or existing_type == "bathroom":
                score -= 12
                continue
            other_zone = (
                candidate_zone
                if is_living_like(existing_type, existing)
                else existing_zone
            )
            if other_zone == "private":
                score += 24
            elif other_zone == "semi_private":
                score += 18

        bedroom_bath_pair = (
            ("bedroom" in candidate_type and existing_type == "bathroom")
            or ("bedroom" in existing_type and candidate_type == "bathroom")
        )
        if bedroom_bath_pair:
            score += 28

        if candidate_family == "wet_core" and existing_family == "wet_core":
            score += 20

    return score


def side_direction_score(side: str, road_facing: str, block_def: dict[str, Any]) -> float:
    zone = block_def.get("zone", "private")
    if side == road_facing:
        if zone == "public":
            return 5
        if zone == "semi_private":
            return -4
        return -8

    if side == opposite_side(road_facing):
        if zone == "private":
            return 8
        if zone == "semi_private":
            return 5
        return 2

    return 2 if zone in {"public", "semi_private"} else 0


def footprint_penalty(
    x: int,
    y: int,
    width: int,
    depth: int,
    placed: list[dict[str, Any]],
) -> float:
    min_x = min([x] + [p["x"] for p in placed])
    min_y = min([y] + [p["y"] for p in placed])
    max_x = max([x + width] + [p["x"] + p["width"] for p in placed])
    max_y = max([y + depth] + [p["y"] + p["depth"] for p in placed])
    return (max_x - min_x) * (max_y - min_y) * 0.16


def footprint_perimeter_penalty(
    x: int,
    y: int,
    width: int,
    depth: int,
    placed: list[dict[str, Any]],
) -> float:
    min_x = min([x] + [p["x"] for p in placed])
    min_y = min([y] + [p["y"] for p in placed])
    max_x = max([x + width] + [p["x"] + p["width"] for p in placed])
    max_y = max([y + depth] + [p["y"] + p["depth"] for p in placed])
    return ((max_x - min_x) + (max_y - min_y)) * 0.9


def edge_blocked_by_placed(
    x: int,
    y: int,
    width: int,
    depth: int,
    edge: str,
    placed: list[dict[str, Any]],
) -> bool:
    if edge == "north":
        return any(
            p["y"] + p["depth"] == y
            and max(x, p["x"]) < min(x + width, p["x"] + p["width"])
            for p in placed
        )
    if edge == "south":
        return any(
            p["y"] == y + depth
            and max(x, p["x"]) < min(x + width, p["x"] + p["width"])
            for p in placed
        )
    if edge == "east":
        return any(
            p["x"] == x + width
            and max(y, p["y"]) < min(y + depth, p["y"] + p["depth"])
            for p in placed
        )
    if edge == "west":
        return any(
            p["x"] + p["width"] == x
            and max(y, p["y"]) < min(y + depth, p["y"] + p["depth"])
            for p in placed
        )
    return False


def orientation_score(
    x: int,
    y: int,
    block_def: dict[str, Any],
    attached_side: str,
    placed: list[dict[str, Any]],
) -> float:
    orientation = block_def.get("preferred_orientation", "any")
    if orientation == "any":
        return 0

    width = block_def["width"]
    depth = block_def["depth"]
    score = 0.0

    if edge_blocked_by_placed(x, y, width, depth, orientation, placed):
        score -= 8
    else:
        score += 6

    if attached_side == orientation:
        score -= 5
    elif attached_side == opposite_side(orientation):
        score += 3

    return score


def rotated_orientation_score(
    x: int,
    y: int,
    block_def: dict[str, Any],
    rotation: int,
    attached_side: str,
    placed: list[dict[str, Any]],
) -> float:
    variant = block_variant(block_def, rotation)
    return orientation_score(x, y, variant, attached_side, placed)


def placement_candidate_score(
    placed: list[dict[str, Any]],
    anchor: dict[str, Any],
    block_type: str,
    block_def: dict[str, Any],
    x: int,
    y: int,
    width: int,
    depth: int,
    side: str,
    road_facing: str,
    adjacency_preferences: list[dict[str, Any]],
    rotation: int = 0,
) -> float:
    score = flow_connection_score(anchor, block_type, block_def, adjacency_preferences)
    score += side_direction_score(side, road_facing, block_def)
    score += rotated_orientation_score(x, y, block_def, rotation, side, placed)
    score -= footprint_penalty(x, y, width, depth, placed)
    score -= footprint_perimeter_penalty(x, y, width, depth, placed)

    if anchor["space_type"] == "entrance" and side != opposite_side(road_facing):
        score -= 300

    if block_def.get("zone") == "private" and anchor["space_type"] == "entrance":
        score -= 500

    candidate = make_placement(-999, block_type, block_def, x, y, rotation=rotation)
    score += contact_relationship_score(candidate, placed, adjacency_preferences)
    score -= same_type_wall_contact_score(candidate, placed) * 16

    existing_living = next(
        (p for p in placed if is_living_like(p["space_type"], p)),
        None,
    )
    if existing_living is not None and block_def.get("zone") == "private":
        score -= distance_between(candidate, existing_living) * 0.35

    return score


def candidate_offsets(anchor: dict[str, Any], block_def: dict[str, Any], side: str) -> list[int]:
    if tangent_axis(side) == "x":
        start = -block_def["width"] + 1
        end = anchor["width"] - 1
    else:
        start = -block_def["depth"] + 1
        end = anchor["depth"] - 1

    offsets = list(range(start, end + 1))
    offsets.sort(key=lambda value: (abs(value), value))
    return offsets


def flow_anchor_candidates(placed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anchors = [
        placement for placement in placed
        if placement["space_type"] != "bathroom"
    ]
    return anchors or placed


def flow_access_type(anchor: dict[str, Any], placement: dict[str, Any]) -> str:
    pair = frozenset((anchor["space_type"], placement["space_type"]))
    if pair == frozenset(("living_room", "kitchen")):
        return "open"
    if placement["space_type"] == "bathroom" or anchor["space_type"] == "bathroom":
        return "door"
    if placement.get("zone") == "private" or anchor.get("zone") == "private":
        return "door"
    if "entrance" in pair or is_living_like(anchor["space_type"], anchor):
        return "wide_opening"
    return "opening"


def select_best_flow_candidate(
    placed: list[dict[str, Any]],
    remaining: list[tuple[int, str, dict[str, Any]]],
    road_facing: str,
    adjacency_preferences: list[dict[str, Any]],
) -> tuple[tuple[int, str, dict[str, Any]], dict[str, Any], dict[str, Any]]:
    best: tuple[
        float,
        int,
        tuple[int, str, dict[str, Any]],
        dict[str, Any],
        dict[str, Any],
    ] | None = None

    for order, item in enumerate(remaining):
        idx, block_type, block_def = item
        for anchor in flow_anchor_candidates(placed):
            for side in FLOW_SIDES:
                for rotation in rotation_options(block_def):
                    variant = block_variant(block_def, rotation)
                    for offset in candidate_offsets(anchor, variant, side):
                        x, y = position_on_side(anchor, variant, side, offset)
                        if placement_overlaps_existing(x, y, variant["width"], variant["depth"], placed):
                            continue

                        score = placement_candidate_score(
                            placed,
                            anchor,
                            block_type,
                            block_def,
                            x,
                            y,
                            variant["width"],
                            variant["depth"],
                            side,
                            road_facing,
                            adjacency_preferences,
                            rotation=rotation,
                        )
                        placement = make_placement(idx, block_type, block_def, x, y, rotation=rotation)
                        if placement_overlaps_existing(
                            placement["x"],
                            placement["y"],
                            placement["width"],
                            placement["depth"],
                            placed,
                        ):
                            continue
                        candidate = (score, -order, item, placement, anchor)
                        if best is None or candidate[:2] > best[:2]:
                            best = candidate

    if best is None:
        raise ValueError("No non-overlapping flow placement candidate found.")

    return best[2], best[3], best[4]


def living_is_placed(placed: list[dict[str, Any]]) -> bool:
    return any(is_living_like(p["space_type"], p) for p in placed)


def next_flow_stage_items(
    placed: list[dict[str, Any]],
    remaining: list[tuple[int, str, dict[str, Any]]],
) -> list[tuple[int, str, dict[str, Any]]]:
    living_items = [
        item for item in remaining
        if is_living_like(item[1], item[2])
    ]
    if living_items and not living_is_placed(placed):
        return living_items

    public_items = [
        item for item in remaining
        if item[2].get("zone") == "public"
    ]
    if public_items:
        return public_items

    return remaining


def placement_rect(placement: dict[str, Any]) -> tuple[int, int, int, int]:
    return placement["x"], placement["y"], placement["width"], placement["depth"]


def placement_overlaps_existing(x: int, y: int, w: int, d: int, placed: list[dict[str, Any]]) -> bool:
    return any(
        overlaps(x, y, w, d, *placement_rect(existing))
        for existing in placed
    )


def position_on_side(
    anchor: dict[str, Any],
    block_def: dict[str, Any],
    side: str,
    offset: int = 0,
) -> tuple[int, int]:
    width = block_def["width"]
    depth = block_def["depth"]

    if side == "north":
        return anchor["x"] + offset, anchor["y"] - depth
    if side == "south":
        return anchor["x"] + offset, anchor["y"] + anchor["depth"]
    if side == "east":
        return anchor["x"] + anchor["width"], anchor["y"] + offset
    if side == "west":
        return anchor["x"] - width, anchor["y"] + offset

    raise ValueError(f"Unknown side: {side}")


def centered_anchor_offset(anchor: dict[str, Any], block_def: dict[str, Any], side: str) -> int:
    if tangent_axis(side) == "x":
        return round((anchor["width"] - block_def["width"]) / 2)
    return round((anchor["depth"] - block_def["depth"]) / 2)


def place_near_anchor(
    placed: list[dict[str, Any]],
    original_idx: int,
    block_type: str,
    block_def: dict[str, Any],
    anchor: dict[str, Any],
    side: str,
    preferred_offset: int | None = None,
) -> dict[str, Any]:
    """Place block_def adjacent to anchor on `side`.

    preferred_offset: if given, the search radiates from this offset first
    (instead of the centred offset).  Useful for biasing kitchen toward the
    road-facing end of the living room so it ends up adjacent to the entrance.
    """
    axis = tangent_axis(side)
    step = 1
    best: tuple[float, dict[str, Any]] | None = None

    for rotation in rotation_options(block_def):
        variant = block_variant(block_def, rotation)
        center_offset = centered_anchor_offset(anchor, variant, side)
        # Use preferred_offset as the search origin when supplied; fall back to centre.
        origin = preferred_offset if preferred_offset is not None else center_offset
        offsets = [origin]
        for i in range(1, 20):
            offsets.extend([origin + i * step, origin - i * step])

        for offset in offsets:
            x, y = position_on_side(anchor, variant, side, offset=offset)
            if placement_overlaps_existing(x, y, variant["width"], variant["depth"], placed):
                continue

            candidate = make_placement(original_idx, block_type, block_def, x, y, rotation=rotation)
            if placement_overlaps_existing(
                candidate["x"],
                candidate["y"],
                candidate["width"],
                candidate["depth"],
                placed,
            ):
                continue

            score = -footprint_penalty(x, y, candidate["width"], candidate["depth"], placed)
            score -= footprint_perimeter_penalty(x, y, candidate["width"], candidate["depth"], placed)
            score -= abs(offset - center_offset) * 0.8
            if rotation % 180 == 90:
                run_length = variant["width"] if axis == "x" else variant["depth"]
                base_run_length = block_def["width"] if axis == "x" else block_def["depth"]
                if run_length > base_run_length:
                    score += 8

            # Preferred orientation: reward exposed face, penalise blocked face.
            orient = block_def.get("preferred_orientation", "any")
            if orient != "any":
                if edge_blocked_by_placed(x, y, candidate["width"], candidate["depth"], orient, placed):
                    score -= 10
                else:
                    score += 6

            if best is None or score > best[0]:
                best = (score, candidate)

    if best is not None:
        return best[1]

    if axis == "x":
        max_x = max(p["x"] + p["width"] for p in placed)
        return make_placement(original_idx, block_type, block_def, max_x, anchor["y"])

    max_y = max(p["y"] + p["depth"] for p in placed)
    return make_placement(original_idx, block_type, block_def, anchor["x"], max_y)


def place_row_from_anchor(
    placed: list[dict[str, Any]],
    items: list[tuple[int, str, dict[str, Any]]],
    anchor: dict[str, Any],
    side: str,
) -> list[dict[str, Any]]:
    row: list[dict[str, Any]] = []
    offset = 0

    for idx, block_type, block_def in items:
        x, y = position_on_side(anchor, block_def, side, offset=offset)

        while placement_overlaps_existing(x, y, block_def["width"], block_def["depth"], placed + row):
            offset += 1
            x, y = position_on_side(anchor, block_def, side, offset=offset)

        placement = make_placement(idx, block_type, block_def, x, y)
        row.append(placement)

        if tangent_axis(side) == "x":
            offset += block_def["width"]
        else:
            offset += block_def["depth"]

    return row


def normalize_layout_origin(placements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    min_x = min(p["x"] for p in placements)
    min_y = min(p["y"] for p in placements)

    if min_x == 0 and min_y == 0:
        return placements

    normalized: list[dict[str, Any]] = []
    for placement in placements:
        copied = dict(placement)
        copied["x"] = copied["x"] - min_x
        copied["y"] = copied["y"] - min_y
        normalized.append(copied)

    return normalized


def needs_corridor_spine(items: list[tuple[int, str, dict[str, Any]]]) -> bool:
    non_entrance = [item for item in items if item[1] != "entrance"]
    has_connector = any(is_connector_like(block_type, block_def) for _, block_type, block_def in non_entrance)
    has_vertical_core = any(block_type == "vertical_core" for _, block_type, _ in non_entrance)
    private_like_count = sum(
        1
        for _, block_type, block_def in non_entrance
        if block_type != "vertical_core"
        and block_def.get("zone") in {"private", "semi_private"}
    )
    service_count = sum(
        1
        for _, block_type, block_def in non_entrance
        if block_type in {"bathroom", "workspace"}
        or block_def.get("family") in {"wet_core", "vertical_core"}
    )

    return (
        has_connector
        or (has_vertical_core and private_like_count >= 6 and service_count >= 2)
    )


def spine_axis_for_road(road_facing: str) -> str:
    return "x" if road_facing in {"north", "south"} else "y"


def kitchen_road_end_offset(
    living: dict[str, Any],
    kitchen_def: dict[str, Any],
    kitchen_side: str,
    road_facing: str,
) -> int:
    """Compute offset so kitchen's far edge aligns with living's road-facing edge.

    This places kitchen at the entrance end of the living room, creating the
    natural Entrance → Kitchen → Living flow instead of centering kitchen on
    the living room midpoint.

    For rf=south (kitchen on east/west of living, offset = y):
      → kitchen south flush with living south → offset = living.depth - kitchen.depth
    For rf=north (kitchen on east/west of living):
      → kitchen north flush with living north → offset = 0
    For rf=east (kitchen on north/south of living, offset = x):
      → kitchen east flush with living east → offset = living.width - kitchen.width
    For rf=west (kitchen on north/south of living):
      → kitchen west flush with living west → offset = 0
    """
    if tangent_axis(kitchen_side) == "y":   # kitchen on east or west of living
        k_depth = kitchen_def.get("depth", kitchen_def.get("height", 1))
        if road_facing == "south":
            return living["depth"] - k_depth        # bottom-align
        if road_facing == "north":
            return 0                                 # top-align
        return centered_anchor_offset(living, kitchen_def, kitchen_side)
    else:                                            # kitchen on north or south of living
        k_width = kitchen_def["width"]
        if road_facing == "east":
            return living["width"] - k_width        # right-align
        if road_facing == "west":
            return 0                                 # left-align
        return centered_anchor_offset(living, kitchen_def, kitchen_side)


def kitchen_lateral_side(road_facing: str, living: dict[str, Any]) -> str:
    """Return the lateral side to place kitchen, avoiding living's preferred face.

    For east/west roads the default lateral is 'south', which directly blocks
    the living room's south-facing preference.  Pick the other lateral instead.
    """
    laterals = lateral_sides_for_road(road_facing)
    living_orient = living.get("preferred_orientation", "any")
    for side in laterals:
        if side != living_orient:
            return side
    return laterals[0]


def lateral_sides_for_road(road_facing: str) -> tuple[str, str]:
    if road_facing in {"north", "south"}:
        return ("east", "west")
    return ("south", "north")


def sort_spine_rooms(
    item: tuple[int, str, dict[str, Any]],
    road_facing: str = "south",
) -> tuple[int, int]:
    # For N-S spines (rf=east/west) workspace is placed first so it can claim
    # the northernmost private-side position before bedrooms fill southward.
    # This gives workspace(north) an exterior north face and places it in the
    # architecturally correct semi-private buffer zone adjacent to the public area.
    # For E-W spines (rf=north/south) bedrooms stay first — workspace will be
    # placed in the public corridor zone anyway and the order doesn't help.
    # Bathrooms are placed last so they cluster near bedrooms via the
    # bedroom_wall_contact_score bonus.
    ns_spine = road_facing in ("east", "west")
    if ns_spine:
        order = {
            "workspace": 0,
            "master_bedroom": 1,
            "child_bedroom": 1,
            "bedroom": 1,
            "bathroom": 2,
        }
    else:
        order = {
            "master_bedroom": 0,
            "child_bedroom": 0,
            "bedroom": 0,
            "workspace": 1,
            "bathroom": 2,
        }
    return (order.get(item[1], 5), item[0])


def required_spine_length(
    attach_items: list[tuple[int, str, dict[str, Any]]],
    axis: str,
) -> int:
    if not attach_items:
        return 3

    total = 0
    for _, _, block_def in attach_items:
        if axis == "x":
            total += block_def["width"]
        else:
            total += block_def["depth"]

    return max(3, total)


def shortest_rotated_run_length(block_def: dict[str, Any], axis: str) -> int:
    run_lengths: list[int] = []
    for rotation in rotation_options(block_def):
        variant = block_variant(block_def, rotation)
        run_lengths.append(variant["width"] if axis == "x" else variant["depth"])
    return min(run_lengths)


def estimated_two_lane_spine_length(
    attach_items: list[tuple[int, str, dict[str, Any]]],
    axis: str,
) -> int:
    lane_lengths = [0, 0]
    run_lengths = sorted(
        (
            shortest_rotated_run_length(block_def, axis)
            for _, _, block_def in attach_items
        ),
        reverse=True,
    )
    for run_length in run_lengths:
        target_lane = 0 if lane_lengths[0] <= lane_lengths[1] else 1
        lane_lengths[target_lane] += run_length
    return max(3, max(lane_lengths))


def required_corridor_path_length(
    attach_items: list[tuple[int, str, dict[str, Any]]],
    axis: str,
) -> int:
    path_items = [
        item for item in attach_items
        if item[1] != "vertical_core"
    ]
    if not path_items:
        return 3
    return required_spine_length(path_items, axis)


def make_corridor_spine(
    connector_item: tuple[int, str, dict[str, Any]] | None,
    living: dict[str, Any],
    road_facing: str,
    attach_items: list[tuple[int, str, dict[str, Any]]],
) -> dict[str, Any]:
    axis = spine_axis_for_road(road_facing)
    interior_side = opposite_side(road_facing)
    connector_def = connector_item[2] if connector_item else load_block_definition("connector")
    connector_idx = connector_item[0] if connector_item else -2

    length = max(
        required_spine_length(attach_items, axis),
        living["width"] if axis == "x" else living["depth"],
    )
    thickness = CORRIDOR_THICKNESS
    width = length if axis == "x" else thickness
    depth = thickness if axis == "x" else length

    # For rf=north with a south-preferring living room: place corridor on the
    # road-facing (north) side of living — between entrance and living —
    # so the living room's south face remains open to the garden.
    if road_facing == "north" and living.get("preferred_orientation") == "south":
        corridor_side = "north"
    else:
        corridor_side = interior_side

    x, y = position_on_side(living, {"width": width, "depth": depth}, corridor_side)
    if axis == "x":
        x = living["x"]
    else:
        y = living["y"]

    return make_sized_placement(
        connector_idx,
        "connector",
        connector_def,
        x,
        y,
        width,
        depth,
        role="corridor_spine",
        generated=connector_item is None,
    )


def should_use_l_shaped_spine(
    attach_items: list[tuple[int, str, dict[str, Any]]],
    road_facing: str,
) -> bool:
    axis = spine_axis_for_road(road_facing)
    if len(attach_items) < 5:
        return False

    single_spine_capacity = 16
    if estimated_two_lane_spine_length(attach_items, axis) <= single_spine_capacity:
        return False

    return required_spine_length(attach_items, axis) > single_spine_capacity


def split_l_shape_items(
    attach_items: list[tuple[int, str, dict[str, Any]]],
) -> tuple[list[tuple[int, str, dict[str, Any]]], list[tuple[int, str, dict[str, Any]]]]:
    first_leg: list[tuple[int, str, dict[str, Any]]] = []
    second_leg: list[tuple[int, str, dict[str, Any]]] = []

    for item in attach_items:
        _, block_type, block_def = item
        family = block_def.get("family")
        if block_type in {"bathroom", "vertical_core"} or family == "vertical_core":
            second_leg.append(item)
        else:
            first_leg.append(item)

    if not first_leg or not second_leg:
        split_at = max(2, (len(attach_items) + 1) // 2)
        return attach_items[:split_at], attach_items[split_at:]

    return first_leg, second_leg


def split_corridor_path_items(
    attach_items: list[tuple[int, str, dict[str, Any]]],
) -> list[list[tuple[int, str, dict[str, Any]]]]:
    first_leg, second_leg = split_l_shape_items(attach_items)
    if len(attach_items) < 7:
        return [first_leg, second_leg]

    service_items = [
        item for item in attach_items
        if is_service_cluster_item(item[1], item[2])
    ]
    non_service_items = [
        item for item in attach_items
        if not is_service_cluster_item(item[1], item[2])
    ]

    if service_items and len(non_service_items) >= 4:
        split_at = max(2, (len(non_service_items) + 1) // 2)
        return [
            non_service_items[:split_at],
            non_service_items[split_at:],
            service_items,
        ]

    split_a = max(2, (len(attach_items) + 2) // 3)
    split_b = max(split_a + 1, (len(attach_items) * 2 + 2) // 3)
    return [
        attach_items[:split_a],
        attach_items[split_a:split_b],
        attach_items[split_b:],
    ]


def connector_leg_id(connector_item: tuple[int, str, dict[str, Any]] | None, suffix: str) -> str:
    connector_idx = connector_item[0] if connector_item else -2
    return f"connector_{connector_idx}_{suffix}"


def make_connector_leg(
    connector_item: tuple[int, str, dict[str, Any]] | None,
    custom_id: str,
    x: int,
    y: int,
    width: int,
    depth: int,
    role: str,
) -> dict[str, Any]:
    connector_def = connector_item[2] if connector_item else load_block_definition("connector")
    connector_idx = connector_item[0] if connector_item else -2
    placement = make_sized_placement(
        connector_idx,
        "connector",
        connector_def,
        x,
        y,
        width,
        depth,
        role=role,
        generated=connector_item is None,
    )
    return with_custom_id(placement, custom_id)


def make_l_shaped_corridor_spines(
    connector_item: tuple[int, str, dict[str, Any]] | None,
    living: dict[str, Any],
    road_facing: str,
    first_items: list[tuple[int, str, dict[str, Any]]],
    second_items: list[tuple[int, str, dict[str, Any]]],
) -> tuple[dict[str, Any], dict[str, Any], str]:
    axis = spine_axis_for_road(road_facing)
    interior_side = opposite_side(road_facing)
    thickness = CORRIDOR_THICKNESS

    first_content_length = max(
        required_spine_length(first_items, axis),
        living["width"] if axis == "x" else living["depth"],
    )
    first_length = first_content_length + thickness
    second_axis = "y" if axis == "x" else "x"
    second_length = max(required_spine_length(second_items, second_axis), thickness)

    if axis == "x":
        first_width = first_length
        first_depth = thickness
        first_x, first_y = position_on_side(living, {"width": first_width, "depth": first_depth}, interior_side)
        first_x = living["x"]

        second_width = thickness
        second_depth = second_length
        second_x = first_x + first_content_length
        if interior_side == "north":
            second_y = first_y - second_depth
            second_attach_side = "east"
        else:
            second_y = first_y + first_depth
            second_attach_side = "east"
    else:
        first_width = thickness
        first_depth = first_length
        first_x, first_y = position_on_side(living, {"width": first_width, "depth": first_depth}, interior_side)
        first_y = living["y"]

        second_width = second_length
        second_depth = thickness
        second_y = first_y + first_content_length
        if interior_side == "east":
            second_x = first_x + first_width
            second_attach_side = "south"
        else:
            second_x = first_x - second_width
            second_attach_side = "south"

    first_leg = make_connector_leg(
        connector_item,
        connector_leg_id(connector_item, "a"),
        first_x,
        first_y,
        first_width,
        first_depth,
        "corridor_spine_l_leg_a",
    )
    second_leg = make_connector_leg(
        connector_item,
        connector_leg_id(connector_item, "b"),
        second_x,
        second_y,
        second_width,
        second_depth,
        "corridor_spine_l_leg_b",
    )
    return first_leg, second_leg, second_attach_side


def make_corridor_path_segments(
    connector_item: tuple[int, str, dict[str, Any]] | None,
    living: dict[str, Any],
    road_facing: str,
    item_groups: list[list[tuple[int, str, dict[str, Any]]]],
) -> tuple[list[dict[str, Any]], list[str]]:
    axis = spine_axis_for_road(road_facing)
    interior_side = opposite_side(road_facing)
    thickness = CORRIDOR_THICKNESS
    suffixes = ("a", "b", "c")

    if len(item_groups) <= 2:
        first_leg, second_leg, second_attach_side = make_l_shaped_corridor_spines(
            connector_item,
            living,
            road_facing,
            item_groups[0],
            item_groups[1],
        )
        return [first_leg, second_leg], [interior_side, second_attach_side]

    segment_lengths: list[int] = []
    current_axis = axis
    for index, group in enumerate(item_groups[:3]):
        base_length = required_corridor_path_length(group, current_axis)
        if index == 0:
            base_length = max(base_length, living["width"] if axis == "x" else living["depth"])
        segment_lengths.append(base_length)
        current_axis = "y" if current_axis == "x" else "x"

    segments: list[dict[str, Any]] = []
    attach_sides: list[str] = []

    if axis == "y":
        sign_x = 1 if interior_side == "east" else -1

        first_length = segment_lengths[0] + thickness
        first_width = thickness
        first_depth = first_length
        first_x, first_y = position_on_side(
            living,
            {"width": first_width, "depth": first_depth},
            interior_side,
        )
        first_y = living["y"]
        first_leg = make_connector_leg(
            connector_item,
            connector_leg_id(connector_item, suffixes[0]),
            first_x,
            first_y,
            first_width,
            first_depth,
            "corridor_spine_path_segment_a",
        )
        segments.append(first_leg)
        attach_sides.append(interior_side)

        second_length = segment_lengths[1] + thickness
        second_width = second_length
        second_depth = thickness
        second_y = first_y + segment_lengths[0]
        second_x = first_x + thickness if sign_x > 0 else first_x - second_width
        second_leg = make_connector_leg(
            connector_item,
            connector_leg_id(connector_item, suffixes[1]),
            second_x,
            second_y,
            second_width,
            second_depth,
            "corridor_spine_path_segment_b",
        )
        segments.append(second_leg)
        attach_sides.append("south")

        third_length = segment_lengths[2]
        third_width = thickness
        third_depth = third_length
        third_x = second_x + segment_lengths[1] if sign_x > 0 else second_x
        third_y = second_y + thickness
        third_leg = make_connector_leg(
            connector_item,
            connector_leg_id(connector_item, suffixes[2]),
            third_x,
            third_y,
            third_width,
            third_depth,
            "corridor_spine_path_segment_c",
        )
        segments.append(third_leg)
        attach_sides.append("east" if sign_x > 0 else "west")

        return segments, attach_sides

    sign_y = 1 if interior_side == "south" else -1

    first_length = segment_lengths[0] + thickness
    first_width = first_length
    first_depth = thickness
    first_x, first_y = position_on_side(
        living,
        {"width": first_width, "depth": first_depth},
        interior_side,
    )
    first_x = living["x"]
    first_leg = make_connector_leg(
        connector_item,
        connector_leg_id(connector_item, suffixes[0]),
        first_x,
        first_y,
        first_width,
        first_depth,
        "corridor_spine_path_segment_a",
    )
    segments.append(first_leg)
    attach_sides.append(interior_side)

    second_length = segment_lengths[1] + thickness
    second_width = thickness
    second_depth = second_length
    second_x = first_x + segment_lengths[0]
    second_y = first_y + thickness if sign_y > 0 else first_y - second_depth
    second_leg = make_connector_leg(
        connector_item,
        connector_leg_id(connector_item, suffixes[1]),
        second_x,
        second_y,
        second_width,
        second_depth,
        "corridor_spine_path_segment_b",
    )
    segments.append(second_leg)
    attach_sides.append("east")

    third_length = segment_lengths[2]
    third_width = third_length
    third_depth = thickness
    third_x = second_x + thickness
    third_y = second_y + segment_lengths[1] if sign_y > 0 else second_y
    third_leg = make_connector_leg(
        connector_item,
        connector_leg_id(connector_item, suffixes[2]),
        third_x,
        third_y,
        third_width,
        third_depth,
        "corridor_spine_path_segment_c",
    )
    segments.append(third_leg)
    attach_sides.append("south" if sign_y > 0 else "north")

    return segments, attach_sides


def make_access_edge(from_id: str, to_id: str, edge_type: str) -> dict[str, str]:
    return {"from": from_id, "to": to_id, "type": edge_type}


def max_offset_on_spine(spine: dict[str, Any], block_def: dict[str, Any], side: str) -> int:
    if tangent_axis(side) == "x":
        return max(0, spine["width"] - block_def["width"])
    return max(0, spine["depth"] - block_def["depth"])


def spine_candidate_offsets(spine: dict[str, Any], block_def: dict[str, Any], side: str) -> list[int]:
    return list(range(0, max_offset_on_spine(spine, block_def, side) + 1))


def same_type_wall_contact_score(candidate: dict[str, Any], placed: list[dict[str, Any]]) -> int:
    return sum(
        1
        for existing in placed
        if existing["space_type"] == candidate["space_type"]
        and shares_wall(
            candidate["x"],
            candidate["y"],
            candidate["width"],
            candidate["depth"],
            existing["x"],
            existing["y"],
            existing["width"],
            existing["depth"],
        )
    )


def bedroom_wall_contact_score(candidate: dict[str, Any], placed: list[dict[str, Any]]) -> int:
    return sum(
        1
        for existing in placed
        if "bedroom" in existing["space_type"]
        and shares_wall(
            candidate["x"],
            candidate["y"],
            candidate["width"],
            candidate["depth"],
            existing["x"],
            existing["y"],
            existing["width"],
            existing["depth"],
        )
    )


def is_service_cluster_item(block_type: str, block_def: dict[str, Any]) -> bool:
    return (
        block_type in {"bathroom", "vertical_core"}
        or block_def.get("family") in {"wet_core", "vertical_core"}
    )


def terminal_sides_for_spine(spine: dict[str, Any]) -> list[str]:
    if spine["depth"] >= spine["width"]:
        return ["south", "north"]
    return ["east", "west"]


def terminal_core_offsets(spine: dict[str, Any], block_def: dict[str, Any], side: str) -> list[int]:
    centered = centered_anchor_offset(spine, block_def, side)
    offsets = [centered]
    for delta in range(1, 3):
        offsets.extend([centered + delta, centered - delta])
    return offsets


def choose_terminal_core_placement(
    spine: dict[str, Any],
    idx: int,
    block_type: str,
    block_def: dict[str, Any],
    placed: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, int] | None:
    if block_type != "vertical_core":
        return None

    best: tuple[float, dict[str, Any], str, int] | None = None
    for side in terminal_sides_for_spine(spine):
        for rotation in rotation_options(block_def):
            variant = block_variant(block_def, rotation)
            for offset in terminal_core_offsets(spine, variant, side):
                x, y = position_on_side(spine, variant, side, offset)
                if placement_overlaps_existing(x, y, variant["width"], variant["depth"], placed):
                    continue

                score = -footprint_penalty(x, y, variant["width"], variant["depth"], placed)
                score -= abs(offset - centered_anchor_offset(spine, variant, side)) * 2
                candidate = make_placement(idx, block_type, block_def, x, y, rotation=rotation)
                run_length = candidate["width"] if tangent_axis(side) == "x" else candidate["depth"]
                next_offset = max(0, offset) + run_length
                if best is None or score > best[0]:
                    best = (score, candidate, side, next_offset)

    if best is None:
        return None

    return best[1], best[2], best[3]


def spine_candidate_score(
    candidate: dict[str, Any],
    block_def: dict[str, Any],
    side: str,
    primary_side: str,
    offset: int,
    target_offset: int,
    placed: list[dict[str, Any]],
    side_usage: dict[str, int],
    last_type_by_side: dict[str, str | None],
    service_cluster_side: str | None,
    road_facing: str = "south",
) -> float:
    attach_axis = tangent_axis(side)
    run_length = candidate["width"] if attach_axis == "x" else candidate["depth"]
    service_item = is_service_cluster_item(candidate["space_type"], block_def)

    score = 0.0

    road_facing_side = side == road_facing

    # --- Offset scoring (axis-aware orientation preference) ---
    pref_south_ns = (
        block_def.get("preferred_orientation") == "south"
        and attach_axis == "y"
        and not road_facing_side
    )
    # North-preferring rooms on N-S spines (e.g. workspace): push toward the
    # north end so the north face is exterior (adjacent to public zone or boundary).
    pref_north_ns = (
        block_def.get("preferred_orientation") == "north"
        and attach_axis == "y"
        and not road_facing_side
    )

    if pref_south_ns:
        # Penalise going north of target; bonus for each unit further south.
        score -= max(0, target_offset - offset) * 0.9
        score += offset * 0.15
    elif pref_north_ns:
        # Penalise going south of target; bonus for each unit further north.
        score -= max(0, offset - target_offset) * 0.9
        score -= offset * 0.15   # smaller y → more northerly → better
    else:
        score -= abs(offset - target_offset) * 1.2
        score -= max(0, offset - target_offset) * 0.35

    score -= run_length * 0.8
    score += 0.8 if side == primary_side else 4.0
    # Strongly penalise rooms placed on the road-facing side of the spine — they
    # would end up between the entrance and the corridor, facing the road.
    if road_facing_side:
        score -= 60
    score -= side_usage.get(side, 0) * 0.15
    if (
        not service_item
        and side != primary_side
        and not road_facing_side  # suppress balance bonus on the road side
        and side_usage.get(primary_side, 0) > side_usage.get(side, 0)
    ):
        score += 18

    # Bonus when a south-preferring room (on a N-S spine) would have its south
    # face exposed at the time of placement.  This steers the scoring away from
    # positions that are immediately blocked by already-placed rooms.
    if pref_south_ns:
        south_y = candidate["y"] + candidate["depth"]

        def _x_overlaps(ax: int, aw: int, bx: int, bw: int) -> bool:
            return max(ax, bx) < min(ax + aw, bx + bw)

        # A 1-unit gap between rooms is routinely closed by optimize_wall_jogs,
        # so treat y == south_y OR y == south_y + 1 as "effectively blocked".
        south_clear = not any(
            p["y"] in (south_y, south_y + 1)
            and _x_overlaps(
                candidate["x"], candidate["width"], p["x"], p["width"]
            )
            for p in placed
        )
        if south_clear:
            score += 8
        else:
            # Penalise placement where the south face is already blocked (or will
            # be blocked once wall-jog optimisation closes the 1-unit gap) — this
            # pushes the scoring toward the opposite (road-facing) side when the
            # private lane is full.
            score -= 5

    # Penalise a candidate that would directly block any already-placed south-preferring
    # room's south face.  Applies to bedrooms, living_rooms, and any other room whose
    # preferred_orientation is "south".  Prevents stacking and keeps south exposure intact.
    # Check exact adjacency AND 1-unit gap (closed by wall-jog optimisation).
    candidate_south = candidate["y"] + candidate["depth"]
    for existing in placed:
        if existing.get("preferred_orientation") != "south":
            continue
        # Case A: candidate placed immediately south of an existing south-preferring room
        # (candidate blocks existing room's south face)
        if existing["y"] + existing["depth"] in (
            candidate["y"],
            candidate["y"] - 1,
        ) and max(existing["x"], candidate["x"]) < min(
            existing["x"] + existing["width"],
            candidate["x"] + candidate["width"],
        ):
            score -= 20
        # Case B: existing bedroom immediately south of candidate
        # (existing room will block this candidate's south face)
        # Only apply when the candidate is also a bedroom — bathroom/workspace
        # placed adjacent to a bedroom's south is normal and should not be penalised.
        if (
            "bedroom" in candidate.get("space_type", "")
            and existing["y"] in (
                candidate_south,
                candidate_south + 1,
            )
            and max(existing["x"], candidate["x"]) < min(
                existing["x"] + existing["width"],
                candidate["x"] + candidate["width"],
            )
        ):
            score -= 20

    score -= same_type_wall_contact_score(candidate, placed) * 0.5
    if last_type_by_side.get(side) == candidate["space_type"]:
        score -= 2 if service_item else 10

    if service_item and service_cluster_side is not None:
        score += 24 if side == service_cluster_side else -18

    if candidate["space_type"] == "bathroom":
        score += bedroom_wall_contact_score(candidate, placed) * 8

    if candidate.get("rotation", 0) % 180 == 90:
        base_run_length = block_def["width"] if attach_axis == "x" else block_def["depth"]
        if run_length < base_run_length:
            score += 8

    return score


def choose_spine_room_placement(
    spine: dict[str, Any],
    idx: int,
    block_type: str,
    block_def: dict[str, Any],
    primary_side: str,
    placed: list[dict[str, Any]],
    side_usage: dict[str, int],
    last_type_by_side: dict[str, str | None],
    service_cluster_side: str | None = None,
    road_facing: str = "south",
) -> tuple[dict[str, Any], str, int]:
    terminal_core = choose_terminal_core_placement(
        spine,
        idx,
        block_type,
        block_def,
        placed,
    )
    if terminal_core is not None:
        return terminal_core

    side_options = [primary_side, opposite_side(primary_side)]
    best: tuple[float, dict[str, Any], str, int] | None = None

    for side in side_options:
        for rotation in rotation_options(block_def):
            variant = block_variant(block_def, rotation)
            offsets = spine_candidate_offsets(spine, variant, side)
            lane_cursor = side_usage.get(side, 0)
            lane_start = next(
                (
                    candidate_offset
                    for candidate_offset in offsets
                    if candidate_offset >= lane_cursor
                    and not placement_overlaps_existing(
                        *position_on_side(spine, variant, side, candidate_offset),
                        variant["width"],
                        variant["depth"],
                        placed,
                    )
                ),
                lane_cursor,
            )
            target_offset = max(lane_cursor, lane_start)
            for offset in offsets:
                x, y = position_on_side(spine, variant, side, offset)
                if placement_overlaps_existing(
                    x,
                    y,
                    variant["width"],
                    variant["depth"],
                    placed,
                ):
                    continue

                candidate = make_placement(idx, block_type, block_def, x, y, rotation=rotation)
                if placement_overlaps_existing(
                    candidate["x"],
                    candidate["y"],
                    candidate["width"],
                    candidate["depth"],
                    placed,
                ):
                    continue
                score = spine_candidate_score(
                    candidate,
                    block_def,
                    side,
                    primary_side,
                    offset,
                    target_offset,
                    placed,
                    side_usage,
                    last_type_by_side,
                    service_cluster_side,
                    road_facing=road_facing,
                )
                run_length = candidate["width"] if tangent_axis(side) == "x" else candidate["depth"]
                next_offset = offset + run_length
                if best is None or score > best[0]:
                    best = (score, candidate, side, next_offset)

    if best is not None:
        return best[1], best[2], best[3]

    fallback_def = block_variant(block_def, 0)
    fallback_offset = max_offset_on_spine(spine, fallback_def, primary_side)
    x, y = position_on_side(spine, fallback_def, primary_side, fallback_offset)
    fallback = make_placement(idx, block_type, block_def, x, y)
    run_length = fallback["width"] if tangent_axis(primary_side) == "x" else fallback["depth"]
    return fallback, primary_side, fallback_offset + run_length


def attach_rooms_to_spine(
    spine: dict[str, Any],
    attach_items: list[tuple[int, str, dict[str, Any]]],
    road_facing: str,
    attach_side: str | None = None,
    existing_placements: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    side = attach_side or opposite_side(road_facing)
    placements: list[dict[str, Any]] = []
    access_edges: list[dict[str, str]] = []
    occupied = list(existing_placements or [])
    side_usage: dict[str, int] = {
        side: 0,
        opposite_side(side): 0,
    }
    last_type_by_side: dict[str, str | None] = {
        side: None,
        opposite_side(side): None,
    }
    service_cluster_side: str | None = None

    for idx, block_type, block_def in attach_items:
        placement, chosen_side, next_offset = choose_spine_room_placement(
            spine,
            idx,
            block_type,
            block_def,
            side,
            occupied + placements,
            side_usage,
            last_type_by_side,
            service_cluster_side,
            road_facing=road_facing,
        )
        placements.append(placement)
        edge_type = "wide_opening" if block_type == "vertical_core" else "door"
        access_edges.append(make_access_edge(spine["id"], placement["id"], edge_type))
        side_usage[chosen_side] = max(side_usage.get(chosen_side, 0), next_offset)
        last_type_by_side[chosen_side] = block_type
        if service_cluster_side is None and is_service_cluster_item(block_type, block_def):
            service_cluster_side = chosen_side

    return placements, access_edges


def normalize_access_edges(
    access_edges: list[dict[str, str]],
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for edge in access_edges:
        key = (edge["from"], edge["to"], edge["type"])
        reverse_key = (edge["to"], edge["from"], edge["type"])
        if key in seen or reverse_key in seen:
            continue
        seen.add(key)
        normalized.append(edge)
    return normalized


def occupied_grid_cells(placements: list[dict[str, Any]]) -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for placement in placements:
        for x in range(int(placement["x"]), int(placement["x"] + placement["width"])):
            for y in range(int(placement["y"]), int(placement["y"] + placement["depth"])):
                cells.add((x, y))
    return cells


def layout_outer_perimeter(placements: list[dict[str, Any]]) -> int:
    cells = occupied_grid_cells(placements)
    perimeter = 0
    for x, y in cells:
        for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if neighbor not in cells:
                perimeter += 1
    return perimeter


def layout_bounding_area(placements: list[dict[str, Any]]) -> int:
    if not placements:
        return 0
    min_x = min(int(p["x"]) for p in placements)
    min_y = min(int(p["y"]) for p in placements)
    max_x = max(int(p["x"] + p["width"]) for p in placements)
    max_y = max(int(p["y"] + p["depth"]) for p in placements)
    return (max_x - min_x) * (max_y - min_y)


def placement_by_id(placements: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in placements}


def access_anchor_ids(
    placement_id: str,
    access_edges: list[dict[str, str]],
) -> set[str]:
    anchors: set[str] = set()
    for edge in access_edges:
        if edge["from"] == placement_id:
            anchors.add(edge["to"])
        elif edge["to"] == placement_id:
            anchors.add(edge["from"])
    return anchors


def can_slide_for_wall_optimization(placement: dict[str, Any]) -> bool:
    role = str(placement.get("role", ""))
    if placement["space_type"] in {"entrance", "living_room", "connector"}:
        return False
    if role.startswith("corridor_spine"):
        return False
    return True


def preserves_access_adjacency(
    candidate: dict[str, Any],
    anchor_ids: set[str],
    by_id: dict[str, dict[str, Any]],
) -> bool:
    for anchor_id in anchor_ids:
        anchor = by_id.get(anchor_id)
        if anchor is None:
            continue
        if not shares_wall(
            candidate["x"],
            candidate["y"],
            candidate["width"],
            candidate["depth"],
            anchor["x"],
            anchor["y"],
            anchor["width"],
            anchor["depth"],
        ):
            return False
    return True


def wall_optimization_score(placements: list[dict[str, Any]]) -> tuple[int, int]:
    return (layout_outer_perimeter(placements), layout_bounding_area(placements))


def optimize_wall_jogs_by_sliding(
    placements: list[dict[str, Any]],
    access_edges: list[dict[str, str]],
    max_passes: int = 4,
    max_shift: int = 2,
) -> list[dict[str, Any]]:
    optimized = [dict(p) for p in placements]
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]

    for _ in range(max_passes):
        changed = False
        for placement in list(optimized):
            if not can_slide_for_wall_optimization(placement):
                continue

            current_index = next(
                i for i, p in enumerate(optimized) if p["id"] == placement["id"]
            )
            current = optimized[current_index]
            anchor_ids = access_anchor_ids(current["id"], access_edges)
            others = [p for p in optimized if p["id"] != current["id"]]
            by_id = placement_by_id(others)
            best_score = wall_optimization_score(optimized)
            best_candidate: dict[str, Any] | None = None

            for step in range(1, max_shift + 1):
                for dx, dy in directions:
                    candidate = dict(current)
                    candidate["x"] = current["x"] + dx * step
                    candidate["y"] = current["y"] + dy * step
                    if placement_overlaps_existing(
                        candidate["x"],
                        candidate["y"],
                        candidate["width"],
                        candidate["depth"],
                        others,
                    ):
                        continue
                    if not preserves_access_adjacency(candidate, anchor_ids, by_id):
                        continue

                    candidate_layout = list(others)
                    candidate_layout.insert(current_index, candidate)
                    candidate_score = wall_optimization_score(candidate_layout)
                    if candidate_score < best_score:
                        best_score = candidate_score
                        best_candidate = candidate

            if best_candidate is not None:
                optimized[current_index] = best_candidate
                changed = True

        if not changed:
            break

    return optimized


def frontage_center(placements: list[dict[str, Any]], side: str) -> float:
    if tangent_axis(side) == "x":
        return (
            min(p["x"] for p in placements)
            + max(p["x"] + p["width"] for p in placements)
        ) / 2
    return (
        min(p["y"] for p in placements)
        + max(p["y"] + p["depth"] for p in placements)
    ) / 2


def is_entry_frontage_anchor(placement: dict[str, Any]) -> bool:
    return (
        placement["space_type"] in {"living_room", "connector", "kitchen"}
        or placement.get("zone") == "public"
        or str(placement.get("role", "")).startswith("corridor_spine")
    )


def entry_anchor_score(anchor: dict[str, Any]) -> float:
    if anchor["space_type"] == "living_room":
        return 20
    if str(anchor.get("role", "")).startswith("corridor_spine"):
        return 18
    if anchor["space_type"] == "connector":
        return 16
    if anchor["space_type"] == "kitchen":
        return -10
    return 0


def entry_candidate_public_contacts(
    x: int,
    y: int,
    width: int,
    depth: int,
    placements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        p for p in placements
        if is_entry_frontage_anchor(p)
        and shares_wall(
            x,
            y,
            width,
            depth,
            p["x"],
            p["y"],
            p["width"],
            p["depth"],
        )
    ]


def best_entry_access_anchor(
    contacts: list[dict[str, Any]],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    if not contacts:
        return fallback
    return max(contacts, key=entry_anchor_score)


def reposition_entrance_on_frontage(
    placements: list[dict[str, Any]],
    access_edges: list[dict[str, str]],
    road_facing: str,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    entrance = next((p for p in placements if p["space_type"] == "entrance"), None)
    if entrance is None:
        return placements, access_edges

    other_placements = [p for p in placements if p["id"] != entrance["id"]]
    if not other_placements:
        return placements, access_edges

    entrance_def = {
        "width": entrance["width"],
        "depth": entrance["depth"],
    }
    target_center = frontage_center(other_placements, road_facing)
    all_candidates: list[tuple[float, dict[str, Any], dict[str, Any], bool]] = []

    def _score_candidate(x: int, y: int, anchor: dict[str, Any], facade_flush_bonus: float = 0) -> None:
        if placement_overlaps_existing(x, y, entrance["width"], entrance["depth"], other_placements):
            return
        cand = dict(entrance)
        cand["x"] = x
        cand["y"] = y
        if tangent_axis(road_facing) == "x":
            cc = x + cand["width"] / 2
        else:
            cc = y + cand["depth"] / 2
        contacts = entry_candidate_public_contacts(x, y, entrance["width"], entrance["depth"], other_placements)
        aa = best_entry_access_anchor(contacts, anchor)
        s = -abs(cc - target_center) * 5
        s -= footprint_penalty(x, y, entrance["width"], entrance["depth"], other_placements) * 0.08
        s += entry_anchor_score(aa)
        lr_touch = any(p["space_type"] == "living_room" for p in contacts)
        kitchen_touch = any(p["space_type"] == "kitchen" for p in contacts)
        if lr_touch:
            s += 28
        if kitchen_touch:
            # Entrance adjacent to kitchen is architecturally correct —
            # creates the natural Entrance → Kitchen → Living flow.
            s += 22
        if any(str(p.get("role", "")).startswith("corridor_spine") for p in contacts):
            s += 22
        # Prefer positions flush with anchor tangent edges — reduces side jogs
        if tangent_axis(road_facing) == "y":
            ent_d = entrance["depth"]
            if abs(y - anchor["y"]) < 0.5:
                s += 30
            if abs((y + ent_d) - (anchor["y"] + anchor["depth"])) < 0.5:
                s += 30
        else:
            ent_w = entrance["width"]
            if abs(x - anchor["x"]) < 0.5:
                s += 30
            if abs((x + ent_w) - (anchor["x"] + anchor["width"])) < 0.5:
                s += 30
        s += facade_flush_bonus
        # Penalise entrance positions that block living_room's preferred orientation face
        lr_block_ref = next((p for p in other_placements if p["space_type"] == "living_room"), None)
        if lr_block_ref:
            lr_orient = lr_block_ref.get("preferred_orientation", "any")
            if lr_orient != "any":
                cand_as_list = [{"x": x, "y": y, "width": entrance["width"], "depth": entrance["depth"], "id": "_ent_tmp", "space_type": "entrance"}]
                if edge_blocked_by_placed(lr_block_ref["x"], lr_block_ref["y"],
                                           lr_block_ref["width"], lr_block_ref["depth"],
                                           lr_orient, cand_as_list):
                    s -= 80
        all_candidates.append((s, cand, aa, lr_touch))

    anchors = [p for p in other_placements if is_entry_frontage_anchor(p)]
    for anchor in anchors:
        for offset in candidate_offsets(anchor, entrance_def, road_facing):
            x, y = position_on_side(anchor, entrance_def, road_facing, offset=offset)
            _score_candidate(x, y, anchor)

    # Facade-flush candidates: entrance aligned with living_room's road face.
    lr_block = next((p for p in other_placements if p["space_type"] == "living_room"), None)
    if lr_block:
        ew, ed = entrance["width"], entrance["depth"]
        lw, ld = lr_block["width"], lr_block["depth"]
        lx, ly = lr_block["x"], lr_block["y"]
        if road_facing == "north":
            lr_is_frontage = ly <= min(p["y"] for p in other_placements) + 1
            if lr_is_frontage:
                for x, y in [(lx + lw, ly), (lx - ew, ly)]:
                    _score_candidate(x, y, lr_block, facade_flush_bonus=60)
        elif road_facing == "south":
            fy = ly + ld - ed
            for x, y in [(lx + lw, fy), (lx - ew, fy)]:
                _score_candidate(x, y, lr_block, facade_flush_bonus=60)
        elif road_facing == "east":
            fx = lx + lw - ew
            for x, y in [(fx, ly + ld), (fx, ly - ed)]:
                _score_candidate(x, y, lr_block, facade_flush_bonus=60)
        else:  # west
            for x, y in [(lx, ly + ld), (lx, ly - ed)]:
                _score_candidate(x, y, lr_block, facade_flush_bonus=60)

    # Also generate kitchen-flush candidates: entrance aligned with kitchen's road face.
    # This supports the Entrance → Kitchen → Living flow preferred in Korean floor plans.
    k_block = next((p for p in other_placements if p["space_type"] == "kitchen"), None)
    if k_block:
        ew, ed = entrance["width"], entrance["depth"]
        kw, kd = k_block["width"], k_block["depth"]
        kx, ky = k_block["x"], k_block["y"]
        if road_facing == "south":
            # entrance immediately south of kitchen (flush with kitchen south face)
            fy = ky + kd
            for x in [kx, kx + kw - ew, kx + (kw - ew) // 2]:
                _score_candidate(x, fy, k_block, facade_flush_bonus=50)
        elif road_facing == "north":
            fy = ky - ed
            for x in [kx, kx + kw - ew, kx + (kw - ew) // 2]:
                _score_candidate(x, fy, k_block, facade_flush_bonus=50)
        elif road_facing == "east":
            fx = kx + kw
            for y in [ky, ky + kd - ed, ky + (kd - ed) // 2]:
                _score_candidate(fx, y, k_block, facade_flush_bonus=50)
        elif road_facing == "west":
            fx = kx - ew
            for y in [ky, ky + kd - ed, ky + (kd - ed) // 2]:
                _score_candidate(fx, y, k_block, facade_flush_bonus=50)

    # Frontage-lateral candidates: entrance placed immediately beside any room whose
    # road-facing edge sits on the building frontage, at the natural entrance y/x
    # level (touching the corridor).  Handles cases where a private room such as
    # workspace occupies the road-facing face and the entrance should sit adjacent
    # to it rather than at the far edge of the building.
    ew, ed = entrance["width"], entrance["depth"]
    # Find the corridor/spine for determining entrance y level
    spine_block = next(
        (p for p in other_placements if str(p.get("role", "")).startswith("corridor_spine")),
        None,
    )
    if road_facing == "north":
        min_front_y = min(p["y"] for p in other_placements)
        ent_y = (spine_block["y"] - ed) if spine_block else min_front_y
        for fr in other_placements:
            if fr["y"] > min_front_y + 1:
                continue
            for cx in [fr["x"] - ew, fr["x"] + fr["width"]]:
                _score_candidate(cx, ent_y, fr, facade_flush_bonus=40)
    elif road_facing == "south":
        max_front_y = max(p["y"] + p["depth"] for p in other_placements)
        ent_y = (spine_block["y"] + spine_block["depth"]) if spine_block else (max_front_y - ed)
        for fr in other_placements:
            if fr["y"] + fr["depth"] < max_front_y - 1:
                continue
            for cx in [fr["x"] - ew, fr["x"] + fr["width"]]:
                _score_candidate(cx, ent_y, fr, facade_flush_bonus=40)
    elif road_facing == "east":
        max_front_x = max(p["x"] + p["width"] for p in other_placements)
        ent_x = (spine_block["x"] + spine_block["width"]) if spine_block else (max_front_x - ew)
        for fr in other_placements:
            if fr["x"] + fr["width"] < max_front_x - 1:
                continue
            for cy in [fr["y"] - ed, fr["y"] + fr["depth"]]:
                _score_candidate(ent_x, cy, fr, facade_flush_bonus=40)
    elif road_facing == "west":
        min_front_x = min(p["x"] for p in other_placements)
        ent_x = (spine_block["x"] - ew) if spine_block else min_front_x
        for fr in other_placements:
            if fr["x"] > min_front_x + 1:
                continue
            for cy in [fr["y"] - ed, fr["y"] + fr["depth"]]:
                _score_candidate(ent_x, cy, fr, facade_flush_bonus=40)

    if not all_candidates:
        return placements, access_edges

    # Prefer candidates that touch living_room or kitchen (valid public-zone entries).
    public_touch = [(s, c, a) for s, c, a, lr in all_candidates if lr]
    # Also include kitchen-touching if living-room-touching candidates are scarce
    if len(public_touch) < 3:
        kitchen_touch_cands = [
            (s, c, a) for s, c, a, _lr in all_candidates
            if any(p["space_type"] == "kitchen"
                   for p in entry_candidate_public_contacts(
                       c["x"], c["y"], c["width"], c["depth"], other_placements))
        ]
        public_touch = list({id(c): (s, c, a) for s, c, a in public_touch + kitchen_touch_cands}.values())
    pool = public_touch if public_touch else [(s, c, a) for s, c, a, _ in all_candidates]
    best = max(pool, key=lambda t: t[0])

    if best is None:
        return placements, access_edges

    _, repositioned_entrance, anchor = best
    repositioned = [
        repositioned_entrance if p["id"] == entrance["id"] else p
        for p in placements
    ]
    next_access_edges = [
        edge for edge in access_edges
        if entrance["id"] not in {edge["from"], edge["to"]}
    ]
    next_access_edges.append(
        make_access_edge(repositioned_entrance["id"], anchor["id"], "wide_opening")
    )
    return repositioned, next_access_edges


def generate_linear_corridor_layout(
    instances: list[tuple[int, str, dict[str, Any]]],
    entrance: tuple[int, str, dict[str, Any]],
    road_facing: str,
) -> dict[str, Any]:
    entrance_idx, entrance_type, entrance_def = entrance
    placed = [make_placement(entrance_idx, entrance_type, entrance_def, 0, 0)]
    access_edges: list[dict[str, str]] = []

    remaining = [item for item in instances if item is not entrance and item[1] != "entrance"]
    connector_item = next((item for item in remaining if is_connector_like(item[1], item[2])), None)
    if connector_item is not None:
        remaining.remove(connector_item)

    living_item = next((item for item in remaining if is_living_like(item[1], item[2])), None)
    if living_item is not None:
        remaining.remove(living_item)
        idx, block_type, block_def = living_item
        living_side = opposite_side(road_facing)
        # For rf=north: leave CORRIDOR_THICKNESS space between entrance and living
        # so the corridor can be inserted there later (north of living).
        if road_facing == "north" and block_def.get("preferred_orientation") == "south":
            padded_entrance = {**placed[0], "depth": placed[0]["depth"] + CORRIDOR_THICKNESS}
            living = place_near_anchor(placed, idx, block_type, block_def, padded_entrance, living_side)
        else:
            living = place_near_anchor(placed, idx, block_type, block_def, placed[0], living_side)
        placed.append(living)
        access_edges.append(make_access_edge(placed[0]["id"], living["id"], "wide_opening"))
    else:
        living = placed[0]

    kitchen_item = next((item for item in remaining if item[1] == "kitchen"), None)
    if kitchen_item is not None:
        remaining.remove(kitchen_item)
        idx, block_type, block_def = kitchen_item
        kitchen_side = kitchen_lateral_side(road_facing, living)
        # Bias kitchen toward the road-facing end of the living room so it ends
        # up adjacent to the entrance (Entrance → Kitchen → Living flow).
        k_pref_offset = kitchen_road_end_offset(living, block_def, kitchen_side, road_facing)
        kitchen = place_near_anchor(
            placed, idx, block_type, block_def, living, kitchen_side,
            preferred_offset=k_pref_offset,
        )
        placed.append(kitchen)
        access_edges.append(make_access_edge(living["id"], kitchen["id"], "open"))

    attach_items = sorted(
        [
            item for item in remaining
            if item[2].get("zone") in {"private", "semi_private"}
            or item[1] in {"bathroom", "workspace", "vertical_core"}
        ],
        key=lambda item: sort_spine_rooms(item, road_facing=road_facing),
    )
    for item in attach_items:
        remaining.remove(item)

    layout_type = "linear_corridor_spine_v1"
    if should_use_l_shaped_spine(attach_items, road_facing):
        item_groups = split_corridor_path_items(attach_items)
        path_segments, attach_sides = make_corridor_path_segments(
            connector_item,
            living,
            road_facing,
            item_groups,
        )
        placed.extend(path_segments)
        access_edges.append(make_access_edge(living["id"], path_segments[0]["id"], "wide_opening"))
        for previous_segment, next_segment in zip(path_segments, path_segments[1:]):
            access_edges.append(make_access_edge(previous_segment["id"], next_segment["id"], "wide_opening"))

        path_rooms: list[dict[str, Any]] = []
        for segment, group, segment_attach_side in zip(path_segments, item_groups, attach_sides):
            segment_rooms, segment_edges = attach_rooms_to_spine(
                segment,
                group,
                road_facing,
                attach_side=segment_attach_side,
                existing_placements=placed + path_rooms,
            )
            path_rooms.extend(segment_rooms)
            access_edges.extend(segment_edges)

        placed.extend(path_rooms)
        layout_type = (
            "corridor_path_spine_v1"
            if len(path_segments) >= 3
            else "l_shaped_corridor_spine_v1"
        )
    else:
        spine = make_corridor_spine(connector_item, living, road_facing, attach_items)
        placed.append(spine)
        access_edges.append(make_access_edge(living["id"], spine["id"], "wide_opening"))

        spine_rooms, spine_edges = attach_rooms_to_spine(
            spine,
            attach_items,
            road_facing,
            existing_placements=placed,
        )
        placed.extend(spine_rooms)
        access_edges.extend(spine_edges)

    for idx, block_type, block_def in remaining:
        placement = place_near_anchor(placed, idx, block_type, block_def, living, "east")
        placed.append(placement)
        access_edges.append(make_access_edge(living["id"], placement["id"], "wide_opening"))

    placed = optimize_wall_jogs_by_sliding(placed, access_edges)
    placed = normalize_layout_origin(placed)
    placed, access_edges = reposition_entrance_on_frontage(placed, access_edges, road_facing)
    placed = normalize_layout_origin(placed)

    return {
        "placements": placed,
        "meta": {
            "layout_type": layout_type,
            "road_facing": road_facing,
            "access_edges": normalize_access_edges(access_edges),
        },
    }


def generate_zoned_layout_from_rules(rules: dict[str, Any]) -> dict[str, Any]:
    required_blocks: list[str] = rules["required_blocks"]
    road_facing: str = rules.get("road_facing", "south")
    adjacency_preferences: list[dict[str, Any]] = rules.get("adjacency_preferences", [])

    instances: list[tuple[int, str, dict[str, Any]]] = [
        (idx, block_type, load_block_definition(block_type))
        for idx, block_type in enumerate(required_blocks)
    ]

    entrance = next((item for item in instances if item[1] == "entrance"), None)
    if entrance is None:
        entrance_def = load_block_definition("entrance")
        entrance = (-1, "entrance", entrance_def)

    if needs_corridor_spine(instances):
        return generate_linear_corridor_layout(instances, entrance, road_facing)

    remaining = [item for item in instances if item is not entrance and item[1] != "entrance"]

    placed: list[dict[str, Any]] = []
    access_edges: list[dict[str, str]] = []
    entrance_idx, entrance_type, entrance_def = entrance
    placed.append(make_placement(entrance_idx, entrance_type, entrance_def, 0, 0))

    first_candidates = [
        item for item in remaining
        if can_follow_entrance(item[1], item[2])
    ]
    if first_candidates:
        first_candidates.sort(
            key=lambda item: (
                0 if is_connector_like(item[1], item[2]) else 1,
                0 if is_living_like(item[1], item[2]) else 1,
                item[0],
            )
        )
        first_item = first_candidates[0]
        _, first_placement, first_anchor = select_best_flow_candidate(
            placed,
            [first_item],
            road_facing,
            adjacency_preferences,
        )
        placed.append(first_placement)
        access_edges.append(
            make_access_edge(
                first_anchor["id"],
                first_placement["id"],
                flow_access_type(first_anchor, first_placement),
            )
        )
        remaining.remove(first_item)

    while remaining:
        stage_items = next_flow_stage_items(placed, remaining)
        item, placement, anchor = select_best_flow_candidate(
            placed,
            stage_items,
            road_facing,
            adjacency_preferences,
        )
        placed.append(placement)
        access_edges.append(
            make_access_edge(
                anchor["id"],
                placement["id"],
                flow_access_type(anchor, placement),
            )
        )
        remaining.remove(item)

    placed = normalize_layout_origin(placed)

    return {
        "placements": placed,
        "meta": {
            "layout_type": "flow_2d_v1",
            "road_facing": road_facing,
            "access_edges": normalize_access_edges(access_edges),
        },
    }


def generate_layout_from_rules(rules: dict[str, Any]) -> dict[str, Any]:
    return generate_zoned_layout_from_rules(rules)
