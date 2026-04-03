from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.layout_postprocess_service import compact_layout_file

layout_path = PROJECT_ROOT / "artifacts" / "layouts" / "case_001.json"

result_path = compact_layout_file(
    layout_path=layout_path,
    output_path=layout_path,   # 기존 파일 덮어쓰기
    vertical_gap=0.0,
)

print("saved compacted layout:", result_path)