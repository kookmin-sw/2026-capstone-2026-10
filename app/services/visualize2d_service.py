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
WINDOW_COLOR = "#8ca6b7"
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


def annotation_metrics(plan_w_px: float, plan_h_px: float) -> dict[str, float]:
    arrow_radius = max(24.0, min(60.0, min(plan_w_px, plan_h_px) * 0.025))
    arrow_size = arrow_radius / 0.72
    return {
        "arrow_size": arrow_size,
        "bottom_annot": max(55, int(arrow_size * 2.2 + 20)),
        "px_per_m": SCALE * 2.0,
        "bar_m": 2.5,
    }


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


def outer_wall_extension_rect(
    edge: dict[str, Any],
    min_x: float,
    min_y: float,
) -> list[tuple[float, float]]:
    x1, y1 = wx(edge["x1"], min_x), wy(edge["y1"], min_y)
    x2, y2 = wx(edge["x2"], min_x), wy(edge["y2"], min_y)
    extra = OUTER_WALL_T - INNER_WALL_T
    inner_half = INNER_WALL_T / 2
    side = edge["side"]

    if side == "north":
        return [
            (min(x1, x2), y1 - inner_half - extra),
            (max(x1, x2), y1 - inner_half - extra),
            (max(x1, x2), y1 - inner_half),
            (min(x1, x2), y1 - inner_half),
        ]

    if side == "south":
        return [
            (min(x1, x2), y1 + inner_half),
            (max(x1, x2), y1 + inner_half),
            (max(x1, x2), y1 + inner_half + extra),
            (min(x1, x2), y1 + inner_half + extra),
        ]

    if side == "west":
        return [
            (x1 - inner_half - extra, min(y1, y2)),
            (x1 - inner_half, min(y1, y2)),
            (x1 - inner_half, max(y1, y2)),
            (x1 - inner_half - extra, max(y1, y2)),
        ]

    if side == "east":
        return [
            (x1 + inner_half, min(y1, y2)),
            (x1 + inner_half + extra, min(y1, y2)),
            (x1 + inner_half + extra, max(y1, y2)),
            (x1 + inner_half, max(y1, y2)),
        ]

    return []


def exterior_opening_cut_rect(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    side: str,
    margin: float = 2,
) -> list[tuple[float, float]]:
    extra = OUTER_WALL_T - INNER_WALL_T
    inner_half = INNER_WALL_T / 2

    if side == "north":
        return [
            (min(x1, x2), y1 - inner_half - extra - margin),
            (max(x1, x2), y1 - inner_half - extra - margin),
            (max(x1, x2), y1 + inner_half + margin),
            (min(x1, x2), y1 + inner_half + margin),
        ]

    if side == "south":
        return [
            (min(x1, x2), y1 - inner_half - margin),
            (max(x1, x2), y1 - inner_half - margin),
            (max(x1, x2), y1 + inner_half + extra + margin),
            (min(x1, x2), y1 + inner_half + extra + margin),
        ]

    if side == "west":
        return [
            (x1 - inner_half - extra - margin, min(y1, y2)),
            (x1 + inner_half + margin, min(y1, y2)),
            (x1 + inner_half + margin, max(y1, y2)),
            (x1 - inner_half - extra - margin, max(y1, y2)),
        ]

    if side == "east":
        return [
            (x1 - inner_half - margin, min(y1, y2)),
            (x1 + inner_half + extra + margin, min(y1, y2)),
            (x1 + inner_half + extra + margin, max(y1, y2)),
            (x1 - inner_half - margin, max(y1, y2)),
        ]

    return wall_rect(x1, y1, x2, y2, OUTER_WALL_T + margin * 2)


def window_symbol_lines(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    side: str,
) -> list[tuple[float, float, float, float]]:
    offset = 2.0
    if side in {"north", "south"}:
        return [
            (x1, y1 - offset, x2, y2 - offset),
            (x1, y1 + offset, x2, y2 + offset),
        ]

    return [
        (x1 - offset, y1, x2 - offset, y2),
        (x1 + offset, y1, x2 + offset, y2),
    ]


def outer_corner_extension_rects(
    outer_edges: list[dict[str, Any]],
    min_x: float,
    min_y: float,
) -> list[list[tuple[float, float]]]:
    extra = OUTER_WALL_T - INNER_WALL_T
    inner_half = INNER_WALL_T / 2
    by_point: dict[tuple[float, float], set[str]] = defaultdict(set)

    for edge in outer_edges:
        points = (
            (wx(edge["x1"], min_x), wy(edge["y1"], min_y)),
            (wx(edge["x2"], min_x), wy(edge["y2"], min_y)),
        )
        for x, y in points:
            by_point[(round(x, 4), round(y, 4))].add(edge["side"])

    rects: list[list[tuple[float, float]]] = []
    for (x, y), sides in by_point.items():
        if {"north", "west"}.issubset(sides):
            rects.append([
                (x - inner_half - extra, y - inner_half - extra),
                (x + inner_half, y - inner_half - extra),
                (x + inner_half, y + inner_half),
                (x - inner_half - extra, y + inner_half),
            ])
        if {"north", "east"}.issubset(sides):
            rects.append([
                (x - inner_half, y - inner_half - extra),
                (x + inner_half + extra, y - inner_half - extra),
                (x + inner_half + extra, y + inner_half),
                (x - inner_half, y + inner_half),
            ])
        if {"south", "west"}.issubset(sides):
            rects.append([
                (x - inner_half - extra, y - inner_half),
                (x + inner_half, y - inner_half),
                (x + inner_half, y + inner_half + extra),
                (x - inner_half - extra, y + inner_half + extra),
            ])
        if {"south", "east"}.issubset(sides):
            rects.append([
                (x - inner_half, y - inner_half),
                (x + inner_half + extra, y - inner_half),
                (x + inner_half + extra, y + inner_half + extra),
                (x - inner_half, y + inner_half + extra),
            ])

    return rects


def corner_square(
    cx: float, cy: float, half: float
) -> list[tuple[float, float]]:
    """볼록 꼭짓점 채움용 정사각형."""
    return [
        (cx - half, cy - half), (cx + half, cy - half),
        (cx + half, cy + half), (cx - half, cy + half),
    ]


def endpoint_squares_for_edges(
    edges: list[dict[str, Any]],
    min_x: float,
    min_y: float,
    half: float,
) -> list[list[tuple[float, float]]]:
    squares: list[list[tuple[float, float]]] = []
    seen: set[tuple[float, float]] = set()

    for edge in edges:
        points = (
            (wx(edge["x1"], min_x), wy(edge["y1"], min_y)),
            (wx(edge["x2"], min_x), wy(edge["y2"], min_y)),
        )
        for x, y in points:
            key = (round(x, 4), round(y, 4))
            if key in seen:
                continue
            seen.add(key)
            squares.append(corner_square(x, y, half))

    return squares


def point_on_wall_segment(
    px: float,
    py: float,
    edge: dict[str, Any],
    min_x: float,
    min_y: float,
) -> bool:
    x1, y1 = wx(edge["x1"], min_x), wy(edge["y1"], min_y)
    x2, y2 = wx(edge["x2"], min_x), wy(edge["y2"], min_y)

    if abs(x1 - x2) < 1e-6:
        return abs(px - x1) < 1e-6 and min(y1, y2) <= py <= max(y1, y2)

    return abs(py - y1) < 1e-6 and min(x1, x2) <= px <= max(x1, x2)


def wall_junction_squares(
    outer_edges: list[dict[str, Any]],
    inner_walls: list[dict[str, Any]],
    min_x: float,
    min_y: float,
) -> list[list[tuple[float, float]]]:
    wall_edges: list[tuple[dict[str, Any], float]] = [
        *((edge, OUTER_WALL_T / 2) for edge in outer_edges),
        *((wall, INNER_WALL_T / 2) for wall in inner_walls),
    ]

    junctions: dict[tuple[float, float], float] = {}
    for edge, half in wall_edges:
        endpoints = (
            (wx(edge["x1"], min_x), wy(edge["y1"], min_y)),
            (wx(edge["x2"], min_x), wy(edge["y2"], min_y)),
        )
        for px, py in endpoints:
            max_half = half
            for other, other_half in wall_edges:
                if point_on_wall_segment(px, py, other, min_x, min_y):
                    max_half = max(max_half, other_half)

            key = (round(px, 4), round(py, 4))
            junctions[key] = max(junctions.get(key, 0), max_half)

    return [corner_square(x, y, half) for (x, y), half in junctions.items()]


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


def svg_north_arrow(cx: float, cy: float, size: float = 28.0) -> list[str]:
    """North arrow symbol: filled arrowhead pointing up + 'N' label below."""
    # Arrow shaft
    half_shaft = size * 0.12
    shaft_top = cy - size * 0.55
    shaft_bottom = cy + size * 0.05
    # Arrowhead (filled triangle)
    tip_y = cy - size * 0.72
    head_base_y = cy - size * 0.35
    head_half = size * 0.22
    # Circle background
    els = [
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{size * 0.72:.2f}" '
        f'fill="none" stroke="#555555" stroke-width="1.2" />',
        # Left filled half (black)
        f'<polygon points="{cx:.2f},{tip_y:.2f} {cx - head_half:.2f},{head_base_y:.2f} '
        f'{cx:.2f},{shaft_bottom:.2f}" fill="#222222" stroke="none" />',
        # Right outline half (white)
        f'<polygon points="{cx:.2f},{tip_y:.2f} {cx + head_half:.2f},{head_base_y:.2f} '
        f'{cx:.2f},{shaft_bottom:.2f}" fill="#f8f8f8" stroke="#222222" stroke-width="0.8" />',
        # 'N' label
        f'<text x="{cx:.2f}" y="{cy + size * 0.48:.2f}" text-anchor="middle" '
        f'dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{size * 0.45:.0f}" font-weight="bold" fill="#222222">N</text>',
    ]
    return els


def svg_scale_bar(
    x: float, y: float,
    scale_px_per_m: float,
    bar_m: float = 5.0,
) -> list[str]:
    """Horizontal scale bar showing bar_m metres."""
    bar_px = bar_m * scale_px_per_m
    tick_h = 5.0
    font_size = 11
    els = [
        # Main bar line
        f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x + bar_px:.2f}" y2="{y:.2f}" '
        f'stroke="#555555" stroke-width="1.5" stroke-linecap="square" />',
        # Left tick
        f'<line x1="{x:.2f}" y1="{y - tick_h:.2f}" x2="{x:.2f}" y2="{y + tick_h:.2f}" '
        f'stroke="#555555" stroke-width="1.5" stroke-linecap="square" />',
        # Right tick
        f'<line x1="{x + bar_px:.2f}" y1="{y - tick_h:.2f}" x2="{x + bar_px:.2f}" y2="{y + tick_h:.2f}" '
        f'stroke="#555555" stroke-width="1.5" stroke-linecap="square" />',
        # Mid tick at bar_m/2
        f'<line x1="{x + bar_px / 2:.2f}" y1="{y - tick_h * 0.6:.2f}" x2="{x + bar_px / 2:.2f}" y2="{y + tick_h * 0.6:.2f}" '
        f'stroke="#555555" stroke-width="1.0" stroke-linecap="square" />',
        # "0" label
        f'<text x="{x:.2f}" y="{y - tick_h - 3:.2f}" text-anchor="middle" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{font_size}" fill="#555555">0</text>',
        # End label
        f'<text x="{x + bar_px:.2f}" y="{y - tick_h - 3:.2f}" text-anchor="middle" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{font_size}" fill="#555555">{bar_m:.0f}m</text>',
    ]
    return els


def build_svg(plan_geometry: dict[str, Any]) -> str:
    min_x, min_y, max_x, max_y = compute_bounds(plan_geometry)

    plan_w_px = (max_x - min_x) * SCALE
    plan_h_px = (max_y - min_y) * SCALE

    # Proportional annotation sizes
    # North arrow radius: ~2.5% of the shorter plan dimension, clamped 24–60 px
    metrics = annotation_metrics(plan_w_px, plan_h_px)
    arrow_size = metrics["arrow_size"]

    # Scale bar: 5 grid units (= 2.5 m), but choose sensible bar_m
    # px_per_m = SCALE / 0.5 = SCALE * 2  (grid_unit = 0.5 m)
    px_per_m = metrics["px_per_m"]
    bar_m = metrics["bar_m"]

    # Extra bottom margin for annotations
    BOTTOM_ANNOT = metrics["bottom_annot"]
    canvas_w = int(plan_w_px + PADDING * 2)
    canvas_h = int(plan_h_px + PADDING * 2 + BOTTOM_ANNOT)

    els: list[str] = []

    # ① 공간 채우기 (방 유형별 색상)
    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        fill = space.get("fill_color", SPACE_FILL)
        els.append(svg_poly(pts, fill))

    # ② 모든 벽 중심선은 내부벽 두께로 먼저 맞춘다.
    outer_edges = plan_geometry.get("outer_edges", [])
    for e in outer_edges:
        x1, y1 = wx(e["x1"], min_x), wy(e["y1"], min_y)
        x2, y2 = wx(e["x2"], min_x), wy(e["y2"], min_y)
        els.append(svg_poly(wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR))

    # ③ 외벽은 바깥 방향으로만 추가 두께를 더한다.
    for e in outer_edges:
        els.append(svg_poly(outer_wall_extension_rect(e, min_x, min_y), WALL_COLOR))

    for rect in outer_corner_extension_rects(outer_edges, min_x, min_y):
        els.append(svg_poly(rect, WALL_COLOR))

    # ④ 내부 벽
    inner_walls = plan_geometry.get("inner_walls", [])
    for w in plan_geometry.get("inner_walls", []):
        x1, y1 = wx(w["x1"], min_x), wy(w["y1"], min_y)
        x2, y2 = wx(w["x2"], min_x), wy(w["y2"], min_y)
        els.append(svg_poly(wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR))

    # ⑤ 개구부 / 창문 — 벽 지우기 후 창문 선
    for op in plan_geometry.get("openings", []):
        x1, y1 = wx(op["x1"], min_x), wy(op["y1"], min_y)
        x2, y2 = wx(op["x2"], min_x), wy(op["y2"], min_y)
        is_ext = op.get("placement") == "exterior"
        cut = (
            exterior_opening_cut_rect(x1, y1, x2, y2, op.get("host_side", "north"))
            if is_ext
            else wall_rect(x1, y1, x2, y2, INNER_WALL_T + 2)
        )
        els.append(svg_poly(cut, SPACE_FILL))
        if op.get("kind") == "window":
            for wx1, wy1, wx2, wy2 in window_symbol_lines(x1, y1, x2, y2, op.get("host_side", "north")):
                els.append(svg_line(wx1, wy1, wx2, wy2, WINDOW_COLOR, 1.5))

    # ⑥ 라벨 (room name + area)
    for label in plan_geometry.get("labels", []):
        lx = wx(label["x"], min_x)
        ly = wy(label["y"], min_y)
        area_m2 = label.get("area_m2")
        if area_m2 is not None:
            # Two-line: name slightly above centre, area slightly below
            line_gap = LABEL_FONT_SIZE * 0.75
            els.append(svg_text(lx, ly - line_gap / 2, label["text"], LABEL_FONT_SIZE, LABEL_COLOR))
            area_text = f"{area_m2:.1f} m\u00b2"
            els.append(svg_text(lx, ly + line_gap, area_text, LABEL_FONT_SIZE - 4, "#777777"))
        else:
            els.append(svg_text(lx, ly, label["text"], LABEL_FONT_SIZE, LABEL_COLOR))

    # ⑦ 북쪽 화살표 + 축척 바 — 평면도 아래 여백에 배치
    annot_y_center = PADDING + plan_h_px + BOTTOM_ANNOT / 2
    # Arrow on the right side of the bottom annotation strip
    arrow_cx = PADDING + plan_w_px - arrow_size * 0.72 - 8.0
    arrow_cy = annot_y_center
    els.extend(svg_north_arrow(arrow_cx, arrow_cy, size=arrow_size))
    # Scale bar left-aligned in the annotation strip
    bar_x = PADDING + 8.0
    bar_y = annot_y_center
    els.extend(svg_scale_bar(bar_x, bar_y, px_per_m, bar_m))

    body = "\n  ".join(els)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{canvas_w}" height="{canvas_h}" '
        f'viewBox="0 0 {canvas_w} {canvas_h}" '
        f'preserveAspectRatio="xMidYMid meet">\n'
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
    plan_w_px = (max_x - min_x) * SCALE
    plan_h_px = (max_y - min_y) * SCALE
    metrics = annotation_metrics(plan_w_px, plan_h_px)
    canvas_w = int(plan_w_px + PADDING * 2)
    canvas_h = int(plan_h_px + PADDING * 2 + metrics["bottom_annot"])

    image = Image.new("RGB", (canvas_w, canvas_h), BG_COLOR)
    draw = ImageDraw.Draw(image)

    # ① 공간 채우기 (방 유형별 색상)
    for space in plan_geometry.get("spaces", []):
        pts = [(wx(x, min_x), wy(y, min_y)) for x, y in space["polygon"]]
        fill = space.get("fill_color", SPACE_FILL)
        draw.polygon(pts, fill=fill)

    # ② 모든 벽 중심선은 내부벽 두께로 먼저 맞춘다.
    outer_edges = plan_geometry.get("outer_edges", [])
    for e in outer_edges:
        x1, y1 = wx(e["x1"], min_x), wy(e["y1"], min_y)
        x2, y2 = wx(e["x2"], min_x), wy(e["y2"], min_y)
        _draw_wall_rect(draw, wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR)

    # ③ 외벽은 바깥 방향으로만 추가 두께를 더한다.
    for e in outer_edges:
        _draw_wall_rect(draw, outer_wall_extension_rect(e, min_x, min_y), WALL_COLOR)

    for rect in outer_corner_extension_rects(outer_edges, min_x, min_y):
        _draw_wall_rect(draw, rect, WALL_COLOR)

    # ④ 내부 벽
    inner_walls = plan_geometry.get("inner_walls", [])
    for w in inner_walls:
        x1, y1 = wx(w["x1"], min_x), wy(w["y1"], min_y)
        x2, y2 = wx(w["x2"], min_x), wy(w["y2"], min_y)
        _draw_wall_rect(draw, wall_rect(x1, y1, x2, y2, INNER_WALL_T), WALL_COLOR)

    # ⑤ 개구부 / 창문
    font = load_font(LABEL_FONT_SIZE)
    for op in plan_geometry.get("openings", []):
        x1, y1 = wx(op["x1"], min_x), wy(op["y1"], min_y)
        x2, y2 = wx(op["x2"], min_x), wy(op["y2"], min_y)
        is_ext = op.get("placement") == "exterior"
        cut = (
            exterior_opening_cut_rect(x1, y1, x2, y2, op.get("host_side", "north"))
            if is_ext
            else wall_rect(x1, y1, x2, y2, INNER_WALL_T + 2)
        )
        _draw_wall_rect(draw, cut, SPACE_FILL)
        if op.get("kind") == "window":
            for wx1, wy1, wx2, wy2 in window_symbol_lines(x1, y1, x2, y2, op.get("host_side", "north")):
                draw.line([(wx1, wy1), (wx2, wy2)], fill=WINDOW_COLOR, width=1)

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

    annot_y_center = PADDING + plan_h_px + metrics["bottom_annot"] / 2
    bar_x = PADDING + 8.0
    bar_y = annot_y_center
    bar_px = metrics["bar_m"] * metrics["px_per_m"]
    small_font = load_font(11)

    draw.line([(bar_x, bar_y), (bar_x + bar_px, bar_y)], fill="#555555", width=2)
    for tick_x, tick_h in (
        (bar_x, 5.0),
        (bar_x + bar_px / 2, 3.0),
        (bar_x + bar_px, 5.0),
    ):
        draw.line([(tick_x, bar_y - tick_h), (tick_x, bar_y + tick_h)], fill="#555555", width=1)
    draw.text((bar_x - 3, bar_y - 22), "0", fill="#555555", font=small_font)
    draw.text((bar_x + bar_px - 10, bar_y - 22), f"{metrics['bar_m']:.0f}m", fill="#555555", font=small_font)

    arrow_size = metrics["arrow_size"]
    arrow_cx = PADDING + plan_w_px - arrow_size * 0.72 - 8.0
    arrow_cy = annot_y_center
    radius = arrow_size * 0.72
    draw.ellipse(
        [(arrow_cx - radius, arrow_cy - radius), (arrow_cx + radius, arrow_cy + radius)],
        outline="#555555",
        width=1,
    )
    tip_y = arrow_cy - arrow_size * 0.72
    base_y = arrow_cy - arrow_size * 0.35
    head_half = arrow_size * 0.22
    shaft_bottom = arrow_cy + arrow_size * 0.05
    draw.polygon(
        [(arrow_cx, tip_y), (arrow_cx - head_half, base_y), (arrow_cx, shaft_bottom)],
        fill="#222222",
    )
    draw.polygon(
        [(arrow_cx, tip_y), (arrow_cx + head_half, base_y), (arrow_cx, shaft_bottom)],
        fill="#f8f8f8",
        outline="#222222",
    )
    draw.text((arrow_cx - 4, arrow_cy + arrow_size * 0.34), "N", fill="#222222", font=small_font)

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
