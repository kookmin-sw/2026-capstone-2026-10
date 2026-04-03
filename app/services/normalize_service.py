from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]

ALIASES_PATH = BASE_DIR / "data" / "ontology" / "aliases.json"
CONCEPTS_PATH = BASE_DIR / "data" / "ontology" / "concepts.json"


def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_aliases() -> dict[str, Any]:
    return load_json(ALIASES_PATH)


def load_concepts() -> dict[str, Any]:
    return load_json(CONCEPTS_PATH)


def canon_space(name: str, aliases: dict[str, Any]) -> str:
    key = name.strip().lower()
    return aliases["space_aliases"].get(key, key)


def canon_relation(value: str, aliases: dict[str, Any]) -> str:
    key = value.strip().lower()
    return aliases["relation_aliases"].get(key, key)


def canon_daylight(value: str, aliases: dict[str, Any]) -> str:
    key = value.strip().lower()
    return aliases["daylight_aliases"].get(key, key)


def canon_privacy(value: str, aliases: dict[str, Any]) -> str:
    key = value.strip().lower()
    return aliases["privacy_aliases"].get(key, key)


def extract_count(text: str) -> int:
    digits = "".join(ch for ch in text if ch.isdigit())
    return int(digits) if digits else 1


def clean_space_text(text: str) -> str:
    cleaned = text
    for ch in "0123456789개 ":
        cleaned = cleaned.replace(ch, "")
    return cleaned.strip()


def normalize_required_spaces(required_spaces: list[str], aliases: dict[str, Any], concepts: dict[str, Any]) -> dict[str, int]:
    spaces: dict[str, int] = {}

    for item in required_spaces:
        text = str(item).strip()
        count = extract_count(text)
        raw_space = clean_space_text(text)
        canonical_space = canon_space(raw_space, aliases)

        if canonical_space not in concepts:
            continue

        spaces[canonical_space] = count

    return spaces


def normalize_preferences(preferences: list[str], aliases: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    relationships: list[dict[str, Any]] = []
    space_traits: dict[str, Any] = {}

    for pref in preferences:
        p = str(pref).strip()
        p_lower = p.lower()

        has_kitchen = ("주방" in p) or ("부엌" in p) or ("kitchen" in p_lower)
        has_living = ("거실" in p) or ("living room" in p_lower) or ("living_room" in p_lower)

        has_workspace = ("작업실" in p) or ("서재" in p) or ("workspace" in p_lower) or ("study" in p_lower)
        has_bathroom = ("욕실" in p) or ("화장실" in p) or ("bathroom" in p_lower)
        has_vertical = ("계단" in p) or ("stair" in p_lower) or ("stairs" in p_lower) or ("vertical core" in p_lower)
        has_connector = ("복도" in p) or ("corridor" in p_lower) or ("buffer" in p_lower)

        # 욕실 관련 특성 (필요시 확장용)
        if has_bathroom:
            space_traits.setdefault("bathroom", {})
            if ("프라이버시" in p) or ("private" in p_lower):
                space_traits["bathroom"]["privacy"] = canon_privacy("private", aliases)

        # 수직동선은 현재 특성보다 존재 여부가 중요해서 traits는 비워둬도 됨
        if has_vertical:
            space_traits.setdefault("vertical_core", {})

        # 복도/완충공간도 마찬가지
        if has_connector:
            space_traits.setdefault("connector", {})

        # 관계 정규화: 주방-거실 연결
        if has_kitchen and has_living:
            relationships.append({
                "from": "kitchen",
                "to": "living_room",
                "type": canon_relation("connected", aliases)
            })

        # 거실 특성 정규화
        if has_living:
            space_traits.setdefault("living_room", {})

            if ("밝" in p) or ("햇빛" in p) or ("bright" in p_lower) or ("sunny" in p_lower):
                space_traits["living_room"]["daylight"] = canon_daylight("bright", aliases)
                space_traits["living_room"]["atmosphere"] = "bright"

        # 작업실 특성 정규화
        if has_workspace:
            space_traits.setdefault("workspace", {})

            if ("조용" in p) or ("quiet" in p_lower):
                space_traits["workspace"]["noise_level"] = "low"
                space_traits["workspace"]["privacy"] = canon_privacy("quiet", aliases)

    return relationships, space_traits


def normalize_llm_json(raw: dict[str, Any]) -> dict[str, Any]:
    aliases = load_aliases()
    concepts = load_concepts()

    result = {
        "occupancy": {
            "household_size": 0,
            "building_type": "single_family_house",
            "spaces": {}
        },
        "relationship": [],
        "space_traits": {}
    }

    # 1) 가족 수
    family_type = raw.get("family_type")
    if family_type:
        digits = "".join(ch for ch in str(family_type) if ch.isdigit())
        if digits:
            result["occupancy"]["household_size"] = int(digits)

    household_size = raw.get("household_size")
    if household_size is not None:
        result["occupancy"]["household_size"] = int(household_size)

    # 2) 주택 유형
    housing_type = raw.get("housing_type")
    if housing_type:
        if "단독" in str(housing_type) or "single" in str(housing_type).lower():
            result["occupancy"]["building_type"] = "single_family_house"

    # 3) 공간 수량 정규화
    required_spaces = raw.get("required_spaces", [])
    result["occupancy"]["spaces"] = normalize_required_spaces(required_spaces, aliases, concepts)

    # 4) 관계 / 특성 정규화
    preferences = raw.get("preferences", [])
    relationships, space_traits = normalize_preferences(preferences, aliases)

    result["relationship"] = relationships
    result["space_traits"] = space_traits

    return result


def validate_internal_format(data: dict[str, Any]) -> dict[str, Any]:
    concepts = load_concepts()

    if not isinstance(data.get("occupancy"), dict):
        raise ValueError("occupancy가 dict여야 합니다.")
    if not isinstance(data.get("relationship"), list):
        raise ValueError("relationship가 list여야 합니다.")
    if not isinstance(data.get("space_traits"), dict):
        raise ValueError("space_traits가 dict여야 합니다.")

    occupancy = data["occupancy"]
    if not isinstance(occupancy.get("household_size"), int):
        raise ValueError("household_size가 int여야 합니다.")

    spaces = occupancy.get("spaces", {})
    if not isinstance(spaces, dict):
        raise ValueError("occupancy.spaces가 dict여야 합니다.")

    allowed_spaces = set(concepts.keys()) - {"entrance"}
    for key, value in spaces.items():
        if key not in allowed_spaces:
            raise ValueError(f"허용되지 않은 공간 키: {key}")
        if not isinstance(value, int):
            raise ValueError(f"{key} 개수는 int여야 합니다.")

    allowed_relations = {"adjacent", "near", "separated"}
    for rel in data["relationship"]:
        if not isinstance(rel, dict):
            raise ValueError("relationship의 각 항목은 dict여야 합니다.")
        if rel.get("type") not in allowed_relations:
            raise ValueError(f"허용되지 않은 관계 타입: {rel.get('type')}")

    return data