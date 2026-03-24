from __future__ import annotations

from pathlib import Path
from typing import Any


SPACE_COLOR_MAP = {
    "entrance": "#B0BEC5",
    "living_room": "#F2D15B",
    "kitchen": "#F28A65",
    "bedroom": "#81C784",
    "workspace": "#64B5F6",
    "bathroom": "#D9D9D9",
    "vertical_core": "#9E9E9E",
    "connector": "#CFCFCF"
}

BAND_BG_MAP = {
    "public": "#FAFAFA",
    "core": "#F5F5F5",
    "connector": "#F8F8F8",
    "private": "#FCFCFC",
    "quiet": "#F7FBFF"
}


def _get_rect_height(item: dict[str, Any]) -> float:
    if "depth" in item:
        return item["depth"]
    return item["height"]


def render_layout_to_svg(layout: dict[str, Any], output_path: Path) -> None:
    placements = layout.get("placements", [])
    if not placements:
        raise ValueError("layout에 placements가 없습니다.")

    scale = 40
    padding = 40
    title_height = 50

    max_x = max(item["x"] + item["width"] for item in placements)
    max_y = max(item["y"] + _get_rect_height(item) for item in placements)

    svg_width = int(max_x * scale + padding * 2)
    svg_height = int(max_y * scale + padding * 2 + title_height)

    bands = layout.get("meta", {}).get("bands", {})

    svg_parts: list[str] = []

    svg_parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" '
        f'viewBox="0 0 {svg_width} {svg_height}">'
    )

    # 배경
    svg_parts.append(f'<rect x="0" y="0" width="{svg_width}" height="{svg_height}" fill="#ffffff"/>')

    # 제목
    svg_parts.append(
        f'<text x="{svg_width/2}" y="30" text-anchor="middle" '
        f'font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#222">'
        f'Modular Layout Preview</text>'
    )

    # band 배경
    band_height = 6 * scale
    for band_name, band_y in bands.items():
        y_px = padding + title_height + band_y * scale
        fill = BAND_BG_MAP.get(band_name, "#FAFAFA")
        svg_parts.append(
            f'<rect x="{padding}" y="{y_px}" width="{max_x * scale}" height="{band_height}" '
            f'fill="{fill}" stroke="none"/>'
        )
        svg_parts.append(
            f'<text x="{padding - 10}" y="{y_px + 24}" text-anchor="end" '
            f'font-family="Arial, sans-serif" font-size="12" fill="#666">{band_name}</text>'
        )

    # 그리드
    for gx in range(0, int(max_x) + 2):
        x_px = padding + gx * scale
        y1 = padding + title_height
        y2 = padding + title_height + max_y * scale
        svg_parts.append(
            f'<line x1="{x_px}" y1="{y1}" x2="{x_px}" y2="{y2}" stroke="#e6e6e6" stroke-width="1"/>'
        )

    for gy in range(0, int(max_y) + 2):
        y_px = padding + title_height + gy * scale
        x1 = padding
        x2 = padding + max_x * scale
        svg_parts.append(
            f'<line x1="{x1}" y1="{y_px}" x2="{x2}" y2="{y_px}" stroke="#e6e6e6" stroke-width="1"/>'
        )

    # 블록
    for item in placements:
        x = item["x"]
        y = item["y"]
        w = item["width"]
        h = _get_rect_height(item)

        x_px = padding + x * scale
        y_px = padding + title_height + y * scale
        w_px = w * scale
        h_px = h * scale

        space_type = item["space_type"]
        family = item.get("family", "")
        band = item.get("band", "")
        color = SPACE_COLOR_MAP.get(space_type, "#CCCCCC")

        svg_parts.append(
            f'<rect x="{x_px}" y="{y_px}" width="{w_px}" height="{h_px}" '
            f'rx="6" ry="6" fill="{color}" stroke="#111" stroke-width="2"/>'
        )

        label_main = space_type
        label_sub = f"{w}x{h}"
        label_small = family if family else band

        cx = x_px + w_px / 2
        cy = y_px + h_px / 2

        svg_parts.append(
            f'<text x="{cx}" y="{cy - 8}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#111">'
            f'{label_main}</text>'
        )
        svg_parts.append(
            f'<text x="{cx}" y="{cy + 10}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="11" fill="#222">'
            f'({label_sub})</text>'
        )
        svg_parts.append(
            f'<text x="{cx}" y="{cy + 26}" text-anchor="middle" '
            f'font-family="Arial, sans-serif" font-size="10" fill="#555">'
            f'{label_small}</text>'
        )

    # 외곽 프레임
    svg_parts.append(
        f'<rect x="{padding}" y="{padding + title_height}" width="{max_x * scale}" height="{max_y * scale}" '
        f'fill="none" stroke="#999" stroke-width="1.5"/>'
    )

    svg_parts.append("</svg>")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_parts))
