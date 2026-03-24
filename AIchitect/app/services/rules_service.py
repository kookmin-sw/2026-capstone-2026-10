from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]

CONCEPTS_PATH = BASE_DIR / "data" / "ontology" / "concepts.json"
RELATIONS_PATH = BASE_DIR / "data" / "ontology" / "relations.json"
CONSTRAINTS_PATH = BASE_DIR / "data" / "ontology" / "constraints.json"


def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_concepts() -> dict[str, Any]:
    return load_json(CONCEPTS_PATH)


def load_relations() -> dict[str, Any]:
    return load_json(RELATIONS_PATH)


def load_constraints() -> dict[str, Any]:
    return load_json(CONSTRAINTS_PATH)


def get_zone_priority(space_name: str, concepts: dict[str, Any]) -> int:
    """
    배치 우선순위:
    entrance(0) -> public(1) -> semi_private(2) -> private(3)
    """
    if space_name == "entrance":
        return 0

    zone = concepts.get(space_name, {}).get("zone", "private")
    order = {
        "public": 1,
        "semi_private": 2,
        "private": 3
    }
    return order.get(zone, 3)


def build_required_blocks(spaces: dict[str, int], concepts: dict[str, Any]) -> list[str]:
    """
    entrance를 맨 앞에 두고,
    public -> semi_private -> private 순으로 정렬
    """
    ordered_space_names = sorted(spaces.keys(), key=lambda x: get_zone_priority(x, concepts))

    blocks: list[str] = ["entrance"]
    for space_name in ordered_space_names:
        count = spaces[space_name]
        for _ in range(count):
            blocks.append(space_name)

    return blocks


def find_adjacency_score(from_space: str, to_space: str, relations: dict[str, Any]) -> int:
    for item in relations.get("adjacency_preferences", []):
        if item["from"] == from_space and item["to"] == to_space:
            return item["score"]
        if item["from"] == to_space and item["to"] == from_space:
            return item["score"]
    return 5


def find_separation_score(space_name: str, target_zone: str, relations: dict[str, Any]) -> int:
    for item in relations.get("separation_preferences", []):
        if item["from"] == space_name and item["to"] == target_zone:
            return item["score"]
    return 4


def add_unique_adjacency(
    adjacency_preferences: list[dict[str, Any]],
    from_space: str,
    to_space: str,
    score: int
) -> None:
    for item in adjacency_preferences:
        same_direction = item["from"] == from_space and item["to"] == to_space
        reverse_direction = item["from"] == to_space and item["to"] == from_space
        if same_direction or reverse_direction:
            return

    adjacency_preferences.append({
        "from": from_space,
        "to": to_space,
        "score": score
    })


def add_unique_separation(
    separation_preferences: list[dict[str, Any]],
    from_space: str,
    to_space: str,
    score: int
) -> None:
    for item in separation_preferences:
        if item["from"] == from_space and item["to"] == to_space:
            return

    separation_preferences.append({
        "from": from_space,
        "to": to_space,
        "score": score
    })


def generate_placement_rules(order: dict[str, Any]) -> dict[str, Any]:
    concepts = load_concepts()
    relations = load_relations()
    constraints = load_constraints()

    spaces = order["occupancy"]["spaces"]
    relationship_list = order.get("relationship", [])
    space_traits = order.get("space_traits", {})

    # 1) required blocks
    required_blocks = build_required_blocks(spaces, concepts)

    # 2) adjacency preferences
    adjacency_preferences: list[dict[str, Any]] = []

    # 2-1. 사용자가 명시한 관계 반영
    for rel in relationship_list:
        if rel.get("type") == "adjacent":
            score = find_adjacency_score(rel["from"], rel["to"], relations)
            add_unique_adjacency(adjacency_preferences, rel["from"], rel["to"], score)

    # 2-2. ontology/relations 기반 기본 관계 반영
    for item in relations.get("adjacency_preferences", []):
        from_space = item["from"]
        to_space = item["to"]

        from_exists = (from_space == "entrance") or (from_space in spaces)
        to_exists = (to_space == "entrance") or (to_space in spaces)

        if from_exists and to_exists:
            add_unique_adjacency(adjacency_preferences, from_space, to_space, item["score"])

    # 3) separation preferences
    separation_preferences: list[dict[str, Any]] = []

    # 3-1. concepts 기반 기본 성향
    for space_name in spaces.keys():
        concept = concepts.get(space_name, {})
        zone = concept.get("zone")
        traits = concept.get("traits", {})

        if zone in {"private", "semi_private"} or traits.get("privacy_preferred") or traits.get("quiet_preferred"):
            score = find_separation_score(space_name, "public_zone", relations)
            add_unique_separation(separation_preferences, space_name, "public_zone", score)

    # 3-2. 주문서의 traits가 강하면 한 번 더 반영
    for space_name, traits in space_traits.items():
        if traits.get("privacy") == "high" or traits.get("noise_level") == "low":
            score = find_separation_score(space_name, "public_zone", relations)
            add_unique_separation(separation_preferences, space_name, "public_zone", score)

    # 4) edge preferences
    edge_preferences: dict[str, str] = {}

    base_edge_preferences = relations.get("edge_preferences", {})
    for space_name in spaces.keys():
        if space_name in base_edge_preferences:
            edge_preferences[space_name] = base_edge_preferences[space_name]

    # 주문서 기반 보정
    if "living_room" in space_traits:
        if space_traits["living_room"].get("daylight") == "high":
            edge_preferences["living_room"] = "outer_edge"

    if "workspace" in space_traits:
        if (
            space_traits["workspace"].get("privacy") == "high"
            or space_traits["workspace"].get("noise_level") == "low"
        ):
            edge_preferences["workspace"] = "quiet_inner_zone"

    # 5) soft constraints
    soft_constraints: list[str] = []

    if any(space in spaces for space in ["bedroom", "workspace", "bathroom"]):
        soft_constraints.append("prefer_public_private_zoning")

    if "living_room" in space_traits and space_traits["living_room"].get("daylight") == "high":
        soft_constraints.append("prefer_daylight_for_living_room")

    if "workspace" in space_traits:
        if (
            space_traits["workspace"].get("privacy") == "high"
            or space_traits["workspace"].get("noise_level") == "low"
        ):
            soft_constraints.append("prefer_quiet_zone_for_workspace")

    if "bathroom" in spaces:
        soft_constraints.append("prefer_bathroom_near_private_zone")

    if "vertical_core" in spaces:
        soft_constraints.append("prefer_vertical_core_as_anchor")

    if "connector" in spaces:
        soft_constraints.append("prefer_connector_between_public_and_private")

    # 6) hard constraints
    hard_constraints = constraints.get("hard_constraints", [])

    rules = {
        "required_blocks": required_blocks,
        "adjacency_preferences": adjacency_preferences,
        "separation_preferences": separation_preferences,
        "edge_preferences": edge_preferences,
        "hard_constraints": hard_constraints,
        "soft_constraints": soft_constraints
    }

    return rules