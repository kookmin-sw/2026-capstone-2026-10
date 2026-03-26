import React, { useState } from 'react';
import './App.css';

function App() {
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { sender: 'AI', text: '안녕하세요! Aichitect입니다.\n어떤 맞춤 공간을 만들어 드릴까요?\n자유롭게 이야기 해주세요.' }
  ]);
  const [orderJson, setOrderJson] = useState({});

  // ==========================================
  // [Step 2] LLM 프롬프트 및 API 통신 설정
  // ==========================================
  
  // 구글 Gemini API 키 (보안을 위해 발급받은 새 API 키를 아래에 입력해 주세요)
  const API_KEY = "AIzaSyCU3wqF40ZhPNYBoouVhAUYN85azQXJkQ4"; 

  // 건축 설계를 위한 최적화된 시스템 프롬프트 (스키마 압축 및 행렬 생성)
  const SYSTEM_PROMPT = `
    당신은 전문적인 모듈러 건축 설계 에이전트 'Aichitect'입니다. 
    사용자의 자연어 요구사항을 분석하여 오직 유효한 JSON 형식으로만 응답해야 합니다.
    시스템의 복잡도를 낮추기 위해 JSON 스키마는 반드시 다음 3가지 최상위 키만 사용하세요:
    
    1. "occupancy": 필요한 공간의 종류와 개수 (예: Entrance, LivingRoom, Bedroom_1, Kitchen, Bathroom).
    2. "relationship": 공간 간의 물리적 배치 요구사항이나 동선 정보.
       - 하위 키로 반드시 "relationship_matrix"를 포함할 것. 각 공간끼리 인접해야 하는 선호도를 0.1 ~ 1.0 사이의 점수로 산정하세요 (예: 거실과 주방이 가까워야 하면 0.8).
    3. "space_traits": 공간의 분위기, 채광, 디자인 스타일 등 공간적 특성.

    출력 예시:
    {
      "occupancy": { "Entrance": 1, "LivingRoom": 1, "Bedroom": 2, "Kitchen": 1, "Bathroom": 1 },
      "relationship": {
        "description": "거실과 주방이 연결된 열린 구조",
        "relationship_matrix": {
          "Entrance": { "LivingRoom": 0.8, "Bathroom": 0.4 },
          "LivingRoom": { "Entrance": 0.8, "Kitchen": 0.9, "Bedroom_1": 0.5 }
        }
      },
      "space_traits": { "style": "cozy", "light": "south-facing" },
      "reply_message": "포근한 분위기의 집을 원하시는군요! 거실과 주방이 가깝게 배치된 평면을 구성해 보았습니다."
    }
  `;

  // 실제 API 호출 함수 (오류 3가지 완벽 수정됨)
  const fetchLLMResponse = async (userMessage) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n사용자 요구사항: " + userMessage }] }
          ],
          // 문제 1 해결: 카멜 케이스(responseMimeType)로 변경
          generationConfig: { responseMimeType: "application/json" } 
        })
      });

      const data = await response.json();

      // 문제 3 해결: API 자체 에러 반환 검사 (앱 멈춤 방지)
      if (data.error) {
        console.error("API 응답 에러:", data.error.message);
        return null;
      }

      let jsonText = data.candidates[0].content.parts[0].text;
      
      // 문제 2 해결: 마크다운 코드 블록 기호 깔끔하게 제거
      jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

      return JSON.parse(jsonText);
      
    } catch (error) {
      console.error("데이터 파싱 또는 통신 에러:", error);
      return null;
    }
  };

  // ==========================================

  // 메시지 전송 핸들러 수정
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    // 1. 사용자 메시지 화면에 즉시 추가
    const userText = inputText;
    setChatHistory((prev) => [...prev, { sender: 'USER', text: userText }]);
    setInputText("");

    // 2. 로딩 상태 표시
    setChatHistory((prev) => [...prev, { sender: 'AI', text: '요구사항을 분석하여 공간 블록을 구성하고 있습니다...' }]);

    // 3. LLM API 호출하여 ORDER.JSON 받아오기
    const aiData = await fetchLLMResponse(userText);

    if (aiData) {
      // 로딩 메시지 제거 후 실제 답변 및 JSON 데이터 업데이트
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory.pop(); // 로딩 메시지 삭제
        newHistory.push({ sender: 'AI', text: aiData.reply_message || "공간 구조도를 생성했습니다." });
        return newHistory;
      });
      
      // 화면 우측의 ORDER.JSON 뷰어에 데이터 전달
      delete aiData.reply_message; // 화면 출력용 메시지는 JSON 뷰어에서 제외
      setOrderJson(aiData);
    } else {
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory.pop();
        newHistory.push({ sender: 'AI', text: '데이터 처리에 실패했습니다. 콘솔 창의 에러 메시지나 API 키를 확인해주세요.' });
        return newHistory;
      });
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', padding: '20px', gap: '20px' }}>
      
      {/* 좌측: 대화형 에이전트 뷰 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h1 className="aichitect-headline-large">AICHITECT</h1>
        <h2 className="aichitect-title-large">DESIGN CONVERSATION</h2>
        <p className="aichitect-body-medium" style={{ marginBottom: '20px' }}>
          자유롭게 만들고 싶은 공간에 대해 이야기 해주세요. 구체화를 위한 질문을 드릴게요.
        </p>
        
        <div className="angular-shadow-medium" style={{ flex: 1, padding: '20px', overflowY: 'auto', marginBottom: '20px' }}>
          {chatHistory.map((chat, index) => (
            <div key={index} style={{ textAlign: chat.sender === 'USER' ? 'right' : 'left', marginBottom: '15px' }}>
              <span className="aichitect-label-medium angular-shadow-small" 
                    style={{ 
                      display: 'inline-block', padding: '10px 15px', 
                      backgroundColor: chat.sender === 'USER' ? '#000' : '#fff',
                      color: chat.sender === 'USER' ? '#fff' : '#000'
                    }}>
                {chat.text}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            className="aichitect-body-large angular-shadow-small"
            style={{ flex: 1, padding: '15px', outline: 'none' }}
            type="text" 
            placeholder="예: 포근한 분위기 집을 만들고 싶어요." 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button 
            className="aichitect-label-medium angular-shadow-small"
            style={{ padding: '0 20px', cursor: 'pointer', backgroundColor: '#000', color: '#fff' }}
            onClick={handleSendMessage}
          >
            전송
          </button>
        </div>
      </div>

      {/* 우측: JSON 주문서 뷰 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h2 className="aichitect-title-large" style={{ paddingBottom: '36px' }}>ORDER.JSON</h2>
        <div className="angular-shadow-medium code-font" 
             style={{ flex: 1, backgroundColor: '#000', color: '#fff', padding: '20px', overflowY: 'auto' }}>
          <pre style={{ margin: 0, fontSize: '14px' }}>
            {Object.keys(orderJson).length > 0 
              ? JSON.stringify(orderJson, null, 2) 
              : "// 대화를 바탕으로 JSON 데이터가 생성됩니다."}
          </pre>
        </div>
      </div>

    </div>
  );
}

export default App;