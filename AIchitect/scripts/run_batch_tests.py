from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]

if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from app.services.normalize_service import normalize_llm_json, validate_internal_format
from app.services.rules_service import generate_placement_rules
from app.services.layout_service import generate_layout_from_rules
from app.services.visualize2d_service import render_layout_to_svg


EXAMPLES_PATH = BASE_DIR / "data" / "examples" / "sample_requests.json"
ORDER_DIR = BASE_DIR / "artifacts" / "internal_orders"
RULES_DIR = BASE_DIR / "artifacts" / "placement_rules"
LAYOUT_DIR = BASE_DIR / "artifacts" / "layouts"
IMAGE_DIR = BASE_DIR / "artifacts" / "images_2d"

ORDER_DIR.mkdir(parents=True, exist_ok=True)
RULES_DIR.mkdir(parents=True, exist_ok=True)
LAYOUT_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main() -> None:
    with open(EXAMPLES_PATH, "r", encoding="utf-8") as f:
        cases = json.load(f)

    print(f"총 {len(cases)}개 테스트 케이스 실행 시작\n")

    for case in cases:
        case_id = case["id"]

        # 1) 내부 포맷 변환
        normalized = normalize_llm_json(case)
        validated = validate_internal_format(normalized)

        # 2) placement rules 생성
        rules = generate_placement_rules(validated)

        # 3) layout 생성
        layout = generate_layout_from_rules(rules)

        # 4) 저장
        order_path = ORDER_DIR / f"{case_id}.json"
        rules_path = RULES_DIR / f"{case_id}.json"
        layout_path = LAYOUT_DIR / f"{case_id}.json"
        image_path = IMAGE_DIR / f"{case_id}.svg"

        save_json(order_path, validated)
        save_json(rules_path, rules)
        save_json(layout_path, layout)

        # 5) SVG 시각화
        render_layout_to_svg(layout, image_path)

        # 6) 요약 출력
        spaces = validated["occupancy"]["spaces"]
        rel_count = len(validated["relationship"])
        placement_count = len(layout["placements"])

        print(f"[{case_id}] 완료")
        print(f"  - spaces: {spaces}")
        print(f"  - relationships: {rel_count}개")
        print(f"  - placements: {placement_count}개")
        print(f"  - order 저장: {order_path.name}")
        print(f"  - rules 저장: {rules_path.name}")
        print(f"  - layout 저장: {layout_path.name}")
        print(f"  - image 저장: {image_path.name}\n")

    print("internal_order / placement_rules / layout / svg 생성 완료")


if __name__ == "__main__":
    main()