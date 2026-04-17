import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────
// SVG fallback parser (planGeometry가 없을 때만 사용)
// ─────────────────────────────────────────────────────────
const SVG_SCALE   = 80;
const SVG_PADDING = 40;

function parseSvgRooms(svgString) {
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    return Array.from(doc.querySelectorAll('polygon')).map(poly => {
      const pts = poly.getAttribute('points').trim().split(/\s+/).map(pt => {
        const [px, pz] = pt.split(',').map(Number);
        return { x: (px - SVG_PADDING) / SVG_SCALE, z: (pz - SVG_PADDING) / SVG_SCALE };
      });
      const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      return {
        x: minX, y: minZ, width: maxX - minX, depth: maxZ - minZ,
        space_type: 'unknown',
      };
    });
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
export default function ThreeExteriorViewer({ svgString, orderJson, styleData, planGeometry }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const w = container.clientWidth  || 600;
    const h = container.clientHeight || 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#C8DCF0');
    scene.fog = new THREE.Fog('#C8DCF0', 60, 130);

    // Camera
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 250);
    camera.position.set(22, 16, 22);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight('#e8f0ff', 0.75));

    const sun = new THREE.DirectionalLight('#fff8e0', 1.8);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 120;
    sun.shadow.camera.left   = -30;
    sun.shadow.camera.right  = 30;
    sun.shadow.camera.top    = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);

    const fill = new THREE.DirectionalLight('#d0e8ff', 0.35);
    fill.position.set(-12, 8, -12);
    scene.add(fill);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance   = 5;
    controls.maxDistance   = 90;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 2, 0);
    controls.update();

    buildScene(scene, controls, planGeometry, svgString, orderJson, styleData);

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const obs = new ResizeObserver(() => {
      const nw = container.clientWidth, nh = container.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    obs.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [svgString, orderJson, styleData, planGeometry]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />;
}

// ─────────────────────────────────────────────────────────
// Scene builder
// ─────────────────────────────────────────────────────────
function countRooms(orderJson) {
  const spaces = orderJson?.required_spaces || [];
  return Math.max(
    spaces.reduce((s, str) => { const m = str.match(/(\d+)/); return s + (m ? +m[1] : 1); }, 0),
    3
  );
}

function buildScene(scene, controls, planGeometry, svgString, orderJson, styleData) {
  // ── 1. 공간 데이터 수집 ───────────────────────────────
  const pgSpaces = planGeometry?.spaces || [];
  let spaces;

  if (pgSpaces.length) {
    spaces = pgSpaces;
  } else if (svgString) {
    spaces = parseSvgRooms(svgString);
  } else {
    const n = countRooms(orderJson);
    const bW = Math.min(12, 6 + n * 0.5);
    const bD = Math.min(10, 5 + n * 0.4);
    spaces = [{ x: 0, y: 0, width: bW, depth: bD, space_type: 'default' }];
  }

  if (!spaces.length) return;

  // ── 2. 바운딩 박스 ────────────────────────────────────
  const minX = Math.min(...spaces.map(s => s.x));
  const maxX = Math.max(...spaces.map(s => s.x + s.width));
  const minY = Math.min(...spaces.map(s => s.y));
  const maxY = Math.max(...spaces.map(s => s.y + s.depth));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bW = maxX - minX;
  const bD = maxY - minY;

  // plan 좌표 → Three.js 월드 (Y up, Z = north = +)
  const toW = (px, py) => ({ x: px - cx, z: py - cy });

  // 직사각형 판별
  const totalArea = spaces.reduce((s, sp) => s + sp.width * sp.depth, 0);
  const rect = Math.abs(totalArea - bW * bD) / (bW * bD) < 0.05;

  const roomCount = countRooms(orderJson);
  const twoStory  = roomCount >= 7;
  const bH        = twoStory ? 6.5 : 3.2;
  const isModern  = ['modern', 'minimalist', 'contemporary'].includes(styleData?.style);

  // 지붕 타입
  let roofType;
  if (!rect || twoStory) {
    roofType = 'flat';
  } else {
    roofType = styleData?.roofType ?? (isModern ? 'flat' : 'gable');
  }

  // ── 재질 ──────────────────────────────────────────────
  const wallC   = new THREE.Color(styleData?.wallColor   || '#F0EBE1');
  const roofC   = new THREE.Color(styleData?.roofColor   || '#5C4B35');
  const accentC = new THREE.Color(styleData?.accentColor || '#7A6550');
  const windowC = new THREE.Color('#B8D8EA');

  const wallMat   = new THREE.MeshStandardMaterial({ color: wallC,   roughness: 0.85 });
  const roofMat   = new THREE.MeshStandardMaterial({ color: roofC,   roughness: 0.90 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentC, roughness: 0.70 });
  const winMat    = new THREE.MeshStandardMaterial({ color: windowC, roughness: 0.10, metalness: 0.10, transparent: true, opacity: 0.75 });
  const doorMat   = new THREE.MeshStandardMaterial({ color: new THREE.Color(accentC).multiplyScalar(0.65), roughness: 0.60 });
  const stepMat   = new THREE.MeshStandardMaterial({ color: '#C8B898', roughness: 0.85 });
  const grassMat  = new THREE.MeshStandardMaterial({ color: '#7CB87B', roughness: 0.95 });
  const pathMat   = new THREE.MeshStandardMaterial({ color: '#C4B49A', roughness: 0.90 });
  const hedgeMat  = new THREE.MeshStandardMaterial({ color: '#3E8E41', roughness: 0.95 });

  // ── 3. 지면 ───────────────────────────────────────────
  addMesh(scene, new THREE.PlaneGeometry(100, 100), grassMat, { rx: -Math.PI / 2, receiveShadow: true });

  // ── 4. 건물 본체: 방 단위 박스 ────────────────────────
  for (const sp of spaces) {
    const w = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    addMesh(scene, new THREE.BoxGeometry(sp.width, bH, sp.depth), wallMat,
      { x: w.x, y: bH / 2, z: w.z, castShadow: true, receiveShadow: true });
  }

  // 2층 벨트 코스
  if (twoStory) {
    for (const sp of spaces) {
      const w = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
      addMesh(scene, new THREE.BoxGeometry(sp.width + 0.06, 0.12, sp.depth + 0.06), accentMat,
        { x: w.x, y: bH / 2, z: w.z });
    }
  }

  // ── 5. 지붕 (패러핏 제거) ─────────────────────────────
  if (roofType === 'flat') {
    buildFlatRoof(scene, spaces, toW, bH, roofMat);
  } else if (roofType === 'hip') {
    buildHipRoof(scene, roofMat, bW, bD, bH);
  } else {
    buildGableRoof(scene, roofMat, wallMat, bW, bD, bH);
  }

  // 굴뚝 (직사각형 박공지붕일 때만)
  if (styleData?.hasChimney && roofType === 'gable') {
    const rH = bW * 0.18;
    addMesh(scene, new THREE.BoxGeometry(0.6, 1.4, 0.6), accentMat,
      { x: bW * 0.15, y: bH + rH * 0.6, castShadow: true });
    addMesh(scene, new THREE.BoxGeometry(0.75, 0.12, 0.75), accentMat,
      { x: bW * 0.15, y: bH + rH * 0.6 + 0.72 });
  }

  // ── 6. 창문 & 문 (plan_geometry 기반) ──────────────────
  const openings = planGeometry?.openings || [];
  const extWindows = openings.filter(op => op.kind === 'window' && op.placement === 'exterior');
  const entranceOp = openings.find(op =>
    op.kind === 'opening' && op.placement === 'exterior' && op.source_edge_type === 'entry'
  );

  // 창문 배치: 도면의 정확한 위치
  const winY = bH * 0.45;
  for (const win of extWindows) {
    const mx = (win.x1 + win.x2) / 2;
    const my = (win.y1 + win.y2) / 2;
    let { x: wx, z: wz } = toW(mx, my);

    const isHoriz = Math.abs(win.y1 - win.y2) < 0.01;
    const winWidth = Math.sqrt((win.x2 - win.x1) ** 2 + (win.y2 - win.y1) ** 2);
    let rotY;

    if (isHoriz) {
      rotY = 0;
      if (win.host_side === 'north') wz -= 0.01; else wz += 0.01;
    } else {
      rotY = Math.PI / 2;
      if (win.host_side === 'east') wx += 0.01; else wx -= 0.01;
    }

    buildWindow(scene, winMat, accentMat, wx, winY, wz, rotY, winWidth);
    if (twoStory) {
      buildWindow(scene, winMat, accentMat, wx, winY + bH / 2, wz, rotY, winWidth);
    }
  }

  // plan_geometry가 없을 때 기본 창문 (fallback)
  if (!extWindows.length) {
    const northZ = bD / 2;
    const numPairs = Math.min(2, Math.max(1, Math.floor(roomCount / 3)));
    const offsets = numPairs === 1 ? [bW * 0.26] : [bW * 0.16, bW * 0.38];
    offsets.forEach(off => {
      buildWindow(scene, winMat, accentMat, -off, winY, northZ + 0.01, 0);
      buildWindow(scene, winMat, accentMat,  off, winY, northZ + 0.01, 0);
    });
    if (bW >= 6) {
      const sideZ = northZ - bD * 0.18;
      buildWindow(scene, winMat, accentMat,  bW / 2 + 0.01, winY, sideZ,  Math.PI / 2);
      buildWindow(scene, winMat, accentMat, -bW / 2 - 0.01, winY, sideZ, -Math.PI / 2);
    }
  }

  // ── 7. 현관 (도면 위치 기반) ───────────────────────────
  let doorX, doorZ, doorRotY;

  if (entranceOp) {
    const mx = (entranceOp.x1 + entranceOp.x2) / 2;
    const my = (entranceOp.y1 + entranceOp.y2) / 2;
    ({ x: doorX, z: doorZ } = toW(mx, my));

    const side = entranceOp.host_side;
    if (side === 'north')      { doorZ -= 0.01; doorRotY = Math.PI; }
    else if (side === 'south') { doorZ += 0.01; doorRotY = 0; }
    else if (side === 'east')  { doorX += 0.01; doorRotY = Math.PI / 2; }
    else                       { doorX -= 0.01; doorRotY = -Math.PI / 2; }
  } else {
    // Fallback: 북쪽 면 중앙
    doorX = 0;
    doorZ = bD / 2 + 0.01;
    doorRotY = 0;
  }

  buildEntrance(scene, doorX, doorZ, doorRotY, doorMat, accentMat, stepMat, pathMat, hedgeMat, bW);

  // ── 8. 나무 ───────────────────────────────────────────
  buildTree(scene, -bW / 2 - 3.0, 0,  bD * 0.15);
  buildTree(scene,  bW / 2 + 3.0, 0,  bD * 0.15);
  buildTree(scene,  bW / 2 + 2.2, 0, -bD * 0.3);

  // 카메라 타겟
  controls.target.set(0, bH * 0.4, 0);
  controls.update();
}

// ─────────────────────────────────────────────────────────
// 현관 빌더 (문, 캐노피, 계단, 진입로, 생울타리)
// ─────────────────────────────────────────────────────────
function buildEntrance(scene, x, z, rotY, doorMat, accentMat, stepMat, pathMat, hedgeMat, bW) {
  const doorH = 2.2, doorW = 1.0;
  const canopyY = doorH + 0.25;
  const canopyD = 0.9;

  // 그룹: 모든 현관 요소를 문 방향에 맞게 회전
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rotY;

  // 문
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
  door.position.y = doorH / 2;
  grp.add(door);

  // 문틀
  const frame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, doorH + 0.1, 0.06), accentMat);
  frame.position.set(0, doorH / 2 + 0.05, -0.01);
  grp.add(frame);

  // 캐노피
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, canopyD), accentMat);
  canopy.position.set(0, canopyY, canopyD / 2);
  canopy.castShadow = true;
  grp.add(canopy);

  // 캐노피 기둥
  const pillarGeo = new THREE.CylinderGeometry(0.05, 0.05, canopyY, 8);
  const p1 = new THREE.Mesh(pillarGeo, accentMat);
  p1.position.set(-0.75, canopyY / 2, canopyD);
  grp.add(p1);
  const p2 = new THREE.Mesh(pillarGeo, accentMat);
  p2.position.set(0.75, canopyY / 2, canopyD);
  grp.add(p2);

  // 계단
  [0, 1].forEach(i => {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(1.8 - i * 0.3, 0.14, 0.38), stepMat
    );
    step.position.set(0, 0.07 + i * 0.14, 0.3 + (1 - i) * 0.38);
    grp.add(step);
  });

  // 생울타리
  const hedgeW = Math.min(bW * 0.18, 2.0);
  const hedgeGeo = new THREE.BoxGeometry(hedgeW, 0.5, 0.45);
  const h1 = new THREE.Mesh(hedgeGeo, hedgeMat);
  h1.position.set(-(doorW / 2 + hedgeW / 2 + 0.5), 0.25, 0.2);
  grp.add(h1);
  const h2 = new THREE.Mesh(hedgeGeo, hedgeMat);
  h2.position.set(doorW / 2 + hedgeW / 2 + 0.5, 0.25, 0.2);
  grp.add(h2);

  scene.add(grp);

  // 진입로 (문 방향으로 뻗어나감)
  const pathLen = 8;
  const pathGrp = new THREE.Group();
  pathGrp.position.set(x, 0, z);
  pathGrp.rotation.y = rotY;
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, pathLen), pathMat);
  pm.rotation.x = -Math.PI / 2;
  pm.position.set(0, 0.01, pathLen / 2 + 1.0);
  pathGrp.add(pm);
  scene.add(pathGrp);
}

// ─────────────────────────────────────────────────────────
// 지붕 빌더
// ─────────────────────────────────────────────────────────

// 평지붕: 방 단위 슬래브 (패러핏 없음)
function buildFlatRoof(scene, spaces, toW, bH, roofMat) {
  const slabH = 0.22;
  for (const sp of spaces) {
    const w = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    addMesh(scene, new THREE.BoxGeometry(sp.width + 0.05, slabH, sp.depth + 0.05), roofMat,
      { x: w.x, y: bH + slabH / 2, z: w.z, castShadow: true });
  }
}

// 박공지붕 (직사각형 건물 전용)
function buildGableRoof(scene, roofMat, wallMat, bW, bD, bH) {
  const oh = 0.25;
  const rH = bW * 0.18;

  const shape = new THREE.Shape();
  shape.moveTo(-(bW / 2 + oh), 0);
  shape.lineTo(0, rH);
  shape.lineTo( bW / 2 + oh, 0);
  shape.closePath();

  const geo  = new THREE.ExtrudeGeometry(shape, { depth: bD + oh * 2, bevelEnabled: false });
  const roof = new THREE.Mesh(geo, [roofMat, wallMat, wallMat]);
  roof.position.set(0, bH, -(bD / 2 + oh));
  roof.castShadow = true;
  scene.add(roof);
}

// 모임지붕 (직사각형 건물 전용)
function buildHipRoof(scene, mat, bW, bD, bH) {
  const oh = 0.25;
  const rH = Math.min(bW, bD) * 0.20;
  const hw = bW / 2 + oh, hd = bD / 2 + oh, cy = bH + rH;

  const verts = new Float32Array([
    -hw, bH,  hd,   hw, bH,  hd,   0, cy, 0,
     hw, bH, -hd,  -hw, bH, -hd,   0, cy, 0,
     hw, bH,  hd,   hw, bH, -hd,   0, cy, 0,
    -hw, bH, -hd,  -hw, bH,  hd,   0, cy, 0,
    -hw, bH, -hd,   hw, bH, -hd,   hw, bH,  hd,
    -hw, bH, -hd,   hw, bH,  hd,  -hw, bH,  hd,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, mat);
  roof.castShadow = true;
  scene.add(roof);
}

// ─────────────────────────────────────────────────────────
// 창문 (프레임 + 유리) — width 가변
// ─────────────────────────────────────────────────────────
function buildWindow(scene, winMat, frameMat, x, y, z, rotY, width = 1.0) {
  const h = 1.0;
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.10), frameMat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, width - 0.15), h - 0.15, 0.07), winMat);
  glass.position.z = 0.015;
  grp.add(glass);
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  scene.add(grp);
}

// ─────────────────────────────────────────────────────────
// 나무
// ─────────────────────────────────────────────────────────
function buildTree(scene, x, y, z) {
  addMesh(scene, new THREE.CylinderGeometry(0.14, 0.20, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: '#5D4037', roughness: 0.9 }),
    { x, y: y + 0.8, z, castShadow: true });
  addMesh(scene, new THREE.SphereGeometry(1.35, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#2E7D32', roughness: 0.95 }),
    { x, y: y + 2.9, z, castShadow: true });
}

// ─────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────
function addMesh(scene, geo, mat, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  if (opts.x  !== undefined) mesh.position.x = opts.x;
  if (opts.y  !== undefined) mesh.position.y = opts.y;
  if (opts.z  !== undefined) mesh.position.z = opts.z;
  if (opts.rx !== undefined) mesh.rotation.x = opts.rx;
  if (opts.castShadow)    mesh.castShadow    = true;
  if (opts.receiveShadow) mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
