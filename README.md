# AIchitect (AI + Architect)
**2026년 국민대학교 소프트웨어융합대학 캡스톤 10팀**

## 1. 프로젝트 소개
**"자연어 요구사항을 바탕으로 설명 가능한 건축 도면을 자동 생성하는 설계 엔진"**

AIchitect는 사용자의 자연어(문장) 설계 요구를 입력받아, 건축 지식 기반의 방 목록과 관계 규칙으로 변환하고, 그 규칙을 바탕으로 블록을 배치한 뒤 벽/창/문이 있는 2D 도면 및 3D 렌더링으로 만들어주는 프로젝트입니다. 
단순히 이미지를 그럴듯하게 생성하는 것을 넘어, **방과 방 사이의 관계 점수, 모듈화된 공간 속성, 채광, 현관과 도로의 관계 등 실제 건축가의 사고 과정을 데이터와 규칙으로 구조화(GraphDB/Ontology 확장)**하여 도면을 생성합니다.

## 2. 소개 영상
<!-- 유튜브 등 프로젝트 소개 영상 링크를 아래에 추가하세요 -->
[![프로젝트 소개 영상](https://img.youtube.com/vi/YOUR_VIDEO_ID/0.jpg)](https://youtu.be/6OoxO3GtnDc)

*(위의 `YOUR_VIDEO_ID` 부분을 실제 유튜브 영상 ID로 변경해 주세요)*

## 3. 팀 소개
| 이름 | 학번 | 역할 (Role) | GitHub |
|:---:|:---:|:---|:---|
| 정수한 | 20193218 | Full-stack & 핵심 엔진 공동 개발 (백엔드, 프론트엔드, 3D/2D 도면 알고리즘) | [@Swan-1111](https://github.com/Swan-1111) |
| 이창록 | 20213159 | Full-stack & 핵심 엔진 공동 개발 (백엔드, 프론트엔드, 3D/2D 도면 알고리즘) | [@leegwanho-code](https://github.com/leegwanho-code) |


## 4. 사용법
본 프로젝트는 Python(FastAPI) 백엔드와 React(Vite) 프론트엔드로 구성되어 있습니다.

### 백엔드 (설계 엔진) 실행
```bash
# 필수 패키지 설치
pip install -r requirements.txt

# 서버 실행
python -m uvicorn app.server:app --reload
```

### 프론트엔드 (웹 인터페이스) 실행
```bash
cd frontend_local_test
npm install
npm run dev
```

## 5. 기타
### 파이프라인 흐름
`자연어 요구` → `내부 주문서 (Normalize)` → `배치 규칙 (Rules)` → `블록 좌표 배치 (Layout)` → `벽/창문/오프닝 기하 생성 (Geometry)` → `2D 도면 / 3D 렌더링 시각화`

자세한 내부 동작 방식은 `PROJECT_OVERVIEW_KR.md` 파일을 참고해 주세요.
