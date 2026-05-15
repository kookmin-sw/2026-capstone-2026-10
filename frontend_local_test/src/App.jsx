import { useState, useRef, useEffect, useMemo } from 'react';
import './App.css';
import ThreeExteriorViewer from './ThreeExteriorViewer';

// ==========================================
// SVG 도면 생성을 위한 헬퍼 함수 및 상수
// ==========================================
const ROOM_NAME_MAP = {
  Entrance: 'ENTRANCE',
  LivingRoom: 'LIVING',
  Kitchen: 'KITCHEN',
  Bathroom: 'BATH',
  Workspace: 'WORK',
  DiningRoom: 'DINING',
  Bedroom: 'BEDROOM',
  Bedroom_1: 'BED 01',
  Bedroom_2: 'BED 02',
  Bedroom_3: 'BED 03',
  MasterBedroom: 'MASTER',
  Terrace: 'TERRACE',
  Storage: 'STORAGE',
};

function expandRooms(orderJson = {}) {
  const spaces = orderJson?.occupancy?.spaces || {};
  const result = [];

  Object.entries(spaces).forEach(([rawName, rawCount]) => {
    const count = Number(rawCount) || 0;

    if (count <= 1) {
      result.push(rawName);
      return;
    }

    for (let i = 1; i <= count; i += 1) {
      result.push(`${rawName}_${i}`);
    }
  });

  return result;
}

function labelForRoom(name) {
  if (ROOM_NAME_MAP[name]) return ROOM_NAME_MAP[name];

  if (name.includes('_')) {
    const [base, index] = name.split('_');
    if (base === 'Bedroom') return `BED ${String(index).padStart(2, '0')}`;
    return `${base.toUpperCase()} ${index}`;
  }

  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function buildFallbackSvg(orderJson = {}) {
  if (!orderJson || Object.keys(orderJson).length === 0) {
    return `
      <svg viewBox="0 0 900 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#eef1f4" stroke-width="0.7"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="900" height="600" fill="#ffffff"/>
        <rect x="0" y="0" width="900" height="600" fill="url(#grid)" opacity="0.35"/>
        <text x="450" y="300" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-size="15" font-weight="500" fill="#a7adb5" letter-spacing="0.3">
          대화를 통해 설계 요구사항을 모두 수집하면 도면이 생성됩니다.
        </text>
      </svg>
    `;
  }

  const rooms = expandRooms(orderJson);

  const slots = [
    { x: 42, y: 42, w: 186, h: 112 },
    { x: 242, y: 42, w: 298, h: 182 },
    { x: 554, y: 42, w: 304, h: 182 },
    { x: 42, y: 168, w: 186, h: 176 },
    { x: 242, y: 238, w: 212, h: 150 },
    { x: 468, y: 238, w: 182, h: 150 },
    { x: 664, y: 238, w: 194, h: 150 },
    { x: 42, y: 358, w: 288, h: 194 },
    { x: 344, y: 402, w: 246, h: 150 },
    { x: 604, y: 402, w: 254, h: 150 },
  ];

  const fills = ['#ffffff', '#f7f4ee', '#f1ede5', '#faf8f3'];
  const blocks = rooms.slice(0, slots.length).map((room, index) => {
    const slot = slots[index];
    const fill = fills[index % fills.length];

    return `
      <g>
        <rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="18" fill="${fill}" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke" />
        <text x="${slot.x + 16}" y="${slot.y + 28}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#111111" letter-spacing="1.2">
          ${labelForRoom(room)}
        </text>
      </g>
    `;
  });

  return `
    <svg viewBox="0 0 900 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e8e1d8" stroke-width="1"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="900" height="600" fill="#f8f4ec"/>
      <rect x="18" y="18" width="864" height="564" rx="28" fill="url(#grid)" stroke="#111111" stroke-width="2"/>
      <text x="50" y="86" font-family="IBM Plex Sans, Arial, sans-serif" font-size="11" font-weight="600" fill="#111111" letter-spacing="2">
        AICHITECT / LIVE PLAN PREVIEW
      </text>
      <path d="M830 76 L860 76 L845 50 Z" fill="none" stroke="#111111" stroke-width="2" />
      <text x="841" y="98" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-size="11" font-weight="600" fill="#111111" letter-spacing="2">N</text>
      ${blocks.join('')}
      <path d="M228 98 L242 98" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M540 130 L554 130" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M228 288 L242 288" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M454 314 L468 314" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M650 314 L664 314" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M330 455 L344 455" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M590 455 L604 455" stroke="#111111" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
  `;
}

function parseSvgLength(value) {
  if (!value || String(value).includes('%')) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSvgDimensions(svgString, fallbackW = 900, fallbackH = 600) {
  const parser = new DOMParser();
  const svgEl = parser.parseFromString(svgString, 'image/svg+xml').querySelector('svg');
  const viewBox = svgEl?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
  const vbW = viewBox?.[2];
  const vbH = viewBox?.[3];
  return {
    width: parseSvgLength(svgEl?.getAttribute('width')) || vbW || fallbackW,
    height: parseSvgLength(svgEl?.getAttribute('height')) || vbH || fallbackH,
    viewBox: svgEl?.getAttribute('viewBox') || `0 0 ${vbW || fallbackW} ${vbH || fallbackH}`,
  };
}

function normalizeSvgForDisplay(svgString) {
  if (!svgString) return svgString;
  const { viewBox } = getSvgDimensions(svgString);
  let svg = setSvgAttribute(svgString, 'width', '100%');
  svg = setSvgAttribute(svg, 'height', '100%');
  if (!/\bviewBox="/.test(svg)) {
    svg = svg.replace(/<svg\b/, `<svg viewBox="${viewBox}"`);
  }
  if (!/\bpreserveAspectRatio="/.test(svg)) {
    svg = svg.replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet"');
  }
  return svg.replace(/<svg\b/, '<svg style="width:100%;height:100%;display:block;"');
}

function setSvgAttribute(svgString, name, value) {
  const attrRegex = new RegExp(`(<svg\\b[^>]*?)\\b${name}="[^"]*"`);
  if (attrRegex.test(svgString)) {
    return svgString.replace(attrRegex, `$1${name}="${value}"`);
  }
  return svgString.replace(/<svg\b/, `<svg ${name}="${value}"`);
}

function normalizeSvgForRaster(svgString, width, height) {
  if (!svgString) return svgString;
  const { viewBox } = getSvgDimensions(svgString, width, height);
  let svg = setSvgAttribute(svgString, 'width', String(width));
  svg = setSvgAttribute(svg, 'height', String(height));
  if (!/\bviewBox="/.test(svg)) {
    svg = setSvgAttribute(svg, 'viewBox', viewBox);
  }
  if (!/\bpreserveAspectRatio="/.test(svg)) {
    svg = setSvgAttribute(svg, 'preserveAspectRatio', 'xMidYMid meet');
  }
  return svg;
}

function svgToDataUrl(svgString) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}

function defaultExteriorStyle() {
  return {
    wallColor: '#F0EBE1',
    roofColor: '#4F5B52',
    accentColor: '#7A6550',
    groundColor: '#8AAE7A',
    roofType: 'flat',
    style: 'modern',
    hasChimney: false,
  };
}
// ==========================================

function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { sender: 'AI', text: '안녕하세요! 저는 Aichitect예요.\n어떤 공간에서 살고 싶으신지 같이 이야기 나눠볼게요. 건축 얘기 말고, 그냥 편하게 일상 대화하듯 말씀해 주세요.\n\n먼저 여쭤볼게요 — 혼자 사실 건가요, 아니면 함께 사는 분이 있으신가요?' }
  ]);
  const [orderJson, setOrderJson] = useState({});
  const [svgOverride, setSvgOverride] = useState('');
  const [image3dUrl, setImage3dUrl] = useState('');
  const [is3dLoading, setIs3dLoading] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const progressTimerRef = useRef(null);

  // 하단 탭 (3D RENDER / 3D EXTERIOR)
  const [rightTab, setRightTab] = useState('3d');

  // 3D 외관 - 레퍼런스 이미지 & 스타일
  const [refImages, setRefImages] = useState([null, null, null]);
  const [exteriorStyle, setExteriorStyle] = useState(null);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [planGeometry, setPlanGeometry] = useState(null);
  const [layoutJson, setLayoutJson] = useState(null);
  const [isDesignComplete, setIsDesignComplete] = useState(false);

  // 방 추가/삭제 모드
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [addRoomType, setAddRoomType] = useState('bathroom');
  const [isAddingRoomLoading, setIsAddingRoomLoading] = useState(false);
  const [isRemovingRoom, setIsRemovingRoom] = useState(false);
  const [isRemovingRoomLoading, setIsRemovingRoomLoading] = useState(false);
  const [isDesignConfirmed, setIsDesignConfirmed] = useState(false);
  const [undoHistory, setUndoHistory] = useState([]);
  const svgContainerRef = useRef(null);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const svgMarkup = useMemo(() => {
    return svgOverride || buildFallbackSvg(orderJson);
  }, [orderJson, svgOverride]);

  // 표시용: 픽셀 width/height → 100% (viewBox는 유지해 비율 보존)
  const displaySvgUrl = useMemo(() => {
    return svgToDataUrl(normalizeSvgForDisplay(svgMarkup));
  }, [svgMarkup]);

  // 구글 Gemini API 키 (주의: 운영 환경에서는 백엔드로 분리해야 합니다)
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // 3D 렌더링 모델 (나노바나나)
  const IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview"; // Nano Banana 2

  // SVG 문자열 → PNG base64 변환 (멀티모달 전송용)
  const svgToBase64Png = (svgString) => new Promise((resolve, reject) => {
    const { width: w, height: h } = getSvgDimensions(svgString, 800, 640);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const blob = new Blob([normalizeSvgForRaster(svgString, w, h)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });

  const generate3dRender = async (pipelineInput, svgString, planGeometry) => {
    setIs3dLoading(true);
    setImage3dUrl('');
    setRenderProgress(0);

    progressTimerRef.current = setInterval(() => {
      setRenderProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressTimerRef.current);
          return 90;
        }
        const step = prev < 40 ? 3 : prev < 70 ? 1.5 : 0.5;
        return Math.min(prev + step, 90);
      });
    }, 300);

    const spaces = pipelineInput.required_spaces.join(', ');
    const prefs = pipelineInput.preferences.join(', ');

    // planGeometry.spaces에서 각 방의 실제 치수·위치를 수치 문자열로 변환
    const roomDimensionLines = (() => {
      const spaces = planGeometry?.spaces;
      if (!spaces?.length) return '';
      return spaces.map(r =>
        `  - ${r.space_type} (${r.id}): ${r.width}m wide × ${r.depth}m deep, position x=${r.x} y=${r.y}`
      ).join('\n');
    })();

    // 전체 건물 크기 계산 (bounding box)
    const buildingSize = (() => {
      const spaces = planGeometry?.spaces;
      if (!spaces?.length) return '';
      const maxX = Math.max(...spaces.map(r => r.x + r.width));
      const maxY = Math.max(...spaces.map(r => r.y + r.depth));
      return `Overall building footprint: ${maxX}m (E-W) × ${maxY}m (N-S).`;
    })();

    const prompt = `TASK: Generate a single photorealistic isometric architectural cutaway rendering. Follow every rule below without exception.

=== PROJECTION (NON-NEGOTIABLE) ===
- Isometric projection ONLY. Camera fixed at exactly 30° above horizon, plan rotated exactly 45°.
- ALL parallel lines stay parallel. Zero vanishing points. Zero perspective distortion.
- Vertical walls are perfectly vertical. Horizontal floor edges run at exactly ±30° from horizontal.
- The entire building sits on a flat white (#FFFFFF) background. No ground plane texture, no sky, no environment.

=== FLOOR PLAN DIMENSIONS — GROUND TRUTH (follow with millimeter precision) ===
${buildingSize}
Each room's exact size and grid position (unit: metres):
${roomDimensionLines || `Spaces: ${spaces}`}
CRITICAL: Room aspect ratios must be preserved exactly as specified above. A 5m×3m room must appear visibly wider than a 3m×5m room. Do NOT distort, stretch, or equalise room proportions. The attached 2D plan image is the authoritative layout reference — match it exactly.

=== ROOMS ===
User preferences: ${prefs}.
- Every room listed in the dimensions table must appear. No extra rooms.
- Room boundaries are defined by 20cm-thick white plaster walls.
- Each room has a small label (room name) printed in dark gray sans-serif text centered near the floor.

=== MATERIALS (exact, consistent) ===
- Floor: 12cm-wide natural oak plank flooring, horizontal grain, matte finish, color #C8A87A.
- Walls (interior faces): smooth white plaster, matte, color #F5F5F5 with 1px dark gray (#333) edge outline.
- Walls (exterior faces): same white plaster, slightly darker #E8E8E8 to show depth.
- Door openings: 90cm wide, no door leaf shown — open passage only.
- Windows: full-height glass panels on exterior walls, light blue tint (#D6EAF8), no frames.

=== FURNITURE (exact placement, isometric style) ===
Place only the furniture listed for each room type present:
- 거실: L-shaped light gray fabric sofa against back wall, rectangular oak coffee table centered, wall-mounted 65" TV on opposite wall, 2x2m light beige area rug under coffee table.
- 침실: Queen platform bed (oak frame, white linen) centered on back wall, two matching oak nightstands with cylindrical white lamps, built-in wardrobe along side wall.
- 주방: Continuous L-shaped counter with dark stone (#4A4A4A) worktop along two walls, undermount stainless sink, 4-seat rectangular dining table (oak, 120x80cm) with chairs in center.
- 욕실: Wall-hung white toilet in corner, floating white vanity (80cm) with rectangular mirror above, walk-in shower with clear glass partition in opposite corner.
- 서재/작업실: 160cm oak desk against wall, black mesh ergonomic chair, floor-to-ceiling white bookshelf on adjacent wall.
- All furniture rendered photorealistically with PBR materials, matching room scale exactly.

=== LIGHTING (fixed setup) ===
- Primary: Soft daylight from top-left at 45°, casting pale gray shadows (opacity 20%) rightward and downward.
- Secondary: Warm white ambient fill (3000K) preventing harsh shadows.
- Ambient occlusion: subtle darkening at wall-floor junctions and under furniture.
- No dramatic spotlights. No colored lights. Consistent brightness across all rooms.

=== OUTPUT CONSTRAINTS ===
- Exactly ONE image. Isometric view only — no perspective insets, no close-ups, no alternative angles.
- Pure white background. The building appears to float cleanly.
- High resolution, sharp edges, photorealistic textures.
- Style reference: Dezeen magazine architectural CGI, clean Scandinavian-modern aesthetic.`;

    try {
      // 2D 도면을 PNG base64로 변환해 멀티모달로 전송
      const planBase64 = svgString ? await svgToBase64Png(svgString) : null;
      const parts = [
        ...(planBase64 ? [{ inlineData: { mimeType: 'image/png', data: planBase64 } }] : []),
        {
          text: planBase64
            ? `ATTACHED: 2D floor plan blueprint. You MUST replicate this layout exactly — every room position, every wall, every adjacency. Treat it as the ground truth. Any deviation is an error.\n\n${prompt}`
            : prompt
        },
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        }
      );
      const data = await res.json();

      if (data.error) {
        throw new Error(`API 오류 ${data.error.code}: ${data.error.message}`);
      }

      const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (imagePart) {
        const { mimeType, data: b64 } = imagePart.inlineData;
        clearInterval(progressTimerRef.current);
        setRenderProgress(100);
        setImage3dUrl(`data:${mimeType};base64,${b64}`);
        setChatHistory(prev => [...prev, { sender: 'AI', text: '3D 렌더링이 완성되었습니다! 오른쪽 하단을 확인해주세요.' }]);
      } else {
        throw new Error(`이미지 데이터 없음. 모델 응답: ${JSON.stringify(data).slice(0, 200)}`);
      }
    } catch (e) {
      clearInterval(progressTimerRef.current);
      setRenderProgress(0);
      setChatHistory(prev => [...prev, { sender: 'AI', text: `3D 렌더링 실패: ${e.message}` }]);
    } finally {
      setIs3dLoading(false);
    }
  };

  const SYSTEM_PROMPT = `
당신은 사람 중심의 주택 설계 에이전트 'Aichitect'입니다.
건축 전문 용어를 절대 사용하지 마세요. 친한 친구와 대화하듯 자연스럽고 따뜻하게 이야기하세요.
응답은 반드시 유효한 JSON 형식으로만 작성하세요.

[핵심 원칙]
- "동선", "배치", "평면", "입면", "공간 구성" 같은 건축 용어 사용 금지
- 공간 종류나 개수를 직접 묻지 마세요. 생활 이야기를 통해 자연스럽게 파악하세요
- 한 번에 하나의 질문만 하세요
- 사용자 답변에서 생활 방식을 읽어내고, 필요한 공간을 내부적으로 추론하세요

[파악해야 할 생활 정보 — 자연스럽게 대화로 수집]
· 함께 사는 사람 (혼자인지, 파트너/가족이 있는지, 아이가 있는지)
· 집에서 주로 하는 활동 (요리, 운동, 독서, 게임, 악기, 그림 등)
· 재택근무나 집에서 일하는지 여부
· 집에서 가장 중요하게 여기는 것 (햇빛, 조용함, 넓은 공간, 수납 등)

[공간 추론 규칙 — 절대 사용자에게 언급하지 말 것]
- 혼자 삶 → 침실 1개
- 재택근무 / 집에서 일함 → 작업실 필수
- 요리를 즐김 → preferences에 "주방은 넓고 환기가 잘 되는 곳에" 추가
- 악기·운동·녹음 → 방음 가능한 별도 공간 제안
- 손님이 자주 옴 → 거실 넓게, 욕실 2개 고려
- 자연광 중요 → preferences에 "거실은 햇빛이 잘 드는 방향으로" 추가
- 어린 자녀 있음 → 침실 추가, 아이 방 별도 고려

[대화 단계]

1단계 (status: "chatting")
생활 정보가 아직 부족할 때. 하나씩 자연스럽게 물어보세요.
required_spaces와 preferences는 빈 배열로 두세요.

2단계 (status: "proposing")
생활 정보가 충분히 모이면, 일상 언어로 공간을 제안하세요.
예: "말씀 들어보니 조용히 작업할 공간이 꼭 필요하시겠어요! 거실, 침실, 주방, 욕실에 아늑한 작업실 하나 더하면 딱 좋을 것 같아요. 이렇게 만들어드릴까요?"
이 단계에서 required_spaces와 preferences를 추론해서 채우세요.

3단계 (status: "complete")
사용자가 제안에 동의하거나 수정 후 확정하면 complete로 설정하세요. 모든 필드를 채워 반환하세요.

[응답 JSON 스키마]
{
  "status": "chatting | proposing | complete",
  "reply_message": "사용자에게 할 말. 반드시 친근하고 자연스러운 말투로.",
  "family_type": "가족 구성 (예: 1인 가구, 신혼부부, 4인 가족)",
  "housing_type": "단독주택",
  "required_spaces": ["한국어, 개수 포함. 예: 침실 2개, 거실, 주방, 욕실"],
  "preferences": ["생활 방식에서 추론한 설계 선호. 예: 거실은 햇빛이 잘 드는 남향으로"]
}

[required_spaces 규칙]
사용 가능한 공간명: 거실, 침실, 주방, 욕실, 작업실, 서재, 계단, 복도
1개면 "거실", 2개 이상이면 "침실 2개" 형식.
`;

  const buildModifyPrompt = (currentDesign) => `
당신은 주택 설계 에이전트 Aichitect입니다. 사용자의 도면이 이미 생성되어 있습니다.

[현재 도면 구성]
공간: ${(currentDesign.required_spaces || []).join(', ')}
선호사항: ${(currentDesign.preferences || []).join(', ')}

사용자가 수정을 요청하면 자연스럽게 대화하면서 변경 사항을 파악하고, 확정되면 수정된 전체 구성을 반환하세요.
건축 전문 용어 사용 금지. 친근하고 따뜻한 말투로 대화하세요.
응답은 반드시 유효한 JSON 형식으로만 작성하세요.

[응답 규칙]
- 수정 내용이 명확하면 status: "modify" — 업데이트된 전체 required_spaces와 preferences를 반환
- 아직 대화 중이면 status: "chatting"
- 한 번에 하나의 질문만 하세요

[응답 JSON 스키마]
{
  "status": "chatting | modify",
  "reply_message": "사용자에게 할 말. 친근하고 자연스러운 말투로.",
  "required_spaces": ["수정된 전체 공간 목록. 변경 없는 공간도 모두 포함"],
  "preferences": ["수정된 전체 선호 목록"]
}

[required_spaces 규칙]
사용 가능한 공간명: 거실, 침실, 주방, 욕실, 작업실, 서재, 계단, 복도
1개면 "거실", 2개 이상이면 "침실 2개" 형식. 기존 공간도 빠짐없이 포함하세요.
`;

  const fetchLLMResponse = async (userMessage, history, systemPrompt = SYSTEM_PROMPT) => {
    try {
      const historyContext = history
        .map(chat => `${chat.sender === 'USER' ? '사용자' : 'AI'}: ${chat.text}`)
        .join('\n');

      const fullPrompt = `${systemPrompt}\n\n[지금까지의 대화 내역]\n${historyContext}\n사용자: ${userMessage}\nAI:`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: fullPrompt }] }
          ],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();

      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        console.error("API 응답 에러:", msg);
        throw new Error(`Gemini API 오류: ${msg}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        const reason = data.promptFeedback?.blockReason || '응답 없음';
        throw new Error(`응답 없음 (blockReason: ${reason})`);
      }

      let jsonText = candidate.content.parts[0].text;
      jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

      return JSON.parse(jsonText);

    } catch (error) {
      console.error("데이터 파싱 또는 통신 에러:", error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userText = inputText;
    const currentHistory = [...chatHistory];

    setChatHistory((prev) => [...prev, { sender: 'USER', text: userText }]);
    setInputText("");
    setIsLoading(true);

    const prompt = isDesignComplete ? buildModifyPrompt(orderJson) : SYSTEM_PROMPT;
    let aiData = null;
    try {
      aiData = await fetchLLMResponse(userText, currentHistory, prompt);
    } catch (fetchErr) {
      setChatHistory((prev) => [
        ...prev,
        { sender: 'AI', text: `AI 연결 오류: ${fetchErr.message}\n\nAPI 키나 네트워크 상태를 확인해주세요.` }
      ]);
      setIsLoading(false);
      return;
    }

    if (aiData) {
      setChatHistory((prev) => [
        ...prev,
        { sender: 'AI', text: aiData.reply_message || "응답을 생성했습니다." }
      ]);

      const shouldGenerate = aiData.status === 'complete' || aiData.status === 'modify';

      if (shouldGenerate) {
        const pipelineInput = {
          family_type:      aiData.family_type      || orderJson.family_type      || "",
          housing_type:     aiData.housing_type     || orderJson.housing_type     || "단독주택",
          road_facing:      aiData.road_facing      || orderJson.road_facing      || "남쪽",
          required_spaces:  aiData.required_spaces  || [],
          preferences:      aiData.preferences      || [],
        };
        setOrderJson(pipelineInput);

        const isModify = aiData.status === 'modify';
        setChatHistory((prev) => [
          ...prev,
          { sender: 'AI', text: isModify ? '도면을 수정하는 중입니다...' : '도면을 생성하는 중입니다...' }
        ]);

        try {
          const svgRes = await fetch('http://localhost:8000/generate-svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pipelineInput),
          });
          if (svgRes.ok) {
            const resData = await svgRes.json();
            setSvgOverride(resData.svg);
            setPlanGeometry(resData.plan_geometry);
            if (resData.layout) setLayoutJson(resData.layout);
            setUndoHistory([]);
            setIsDesignComplete(true);
            setChatHistory((prev) => [
              ...prev,
              {
                sender: 'AI',
                text: isModify
                  ? '도면이 수정되었습니다! 추가로 바꾸고 싶은 부분이 있으면 언제든지 말씀해 주세요.\n\n마음에 드시면 도면 상단의 "도면 확정" 버튼을 눌러 3D 렌더링을 시작하세요.'
                  : '2D 도면이 생성되었습니다! 마음에 드시면 도면 상단의 "도면 확정" 버튼을 눌러 3D 렌더링을 시작하세요.\n\n바꾸고 싶은 부분이 있으면 편하게 말씀해 주세요.'
              }
            ]);
          } else {
            const err = await svgRes.json();
            setChatHistory((prev) => [
              ...prev,
              { sender: 'AI', text: `도면 생성 실패: ${err.detail}` }
            ]);
          }
        } catch (e) {
          setChatHistory((prev) => [
            ...prev,
            { sender: 'AI', text: '도면 서버에 연결할 수 없습니다.\n터미널에서 다음 명령어를 실행해주세요:\n\nuvicorn app.server:app --reload' }
          ]);
        }
      }
    }

    setIsLoading(false);
  };

  // ==========================================
  // 방 추가 (클릭 위치 지정)
  // ==========================================

  const handleUndo = () => {
    setUndoHistory(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setSvgOverride(last.svgOverride);
      setPlanGeometry(last.planGeometry);
      setLayoutJson(last.layoutJson);
      return prev.slice(0, -1);
    });
  };

  const ADD_ROOM_OPTIONS = [
    { type: 'bathroom',  label: '욕실' },
    { type: 'bedroom',   label: '침실' },
    { type: 'workspace', label: '작업실' },
    { type: 'kitchen',   label: '주방' },
  ];

  // SVG 클릭 좌표 → 도면 plan 좌표 변환
  const svgClickToPlanCoords = (e) => {
    const container = svgContainerRef.current;
    if (!container || !planGeometry) return null;

    // SVG 원본 크기 (DOMParser로 파싱 — 더 안전)
    const { width: svgNatW, height: svgNatH } = getSvgDimensions(svgMarkup);
    if (!svgNatW || !svgNatH) return null;

    // 컨테이너 padding(16px)을 제외한 실제 이미지 영역 계산
    const PAD = 16;
    const rect = container.getBoundingClientRect();
    const imgW = rect.width - 2 * PAD;
    const imgH = rect.height - 2 * PAD;

    // objectFit: contain 스케일 및 레터박스 오프셋
    const scaleF = Math.min(imgW / svgNatW, imgH / svgNatH);
    if (!scaleF || scaleF <= 0) return null;
    const rendW = svgNatW * scaleF;
    const rendH = svgNatH * scaleF;
    const offX = (imgW - rendW) / 2;
    const offY = (imgH - rendH) / 2;

    // 클릭 좌표 → SVG 내부 좌표 (padding + letterbox 보정)
    const svgX = (e.clientX - rect.left - PAD - offX) / scaleF;
    const svgY = (e.clientY - rect.top  - PAD - offY) / scaleF;

    // SVG 내부 좌표 → plan 좌표 (SCALE=80, PADDING=50, Y축 반전)
    const SVG_SCALE = 80, SVG_PAD = 50;
    const spaces = planGeometry.spaces || [];
    if (!spaces.length) return null;
    const minX = Math.min(...spaces.map(s => s.x));
    const maxY = Math.max(...spaces.map(s => s.y + s.depth));

    const planX = minX + (svgX - SVG_PAD) / SVG_SCALE;
    const planY = maxY - (svgY - SVG_PAD) / SVG_SCALE;

    return { x: planX, y: planY };
  };

  const handleSvgClickForRoom = async (e) => {
    if (!isAddingRoom || isAddingRoomLoading) return;

    // layoutJson이 없으면 planGeometry에서 재구성 (서버 구버전 호환)
    let currentLayout = layoutJson;
    if (!currentLayout) {
      if (!planGeometry || !planGeometry.spaces?.length) {
        alert('도면 정보가 없습니다. 도면을 다시 생성해 주세요.');
        setIsAddingRoom(false);
        return;
      }
      currentLayout = {
        placements: planGeometry.spaces.map(s => ({
          id: s.id,
          space_type: s.space_type,
          x: s.x,
          y: s.y,
          width: s.width,
          depth: s.depth ?? s.height ?? 2,
          zone: s.zone || 'private',
          rotation: s.rotation || 0,
        })),
        meta: {
          layout_type: 'flow_2d_v1',
          road_facing: orderJson.road_facing || 'south',
          access_edges: planGeometry.access_edges || [],
        },
      };
    }

    const coords = svgClickToPlanCoords(e);
    if (!coords) return;

    setIsAddingRoomLoading(true);
    try {
      const res = await fetch('http://localhost:8000/add-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout: currentLayout,
          room_type: addRoomType,
          target_x: coords.x,
          target_y: coords.y,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUndoHistory(prev => [...prev, { svgOverride, planGeometry, layoutJson }]);
        setSvgOverride(data.svg);
        setPlanGeometry(data.plan_geometry);
        setLayoutJson(data.layout);
        setIsAddingRoom(false);
      } else {
        const err = await res.json();
        alert(`방 추가 실패: ${err.detail}`);
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    }
    setIsAddingRoomLoading(false);
  };

  const handleSvgClickForDelete = async (e) => {
    if (!isRemovingRoom || isRemovingRoomLoading) return;

    const coords = svgClickToPlanCoords(e);
    if (!coords) return;

    const spaces = planGeometry?.spaces || [];
    if (spaces.length <= 1) {
      alert('마지막 방은 삭제할 수 없습니다.');
      return;
    }

    // 클릭 위치를 포함하는 방 찾기
    let targetId = null;
    for (const space of spaces) {
      if (coords.x >= space.x && coords.x <= space.x + space.width &&
          coords.y >= space.y && coords.y <= space.y + space.depth) {
        targetId = space.id;
        break;
      }
    }
    // 없으면 가장 가까운 방
    if (!targetId) {
      let minDist = Infinity;
      for (const space of spaces) {
        const cx = space.x + space.width / 2;
        const cy = space.y + space.depth / 2;
        const dist = (cx - coords.x) ** 2 + (cy - coords.y) ** 2;
        if (dist < minDist) { minDist = dist; targetId = space.id; }
      }
    }
    if (!targetId) return;

    let currentLayout = layoutJson;
    if (!currentLayout) {
      if (!planGeometry?.spaces?.length) return;
      currentLayout = {
        placements: planGeometry.spaces.map(s => ({
          id: s.id, space_type: s.space_type, x: s.x, y: s.y,
          width: s.width, depth: s.depth ?? s.height ?? 2,
          zone: s.zone || 'private', rotation: s.rotation || 0,
        })),
        meta: {
          layout_type: 'flow_2d_v1',
          road_facing: orderJson.road_facing || 'south',
          access_edges: planGeometry.access_edges || [],
        },
      };
    }

    setIsRemovingRoomLoading(true);
    try {
      const res = await fetch('http://localhost:8000/delete-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: currentLayout, room_id: targetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setUndoHistory(prev => [...prev, { svgOverride, planGeometry, layoutJson }]);
        setSvgOverride(data.svg);
        setPlanGeometry(data.plan_geometry);
        setLayoutJson(data.layout);
        setIsRemovingRoom(false);
      } else {
        const err = await res.json();
        alert(`방 삭제 실패: ${err.detail}`);
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    }
    setIsRemovingRoomLoading(false);
  };

  // ==========================================
  // 내보내기 기능 함수들
  // ==========================================

  // 1. SVG 파일로 다운로드
  const downloadSVG = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aichitect-floorplan.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. PNG 이미지로 변환 후 다운로드
  const downloadPNG = () => {
    if (!svgMarkup) return;

    // SVG 실제 크기 파싱 (width/height 속성 또는 viewBox 기준)
    const { width: svgW, height: svgH } = getSvgDimensions(svgMarkup);

    const scale = 2; // 2× 고해상도
    const canvas = document.createElement('canvas');
    canvas.width = svgW * scale;
    canvas.height = svgH * scale;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.width = svgW * scale;
    img.height = svgH * scale;
    const svgBlob = new Blob([normalizeSvgForRaster(svgMarkup, svgW, svgH)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = 'aichitect-floorplan.png';
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // 3. 네이티브 공유하기
  const handleShare = async () => {
    const shareData = {
      title: 'Aichitect 맞춤형 도면',
      text: '제가 AI와 함께 설계한 나만의 공간을 확인해보세요!',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        console.log('공유 실패:', error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('링크가 클립보드에 복사되었습니다!');
    }
  };

  // 3D 이미지 내보내기
  const download3dPNG = () => {
    if (!image3dUrl) return;
    const link = document.createElement('a');
    link.href = image3dUrl;
    link.download = 'aichitect-3d-render.png';
    link.click();
  };

  const download3dSVG = () => {
    if (!image3dUrl) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image xlink:href="${image3dUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aichitect-3d-render.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };
    img.src = image3dUrl;
  };

  const download3dPDF = () => {
    if (!image3dUrl) return;
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Aichitect 3D Render</title>
    <style>
      @page { size: A3; margin: 12mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 277mm; height: 394mm; background: white; display: flex; justify-content: center; align-items: center; }
      img { max-width: 277mm; max-height: 394mm; object-fit: contain; }
    </style>
  </head>
  <body><img src="${image3dUrl}" /></body>
  <script>window.onload = () => { window.print(); };<\/script>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    printWindow.addEventListener('load', () => URL.revokeObjectURL(url));
  };

  // ── 레퍼런스 이미지 업로드 ──
  const handleRefImageUpload = (index, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const full = e.target.result;
      const base64 = full.split(',')[1];
      setRefImages(prev => {
        const next = [...prev];
        next[index] = { base64, preview: full, mimeType: file.type || 'image/jpeg' };
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Gemini 레퍼런스 스타일 분석 ──
  const analyzeReferenceImages = async () => {
    const uploaded = refImages.filter(Boolean);
    if (!uploaded.length) {
      setExteriorStyle(defaultExteriorStyle());
      return;
    }
    setIsAnalyzingStyle(true);
    try {
      const imgParts = uploaded.map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
      }));
      imgParts.push({
        text: `이 건축물 외관 레퍼런스 이미지들을 분석해 3D 모델에 적용할 디자인 속성을 추출하세요.
반드시 아래 JSON 형식으로만 응답하세요 (설명 없이 JSON만):
{
  "wallColor": "#F0EBE1",
  "roofColor": "#5C4B35",
  "accentColor": "#7A6550",
  "groundColor": "#8AAE7A",
  "roofType": "flat",
  "style": "modern",
  "hasChimney": false
}

각 필드 설명:
- wallColor: 건물 외벽의 주요 색상 hex 코드 (실제 이미지에서 추출)
- roofColor: 지붕 표면의 색상 hex 코드 (실제 이미지에서 추출)
- accentColor: 창틀·처마·문 등 포인트 부위의 색상 hex 코드 (실제 이미지에서 추출)
- groundColor: 건물 주변 대지/마당/정원의 지면 색상 hex 코드 (잔디면이면 #7CB87B, 자갈/포장이면 #B0A898, 흙이면 #9B7B5A 등 실제 이미지에서 추출)
- roofType: 아래 세 가지 중 정확히 하나를 선택하세요. 애매하면 "flat"을 선택하세요.
  * "flat" — 경사가 거의 없는 수평 평지붕. 지붕 면이 하늘에서 보면 평평함. 현대/미니멀 건물에 많음.
  * "gable" — 삼각형 박공지붕. 지붕 꼭대기에 수평 능선(ridge)이 있고 양쪽으로 경사면이 내려옴. 정면에서 보면 역V자 형태.
  * "hip" — 우진각(팔작)지붕. 능선(ridge)이 있고 네 방향 모두 경사면. 위에서 보면 사다리꼴 능선이 보임. 단순 피라미드가 아니라 양쪽 끝도 경사짐.
- style: "modern" | "traditional" | "minimalist" | "rustic" | "contemporary"
- hasChimney: 굴뚝 여부 boolean

모든 색상은 이미지에서 직접 추출한 실제 hex 코드를 사용하세요.`,
      });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: imgParts }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      let text = data.candidates[0].content.parts[0].text;
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      setExteriorStyle(JSON.parse(text));
    } catch (e) {
      console.error('스타일 분석 실패:', e);
      // 분석 실패 시 기본값 적용
      setExteriorStyle({
        wallColor: '#F0EBE1', roofColor: '#5C4B35', accentColor: '#7A6550',
        groundColor: '#8AAE7A', roofType: 'gable', style: 'traditional', hasChimney: false,
      });
    } finally {
      setIsAnalyzingStyle(false);
    }
  };

  // 4. PDF 다운로드 (도면만 새 창에서 인쇄)
  const downloadPDF = () => {
    if (!svgMarkup) return;
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Aichitect 도면</title>
    <style>
      @page {
        size: A3;
        margin: 12mm;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 277mm;
        height: 394mm;
        background: white;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      svg {
        width: 277mm;
        height: 394mm;
        max-width: 277mm;
        max-height: 394mm;
        object-fit: contain;
      }
    </style>
  </head>
  <body id="root"></body>
  <script>
    const raw = ${JSON.stringify(svgMarkup)};
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h && !w.includes('%')) {
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    }
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    document.getElementById('root').appendChild(svg);
  </script>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    printWindow.addEventListener('load', () => {
      printWindow.print();
      URL.revokeObjectURL(url);
    });
  };

  if (!isStarted) {
    return (
      <div className="start-page">
        <div className="start-content">
          <h1 className="start-title">Aichitect</h1>
          <p className="start-description">
            AI와 대화하며 당신만의 맞춤형 공간을 설계해보세요.<br />
            당신의 아이디어가 실시간으로 도면이 됩니다.
          </p>
          <button
            className="start-button"
            onClick={() => setIsStarted(true)}
          >
            설계 시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 좌측: 대화형 에이전트 패널 */}
      <div className="panel">
        <div className="panel-header" style={{ position: 'relative' }}>
          <h1 className="panel-title">Aichitect</h1>
          <p className="panel-subtitle">
            {isDesignComplete
              ? '도면이 생성되었습니다. 수정하고 싶은 부분을 자유롭게 말씀해 주세요.'
              : '공간에 대한 아이디어를 대화로 구체화해보세요.'}
          </p>
          {isDesignComplete && (
            <span style={{
              display: 'inline-block', marginTop: '6px',
              padding: '2px 10px', borderRadius: '12px',
              background: '#e8f5e9', color: '#2e7d32',
              fontSize: '10px', letterSpacing: '0.8px', fontWeight: '600',
            }}>
              수정 모드
            </span>
          )}
          <button onClick={handleShare} className="export-btn share-btn" title="공유하기" style={{ position: 'absolute', top: '12px', right: '16px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            공유
          </button>
        </div>

        <div className="chat-window">
          {chatHistory.map((chat, index) => (
            <div key={index} className={`chat-bubble-wrapper ${chat.sender === 'USER' ? 'user' : 'ai'}`}>
              <div className={`chat-bubble ${chat.sender === 'USER' ? 'user' : 'ai'}`}>
                {chat.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="chat-bubble-wrapper ai">
              <div className="chat-bubble ai">
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <input
            className="chat-input"
            type="text"
            placeholder={isDesignComplete ? "수정하고 싶은 부분을 말씀해 주세요." : "메시지를 입력하세요."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={isLoading}
          />
          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={isLoading || !inputText.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>

      {/* 우측: 2D 고정(상단) + 3D 탭(하단) */}
      <div className="right-panels">

        {/* ── 상단: 2D PLAN (항상 표시) ── */}
        <div className="panel svg-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="json-header">
            <div className="mac-dots">
              <div className="mac-dot red"></div>
              <div className="mac-dot yellow"></div>
              <div className="mac-dot green"></div>
            </div>
            <span className="json-title">2D PLAN</span>
            <div className="export-toolbar">
              {isDesignComplete && !isAddingRoom && !isRemovingRoom && (
                <>
                  <button onClick={() => setIsAddingRoom(true)} className="export-btn"
                    style={{ background: '#e8f5e9', color: '#2e7d32', borderColor: '#c8e6c9', fontWeight: 600 }}>
                    + 방 추가
                  </button>
                  <button onClick={() => setIsRemovingRoom(true)} className="export-btn"
                    style={{ background: '#fde8e8', color: '#c62828', borderColor: '#f5c2c2', fontWeight: 600 }}>
                    방 삭제
                  </button>
                  {undoHistory.length > 0 && (
                    <button onClick={handleUndo} className="export-btn"
                      style={{ background: '#f5f5f5', color: '#555', borderColor: '#ddd' }}>
                      ↩ 되돌리기
                    </button>
                  )}
                  {!isDesignConfirmed ? (
                    <button
                      onClick={() => { setIsDesignConfirmed(true); setRightTab('3d'); }}
                      className="export-btn"
                      style={{ background: '#1565c0', color: '#fff', borderColor: '#1565c0', fontWeight: 700 }}
                    >
                      도면 확정
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#2e7d32', fontWeight: 700, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      ✓ 확정됨
                    </span>
                  )}
                </>
              )}
              {(isAddingRoom || isRemovingRoom) && (
                <button
                  onClick={() => { setIsAddingRoom(false); setIsRemovingRoom(false); }}
                  className="export-btn"
                  style={{ color: '#b71c1c' }}
                >
                  취소
                </button>
              )}
              <button onClick={downloadPNG} className="export-btn">PNG</button>
              <button onClick={downloadSVG} className="export-btn">SVG</button>
              <button onClick={downloadPDF} className="export-btn">PDF</button>
            </div>
          </div>

          {/* 방 삭제 모드: 안내 바 */}
          {isRemovingRoom && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', background: '#fff0f0',
              borderBottom: '1px solid #ffd0d0',
            }}>
              <span style={{ fontSize: '11px', color: '#c62828', letterSpacing: '0.6px' }}>
                삭제할 방을 클릭하세요 — 클릭 위치의 방이 도면에서 제거됩니다
              </span>
            </div>
          )}

          {/* 방 추가 모드: 방 종류 선택 바 */}
          {isAddingRoom && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', background: '#f0f7ff',
              borderBottom: '1px solid #d0e4ff', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '11px', color: '#555', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
                추가할 방:
              </span>
              {ADD_ROOM_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setAddRoomType(opt.type)}
                  style={{
                    padding: '4px 12px', borderRadius: '14px', fontSize: '11px',
                    border: addRoomType === opt.type ? '1.5px solid #1565c0' : '1px solid #ccc',
                    background: addRoomType === opt.type ? '#1565c0' : '#fff',
                    color: addRoomType === opt.type ? '#fff' : '#444',
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.5px',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '4px' }}>
                → 도면에서 배치할 위치를 클릭하세요
              </span>
            </div>
          )}

          <div
            ref={svgContainerRef}
            className="svg-content"
            onClick={isAddingRoom ? handleSvgClickForRoom : isRemovingRoom ? handleSvgClickForDelete : undefined}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '0 0 10px 10px',
              padding: '16px',
              boxSizing: 'border-box',
              position: 'relative',
              cursor: (isAddingRoom || isRemovingRoom)
                ? ((isAddingRoomLoading || isRemovingRoomLoading) ? 'wait' : 'crosshair')
                : 'default',
            }}
          >
            {!svgOverride && Object.keys(orderJson).length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '13px', letterSpacing: '1px', textAlign: 'center' }}>
                대화를 통해 설계 요구사항을 모두 수집하면 도면이 생성됩니다.
              </div>
            ) : (
              <img
                src={displaySvgUrl}
                alt="2D floor plan"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* 방 추가/삭제 로딩 오버레이 */}
            {(isAddingRoomLoading || isRemovingRoomLoading) && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.72)',
                fontSize: '13px', color: '#555', letterSpacing: '1px',
              }}>
                {isAddingRoomLoading ? '방을 배치하는 중...' : '방을 삭제하는 중...'}
              </div>
            )}
          </div>
        </div>

        {/* ── 하단: 3D 탭 패널 ── */}
        <div className="panel svg-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 탭 헤더 */}
          <div className="json-header" style={{ gap: '0' }}>
            <div className="mac-dots" style={{ marginRight: '12px' }}>
              <div className="mac-dot red"></div>
              <div className="mac-dot yellow"></div>
              <div className="mac-dot green"></div>
            </div>
            {/* 탭 버튼 */}
            <button
              className={`bottom-tab-btn${rightTab === '3d' ? ' active' : ''}`}
              onClick={() => setRightTab('3d')}
            >
              3D RENDER
            </button>
            <button
              className={`bottom-tab-btn${rightTab === 'exterior' ? ' active' : ''}`}
              onClick={() => setRightTab('exterior')}
            >
              3D EXTERIOR
            </button>
            {/* 내보내기 버튼 (탭에 따라 표시) */}
            {rightTab === '3d' && (
              <div className="export-toolbar">
                <button onClick={download3dPNG} className="export-btn" disabled={!image3dUrl}>PNG</button>
                <button onClick={download3dSVG} className="export-btn" disabled={!image3dUrl}>SVG</button>
                <button onClick={download3dPDF} className="export-btn" disabled={!image3dUrl}>PDF</button>
              </div>
            )}
            {rightTab === 'exterior' && exteriorStyle && (
              <div className="export-toolbar">
                <button className="export-btn" onClick={() => { setExteriorStyle(null); setRefImages([null, null, null]); }}>
                  레퍼런스 재업로드
                </button>
              </div>
            )}
          </div>

          {/* ── 3D RENDER 콘텐츠 ── */}
          {rightTab === '3d' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px', overflow: 'hidden', padding: '16px', boxSizing: 'border-box', position: 'relative' }}>
              {!isDesignConfirmed ? (
                <div style={{ textAlign: 'center', color: '#aaa', lineHeight: 2 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 12px' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div style={{ fontSize: '13px', letterSpacing: '0.5px' }}>도면을 확정한 후 3D 렌더링을 사용할 수 있습니다.</div>
                  <div style={{ fontSize: '11px', marginTop: '6px', color: '#bbb' }}>2D 도면 상단의 "도면 확정" 버튼을 눌러주세요.</div>
                </div>
              ) : is3dLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '60%' }}>
                  <div style={{ color: '#666', fontSize: '13px', letterSpacing: '1.5px' }}>
                    3D RENDERING... {Math.round(renderProgress)}%
                  </div>
                  <div style={{ width: '100%', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${renderProgress}%`, backgroundColor: '#c8b89a', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ) : image3dUrl ? (
                <>
                  <img src={image3dUrl} alt="3D render" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  <button
                    onClick={() => generate3dRender(orderJson, svgMarkup, planGeometry)}
                    style={{ position: 'absolute', bottom: '16px', right: '16px', padding: '6px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', letterSpacing: '0.8px' }}
                  >
                    다시 렌더링
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: '13px', marginBottom: '20px', letterSpacing: '0.5px' }}>
                    도면이 확정되었습니다.<br />3D 렌더링을 시작하세요.
                  </div>
                  <button
                    onClick={() => generate3dRender(orderJson, svgMarkup, planGeometry)}
                    style={{ padding: '10px 32px', background: '#1565c0', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '1px' }}
                  >
                    렌더링하기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 3D EXTERIOR 콘텐츠 ── */}
          {rightTab === 'exterior' && (
            <>
              {/* 도면 미확정 — 잠금 */}
              {!isDesignConfirmed && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px' }}>
                  <div style={{ textAlign: 'center', color: '#aaa', lineHeight: 2 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 12px' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div style={{ fontSize: '13px', letterSpacing: '0.5px' }}>도면을 확정한 후 3D 외관을 사용할 수 있습니다.</div>
                    <div style={{ fontSize: '11px', marginTop: '6px', color: '#bbb' }}>2D 도면 상단의 "도면 확정" 버튼을 눌러주세요.</div>
                  </div>
                </div>
              )}

              {/* 도면 미완성 */}
              {isDesignConfirmed && !svgOverride && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px' }}>
                  <div style={{ color: '#aaa', fontSize: '13px', letterSpacing: '1px', textAlign: 'center', lineHeight: 2 }}>
                    2D 도면이 완성되면<br />레퍼런스 이미지를 업로드할 수 있습니다.
                  </div>
                </div>
              )}

              {/* 레퍼런스 업로드 UI */}
              {isDesignConfirmed && svgOverride && !exteriorStyle && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '22px', padding: '20px', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px' }}>
                  <div style={{ color: '#8b949e', fontSize: '11px', letterSpacing: '2px', textAlign: 'center' }}>
                    REFERENCE IMAGES — 원하는 외관 스타일의 이미지를 업로드하세요
                  </div>
                  <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <label key={i} className="ref-image-slot">
                        {refImages[i] ? (
                          <>
                            <img src={refImages[i].preview} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }} alt={`ref ${i + 1}`} />
                            <div className="ref-image-overlay">변경</div>
                          </>
                        ) : (
                          <div className="ref-image-placeholder">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="3" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>이미지 {i + 1}</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => handleRefImageUpload(i, e.target.files?.[0])} />
                      </label>
                    ))}
                  </div>
                  <button
                    className="analyze-btn"
                    disabled={isAnalyzingStyle}
                    onClick={analyzeReferenceImages}
                  >
                    {isAnalyzingStyle ? (
                      <><span className="analyze-spinner" />스타일 분석 중...</>
                    ) : '스타일 분석 및 3D 외관 생성'}
                  </button>
                  <div style={{ color: '#888', fontSize: '11px' }}>1~3장 업로드 가능 · 건축물 외관 사진 권장</div>
                </div>
              )}

              {/* Three.js 뷰어 */}
              {isDesignConfirmed && svgOverride && exteriorStyle && (
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '0 0 10px 10px' }}>
                  <ThreeExteriorViewer
                    key={JSON.stringify(exteriorStyle) + svgOverride.length}
                    svgString={svgOverride}
                    orderJson={orderJson}
                    styleData={exteriorStyle}
                    planGeometry={planGeometry}
                  />
                  <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: '11px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                    드래그: 회전 &nbsp;·&nbsp; 스크롤: 줌 &nbsp;·&nbsp; 우클릭: 이동
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;
