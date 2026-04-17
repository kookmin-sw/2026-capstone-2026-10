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
    { sender: 'AI', text: '안녕하세요! Aichitect입니다.\n어떤 맞춤 공간을 만들어 드릴까요? 먼저 가족 구성원이나 주로 사용할 목적을 알려주시겠어요?' }
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
  const API_KEY = "AIzaSyBaxhIN2ZNIq63x13tNp-Cg-PqC_QH44dI";

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

  const generate3dRender = async (pipelineInput, svgString) => {
    setIs3dLoading(true);
    setImage3dUrl('');
    setRenderProgress(0);

    // 0 → 90%까지 서서히 채움 (API 응답 대기 시각화)
    progressTimerRef.current = setInterval(() => {
      setRenderProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressTimerRef.current);
          return 90;
        }
        // 초반엔 빠르게, 후반엔 천천히
        const step = prev < 40 ? 3 : prev < 70 ? 1.5 : 0.5;
        return Math.min(prev + step, 90);
      });
    }, 300);

    const spaces = pipelineInput.required_spaces.join(', ');
    const prefs = pipelineInput.preferences.join(', ');

    const prompt = `TASK: Generate a single photorealistic isometric architectural cutaway rendering. Follow every rule below without exception.

=== PROJECTION (NON-NEGOTIABLE) ===
- Isometric projection ONLY. Camera fixed at exactly 30° above horizon, plan rotated exactly 45°.
- ALL parallel lines stay parallel. Zero vanishing points. Zero perspective distortion.
- Vertical walls are perfectly vertical. Horizontal floor edges run at exactly ±30° from horizontal.
- The entire building sits on a flat white (#FFFFFF) background. No ground plane texture, no sky, no environment.

=== ROOMS ===
Spaces to render: ${spaces}.
User preferences: ${prefs}.
- Every room listed above must appear. No extra rooms, no missing rooms.
- Room proportions and adjacencies must exactly match the attached 2D floor plan.
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
        { text: planBase64
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
    당신은 전문적인 모듈러 건축 설계 에이전트 'Aichitect'입니다.
    사용자와 자연스럽게 대화하며 건축에 필요한 요구사항을 단계별로 수집하고, 모든 정보가 모이면 최종 설계도를 생성해야 합니다.
    응답은 항상 유효한 JSON 형식으로만 작성하세요.

    [요구사항 수집 규칙]
    다음 3가지 핵심 정보가 모두 수집되었는지 확인하세요:
    1. 필요한 공간의 종류와 개수 (거실, 침실, 주방, 화장실 등)
    2. 공간 간의 물리적 배치나 동선 선호도 (예: 거실과 주방이 붙어있어야 함)
    3. 공간의 분위기나 디자인 특성 (예: 밝은, 조용한, 프라이버시 등)

    [응답 JSON 스키마]
    {
      "status": "상태값",
      "reply_message": "사용자에게 할 대답이나 질문",
      "family_type": "가족 구성 (예: 4인 가족)",
      "housing_type": "단독주택",
      "road_facing": "도로 방향. 남쪽/북쪽/동쪽/서쪽 중 하나",
      "required_spaces": ["공간명 개수 형식 배열. 예: 침실 2개, 거실, 주방, 화장실 1개"],
      "preferences": ["사용자의 배치/분위기 선호를 문장 배열로. 예: 거실은 밝고 햇빛이 잘 들어야 한다"]
    }

    [required_spaces 작성 규칙]
    - 반드시 한국어로, "공간명 N개" 형식으로 작성하세요.
    - 사용 가능한 공간명: 거실, 침실, 주방, 욕실, 작업실, 서재, 계단, 복도
    - 개수가 1개면 "거실" 처럼 개수 생략 가능, 2개 이상이면 "침실 2개" 형식 필수

    [상태(status) 값 설정 기준]
    - "interviewing": 정보가 부족할 때. required_spaces, preferences는 빈 배열로 두고 reply_message로 하나씩 질문하세요.
    - "complete": 3가지 정보가 모두 수집됐을 때. reply_message에 완료 인사를 남기고 나머지 필드를 모두 채워 반환하세요.
  `;

  const ROAD_FACING_REQUIREMENT = `
    추가 필수 조건:
    - 도로가 어느 방향에 접하는지 반드시 물어보세요. 선택지는 남쪽, 북쪽, 동쪽, 서쪽입니다.
    - road_facing 필드를 JSON에 반드시 포함하세요.
    - road_facing 값은 "남쪽", "북쪽", "동쪽", "서쪽" 중 하나로 작성하세요.
    - 공간/관계/분위기 정보가 있어도 도로 방향이 없으면 status는 "interviewing"입니다.
    - complete가 되려면 required_spaces, preferences, road_facing이 모두 있어야 합니다.
  `;

  const fetchLLMResponse = async (userMessage, history) => {
    try {
      const historyContext = history
        .map(chat => `${chat.sender === 'USER' ? '사용자' : 'AI'}: ${chat.text}`)
        .join('\n');

      const fullPrompt = `${SYSTEM_PROMPT}\n\n${ROAD_FACING_REQUIREMENT}\n\n[지금까지의 대화 내역]\n${historyContext}\n사용자: ${userMessage}\nAI:`;

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
        console.error("API 응답 에러:", data.error.message);
        return null;
      }

      let jsonText = data.candidates[0].content.parts[0].text;
      jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

      return JSON.parse(jsonText);

    } catch (error) {
      console.error("데이터 파싱 또는 통신 에러:", error);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userText = inputText;
    const currentHistory = [...chatHistory];

    setChatHistory((prev) => [...prev, { sender: 'USER', text: userText }]);
    setInputText("");
    setIsLoading(true);

    const aiData = await fetchLLMResponse(userText, currentHistory);

    if (aiData) {
      setChatHistory((prev) => [
        ...prev,
        { sender: 'AI', text: aiData.reply_message || "응답을 생성했습니다." }
      ]);

      if (aiData.status === 'complete') {
        const pipelineInput = {
          family_type: aiData.family_type || "",
          housing_type: aiData.housing_type || "단독주택",
          road_facing: aiData.road_facing || "남쪽",
          required_spaces: aiData.required_spaces || [],
          preferences: aiData.preferences || [],
        };
        setOrderJson(pipelineInput);

        setChatHistory((prev) => [
          ...prev,
          { sender: 'AI', text: '도면을 생성하는 중입니다...' }
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
            setChatHistory((prev) => [
              ...prev,
              { sender: 'AI', text: '2D 도면이 생성되었습니다! 3D 렌더링을 생성하는 중입니다...' }
            ]);
            generate3dRender(pipelineInput, resData.svg);
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
    } else {
      setChatHistory((prev) => [
        ...prev,
        { sender: 'AI', text: '데이터 처리에 실패했습니다. API 키나 네트워크 상태를 확인해주세요.' }
      ]);
    }

    setIsLoading(false);
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
        text: `이 건축물 외관 레퍼런스 이미지들을 분석해 디자인 스타일을 추출하세요.
반드시 아래 JSON 형식으로만 응답하세요 (설명 없이 JSON만):
{
  "wallColor": "#F0EBE1",
  "roofColor": "#5C4B35",
  "accentColor": "#7A6550",
  "roofType": "gable",
  "style": "traditional",
  "hasChimney": false
}
roofType: "gable" | "flat" | "hip"
style: "modern" | "traditional" | "minimalist" | "rustic" | "contemporary"
색상은 이미지에서 추출한 실제 hex 코드로 작성하세요.`,
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
        roofType: 'gable', style: 'traditional', hasChimney: false,
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
          <p className="panel-subtitle">공간에 대한 아이디어를 대화로 구체화해보세요.</p>
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
            placeholder="예: 따뜻한 햇살이 들어오는 우드톤의 거실을 원해요."
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
              <button onClick={downloadPNG} className="export-btn">PNG</button>
              <button onClick={downloadSVG} className="export-btn">SVG</button>
              <button onClick={downloadPDF} className="export-btn">PDF</button>
            </div>
          </div>
          <div className="svg-content" style={{ flex: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px' }}>
            <img
              src={displaySvgUrl}
              alt="2D floor plan"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              {is3dLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '60%' }}>
                  <div style={{ color: '#666', fontSize: '13px', letterSpacing: '1.5px' }}>
                    3D RENDERING... {Math.round(renderProgress)}%
                  </div>
                  <div style={{ width: '100%', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${renderProgress}%`, backgroundColor: '#c8b89a', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ) : image3dUrl ? (
                <img src={image3dUrl} alt="3D render" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#aaa', fontSize: '13px', letterSpacing: '1px' }}>2D 도면이 완성되면 3D 렌더링이 생성됩니다.</div>
              )}
            </div>
          )}

          {/* ── 3D EXTERIOR 콘텐츠 ── */}
          {rightTab === 'exterior' && (
            <>
              {/* 도면 미완성 */}
              {!svgOverride && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px' }}>
                  <div style={{ color: '#aaa', fontSize: '13px', letterSpacing: '1px', textAlign: 'center', lineHeight: 2 }}>
                    2D 도면이 완성되면<br />레퍼런스 이미지를 업로드할 수 있습니다.
                  </div>
                </div>
              )}

              {/* 레퍼런스 업로드 UI */}
              {svgOverride && !exteriorStyle && (
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
                              <rect x="3" y="3" width="18" height="18" rx="3"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
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
              {svgOverride && exteriorStyle && (
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
