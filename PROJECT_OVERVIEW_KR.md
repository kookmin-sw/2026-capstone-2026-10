# AIchitect 프로젝트 이해 정리

## 1. 프로젝트 한 줄 요약

AIchitect는 사용자의 자연어 설계 요구를 받아서, 건축 지식 기반의 방 목록과 관계 규칙으로 바꾸고, 그 규칙을 바탕으로 블록을 배치한 뒤, 벽/창/문/오프닝이 있는 2D 도면과 3D 렌더링 재료를 만드는 프로젝트다.

핵심은 자연어를 바로 이미지로 만드는 것이 아니라, 중간에 건축적인 구조를 가진 데이터로 변환한다는 점이다.

```text
자연어 요구
→ 내부 주문서
→ 배치 규칙
→ 블록 좌표 배치
→ 벽/창문/오프닝 기하 생성
→ 2D 도면 / 3D 렌더링
```

## 2. 프로젝트 폴더 구조

```text
AIchitect_fin/
├─ app/
│  ├─ main.py
│  ├─ server.py
│  └─ services/
│     ├─ normalize_service.py
│     ├─ rules_service.py
│     ├─ layout_service.py
│     ├─ layout_postprocess_service.py
│     ├─ plan_geometry_service.py
│     ├─ visualize2d_service.py
│     └─ compose2d_service.py
├─ data/
│  ├─ blocks/
│  ├─ ontology/
│  └─ examples/
├─ artifacts/
├─ frontend_local_test/
├─ scripts/
└─ tests/
```

각 폴더의 역할은 다음과 같다.

| 폴더 | 역할 |
|---|---|
| `app/` | 백엔드 서버와 설계 엔진 |
| `app/services/` | 자연어 처리 이후의 핵심 설계 파이프라인 |
| `data/blocks/` | 방 블록의 크기, 성격, 창문, 연결면 정의 |
| `data/ontology/` | 공간 개념, 이름 매핑, 관계 점수, 제약 조건 |
| `data/examples/` | 테스트용 자연어 요청 케이스 |
| `artifacts/` | 파이프라인 결과물 저장 위치 |
| `frontend_local_test/` | React 기반 웹 인터페이스 |
| `scripts/` | 전체 파이프라인 실행 및 렌더링 스크립트 |

## 3. 전체 파이프라인

전체 흐름은 다음 순서로 진행된다.

```text
사용자 자연어 입력
→ normalize_service.py
→ rules_service.py
→ layout_service.py
→ layout_postprocess_service.py
→ plan_geometry_service.py
→ visualize2d_service.py
→ 2D 도면 / 3D 렌더링 입력
```

실제 서버에서는 `app/server.py`의 `/generate-svg` API가 이 흐름을 한 번에 실행한다.

```python
normalized = normalize_llm_json(raw)
validated = validate_internal_format(normalized)
rules = generate_placement_rules(validated)
layout = generate_layout_from_rules(rules)
layout = compact_layout_data(layout)
plan_geometry = build_plan_geometry(layout)
svg = build_svg(plan_geometry)
```

즉 서버는 여러 서비스를 순서대로 호출하는 조립 라인 역할을 한다.

## 4. 1단계: 자연어를 내부 주문서로 변환

담당 파일:

```text
app/services/normalize_service.py
```

이 단계에서는 사용자의 말을 컴퓨터가 이해하기 쉬운 내부 JSON으로 바꾼다.

예를 들어 사용자가 다음처럼 말한다고 하자.

```json
{
  "required_spaces": [
    "bedroom 1",
    "living_room 1",
    "kitchen",
    "workspace 1"
  ],
  "preferences": [
    "living room and kitchen should feel open to each other",
    "workspace should be quiet and slightly separated",
    "bedroom should stay away from the entrance"
  ],
  "road_facing": "south"
}
```

그러면 내부 주문서는 다음처럼 정리된다.

```json
{
  "occupancy": {
    "spaces": {
      "bedroom": 1,
      "living_room": 1,
      "kitchen": 1,
      "workspace": 1
    }
  },
  "site": {
    "road_facing": "south"
  },
  "relationship": [
    {
      "from": "kitchen",
      "to": "living_room",
      "type": "adjacent"
    }
  ],
  "space_traits": {
    "workspace": {
      "noise_level": "low",
      "privacy": "high"
    }
  }
}
```

이 단계에서 중요한 데이터 파일은 다음과 같다.

```text
data/ontology/aliases.json
data/ontology/concepts.json
```

`aliases.json`은 사용자가 다르게 말한 공간 이름을 표준 이름으로 바꿔준다.

```text
거실 / living room / living_room → living_room
주방 / kitchen → kitchen
침실 / bedroom → bedroom
복도 / corridor → connector
계단 / stair → vertical_core
```

`concepts.json`은 각 공간이 어떤 성격을 가지는지 정의한다.

```text
living_room → public
workspace → semi_private
bedroom → private
bathroom → private
entrance → public
```

## 5. 2단계: 내부 주문서를 배치 규칙으로 변환

담당 파일:

```text
app/services/rules_service.py
```

이 단계에서는 어떤 블록이 필요한지, 어떤 방끼리 가까워야 하는지, 어떤 방은 공용 공간과 떨어져야 하는지를 규칙으로 만든다.

출력 예시는 다음과 같다.

```json
{
  "required_blocks": [
    "entrance",
    "living_room",
    "kitchen",
    "workspace",
    "bedroom"
  ],
  "adjacency_preferences": [
    {
      "from": "kitchen",
      "to": "living_room",
      "score": 8
    },
    {
      "from": "entrance",
      "to": "living_room",
      "score": 5
    }
  ],
  "separation_preferences": [
    {
      "from": "bedroom",
      "to": "public_zone",
      "score": 5
    },
    {
      "from": "workspace",
      "to": "public_zone",
      "score": 6
    }
  ],
  "road_facing": "south"
}
```

이 단계에서 중요한 데이터 파일은 다음과 같다.

```text
data/ontology/relations.json
data/ontology/constraints.json
```

`relations.json`은 방과 방 사이의 관계 점수표다.

```text
kitchen - living_room: 8점
bathroom - master_bedroom: 9점
entrance - living_room: 5점
connector - bedroom: 6점
```

점수가 높을수록 가까이 배치하는 것이 좋다는 뜻이다.

`constraints.json`은 전체 배치에서 지켜야 하는 제약 조건 이름을 담고 있다.

```text
no_overlap
keep_window_edge_open
maintain_accessibility
```

## 6. 3단계: 블록 배치

담당 파일:

```text
app/services/layout_service.py
```

이 파일이 현재 프로젝트의 핵심 설계 엔진이다.

이 단계에서는 배치 규칙을 받아 실제 방 블록의 좌표를 만든다.

출력 예시는 다음과 같다.

```json
{
  "id": "living_room_1",
  "space_type": "living_room",
  "x": 0,
  "y": 6,
  "width": 8,
  "depth": 10,
  "rotation": 90,
  "zone": "public"
}
```

이 말은 다음 뜻이다.

```text
living_room 블록을
x=0, y=6 위치에 놓고
가로 8칸, 세로 10칸으로 배치했으며
90도 회전했다.
```

블록의 기본 크기와 속성은 `data/blocks/`에 정의되어 있다.

예를 들어 `living_room.json`은 다음 정보를 가진다.

```text
width: 10
depth: 8
zone: public
rotatable: true
preferred_orientation: south
south edge: window_required
north/east/west edge: connectable
```

즉 블록은 단순한 사각형이 아니라, 건축적 속성을 가진 모듈이다.

```text
크기
공간 성격
공용/사적 zone
회전 가능 여부
창문 필요한 방향
연결 가능한 벽
채광 선호
설비 여부
```

## 7. layout_service.py의 핵심 판단

`layout_service.py`는 방을 그냥 순서대로 붙이지 않는다. 여러 후보 위치를 만들고 점수를 매겨 가장 좋은 위치를 선택한다.

핵심 함수는 다음과 같다.

| 함수 | 역할 |
|---|---|
| `generate_layout_from_rules()` | 외부에서 호출하는 최종 배치 함수 |
| `generate_zoned_layout_from_rules()` | 규칙을 기반으로 배치 방식 선택 |
| `needs_corridor_spine()` | 복도형 배치가 필요한지 판단 |
| `select_best_flow_candidate()` | 현재 상태에서 가장 좋은 다음 방 위치 선택 |
| `placement_candidate_score()` | 후보 배치의 총점 계산 |
| `contact_relationship_score()` | 실제로 맞닿는 방 사이의 관계 점수 계산 |
| `generate_linear_corridor_layout()` | corridor 중심 배치 생성 |
| `attach_rooms_to_spine()` | corridor 주변에 방 배치 |

후보 배치 점수는 대략 다음 요소를 본다.

```text
방과 방의 관계 점수
실제로 벽을 맞대는 관계
도로 방향
선호 향
건물 외곽이 너무 이상해지는지
같은 종류 방이 계속 붙는지
거실과의 거리
현관 바로 옆에 private room이 붙는지
겹침 여부
```

최근 수정으로 중요한 변화는 다음이다.

```text
기존: 향과 도로 방향의 영향이 큼
현재: 방과 방 사이의 관계 점수와 실제 접촉 관계를 더 중요하게 봄
```

이 때문에 living에서 굳이 corridor를 거쳐 방으로 가는 비효율을 줄이고, 필요 없는 corridor가 덜 생기도록 했다.

## 8. 4단계: 배치 후처리

담당 파일:

```text
app/services/layout_postprocess_service.py
```

이 단계는 이미 생성된 배치를 살짝 정리한다.

주요 역할은 다음과 같다.

```text
불필요하게 벌어진 틈 줄이기
전체 도면을 compact하게 만들기
배치가 너무 퍼지지 않게 보정하기
```

이 단계는 새로운 설계를 만드는 단계라기보다, 나온 배치를 더 보기 좋게 정리하는 단계다.

## 9. 5단계: 도면 기하 생성

담당 파일:

```text
app/services/plan_geometry_service.py
```

`layout_service.py`가 만든 것은 아직 방 사각형 좌표다. 이 좌표를 실제 도면으로 만들려면 벽, 창문, 문, 오프닝을 계산해야 한다.

이 단계에서 생성되는 주요 데이터는 다음과 같다.

```text
spaces: 방 사각형들
edges: 각 방의 네 변
shared_edges: 방끼리 맞닿는 변
outer_edges: 외부에 노출된 변
inner_walls: 내부 벽
open_edges: 벽 없이 열린 내부 경계
openings: 창문, 문, 오프닝
labels: 방 이름과 면적
```

예를 들어 거실과 주방이 붙어 있고 둘 다 연결 가능한 면을 가지고 있으면, 그 사이 벽은 넓은 오프닝이나 열린 경계로 처리될 수 있다.

반대로 침실과 침실, 욕실과 욕실처럼 바로 열면 이상한 조합은 막는다.

## 10. 6단계: SVG/PNG 도면 렌더링

담당 파일:

```text
app/services/visualize2d_service.py
```

이 파일은 `plan_geometry`를 실제 눈에 보이는 도면으로 그린다.

주요 역할은 다음과 같다.

```text
공간 색 채우기
외벽 두껍게 그리기
내벽 얇게 그리기
창문 선 그리기
오프닝 부분 벽 끊기
방 이름과 면적 쓰기
북쪽 화살표와 스케일바 그리기
SVG 또는 PNG로 저장
```

즉:

```text
plan_geometry_service.py → 도면 데이터 생성
visualize2d_service.py → 도면 그림 생성
```

## 11. 웹에서 돌아가는 방식

웹 프론트엔드는 `frontend_local_test/`에 있다.

사용자는 웹에서 요구사항을 입력하고, 도로 방향을 선택하고, 2D Plan과 3D Render를 확인한다.

백엔드 API는 다음 파일에 있다.

```text
app/server.py
```

주요 API는 다음이다.

```text
POST /generate-svg
```

요청이 들어오면 다음 흐름을 실행한다.

```text
normalize
→ rules
→ layout
→ postprocess
→ plan geometry
→ svg
```

## 12. artifacts 폴더의 의미

`artifacts/`는 파이프라인 결과물이 저장되는 폴더다.

```text
artifacts/internal_orders/
artifacts/placement_rules/
artifacts/layouts/
artifacts/plan_geometry/
artifacts/images_2d/
```

각 단계의 결과를 따로 볼 수 있기 때문에, 어디서 문제가 생겼는지 추적하기 좋다.

예를 들어 `case_001`은 다음처럼 저장된다.

```text
artifacts/internal_orders/case_001.json
artifacts/placement_rules/case_001.json
artifacts/layouts/case_001.json
artifacts/plan_geometry/case_001.plan_geometry.json
artifacts/images_2d/case_001.svg
artifacts/images_2d/case_001.png
```

## 13. Ontology와 GraphDB 관점

현재 프로젝트에는 ontology 개념이 들어가 있다.

해당 파일은 다음이다.

```text
data/ontology/concepts.json
data/ontology/aliases.json
data/ontology/relations.json
data/ontology/constraints.json
```

각 파일의 역할은 다음과 같다.

| 파일 | 역할 |
|---|---|
| `concepts.json` | 공간의 zone과 성격 정의 |
| `aliases.json` | 사용자의 자연어 표현을 표준 공간명으로 변환 |
| `relations.json` | 공간 사이의 인접/분리 관계 점수 |
| `constraints.json` | 지켜야 하는 제약 조건 이름 |

다만 현재는 진짜 GraphDB는 아니다.

현재 구조는 다음에 가깝다.

```text
JSON ontology
→ Python이 직접 읽음
→ 관계 점수 배열로 사용
```

진짜 GraphDB 구조라면 다음처럼 갈 수 있다.

```text
Space 노드
Relationship 엣지
Constraint 노드
Query 기반 관계 탐색
Reasoning 가능
```

따라서 현재 프로젝트는 “GraphDB로 확장 가능한 lightweight ontology 기반 설계 엔진”이라고 설명하는 것이 정확하다.

## 14. 이 프로젝트에서 건축가의 역할

이 프로젝트의 핵심은 건축가의 판단을 코드로 옮기는 것이다.

건축가는 방을 랜덤으로 붙이지 않는다. 다음과 같은 판단을 한다.

```text
현관은 도로와 맞아야 한다
거실은 현관 다음에 자연스럽게 연결되어야 한다
주방은 거실과 붙는 것이 좋다
침실은 현관 바로 옆보다 안쪽이 좋다
욕실은 침실 근처가 좋다
복도는 필요할 때만 생겨야 한다
방들이 겹치면 안 된다
창문이 필요한 면은 외부에 닿아야 한다
```

이 판단들이 코드에서는 점수와 규칙으로 구현된다.

```text
관계 점수
zone 점수
도로 방향 점수
향 점수
외곽 compact 점수
같은 타입 반복 패널티
겹침 방지
오프닝 가능 여부
```

즉 이 프로젝트에서 건축가는 다음 역할로 해석된다.

```text
공간을 모듈로 나누는 사람
공간 사이 관계를 정의하는 사람
공간의 위계를 정하는 사람
좋은 배치를 판단하는 기준을 만드는 사람
도면으로 성립 가능한 기하를 검증하는 사람
```

## 15. 왜 바로 이미지 생성이 아니라 블록과 배치인가

이미지 생성 AI로 바로 평면을 만들면 그럴듯한 이미지는 나올 수 있다. 하지만 다음 문제가 생길 수 있다.

```text
방이 겹칠 수 있음
문이 이상할 수 있음
창문이 내벽에 생길 수 있음
현관이 도로와 안 맞을 수 있음
면적과 스케일이 불명확함
수정이 어려움
3D로 넘기기 어려움
```

이 프로젝트는 중간에 구조화된 JSON을 만들기 때문에 다음 장점이 있다.

```text
왜 이 방이 여기 붙었는지 설명 가능
각 방의 크기와 좌표가 명확함
벽/창/문/오프닝 로직을 따로 수정 가능
2D에서 3D로 확장하기 쉬움
GraphDB/Ontology로 확장 가능
```

## 16. 현재까지의 설계 방향

현재 프로젝트는 다음 방향으로 발전하고 있다.

```text
1. 방을 모듈 블록으로 본다
2. 블록은 크기/창문/연결면/zone을 가진다
3. 현관은 도로와 관계를 가진다
4. 거실은 공용 중심 공간이 된다
5. 복도는 무조건 만드는 것이 아니라 필요할 때만 만든다
6. 침실/욕실/작업실은 관계 점수로 배치한다
7. 배치 이후 벽/창/문/오프닝을 따로 생성한다
8. 2D 도면을 기반으로 3D 렌더링으로 확장한다
```

최근 수정 방향은 다음과 같다.

```text
기존 문제:
- 향 점수가 너무 강함
- 같은 종류의 방이 한쪽에 몰림
- 복도가 과하게 생김
- living에서 굳이 복도를 지나 방으로 가는 비효율 발생

수정 방향:
- 방과 방 사이의 관계 점수 강화
- 실제 맞닿는 방의 관계를 점수에 반영
- corridor는 명시적으로 필요하거나 큰 배치에서만 사용
- living 중심의 직접 연결 배치 강화
```

## 17. 발표용 핵심 문장

다음 문장은 발표에서 그대로 써도 된다.

```text
저희는 건축가의 역할을 단순히 이미지를 생성하는 것이 아니라, 공간을 모듈화하고 관계를 점수화해 배치하는 과정으로 해석했습니다.
자연어 요구를 ontology 기반의 공간 규칙으로 바꾸고, 그 규칙을 통해 블록 배치, 벽, 창문, 오프닝을 생성한 뒤 2D 도면과 3D 렌더링으로 확장하는 구조입니다.
```

조금 더 짧게 말하면:

```text
AIchitect는 자연어를 바로 이미지로 바꾸는 프로젝트가 아니라, 건축가의 사고 과정을 데이터와 규칙으로 구조화해 도면을 생성하는 프로젝트입니다.
```

## 18. 처음 외우면 좋은 핵심 파일

일단 다음 7개 파일만 이해하면 전체 프로젝트의 대부분을 설명할 수 있다.

| 파일 | 역할 |
|---|---|
| `normalize_service.py` | 자연어 JSON 정리 |
| `rules_service.py` | 배치 규칙 생성 |
| `layout_service.py` | 방 블록 배치 |
| `layout_postprocess_service.py` | 배치 후처리 |
| `plan_geometry_service.py` | 벽/창/문 도면 기하 생성 |
| `visualize2d_service.py` | SVG/PNG 렌더링 |
| `server.py` | 프론트엔드와 연결되는 API |

## 19. 디버깅할 때 보는 순서

도면이 이상할 때는 다음 순서로 보면 된다.

```text
1. internal_orders
   사용자의 방 요구가 제대로 정리됐는가?

2. placement_rules
   관계 점수와 required_blocks가 맞는가?

3. layouts
   방 좌표와 회전이 이상하지 않은가?

4. plan_geometry
   외벽/내벽/창문/오프닝이 제대로 계산됐는가?

5. images_2d
   SVG/PNG 렌더링만 이상한가?
```

이 순서로 보면 문제 위치를 빠르게 좁힐 수 있다.

## 20. 최종 이해 요약

AIchitect는 다음 구조를 가진다.

```text
자연어를 이해하는 단계
→ 건축적 규칙으로 번역하는 단계
→ 블록을 배치하는 단계
→ 도면 기하를 만드는 단계
→ 시각화하는 단계
```

이 프로젝트의 핵심 가치는 다음이다.

```text
건축가의 사고를 블록, 관계, 제약, 점수로 모델링한다.
이미지 생성이 아니라 설명 가능한 설계 구조를 만든다.
2D 도면과 3D 렌더링 사이에 연결 가능한 중간 데이터를 만든다.
```
