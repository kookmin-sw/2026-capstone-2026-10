from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parents[2]
IMAGES_2D_DIR = BASE_DIR / "artifacts" / "images_2d"

SCALE = 80
PADDING = 40

OUTER_WALL_T = 14   # outer wall thickness (pixels)
INNER_WALL_T = 6    # inner wall thickness (pixels)
LABEL_FONT_SIZE = 18
WINDOW_T = 4        # window line thickness (pixels)

SPACE_FILL = "#f8f8f8"
WALL_COLOR = "#111111"
LABEL_COLOR = "#333333"
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
    candidates = ["arial.ttf", "malgun.ttf", "맑은 고딕.ttf", "segoeui.ttf"]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


# ── 기하 유틸 ──────────────────────────────────────────────

def wall_rect(
    x1: float, y1: float, x2: float, y2: float, thickness: float
) -> list[tuple[float, float]]:
    """
    벽 선분 → 두께를 가진 직사각형 꼭짓점 목록 (butt end, 연장 없음).
    수직/수평 선분에만 적용된다.
    """
    half = thickness / 2
    if abs(x1 - x2) < 1e-9:  # 수직
        y_lo, y_hi = min(y1, y2), max(y1, y2)
        return [
            (x1 - half, y_lo), (x1 + half, y_lo),
            (x1 + half, y_hi), (x1 - half, y_hi),
        ]
    else:  # 수평
        x_lo, x_hi = min(x1, x2), max(x1, x2)
        return [
            (x_lo, y1 - half), (x_hi, y1 - half),
            (x_hi, y1 + half), (x_lo, y1 + half),
        ]


def corner_square(
    cx: float, cy: float, half: float
) -> list[tuple[float, float]]:
    """볼록 꼭짓점 채움용 정사각형."""
    return [
        (cx - half, cy - half), (cx + half, cy - half),
        (cx + half, cy + half), (cx - half, cy + half),
    ]


def extract_outer_polygon(
    outer_edges: list[dict[str, Any]],
    min_x: float, min_y: float,
) -> list[tuple[float, float]]:
    """Outer edges를 체이닝하여 닫힌 폴리곤 좌표 목록 반환."""
    def rnd(v: float) -> float:
        return round(v, 4)

    adj: dict[tuple, list[tuple]] = defaultdict(list)
    for e in outer_edges:
        p1 = (rnd(wx(e["x1"], min_x)), rnd(wy(e["y1"], min_y)))
        p2 = (rnd(wx(e["x2"], min_x)), rnd(wy(e["y2"], min_y)))
        adj[p1].append(p2)
        adj[p2].append(p1)

    visited: set[tuple[tuple, tuple]] = set()
    chains: list[list[tuple]] = []

    for start in list(adj.keys()):
        for nxt in adj[start]:
            edge = (min(start, nxt), max(start, nxt))
            if edge in visited:
                continue
            chain = [start, nxt]
            visited.add(edge)
            while True:
                cur = chain[-1]
                moved = False
                for nb in adj[cur]:
                    e = (min(cur, nb), max(cur, nb))
                    if e not in visited:
                        visited.add(e)
                        chain.append(nb)
                        moved = True
                        break
                if not moved:
                    break
            chains.append(chain)

    if not chains:
        return []
    return max(chains, key=len)


def classify_corners(
    poly: list[tuple[float, float]],
) -> list[tuple[tuple[float, float], str]]:
    """
    폴리곤 각 꼭짓점을 'convex'(볼록) / 'concave'(오목) / 'collinear'(직선)으로 분류.

    SVG 좌표계(y↓) 기준:
      - CW 폴리곤에서 cross > 0 → 오른쪽 회전 → 볼록
      - CCW 폴리곤에서 cross < 0 → 오른쪽 회전 → 볼록
    사인 면적 부호로 권선 방향을 자동 판정한다.
    """
    n = len(poly)
    if n < 3:
        return [(pt, "collinear") for pt in poly]

    # 사인 면적 (Shoelace)
    signed_area = 0.0
    for i in range(n):
        j = (i + 1) % n
        signed_area += poly[i][0] * poly[j][1]
        signed_area -= poly[j][0] * poly[i][1]

    results = []
    for i in range(n):
        a = poly[(i - 1) % n]
        b = poly[i]
        c = poly[(i + 1) % n]
        ab = (b[0] - a[0], b[1] - a[1])
        bc = (c[0] - b[0], c[1] - b[1])
        cross = ab[0] * bc[1] - ab[1] * bc[0]

        if abs(cross) < 1e-6:
            kind = "collinear"
        elif (cross > 0) == (signed_area < 0):
            # CW 폴리곤에서 cross>0 → 오른쪽 회전 → 볼록
            # CCW 폴리곤에서 cross<0 → 오른쪽 회전 → 볼록
            kind = "convex"
        else:
            kind = "concave"
        results.append((b, kind))

    return results


# ── SVG ────────────────────────────────────────────────────

def svg_poly(points: list[tuple[float, float]], fill: str) -> str:
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return f'<polygon points="{pts}" fill="{fill}" stroke="none" />'


def svg_line(
    x1: float, y1: float, x2: float, y2: float,
    stroke: str, width: float,
) -> str:
    return (
        f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
        f'stroke="{stroke}" stroke-width="{width}" stroke-linecap="butt" />'
    )


def svg_text(x: float, y: float, text: str, size: int, color: str) -> str:
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="middle" '
        f'dominant-baseline="middle" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{size}" '
        f'fill="{color}">{safe}</text>'
    )


def build_svg(plan_geometry: dict[str, Any]) -> str:
    min_x, min_y, max_x, max_y = compute_bounds(plan_geometry)
    canvas_w = int((max_x - min_x) * SCALE + PADDING * 2)
    canvas_h = int((max_y - min_y) * SCALE + PADDING * 2)

    els: list[str] = []

    # ① 공간 채우기
    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        els.append(svg_poly(pts, SPACE_FILL))

    # ② 외벽 — 각 세그먼트를 butt-ended 직사각형으로
    outer_edges = plan_geometry.get("outer_edges", [])
    for e in outer_edges:
        x1, y1 = wx(e["x1"], min_x), wy(e["y1"], min_y)
        x2, y2 = wx(e["x2"], min_x), wy(e["y2"], min_y)
        els.append(svg_poly(wall_rect(x1, y1, x2, y2, OUTER_WALL_T), WALL_COLOR))

    # ③ 볼록 꼭짓점 채우기 (butt 선분 사이 갭 메우기)
    outer_poly = extract_outer_polygon(outer_edges, min_x, min_y)
    half_t = OUTER_WALL_T / 2
    for vertex, kind in classify_corners(outer_poly):
        if kind == "convex":
            els.append(svg_poly(corner_square(vertex[0], vertex[1], half_t), WALL_COLOR))

    # ④ 내부 벽 — 얇은 직사각형
    for w in plan_geometry.get("inner_walls", []):
        x1, y1 = wx(w["x1"], min_x), wy(w["y1"], min_y)
        x2, y2 = wx(w["x2"], min_x), wy(w["y2"], min_y)
        els.append(svg_poly(wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR))

    # ⑤ 개구부 / 창문 — 벽 지우기 후 창문 선
    for op in plan_geometry.get("openings", []):
        x1, y1 = wx(op["x1"], min_x), wy(op["y1"], min_y)
        x2, y2 = wx(op["x2"], min_x), wy(op["y2"], min_y)
        is_ext = op.get("placement") == "exterior"
        gap = OUTER_WALL_T + 2 if is_ext else INNER_WALL_T + 2
        # 벽 영역을 공간 색으로 지움
        els.append(svg_poly(wall_rect(x1, y1, x2, y2, gap), SPACE_FILL))
        if op.get("kind") == "window":
            els.append(svg_line(x1, y1, x2, y2, WALL_COLOR, WINDOW_T))

    # ⑥ 라벨
    for label in plan_geometry.get("labels", []):
        els.append(svg_text(
            wx(label["x"], min_x), wy(label["y"], min_y),
            label["text"], LABEL_FONT_SIZE, LABEL_COLOR,
        ))

    body = "\n  ".join(els)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{canvas_w}" height="{canvas_h}" '
        f'viewBox="0 0 {canvas_w} {canvas_h}">\n'
        f'  <rect x="0" y="0" width="{canvas_w}" height="{canvas_h}" fill="{BG_COLOR}" />\n'
        f'  {body}\n'
        f'</svg>\n'
    )


def save_svg(svg_str: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg_str, encoding="utf-8")
    return output_path


# ── PNG ────────────────────────────────────────────────────

def _draw_wall_rect(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], fill: str) -> None:
    draw.polygon(pts, fill=fill)


def build_png(plan_geometry: dict[str, Any]) -> Image.Image:
    min_x, min_y, max_x, max_y = compute_bounds(plan_geometry)
    canvas_w = int((max_x - min_x) * SCALE + PADDING * 2)
    canvas_h = int((max_y - min_y) * SCALE + PADDING * 2)

    image = Image.new("RGB", (canvas_w, canvas_h), BG_COLOR)
    draw = ImageDraw.Draw(image)

    # ① 공간 채우기
    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        draw.polygon(pts, fill=SPACE_FILL)

    # ② 외벽
    outer_edges = plan_geometry.get("outer_edges", [])
    for e in outer_edges:
        x1, y1 = wx(e["x1"], min_x), wy(e["y1"], min_y)
        x2, y2 = wx(e["x2"], min_x), wy(e["y2"], min_y)
        _draw_wall_rect(draw, wall_rect(x1, y1, x2, y2, OUTER_WALL_T), WALL_COLOR)

    # ③ 볼록 꼭짓점 채우기
    outer_poly = extract_outer_polygon(outer_edges, min_x, min_y)
    half_t = OUTER_WALL_T / 2
    for vertex, kind in classify_corners(outer_poly):
        if kind == "convex":
            _draw_wall_rect(draw, corner_square(vertex[0], vertex[1], half_t), WALL_COLOR)

    # ④ 내부 벽
    for w in plan_geometry.get("inner_walls", []):
        x1, y1 = wx(w["x1"], min_x), wy(w["y1"], min_y)
        x2, y2 = wx(w["x2"], min_x), wy(w["y2"], min_y)
        _draw_wall_rect(draw, wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR)

    # ⑤ 개구부 / 창문
    font = load_font(LABEL_FONT_SIZE)
    for op in plan_geometry.get("openings", []):
        x1, y1 = wx(op["x1"], min_x), wy(op["y1"], min_y)
        x2, y2 = wx(op["x2"], min_x), wy(op["y2"], min_y)
        is_ext = op.get("placement") == "exterior"
        gap = OUTER_WALL_T + 2 if is_ext else INNER_WALL_T + 2
        _draw_wall_rect(draw, wall_rect(x1, y1, x2, y2, gap), SPACE_FILL)
        if op.get("kind") == "window":
            draw.line([(x1, y1), (x2, y2)], fill=WALL_COLOR, width=WINDOW_T)

    # ⑥ 라벨
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

    return image


def save_png(image: Image.Image, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return output_path


# ── 파일 기반 렌더 유틸 ────────────────────────────────────

def render_plan_geometry_file(plan_geometry_path: Path) -> tuple[Path, Path]:
    plan_geometry = load_plan_geometry(plan_geometry_path)
    base_name = plan_geometry_path.stem.replace(".plan_geometry", "")
    svg_path = IMAGES_2D_DIR / f"{base_name}.svg"
    png_path = IMAGES_2D_DIR / f"{base_name}.png"
    save_svg(build_svg(plan_geometry), svg_path)
    save_png(build_png(plan_geometry), png_path)
    return svg_path, png_path


def render_plan_geometry_file_to_svg(plan_geometry_path: Path) -> Path:
    svg_path, _ = render_plan_geometry_file(plan_geometry_path)
    return svg_path


def render_plan_geometry_file_to_png(plan_geometry_path: Path) -> Path:
    _, png_path = render_plan_geometry_file(plan_geometry_path)
    return png_path
