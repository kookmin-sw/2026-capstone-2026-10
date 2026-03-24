from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle


COLOR_MAP = {
    "entrance": "#B0BEC5",     # 회색
    "living_room": "#FFD54F",  # 노랑
    "kitchen": "#FF8A65",      # 주황
    "bedroom": "#81C784",      # 초록
    "workspace": "#64B5F6"     # 파랑
}


def render_layout_to_png(layout: dict[str, Any], output_path: Path) -> None:
    placements = layout.get("placements", [])
    if not placements:
        raise ValueError("layout에 placements가 없습니다.")

    # 전체 도면 크기 계산
    max_x = max(item["x"] + item["width"] for item in placements)
    max_y = max(item["y"] + item["height"] for item in placements)

    fig, ax = plt.subplots(figsize=(10, 6))

    for item in placements:
        x = item["x"]
        y = item["y"]
        w = item["width"]
        h = item["height"]
        space_type = item["space_type"]

        color = COLOR_MAP.get(space_type, "#CCCCCC")

        rect = Rectangle(
            (x, y), w, h,
            facecolor=color,
            edgecolor="black",
            linewidth=1.5
        )
        ax.add_patch(rect)

        # 라벨
        label = f"{space_type}\n({w}x{h})"
        ax.text(
            x + w / 2,
            y + h / 2,
            label,
            ha="center",
            va="center",
            fontsize=9
        )

    # 축 / 범위 설정
    ax.set_xlim(0, max_x + 2)
    ax.set_ylim(max_y + 2, 0)   # 위에서 아래로 보이게 뒤집기
    ax.set_aspect("equal")
    ax.set_title("Rule-based 2D Layout", fontsize=14)
    ax.grid(True, linestyle="--", alpha=0.3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close(fig)