"""
전체 파이프라인 일괄 실행 스크립트
sample_requests.json → normalize → rules → layout → compact → plan_geometry → SVG/PNG → contact sheet
artifacts/ 폴더가 비어 있어도 처음부터 모두 생성합니다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.normalize_service import normalize_llm_json, validate_internal_format
from app.services.rules_service import generate_placement_rules
from app.services.layout_service import generate_layout_from_rules
from app.services.layout_postprocess_service import compact_layout_data
from app.services.plan_geometry_service import build_plan_geometry
from app.services.visualize2d_service import build_svg, save_svg, build_png, save_png


EXAMPLES_PATH = PROJECT_ROOT / "data" / "examples" / "sample_requests.json"
ORDER_DIR = PROJECT_ROOT / "artifacts" / "internal_orders"
RULES_DIR = PROJECT_ROOT / "artifacts" / "placement_rules"
LAYOUT_DIR = PROJECT_ROOT / "artifacts" / "layouts"
PLAN_GEOMETRY_DIR = PROJECT_ROOT / "artifacts" / "plan_geometry"
IMAGES_DIR = PROJECT_ROOT / "artifacts" / "images_2d"

for d in (ORDER_DIR, RULES_DIR, LAYOUT_DIR, PLAN_GEOMETRY_DIR, IMAGES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_font(size: int):
    candidates = ["arial.ttf", "malgun.ttf", "맑은 고딕.ttf", "segoeui.ttf"]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def make_contact_sheet(image_paths: list[Path], output_path: Path) -> None:
    thumb_w, thumb_h = 420, 300
    padding, header_h = 30, 40
    cols = 2
    rows = (len(image_paths) + cols - 1) // cols

    canvas_w = cols * thumb_w + (cols + 1) * padding
    canvas_h = rows * (thumb_h + header_h) + (rows + 1) * padding

    sheet = Image.new("RGB", (canvas_w, canvas_h), "white")
    draw = ImageDraw.Draw(sheet)
    font = load_font(18)

    for idx, image_path in enumerate(image_paths):
        row, col = divmod(idx, cols)
        x = padding + col * (thumb_w + padding)
        y = padding + row * (thumb_h + header_h + padding)

        draw.text((x, y), image_path.stem, fill="black", font=font)

        img = Image.open(image_path).convert("RGB")
        img.thumbnail((thumb_w, thumb_h))

        paste_x = x + (thumb_w - img.width) // 2
        paste_y = y + header_h + (thumb_h - img.height) // 2
        sheet.paste(img, (paste_x, paste_y))
        draw.rectangle(
            [x, y + header_h, x + thumb_w, y + header_h + thumb_h],
            outline="gray",
            width=1,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)


def run_case(case: dict) -> Path:
    case_id = case["id"]
    print(f"\n[{case_id}]")

    # 1) normalize
    normalized = normalize_llm_json(case)
    validated = validate_internal_format(normalized)
    print(f"  normalize  → spaces: {validated['occupancy']['spaces']}")

    # 2) placement rules
    rules = generate_placement_rules(validated)
    print(f"  rules      → blocks: {rules['required_blocks']}")

    # 3) layout + compact
    layout = generate_layout_from_rules(rules)
    layout = compact_layout_data(layout)
    print(f"  layout     → {len(layout['placements'])} placements")

    # 4) plan geometry
    plan_geometry = build_plan_geometry(layout)
    print(f"  geometry   → {len(plan_geometry['spaces'])} spaces, "
          f"{len(plan_geometry['openings'])} openings")

    # 5) 저장
    save_json(ORDER_DIR / f"{case_id}.json", validated)
    save_json(RULES_DIR / f"{case_id}.json", rules)
    save_json(LAYOUT_DIR / f"{case_id}.json", layout)
    save_json(PLAN_GEOMETRY_DIR / f"{case_id}.plan_geometry.json", plan_geometry)

    svg_path = IMAGES_DIR / f"{case_id}.svg"
    png_path = IMAGES_DIR / f"{case_id}.png"
    save_svg(build_svg(plan_geometry), svg_path)
    save_png(build_png(plan_geometry), png_path)
    print(f"  rendered   → {svg_path.name}, {png_path.name}")

    return png_path


def main() -> None:
    with open(EXAMPLES_PATH, "r", encoding="utf-8") as f:
        cases = json.load(f)

    print(f"총 {len(cases)}개 케이스 파이프라인 시작")

    rendered_pngs: list[Path] = []
    for case in cases:
        png_path = run_case(case)
        rendered_pngs.append(png_path)

    print("\n[contact sheet 생성 중...]")
    contact_path = IMAGES_DIR / "all_cases_overview.png"
    make_contact_sheet(rendered_pngs, contact_path)
    print(f"저장 완료: {contact_path}")

    print(f"\n완료: {len(cases)}개 케이스 처리, artifacts/ 하위 전체 갱신됨")


if __name__ == "__main__":
    main()
