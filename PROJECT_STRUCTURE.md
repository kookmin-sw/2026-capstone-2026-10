# AIchitect — 프로젝트 구조 문서

AI와의 대화를 통해 건축 설계 요구사항을 수집하고, 2D 도면과 3D 렌더링을 자동 생성하는 모듈러 건축 설계 시스템.

---

## 파일 트리

```
AIchitect_fin/
├── app/                                     # 백엔드 (FastAPI)
│   ├── main.py                              # 스탠드얼론 실행: LLM JSON → 정규화 → 규칙 생성 → 저장
│   ├── server.py                            # FastAPI 서버, POST /generate-svg 엔드포인트
│   └── services/                            # 파이프라인 핵심 로직
│       ├── normalize_service.py             # [Step 1] LLM 원본 JSON → 내부 표준 포맷 변환
│       ├── rules_service.py                 # [Step 2] 내부 포맷 → 공간 배치 규칙 생성
│       ├── layout_service.py                # [Step 3] 배치 규칙 → 2D 좌표 레이아웃 생성
│       ├── layout_postprocess_service.py    # [Step 3.5] 레이아웃 수직 압축 최적화
│       ├── plan_geometry_service.py         # [Step 4] 레이아웃 → 벽/개구부/윈도우 기하 데이터
│       ├── visualize2d_service.py           # [Step 5] 기하 데이터 → SVG / PNG 생성
│       └── compose2d_service.py             # (미구현, 향후 확장용)
│
├── scripts/                                 # 배치 실행 / 테스트 스크립트
│   ├── run_full_pipeline.py                 # 전체 파이프라인 일괄 실행 + contact sheet 생성
│   ├── run_batch_tests.py                   # 다중 케이스 순차 실행, 모든 중간 산출물 저장
│   ├── render_all_cases.py                  # 기존 layout 파일 → PNG 재렌더링
│   ├── test_compact_layout.py               # 레이아웃 압축 단위 테스트
│   ├── test_plan_geometry.py                # 기하학 변환 단위 테스트
│   └── test_visualize2d.py                  # SVG/PNG 시각화 단위 테스트
│
├── data/                                    # 설계 규칙 및 예제 데이터
│   ├── blocks/                              # 공간 모듈 물리 속성 정의
│   │   ├── bedroom.json                     # 침실 (3m × 4m, zone: private)
│   │   ├── bathroom.json                    # 욕실
│   │   ├── kitchen.json                     # 주방
│   │   ├── living_room.json                 # 거실
│   │   ├── workspace.json                   # 작업실
│   │   ├── entrance.json                    # 현관
│   │   ├── connector.json                   # 복도/연결부
│   │   ├── vertical_core.json               # 계단/코어
│   │   └── module_system.json               # 모듈 시스템 메타 규칙
│   │
│   ├── ontology/                            # 건축 개념 및 제약 조건
│   │   ├── concepts.json                    # 공간별 zone·trait 속성 정의
│   │   ├── aliases.json                     # 사용자 입력 → 표준 용어 매핑
│   │   ├── relations.json                   # 공간 간 인접/연결 규칙
│   │   └── constraints.json                 # 레이아웃 제약 조건
│   │
│   └── examples/
│       └── sample_requests.json             # 테스트용 샘플 요청 7개 (case_001~007)
│
├── artifacts/                               # 파이프라인 중간 산출물 (자동 생성)
│   ├── raw_llm/                             # Step 0: LLM 원본 JSON
│   ├── internal_orders/                     # Step 1: 정규화된 내부 포맷
│   ├── placement_rules/                     # Step 2: 배치 규칙
│   ├── layouts/                             # Step 3: 2D 좌표 레이아웃
│   ├── plan_geometry/                       # Step 4: 기하학 도면 데이터
│   └── images_2d/                           # Step 5: 최종 SVG / PNG 이미지
│
├── frontend_local_test/                     # React 19 + Vite 프론트엔드
│   ├── index.html                           # HTML 진입점
│   ├── package.json                         # 의존성 (React 19.2.4, Vite)
│   ├── vite.config.js                       # Vite 빌드 설정
│   └── src/
│       ├── main.jsx                         # React 앱 부트스트랩 (StrictMode)
│       ├── App.jsx                          # 메인 컴포넌트 — 전체 UI + 파이프라인 연결
│       ├── App.css                          # 컴포넌트 스타일 (레이아웃, 채팅 UI, 패널)
│       └── index.css                        # 글로벌 스타일 (색상 변수, 폰트, 스크롤바)
│
├── tests/                                   # (미구현, 향후 자동화 테스트용)
├── requirements.txt                         # Python 의존성
├── .gitignore
└── PROJECT_STRUCTURE.md                     # 이 문서
```

---

## 파이프라인 흐름

```
사용자 입력 (프론트엔드 채팅)
        ↓
  Gemini 2.5 Flash  ← 요구사항 대화 수집 → JSON 반환
        ↓
  POST /generate-svg  (app/server.py)
        ↓
[Step 1]  normalize_service     — LLM JSON → 내부 표준 포맷
        ↓
[Step 2]  rules_service         — 내부 포맷 → 배치 규칙
        ↓
[Step 3]  layout_service        — 배치 규칙 → 2D 좌표 레이아웃
        ↓
[Step 3.5] layout_postprocess   — 수직 압축 최적화
        ↓
[Step 4]  plan_geometry_service — 좌표 → 벽/개구부/윈도우 기하 데이터
        ↓
[Step 5]  visualize2d_service   — 기하 데이터 → SVG 문자열
        ↓
  프론트엔드 2D 도면 표시
        ↓
  generate3dRender()  — SVG → PNG base64 → Gemini 3.1 Flash Image
        ↓
  프론트엔드 3D 렌더링 표시
```

---

## 각 서비스 상세

| 파일 | 입력 | 출력 | 주요 함수 |
|------|------|------|-----------|
| `normalize_service.py` | LLM raw JSON | 내부 표준 포맷 | `normalize_llm_json()`, `validate_internal_format()` |
| `rules_service.py` | 내부 포맷 | 배치 규칙 JSON | `generate_placement_rules()` |
| `layout_service.py` | 배치 규칙 | 2D 좌표 레이아웃 | `generate_layout_from_rules()` |
| `layout_postprocess_service.py` | 레이아웃 | 압축된 레이아웃 | `compact_layout_data()` |
| `plan_geometry_service.py` | 레이아웃 | 기하학 도면 데이터 | `build_plan_geometry()` |
| `visualize2d_service.py` | 기하 데이터 | SVG 문자열 / PNG | `build_svg()`, `build_png()` |

---

## 프론트엔드 (App.jsx) 주요 기능

| 기능 | 설명 |
|------|------|
| 대화 UI | Gemini 2.5 Flash와 채팅, 요구사항 3가지 수집 후 `status: complete` 반환 |
| 2D 도면 표시 | 백엔드 SVG 수신 후 패널에 렌더링, viewBox 유지로 비율 보존 |
| 3D 렌더링 | 2D SVG → PNG base64 변환 후 Gemini 3.1 Flash Image에 멀티모달 전송 |
| 진행 상태 | 3D 렌더링 중 0→100% 프로그레스바 표시 |
| 내보내기 | 2D: PNG / SVG / PDF, 3D: PNG / SVG / PDF |
| 공유 | 현재 페이지 URL 클립보드 복사 또는 Web Share API |

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| 백엔드 | Python 3, FastAPI, Pydantic, Uvicorn |
| AI 모델 | Gemini 2.5 Flash (대화), Gemini 3.1 Flash Image — Nano Banana 2 (이미지 생성) |
| 이미지 처리 | Pillow (PIL) |
| 프론트엔드 | React 19, Vite, CSS |
| 시각화 | SVG (벡터 도면), PNG (래스터 내보내기) |

---

## 실행 방법

```bash
# 백엔드 서버
cd AIchitect_fin
uvicorn app.server:app --reload        # http://localhost:8000

# 프론트엔드
cd frontend_local_test
npm install
npm run dev                            # http://localhost:5173

# 배치 처리
python scripts/run_full_pipeline.py    # 전체 파이프라인 (7개 케이스)
python scripts/run_batch_tests.py      # 산출물 포함 배치 테스트
python scripts/render_all_cases.py     # 기존 레이아웃 재렌더링
```
