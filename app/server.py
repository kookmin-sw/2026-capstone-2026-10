"""
FastAPI 백엔드 서버
Gemini에서 받은 raw 입력을 파이프라인으로 처리해 SVG를 반환합니다.

실행 방법:
    cd AIchitect_fin
    uvicorn app.server:app --reload
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.normalize_service import normalize_llm_json, validate_internal_format
from app.services.rules_service import generate_placement_rules
from app.services.layout_service import generate_layout_from_rules
from app.services.layout_postprocess_service import compact_layout_data
from app.services.plan_geometry_service import build_plan_geometry
from app.services.visualize2d_service import build_svg


app = FastAPI(title="AIchitect API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class RawInput(BaseModel):
    family_type: str = ""
    housing_type: str = "단독주택"
    road_facing: str = "남쪽"
    required_spaces: list[str] = []
    preferences: list[str] = []


@app.post("/generate-svg")
def generate_svg(body: RawInput) -> dict:
    try:
        raw = body.model_dump()
        normalized = normalize_llm_json(raw)
        validated = validate_internal_format(normalized)
        rules = generate_placement_rules(validated)
        layout = generate_layout_from_rules(rules)
        layout = compact_layout_data(layout)
        plan_geometry = build_plan_geometry(layout)
        svg = build_svg(plan_geometry)
        return {"svg": svg, "plan_geometry": plan_geometry}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
