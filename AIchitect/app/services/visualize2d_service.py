from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parents[2]
IMAGES_2D_DIR = BASE_DIR / "artifacts" / "images_2d"

SCALE = 80
PADDING = 40

OUTER_WALL_STROKE = 14
INNER_WALL_STROKE = 8
SPACE_STROKE = 1
LABEL_FONT_SIZE = 18
WINDOW_STROKE = 4

SPACE_FILL = "#ffffff"
SPACE_STROKE_COLOR = "#d9d9d9"
WALL_COLOR = "#111111"
LABEL_COLOR = "#222222"
BG_COLOR = "#ffffff"


def load_plan_geometry(plan_geometry_path: Path) -> dict[str, Any]:
    with open(plan_geometry_path, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_bounds(plan_geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []

    for space in plan_geometry.get("spaces", []):
        for x, y in space["polygon"]:
            xs.append(x)
            ys.append(y)

    if not xs or not ys:
        raise ValueError("plan_geometry does not contain any space polygons")

    return min(xs), min(ys), max(xs), max(ys)


def wx(x: float, min_x: float) -> float:
    return PADDING + (x - min_x) * SCALE


def wy(y: float, min_y: float) -> float:
    return PADDING + (y - min_y) * SCALE


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "arial.ttf",
        "malgun.ttf",
        "맑은 고딕.ttf",
        "segoeui.ttf",
    ]

    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass

    return ImageFont.load_default()


def svg_line(x1: float, y1: float, x2: float, y2: float, stroke: str, width: float, linecap: str = "square") -> str:
    return (
        f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
        f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="{linecap}" />'
    )


def svg_polygon(points: list[tuple[float, float]], stroke: str, width: float, fill: str) -> str:
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return f'<polygon points="{pts}" stroke="{stroke}" stroke-width="{width}" fill="{fill}" />'


def svg_text(x: float, y: float, text: str, size: int, color: str) -> str:
    safe = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="middle" dominant-baseline="middle" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{size}" fill="{color}">{safe}</text>'
    )


def build_svg(plan_geometry: dict[str, Any]) -> str:
    min_x, min_y, max_x, max_y = compute_bounds(plan_geometry)
    canvas_width = int((max_x - min_x) * SCALE + PADDING * 2)
    canvas_height = int((max_y - min_y) * SCALE + PADDING * 2)

    elements: list[str] = []

    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        elements.append(svg_polygon(pts, SPACE_STROKE_COLOR, SPACE_STROKE, SPACE_FILL))

    for wall in plan_geometry.get("outer_edges", []):
        elements.append(
            svg_line(
                wx(wall["x1"], min_x),
                wy(wall["y1"], min_y),
                wx(wall["x2"], min_x),
                wy(wall["y2"], min_y),
                WALL_COLOR,
                OUTER_WALL_STROKE,
            )
        )

    for wall in plan_geometry.get("inner_walls", []):
        elements.append(
            svg_line(
                wx(wall["x1"], min_x),
                wy(wall["y1"], min_y),
                wx(wall["x2"], min_x),
                wy(wall["y2"], min_y),
                WALL_COLOR,
                INNER_WALL_STROKE,
            )
        )

    for opening in plan_geometry.get("openings", []):
        x1 = wx(opening["x1"], min_x)
        y1 = wy(opening["y1"], min_y)
        x2 = wx(opening["x2"], min_x)
        y2 = wy(opening["y2"], min_y)

        if opening["kind"] == "window":
            elements.append(svg_line(x1, y1, x2, y2, BG_COLOR, OUTER_WALL_STROKE + 2, "butt"))
            elements.append(svg_line(x1, y1, x2, y2, WALL_COLOR, WINDOW_STROKE, "butt"))

        elif opening["kind"] == "opening":
            gap_width = OUTER_WALL_STROKE + 2 if opening["placement"] == "exterior" else INNER_WALL_STROKE + 2
            elements.append(svg_line(x1, y1, x2, y2, BG_COLOR, gap_width, "butt"))

    for label in plan_geometry.get("labels", []):
        elements.append(
            svg_text(
                wx(label["x"], min_x),
                wy(label["y"], min_y),
                label["text"],
                LABEL_FONT_SIZE,
                LABEL_COLOR,
            )
        )

    body = "\n  ".join(elements)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_width}" height="{canvas_height}" viewBox="0 0 {canvas_width} {canvas_height}">
  <rect x="0" y="0" width="{canvas_width}" height="{canvas_height}" fill="{BG_COLOR}" />
  {body}
</svg>
'''


def save_svg(svg_text_value: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg_text_value, encoding="utf-8")
    return output_path


def draw_spaces_png(draw: ImageDraw.ImageDraw, plan_geometry: dict[str, Any], min_x: float, min_y: float) -> None:
    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        draw.polygon(pts, fill=SPACE_FILL, outline=SPACE_STROKE_COLOR)


def draw_outer_walls_png(draw: ImageDraw.ImageDraw, plan_geometry: dict[str, Any], min_x: float, min_y: float) -> None:
    for wall in plan_geometry.get("outer_edges", []):
        draw.line(
            [
                (wx(wall["x1"], min_x), wy(wall["y1"], min_y)),
                (wx(wall["x2"], min_x), wy(wall["y2"], min_y)),
            ],
            fill=WALL_COLOR,
            width=OUTER_WALL_STROKE,
        )


def draw_inner_walls_png(draw: ImageDraw.ImageDraw, plan_geometry: dict[str, Any], min_x: float, min_y: float) -> None:
    for wall in plan_geometry.get("inner_walls", []):
        draw.line(
            [
                (wx(wall["x1"], min_x), wy(wall["y1"], min_y)),
                (wx(wall["x2"], min_x), wy(wall["y2"], min_y)),
            ],
            fill=WALL_COLOR,
            width=INNER_WALL_STROKE,
        )


def draw_window_png(draw: ImageDraw.ImageDraw, opening: dict[str, Any], min_x: float, min_y: float) -> None:
    x1 = wx(opening["x1"], min_x)
    y1 = wy(opening["y1"], min_y)
    x2 = wx(opening["x2"], min_x)
    y2 = wy(opening["y2"], min_y)

    draw.line([(x1, y1), (x2, y2)], fill=BG_COLOR, width=OUTER_WALL_STROKE + 2)
    draw.line([(x1, y1), (x2, y2)], fill=WALL_COLOR, width=WINDOW_STROKE)

    if abs(x1 - x2) < 1e-6:
        draw.line([(x1 - 5, y1), (x2 - 5, y2)], fill=WALL_COLOR, width=1)
        draw.line([(x1 + 5, y1), (x2 + 5, y2)], fill=WALL_COLOR, width=1)
    else:
        draw.line([(x1, y1 - 5), (x2, y2 - 5)], fill=WALL_COLOR, width=1)
        draw.line([(x1, y1 + 5), (x2, y2 + 5)], fill=WALL_COLOR, width=1)


def draw_opening_gap_png(draw: ImageDraw.ImageDraw, opening: dict[str, Any], min_x: float, min_y: float) -> None:
    x1 = wx(opening["x1"], min_x)
    y1 = wy(opening["y1"], min_y)
    x2 = wx(opening["x2"], min_x)
    y2 = wy(opening["y2"], min_y)

    gap_width = OUTER_WALL_STROKE + 2 if opening["placement"] == "exterior" else INNER_WALL_STROKE + 2
    draw.line([(x1, y1), (x2, y2)], fill=BG_COLOR, width=gap_width)


def draw_openings_png(draw: ImageDraw.ImageDraw, plan_geometry: dict[str, Any], min_x: float, min_y: float) -> None:
    for opening in plan_geometry.get("openings", []):
        if opening["kind"] == "window":
            draw_window_png(draw, opening, min_x, min_y)
        elif opening["kind"] == "opening":
            draw_opening_gap_png(draw, opening, min_x, min_y)


def draw_labels_png(draw: ImageDraw.ImageDraw, plan_geometry: dict[str, Any], min_x: float, min_y: float) -> None:
    font = load_font(LABEL_FONT_SIZE)

    for label in plan_geometry.get("labels", []):
        x = wx(label["x"], min_x)
        y = wy(label["y"], min_y)
        text = label["text"]

        try:
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        except Exception:
            tw, th = draw.textlength(text, font=font), LABEL_FONT_SIZE

        draw.text((x - tw / 2, y - th / 2), text, fill=LABEL_COLOR, font=font)


def build_png(plan_geometry: dict[str, Any]) -> Image.Image:
    min_x, min_y, max_x, max_y = compute_bounds(plan_geometry)
    canvas_width = int((max_x - min_x) * SCALE + PADDING * 2)
    canvas_height = int((max_y - min_y) * SCALE + PADDING * 2)

    image = Image.new("RGB", (canvas_width, canvas_height), BG_COLOR)
    draw = ImageDraw.Draw(image)

    draw_spaces_png(draw, plan_geometry, min_x, min_y)
    draw_outer_walls_png(draw, plan_geometry, min_x, min_y)
    draw_inner_walls_png(draw, plan_geometry, min_x, min_y)
    draw_openings_png(draw, plan_geometry, min_x, min_y)
    draw_labels_png(draw, plan_geometry, min_x, min_y)

    return image


def save_png(image: Image.Image, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return output_path


def render_plan_geometry_file(plan_geometry_path: Path) -> tuple[Path, Path]:
    plan_geometry = load_plan_geometry(plan_geometry_path)

    svg_text_value = build_svg(plan_geometry)
    png_image = build_png(plan_geometry)

    base_name = plan_geometry_path.stem.replace(".plan_geometry", "")
    svg_path = IMAGES_2D_DIR / f"{base_name}.svg"
    png_path = IMAGES_2D_DIR / f"{base_name}.png"

    save_svg(svg_text_value, svg_path)
    save_png(png_image, png_path)

    return svg_path, png_path


def render_plan_geometry_file_to_svg(plan_geometry_path: Path) -> Path:
    svg_path, _ = render_plan_geometry_file(plan_geometry_path)
    return svg_path


def render_plan_geometry_file_to_png(plan_geometry_path: Path) -> Path:
    _, png_path = render_plan_geometry_file(plan_geometry_path)
    return png_path