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

    # 1. 인접 adjacency 점수 합산
    for p in placed:
        if shares_wall(x, y, w, d, p["x"], p["y"], p["width"], p["depth"]):
            score += get_adjacency_score(
                block_type, p["space_type"], adjacency_preferences
            )

    # 2. zone 선호 위치 (도로 방향 기준)
    #    public = 도로쪽, private = 안쪽
    zone = block_def.get("zone", "private")
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


def generate_layout_from_rules(rules: dict[str, Any]) -> dict[str, Any]:
    required_blocks: list[str] = rules["required_blocks"]
    adjacency_preferences: list[dict[str, Any]] = rules.get("adjacency_preferences", [])
    road_facing: str = rules.get("road_facing", "south")

    # 블록 정의 로드
    block_defs: dict[str, dict[str, Any]] = {}
    for bt in set(required_blocks):
        block_defs[bt] = load_block_definition(bt)

    # 배치 우선순위 정렬: fixed_core → plumbing → zone 순
    indexed = list(enumerate(required_blocks))
    indexed.sort(key=lambda item: placement_priority(item[1], block_defs[item[1]]))

    placed: list[dict[str, Any]] = []

    for original_idx, block_type in indexed:
        bd = block_defs[block_type]
        w, d = bd["width"], bd["depth"]
        uid = f"{block_type}_{original_idx}"

        candidates = get_candidate_positions(placed, w, d)

        if not candidates:
            # fallback: 현재 footprint 오른쪽 끝에 붙임
            max_x = max((p["x"] + p["width"] for p in placed), default=0)
            candidates = [(max_x, 0)]

        best_x, best_y = max(
            candidates,
            key=lambda pos: score_position(
                pos[0], pos[1], w, d,
                block_type, bd, placed, adjacency_preferences, road_facing
            )
        )

        placed.append({
            "id": uid,
            "space_type": block_type,
            "family": bd.get("family", "unknown"),
            "fixed_core": bd.get("fixed_core", False),
            "x": best_x,
            "y": best_y,
            "width": w,
            "depth": d,
            "height": d,
            "zone": bd.get("zone", "private"),
            "plumbing_required": bd.get("plumbing_required", False),
            "preferred_orientation": bd.get("preferred_orientation", "any"),
            "natural_light": bd.get("natural_light", "none"),
            "acoustic_insulation": bd.get("acoustic_insulation", "low"),
        })

    return {
        "placements": placed,
        "meta": {
            "layout_type": "greedy_2d_v1",
            "road_facing": road_facing,
        },
    }