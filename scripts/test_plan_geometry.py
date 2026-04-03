from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.plan_geometry_service import convert_layout_file_to_plan_geometry

layout_path = PROJECT_ROOT / "artifacts" / "layouts" / "case_001.json"
# layout_path = PROJECT_ROOT / "artifacts" / "layouts" / "case_001.layout.json"

result_path = convert_layout_file_to_plan_geometry(layout_path)
print("saved:", result_path)