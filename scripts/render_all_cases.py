from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.layout_postprocess_service import compact_layout_file
from app.services.plan_geometry_service import convert_layout_file_to_plan_geometry
from app.services.visualize2d_service import render_plan_geometry_file


LAYOUTS_DIR = PROJECT_ROOT / "artifacts" / "layouts"
PLAN_GEOMETRY_DIR = PROJECT_ROOT / "artifacts" / "plan_geometry"
IMAGES_2D_DIR = PROJECT_ROOT / "artifacts" / "images_2d"


def load_font(size: int):
    candidates = ["arial.ttf", "malgun.ttf", "맑은 고딕.ttf", "segoeui.ttf"]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def make_contact_sheet(image_paths: list[Path], output_path: Path) -> Path:
    if not image_paths:
        raise ValueError("No images to place in contact sheet")

    thumb_w = 420
    thumb_h = 300
    padding = 30
    header_h = 40
    cols = 2
    rows = (len(image_paths) + cols - 1) // cols

    canvas_w = cols * thumb_w + (cols + 1) * padding
    canvas_h = rows * (thumb_h + header_h) + (rows + 1) * padding

    sheet = Image.new("RGB", (canvas_w, canvas_h), "white")
    draw = ImageDraw.Draw(sheet)
    font = load_font(18)

    for idx, image_path in enumerate(image_paths):
        row = idx // cols
        col = idx % cols

        x = padding + col * (thumb_w + padding)
        y = padding + row * (thumb_h + header_h + padding)

        title = image_path.stem
        draw.text((x, y), title, fill="black", font=font)

        img = Image.open(image_path).convert("RGB")
        img.thumbnail((thumb_w, thumb_h))

        # 중앙 정렬
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
    return output_path


def main() -> None:
    layout_files = sorted(LAYOUTS_DIR.glob("case_*.json"))

    if not layout_files:
        print("No case_*.json files found in artifacts/layouts")
        return

    rendered_pngs: list[Path] = []

    for layout_path in layout_files:
        print(f"[1/4] compact layout: {layout_path.name}")
        compact_layout_file(
            layout_path=layout_path,
            output_path=layout_path,   # 덮어쓰기
            vertical_gap=0.0,
        )

        print(f"[2/4] plan geometry: {layout_path.name}")
        plan_geometry_path = convert_layout_file_to_plan_geometry(layout_path)

        print(f"[3/4] render 2d: {layout_path.name}")
        svg_path, png_path = render_plan_geometry_file(plan_geometry_path)

        print("  saved svg:", svg_path.name)
        print("  saved png:", png_path.name)

        rendered_pngs.append(png_path)

    print("[4/4] making contact sheet...")
    contact_sheet_path = IMAGES_2D_DIR / "all_cases_overview.png"
    make_contact_sheet(rendered_pngs, contact_sheet_path)

    print("saved overview:", contact_sheet_path)


if __name__ == "__main__":
    main()