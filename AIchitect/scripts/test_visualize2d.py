from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.visualize2d_service import render_plan_geometry_file

plan_geometry_path = PROJECT_ROOT / "artifacts" / "plan_geometry" / "case_001.plan_geometry.json"
svg_path, png_path = render_plan_geometry_file(plan_geometry_path)

print("saved svg:", svg_path)
print("saved png:", png_path)