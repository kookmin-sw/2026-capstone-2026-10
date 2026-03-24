import json
from pathlib import Path

from services.normalize_service import normalize_llm_json, validate_internal_format
from services.rules_service import generate_placement_rules


BASE_DIR = Path(__file__).resolve().parents[1]

RAW_INPUT_PATH = BASE_DIR / "artifacts" / "raw_llm" / "raw_001.json"

ORDER_OUTPUT_DIR = BASE_DIR / "artifacts" / "internal_orders"
RULES_OUTPUT_DIR = BASE_DIR / "artifacts" / "placement_rules"

ORDER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RULES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with open(RAW_INPUT_PATH, "r", encoding="utf-8") as f:
        raw_llm_json = json.load(f)

    # 3단계: 내부 포맷 JSON 생성
    normalized = normalize_llm_json(raw_llm_json)
    validated = validate_internal_format(normalized)

    order_output_path = ORDER_OUTPUT_DIR / "order_001.json"
    with open(order_output_path, "w", encoding="utf-8") as f:
        json.dump(validated, f, ensure_ascii=False, indent=2)

    # 4단계: placement rules 생성
    rules = generate_placement_rules(validated)

    rules_output_path = RULES_OUTPUT_DIR / "rules_001.json"
    with open(rules_output_path, "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)

    print("3단계 완료: 내부 포맷 JSON 생성")
    print(f"저장 위치: {order_output_path}")
    print(json.dumps(validated, ensure_ascii=False, indent=2))

    print("\n4단계 완료: placement rules 생성")
    print(f"저장 위치: {rules_output_path}")
    print(json.dumps(rules, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()