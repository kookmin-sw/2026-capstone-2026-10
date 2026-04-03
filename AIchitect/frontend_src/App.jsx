import React, { useState, useRef, useEffect, useMemo } from 'react';
import './App.css';

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
  const occupancy = orderJson?.occupancy || {};
  const result = [];

  Object.entries(occupancy).forEach(([rawName, rawCount]) => {
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
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e8e1d8" stroke-width="1"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="900" height="600" fill="#f8f4ec"/>
        <rect x="18" y="18" width="864" height="564" rx="28" fill="url(#grid)" stroke="#111111" stroke-width="2"/>
        <text x="450" y="300" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-size="16" font-weight="600" fill="#888888" letter-spacing="1">
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
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const svgMarkup = useMemo(() => {
    return svgOverride || buildFallbackSvg(orderJson);
  }, [orderJson, svgOverride]);

  // 구글 Gemini API 키 (주의: 운영 환경에서는 백엔드로 분리해야 합니다)
  const API_KEY = "AIzaSyDdySWDsjk3Qe-6JCxwMaNhJw9O_zlDlac"; 

  const SYSTEM_PROMPT = `
    당신은 전문적인 모듈러 건축 설계 에이전트 'Aichitect'입니다. 
    사용자와 자연스럽게 대화하며 건축에 필요한 요구사항을 단계별로 수집하고, 모든 정보가 모이면 최종 설계도를 생성해야 합니다.
    응답은 항상 유효한 JSON 형식으로만 작성하세요.

    [요구사항 수집 규칙]
    다음 3가지 핵심 정보가 모두 수집되었는지 확인하세요:
    1. 필요한 공간의 종류와 개수 (거실, 침실, 주방, 화장실 등)
    2. 공간 간의 물리적 배치나 동선 선호도 (예: 거실과 주방이 붙어있어야 함)
    3. 공간의 분위기나 디자인 특성 (예: 우드톤, 남향, 모던 등)

    [응답 JSON 스키마]
    {
      "status": "상태값", 
      "reply_message": "사용자에게 할 대답이나 질문",
      "occupancy": { ... }, 
      "relationship": { ... }, 
      "space_traits": { ... }
    }

    [상태(status) 값 설정 기준]
    - "interviewing": 위 3가지 정보 중 부족한 것이 있을 때. 이때는 occupancy, relationship, space_traits 필드를 비워두고, reply_message를 통해 부족한 정보를 하나씩 자연스럽게 물어보세요. (한 번에 하나씩만 물어볼 것)
    - "complete": 위 3가지 정보가 충분히 수집되었을 때. 이때는 reply_message에 "모든 정보가 수집되어 도면을 생성했습니다!" 등의 인사를 남기고, 나머지 설계 데이터(occupancy, relationship, space_traits)를 완벽하게 채워 반환하세요.
  `;

  const fetchLLMResponse = async (userMessage, history) => {
    try {
      const historyContext = history
        .map(chat => `${chat.sender === 'USER' ? '사용자' : 'AI'}: ${chat.text}`)
        .join('\n');
      
      const fullPrompt = `${SYSTEM_PROMPT}\n\n[지금까지의 대화 내역]\n${historyContext}\n사용자: ${userMessage}\nAI:`;

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
        const jsonToDisplay = { ...aiData };
        delete jsonToDisplay.reply_message; 
        delete jsonToDisplay.status; 
        
        if (jsonToDisplay.svg_markup) {
          setSvgOverride(jsonToDisplay.svg_markup);
          delete jsonToDisplay.svg_markup;
        } else {
          setSvgOverride('');
        }
        setOrderJson(jsonToDisplay);
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
    const canvas = document.createElement('canvas');
    canvas.width = 1800; // 해상도를 2배로 높여 선명하게 저장
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // 배경색 채우기
      ctx.fillStyle = '#f8f4ec';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 이미지를 캔버스에 그리기
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

  // 4. PDF 다운로드 (브라우저 인쇄 모드)
  const downloadPDF = () => {
    window.print();
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
        <div className="panel-header">
          <h1 className="panel-title">Aichitect</h1>
          <p className="panel-subtitle">공간에 대한 아이디어를 대화로 구체화해보세요.</p>
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

      {/* 우측: 뷰어 패널 구역 */}
      <div className="right-panels" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="panel svg-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div className="json-header">
            <div className="mac-dots">
              <div className="mac-dot red"></div>
              <div className="mac-dot yellow"></div>
              <div className="mac-dot green"></div>
            </div>
            <span className="json-title">LIVE PREVIEW</span>
            
            {/* 내보내기 툴바 */}
            <div className="export-toolbar">
              <button onClick={downloadPNG} className="export-btn" title="PNG 다운로드">PNG</button>
              <button onClick={downloadSVG} className="export-btn" title="SVG 다운로드">SVG</button>
              <button onClick={downloadPDF} className="export-btn" title="PDF 인쇄">PDF</button>
              <div className="divider"></div>
              <button onClick={handleShare} className="export-btn share-btn" title="공유하기">
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
          </div>

          <div className="svg-content" style={{ flex: 1, padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f4ec', borderRadius: '0 0 10px 10px' }}>
            <div dangerouslySetInnerHTML={{ __html: svgMarkup }} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
