---
layout: default
---

# AIchitect (AI + Architect)

**2026 국민대학교 캡스톤디자인 10팀**  
AIchitect는 자연어를 바로 이미지로 바꾸는 프로젝트가 아니라, 건축가의 사고 과정을 데이터와 규칙으로 구조화해 도면을 생성하는 프로젝트입니다.

---

## 1. 프로젝트 소개
AIchitect는 사용자의 자연어 설계 요구를 받아서, 건축 지식 기반의 방 목록과 관계 규칙으로 바꾸고, 그 규칙을 바탕으로 블록을 배치한 뒤, 벽/창/문/오프닝이 있는 2D 도면과 3D 렌더링 재료를 만드는 엔진입니다.

**주요 특징**
- **모듈화 기반 설계:** 공간을 단순한 사각형이 아니라 크기, 창문, 성격(zone)을 가진 모듈로 취급
- **설명 가능한 배치:** 향, 도로 방향, 방 사이의 관계 점수를 계산하여 최적의 위치 결정
- **2D/3D 확장:** 2D 도면 좌표를 바탕으로 3D 웹 뷰어로 시각화하여 사용자가 쉽게 확인 가능

## 2. 소개 영상
<!-- 영상이 준비되면 아래 iframe의 YOUR_VIDEO_ID를 교체하세요 -->
<iframe width="100%" height="450" src="https://www.youtube.com/embed/YOUR_VIDEO_ID" frameborder="0" allowfullscreen></iframe>

## 3. 팀 소개
- **정수한 (20193218)**: Full-stack & 핵심 엔진 공동 개발 (백엔드, 프론트엔드, 알고리즘)
- **이창록 (20213159)**: Full-stack & 핵심 엔진 공동 개발 (백엔드, 프론트엔드, 알고리즘)

## 4. 파이프라인 작동 순서
1. `normalize_service.py`: 자연어 JSON 정리
2. `rules_service.py`: 배치 규칙 생성
3. `layout_service.py`: 방 블록 배치 (핵심 엔진)
4. `layout_postprocess_service.py`: 배치 후처리
5. `plan_geometry_service.py`: 벽/창/문 도면 기하 생성
6. `visualize2d_service.py`: SVG/PNG 렌더링

## 5. 사용법
자세한 설치 및 실행 방법은 [GitHub Repository](https://github.com/kookmin-sw/2026-capstone-10)의 `README.md`를 참고해 주세요.
