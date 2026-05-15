import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls }      from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFExporter }        from 'three/addons/exporters/GLTFExporter.js';

// ─── Constants ────────────────────────────────────────────
const SVG_SCALE   = 80;
const SVG_PADDING = 40;

const MINI_W   = 100;
const MINI_PAD = 7;

const SPACE_FILL_COLORS = {
  living_room:    '#fef9ec',
  kitchen:        '#fdf3d0',
  entrance:       '#fdebd0',
  bedroom:        '#e8f0fb',
  master_bedroom: '#ddeaf8',
  child_bedroom:  '#eef4fd',
  bathroom:       '#e4f4f4',
  workspace:      '#eaf5ea',
  connector:      '#f5f5f5',
  vertical_core:  '#ececec',
};

const LABEL_NAME_MAP = {
  entrance:       'ENTRANCE',
  living_room:    'LIVING',
  kitchen:        'KITCHEN',
  workspace:      'WORK',
  bedroom:        'BEDROOM',
  master_bedroom: 'MASTER BR',
  child_bedroom:  'CHILD BR',
  bathroom:       'BATH',
  connector:      'HALL',
  vertical_core:  'CORE',
};

const ROOM_FLOOR_COLORS = {
  living_room:    '#C8A96E',
  kitchen:        '#B8A88A',
  entrance:       '#B4B0AA',
  bedroom:        '#D8CFC4',
  master_bedroom: '#CFC6BA',
  child_bedroom:  '#D8D0C8',
  bathroom:       '#C8D4D4',
  workspace:      '#C4C0B0',
  connector:      '#C0BAB0',
  vertical_core:  '#C0BAB0',
};

const ROOM_WALL_COLORS = {
  bathroom:       '#E6F2F2',
  kitchen:        '#F4F0E6',
  living_room:    '#F2EDE5',
  bedroom:        '#EDE8E0',
  master_bedroom: '#EAE4DC',
  child_bedroom:  '#EEF0EA',
  workspace:      '#ECECF0',
  entrance:       '#F0EDE6',
  connector:      '#EEEBE4',
};

const ROOM_LIGHT_COLORS = {
  bathroom:       '#E8F4FF',
  kitchen:        '#FFF5D0',
  living_room:    '#FFF2D8',
  bedroom:        '#FFE8C0',
  master_bedroom: '#FFE8C0',
  child_bedroom:  '#FFEEDD',
  workspace:      '#F4F8FF',
  entrance:       '#FFF8EC',
};

// ─── Helpers ──────────────────────────────────────────────
function parseSvgRooms(svgString) {
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    return Array.from(doc.querySelectorAll('polygon')).map(poly => {
      const pts = poly.getAttribute('points').trim().split(/\s+/).map(pt => {
        const [px, pz] = pt.split(',').map(Number);
        return { x: (px - SVG_PADDING) / SVG_SCALE, z: (pz - SVG_PADDING) / SVG_SCALE };
      });
      const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
      return {
        x: Math.min(...xs), y: Math.min(...zs),
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...zs) - Math.min(...zs),
        space_type: 'unknown',
      };
    });
  } catch { return []; }
}

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 26px "IBM Plex Sans", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.7, 1);
  return sprite;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── Component ────────────────────────────────────────────
export default function ThreeExteriorViewer({ svgString, orderJson, styleData, planGeometry }) {
  const mountRef      = useRef(null);
  const threeRef      = useRef(null);
  const animRef       = useRef({ active: false });
  const keysRef       = useRef({ w: false, a: false, s: false, d: false });
  const isInteriorRef   = useRef(false);
  const miniMapDotRef = useRef(null);
  const planBoundsRef = useRef(null);

  const [isInterior, setIsInterior] = useState(false);
  const [isLocked,   setIsLocked]   = useState(false);

  const miniRooms = useMemo(() => {
    const pgSp = planGeometry?.spaces || [];
    if (!pgSp.length) return null;
    const minX = Math.min(...pgSp.map(s => s.x));
    const maxX = Math.max(...pgSp.map(s => s.x + s.width));
    const minY = Math.min(...pgSp.map(s => s.y));
    const maxY = Math.max(...pgSp.map(s => s.y + s.depth));
    const scale = (MINI_W - MINI_PAD * 2) / Math.max(maxX - minX, maxY - minY);
    return pgSp.map((sp, i) => (
      <rect key={i}
        x={(( sp.x            - minX) * scale + MINI_PAD).toFixed(2)}
        y={((maxY - sp.y - sp.depth) * scale + MINI_PAD).toFixed(2)}
        width={(sp.width * scale).toFixed(2)}
        height={(sp.depth * scale).toFixed(2)}
        fill={SPACE_FILL_COLORS[sp.space_type] || '#eee'}
        stroke="rgba(255,255,255,0.35)" strokeWidth="0.6"
      />
    ));
  }, [planGeometry]);

  // keep ref in sync for use inside tick closure
  useEffect(() => { isInteriorRef.current = isInterior; }, [isInterior]);

  // ── Scene setup ────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const w = container.clientWidth  || 600;
    const h = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#C8DCF0');
    scene.fog = new THREE.Fog('#C8DCF0', 35, 75);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 250);
    const EXT_CAM_POS = new THREE.Vector3(22, 16, 22);
    camera.position.copy(EXT_CAM_POS);

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
    sun.position.set(20, 30, 15); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far  = 120;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top  = 30; sun.shadow.camera.bottom = -30;
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#d0e8ff', 0.35);
    fill.position.set(-12, 8, -12); scene.add(fill);

    const intLight = new THREE.PointLight('#fff5e0', 0, 40);
    intLight.position.set(0, 2.5, 0); scene.add(intLight);

    // OrbitControls (exterior)
    const orbitCtrl = new OrbitControls(camera, renderer.domElement);
    orbitCtrl.enableDamping = true; orbitCtrl.dampingFactor = 0.05;
    orbitCtrl.minDistance = 5; orbitCtrl.maxDistance = 90;
    orbitCtrl.maxPolarAngle = Math.PI / 2.1;

    // PointerLockControls (interior)
    const plCtrl = new PointerLockControls(camera, renderer.domElement);
    plCtrl.addEventListener('lock',   () => setIsLocked(true));
    plCtrl.addEventListener('unlock', () => {
      setIsLocked(false);
      keysRef.current = { w: false, a: false, s: false, d: false };
    });

    // WASD
    const onKeyDown = e => {
      if (e.code === 'KeyW') keysRef.current.w = true;
      if (e.code === 'KeyA') keysRef.current.a = true;
      if (e.code === 'KeyS') keysRef.current.s = true;
      if (e.code === 'KeyD') keysRef.current.d = true;
    };
    const onKeyUp = e => {
      if (e.code === 'KeyW') keysRef.current.w = false;
      if (e.code === 'KeyA') keysRef.current.a = false;
      if (e.code === 'KeyS') keysRef.current.s = false;
      if (e.code === 'KeyD') keysRef.current.d = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);

    // Build scene geometry
    const result = buildScene(scene, planGeometry, svgString, orderJson, styleData);

    // Store plan bounds for mini-map
    const _pgSp = planGeometry?.spaces || [];
    if (_pgSp.length) {
      const minX = Math.min(..._pgSp.map(s => s.x));
      const maxX = Math.max(..._pgSp.map(s => s.x + s.width));
      const minY = Math.min(..._pgSp.map(s => s.y));
      const maxY = Math.max(..._pgSp.map(s => s.y + s.depth));
      planBoundsRef.current = { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    const EXT_TARGET = new THREE.Vector3(0, result.bH * 0.4, 0);
    orbitCtrl.target.copy(EXT_TARGET);
    orbitCtrl.update();

    threeRef.current = {
      camera, renderer, scene,
      orbitCtrl, plCtrl, intLight,
      wallMats:      result.wallMats,
      roofGroup:     result.roofGroup,
      interiorGroup: result.interiorGroup,
      roomBoxGroup:  result.roomBoxGroup,
      bH:            result.bH,
      interiorCamPos: result.interiorCamPos,
      interiorTarget: result.interiorTarget,
      exteriorCamPos: EXT_CAM_POS.clone(),
      exteriorTarget: EXT_TARGET.clone(),
    };

    // Animation loop
    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);

      // Camera transition
      const anim = animRef.current;
      if (anim.active) {
        anim.t = Math.min(1, anim.t + 0.022);
        const e = easeInOut(anim.t);
        camera.position.lerpVectors(anim.fromCam, anim.toCam, e);
        if (anim.fromTarget && anim.toTarget) {
          orbitCtrl.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
        }
        if (anim.t >= 1) anim.active = false;
      }

      // WASD movement (interior, pointer locked)
      if (plCtrl.isLocked) {
        const spd  = 0.06;
        const keys = keysRef.current;
        if (keys.w) plCtrl.moveForward(spd);
        if (keys.s) plCtrl.moveForward(-spd);
        if (keys.a) plCtrl.moveRight(-spd);
        if (keys.d) plCtrl.moveRight(spd);
      }

      // Mini-map: update dot from camera position
      if (isInteriorRef.current) {
        const pb = planBoundsRef.current;
        if (pb && miniMapDotRef.current) {
          const scale = (MINI_W - MINI_PAD * 2) / Math.max(pb.maxX - pb.minX, pb.maxY - pb.minY);
          const planX = camera.position.x + pb.cx;
          const planY = pb.cy - camera.position.z;
          const svgX  = (planX - pb.minX) * scale + MINI_PAD;
          const svgY  = (pb.maxY - planY) * scale + MINI_PAD;
          miniMapDotRef.current.setAttribute('cx', svgX.toFixed(1));
          miniMapDotRef.current.setAttribute('cy', svgY.toFixed(1));
        }
      }

      if (!isInteriorRef.current) orbitCtrl.update();
      renderer.render(scene, camera);
    };
    tick();

    const obs = new ResizeObserver(() => {
      const nw = container.clientWidth, nh = container.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    obs.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
      orbitCtrl.dispose(); plCtrl.dispose();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [svgString, orderJson, styleData, planGeometry]);

  // ── Mode switch ────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (isInterior) {
      t.orbitCtrl.enabled = false;
      t.roofGroup.visible     = false;
      t.roomBoxGroup.visible  = false;
      t.interiorGroup.visible = true;
      t.intLight.intensity    = 1.4;
      animRef.current = {
        active: true, t: 0,
        fromCam: t.camera.position.clone(), toCam: t.interiorCamPos.clone(),
        fromTarget: null, toTarget: null,
      };
    } else {
      if (t.plCtrl.isLocked) t.plCtrl.unlock();
      setIsLocked(false);
      t.roofGroup.visible     = true;
      t.roomBoxGroup.visible  = true;
      t.interiorGroup.visible = false;
      t.intLight.intensity    = 0;
      animRef.current = {
        active: true, t: 0,
        fromCam:    t.camera.position.clone(),   toCam:    t.exteriorCamPos.clone(),
        fromTarget: t.orbitCtrl.target.clone(),  toTarget: t.exteriorTarget.clone(),
      };
      // re-enable orbit after animation finishes
      setTimeout(() => {
        if (threeRef.current) threeRef.current.orbitCtrl.enabled = true;
      }, 1200);
    }
  }, [isInterior]);

  const handleCanvasClick = () => {
    const t = threeRef.current;
    if (isInteriorRef.current && t?.plCtrl && !t.plCtrl.isLocked) {
      t.plCtrl.lock();
    }
  };

  const exitInterior = () => {
    if (threeRef.current?.plCtrl?.isLocked) threeRef.current.plCtrl.unlock();
    setIsInterior(false);
  };

  const [isExporting, setIsExporting] = useState(false);

  const downloadGLB = () => {
    const scene = threeRef.current?.scene;
    if (!scene) return;
    setIsExporting(true);
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (glb) => {
        const blob = new Blob([glb], { type: 'application/octet-stream' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'AIchitect_model.glb';
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
      },
      (err) => { console.error('GLB export error:', err); setIsExporting(false); },
      { binary: true }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Three.js canvas */}
      <div
        ref={mountRef}
        onClick={handleCanvasClick}
        style={{ width: '100%', height: '100%', cursor: isInterior && !isLocked ? 'pointer' : isInterior ? 'none' : 'grab' }}
      />

      {/* ── 외부 뷰: 내부 진입 + 모델 다운로드 버튼 ── */}
      {!isInterior && (
        <div style={{
          position: 'absolute', bottom: '44px', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: '10px', alignItems: 'center',
        }}>
          <button
            onClick={() => setIsInterior(true)}
            style={{ ...btnStyle({ dark: false }), position: 'static' }}
          >
            내부 진입 →
          </button>
          <button
            onClick={downloadGLB}
            disabled={isExporting}
            style={{
              ...btnStyle({ dark: false }),
              position: 'static',
              opacity: isExporting ? 0.55 : 1,
            }}
          >
            {isExporting ? '변환 중…' : '↓ 3D 모델 받기'}
          </button>
        </div>
      )}

      {/* ── 내부, 포인터 미잠금: 안내 오버레이 ── */}
      {isInterior && !isLocked && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}>
          <p style={overlayTitle}>클릭하여 탐색 시작</p>
          <p style={overlayHint}>WASD 이동 &nbsp;·&nbsp; 마우스 시점</p>
          <button
            onClick={exitInterior}
            style={{ ...btnStyle({ dark: true }), marginTop: '28px', pointerEvents: 'auto' }}
          >
            ← 외부 뷰
          </button>
        </div>
      )}

      {/* ── 내부, 포인터 잠금: ESC 힌트 ── */}
      {isInterior && isLocked && (
        <div style={{
          position: 'absolute', top: '14px', right: '16px',
          color: 'rgba(255,255,255,0.55)',
          fontSize: '11px', letterSpacing: '1.4px',
          fontFamily: '"IBM Plex Sans", Arial, sans-serif',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          ESC · 종료
        </div>
      )}

      {/* ── 내부, 포인터 잠금: 미니맵 ── */}
      {isInterior && isLocked && miniRooms && (
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          width: `${MINI_W}px`,
          background: 'rgba(10,10,10,0.55)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.12)',
          pointerEvents: 'none',
        }}>
          <svg width={MINI_W} height={MINI_W} style={{ display: 'block' }}>
            {miniRooms}
            <circle ref={miniMapDotRef} r="3.5" cx="0" cy="0" fill="#FF3C3C" stroke="white" strokeWidth="1" />
          </svg>
          <div style={{
            textAlign: 'center', fontSize: '8px', letterSpacing: '1.2px',
            color: 'rgba(255,255,255,0.4)', fontFamily: '"IBM Plex Sans", Arial, sans-serif',
            userSelect: 'none', padding: '3px 0',
          }}>
            KEY PLAN
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Button style helper ───────────────────────────────────
function btnStyle({ dark = false, ...pos } = {}) {
  return {
    position: 'absolute',
    padding: '7px 22px',
    background: dark ? 'rgba(20,20,20,0.80)' : 'rgba(255,255,255,0.82)',
    color: dark ? '#f0f0f0' : '#1a1a1a',
    border: '1px solid rgba(0,0,0,0.18)',
    borderRadius: '24px',
    fontSize: '11px',
    letterSpacing: '1.8px',
    fontFamily: '"IBM Plex Sans", Arial, sans-serif',
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    whiteSpace: 'nowrap',
    zIndex: 10,
    ...pos,
  };
}

const overlayTitle = {
  margin: 0,
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: '600',
  letterSpacing: '1px',
  fontFamily: '"IBM Plex Sans", Arial, sans-serif',
};

const overlayHint = {
  margin: '10px 0 0',
  color: 'rgba(255,255,255,0.65)',
  fontSize: '12px',
  letterSpacing: '1.2px',
  fontFamily: '"IBM Plex Sans", Arial, sans-serif',
};

// ─── Scene builder ────────────────────────────────────────
function buildScene(scene, planGeometry, svgString, orderJson, styleData) {
  const pgSpaces = planGeometry?.spaces || [];
  let spaces;
  if (pgSpaces.length) {
    spaces = pgSpaces;
  } else if (svgString) {
    spaces = parseSvgRooms(svgString);
  } else {
    const n = countRooms(orderJson);
    spaces = [{ x: 0, y: 0, width: Math.min(12, 6 + n * 0.5), depth: Math.min(10, 5 + n * 0.4), space_type: 'default' }];
  }

  const EMPTY = {
    wallMats: [], roofGroup: new THREE.Group(), interiorGroup: new THREE.Group(),
    roomBoxGroup: new THREE.Group(),
    bH: 3.2, interiorCamPos: new THREE.Vector3(0, 1.6, 3), interiorTarget: new THREE.Vector3(0, 1.2, 0),
  };
  if (!spaces.length) return EMPTY;

  const minX = Math.min(...spaces.map(s => s.x));
  const maxX = Math.max(...spaces.map(s => s.x + s.width));
  const minY = Math.min(...spaces.map(s => s.y));
  const maxY = Math.max(...spaces.map(s => s.y + s.depth));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const bW = maxX - minX, bD = maxY - minY;
  const toW = (px, py) => ({ x: px - cx, z: cy - py });

  const totalArea = spaces.reduce((s, sp) => s + sp.width * sp.depth, 0);
  const rect = Math.abs(totalArea - bW * bD) / (bW * bD) < 0.05;

  const bH = 3.2;
  const isModern = ['modern', 'minimalist', 'contemporary'].includes(styleData?.style);
  // If styleData specifies a roof type, always honour it; only fall back to flat for non-rect plans when no preference given
  const requestedRoof = styleData?.roofType;
  const roofType = requestedRoof
    ? requestedRoof
    : (!rect || isModern ? 'flat' : 'gable');

  // Materials
  const wallC   = new THREE.Color(styleData?.wallColor   || '#F0EBE1');
  const roofC   = new THREE.Color(styleData?.roofColor   || '#5C4B35');
  const accentC = new THREE.Color(styleData?.accentColor || '#7A6550');
  const windowC = new THREE.Color('#B8D8EA');

  const wallMats = [];
  const newWallMat = () => {
    const m = new THREE.MeshStandardMaterial({ color: wallC, roughness: 0.85 });
    wallMats.push(m); return m;
  };
  const roofMat   = new THREE.MeshStandardMaterial({ color: roofC,   roughness: 0.90 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentC, roughness: 0.70 });
  const winMat    = new THREE.MeshStandardMaterial({ color: windowC, roughness: 0.10, metalness: 0.10, transparent: true, opacity: 0.75 });
  const stepMat   = new THREE.MeshStandardMaterial({ color: '#C8B898', roughness: 0.85 });
  const groundColor = new THREE.Color(styleData?.groundColor || '#7CB87B');
  const grassMat  = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.95 });

  // Ground
  addMesh(scene, new THREE.PlaneGeometry(400, 400), grassMat, { rx: -Math.PI / 2, receiveShadow: true });

  // Building floor slabs — cover grass gaps between room boxes
  const floorSlabMat = new THREE.MeshStandardMaterial({ color: '#E8E0D0', roughness: 0.90 });
  for (const sp of spaces) {
    const w = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(sp.width + 0.08, sp.depth + 0.08),
      floorSlabMat
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(w.x, 0.005, w.z);
    slab.receiveShadow = true;
    scene.add(slab);
  }

  // Walls (one box per room) — grouped so interior mode can hide them
  const roomBoxGroup = new THREE.Group();
  scene.add(roomBoxGroup);
  for (const sp of spaces) {
    const w = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    addMesh(roomBoxGroup, new THREE.BoxGeometry(sp.width, bH, sp.depth), newWallMat(),
      { x: w.x, y: bH / 2, z: w.z, castShadow: true, receiveShadow: true });
  }

  // Roof group
  const roofGroup = new THREE.Group();
  scene.add(roofGroup);
  if      (roofType === 'flat') buildFlatRoof(roofGroup, spaces, toW, bH, roofMat);
  else if (roofType === 'hip')  buildHipRoof(roofGroup, spaces, toW, bH, roofMat);
  else                          buildGableRoof(roofGroup, spaces, toW, bH, roofMat);

  if (styleData?.hasChimney && roofType === 'gable' && spaces.length) {
    const sp = spaces[0];
    const wc = toW(sp.x + sp.width * 0.3, sp.y + sp.depth / 2);
    const rH = Math.min(sp.width, sp.depth) * 0.25;
    addMesh(roofGroup, new THREE.BoxGeometry(0.6, 1.4, 0.6), accentMat, { x: wc.x, y: bH + rH * 0.5, z: wc.z });
    addMesh(roofGroup, new THREE.BoxGeometry(0.75, 0.12, 0.75), accentMat, { x: wc.x, y: bH + rH * 0.5 + 0.72, z: wc.z });
  }

  // Windows & door
  const openings   = planGeometry?.openings || [];
  const extWindows = openings.filter(op => op.kind === 'window' && op.placement === 'exterior');

  const hasLivWin  = extWindows.some(op => isLivingRoom(op.space_type));
  const winY       = bH * 0.45;

  for (const win of extWindows) {
    const mx = (win.x1 + win.x2) / 2, my = (win.y1 + win.y2) / 2;
    let { x: wx, z: wz } = toW(mx, my);
    const isHoriz  = Math.abs(win.y1 - win.y2) < 0.01;
    const winWidth = Math.sqrt((win.x2 - win.x1) ** 2 + (win.y2 - win.y1) ** 2);
    let rotY;
    if (isHoriz) {
      // Determine north vs south by proximity to building boundary
      const isNorth = my <= (minY + maxY) / 2;
      rotY = isNorth ? 0 : Math.PI;
      if (isNorth) wz -= 0.01; else wz += 0.01;
    } else {
      // Determine east vs west by proximity to building boundary
      const isEast = mx >= (minX + maxX) / 2;
      rotY = isEast ? Math.PI / 2 : -Math.PI / 2;
      if (isEast) wx += 0.01; else wx -= 0.01;
    }
    if (isLivingRoom(win.space_type))
      buildPanoramicWindow(scene, accentMat, wx, wz, rotY, winWidth, bH);
    else
      buildWindow(scene, winMat, accentMat, wx, winY, wz, rotY, winWidth);
  }

  if (!extWindows.length) {
    const rc     = countRooms(orderJson);
    const northZ = bD / 2;
    const offs   = Math.min(2, Math.max(1, Math.floor(rc / 3))) === 1 ? [bW * 0.26] : [bW * 0.16, bW * 0.38];
    offs.forEach(off => {
      buildWindow(scene, winMat, accentMat, -off, winY, northZ + 0.01, 0);
      buildWindow(scene, winMat, accentMat,  off, winY, northZ + 0.01, 0);
    });
    if (bW >= 6) {
      const sZ = northZ - bD * 0.18;
      buildWindow(scene, winMat, accentMat,  bW / 2 + 0.01, winY, sZ,  Math.PI / 2);
      buildWindow(scene, winMat, accentMat, -bW / 2 - 0.01, winY, sZ, -Math.PI / 2);
    }
  }

  if (!hasLivWin) {
    const livSp = spaces.find(sp => isLivingRoom(sp.space_type));
    const outerEd = (planGeometry?.outer_edges || []).filter(e =>
      livSp && e.space_id === livSp.id &&
      Math.sqrt((e.x2 - e.x1) ** 2 + (e.y2 - e.y1) ** 2) >= 1.8
    );
    let livEdge = outerEd.sort((a, b) =>
      Math.sqrt((b.x2 - b.x1) ** 2 + (b.y2 - b.y1) ** 2) -
      Math.sqrt((a.x2 - a.x1) ** 2 + (a.y2 - a.y1) ** 2)
    )[0];
    if (!livEdge && livSp) {
      const eps = 0.05;
      if      (Math.abs(livSp.y - minY) < eps)                livEdge = { x1: livSp.x, y1: livSp.y, x2: livSp.x + livSp.width, y2: livSp.y, side: 'north' };
      else if (Math.abs(livSp.x + livSp.width - maxX) < eps) livEdge = { x1: livSp.x + livSp.width, y1: livSp.y, x2: livSp.x + livSp.width, y2: livSp.y + livSp.depth, side: 'east' };
      else if (Math.abs(livSp.y + livSp.depth - maxY) < eps) livEdge = { x1: livSp.x, y1: livSp.y + livSp.depth, x2: livSp.x + livSp.width, y2: livSp.y + livSp.depth, side: 'south' };
      else if (Math.abs(livSp.x - minX) < eps)               livEdge = { x1: livSp.x, y1: livSp.y, x2: livSp.x, y2: livSp.y + livSp.depth, side: 'west' };
    }
    if (livEdge) {
      const p = getCenterLineWindowPlacement(livEdge, toW, minX, maxX, minY, maxY);
      buildPanoramicWindow(scene, accentMat, p.x, p.z, p.rotY, p.width, bH);
    }
  }

  // Entrance — door panel + steps + wall-mounted canopy (no pillars)
  const entranceOp = openings.find(op => op.kind === 'opening' && op.placement === 'exterior' && op.source_edge_type === 'entry');
  if (entranceOp) {
    const mx = (entranceOp.x1 + entranceOp.x2) / 2, my = (entranceOp.y1 + entranceOp.y2) / 2;
    const { x: enX, z: enZ } = toW(mx, my);
    const side = entranceOp.host_side;
    let enRotY = 0;
    if      (side === 'north') enRotY = Math.PI;
    else if (side === 'south') enRotY = 0;
    else if (side === 'east')  enRotY = Math.PI / 2;
    else                       enRotY = -Math.PI / 2;
    buildEntrance(roomBoxGroup, enX, enZ, enRotY, accentMat, stepMat);
  }

  // Trees — varied sizes for natural grouping
  buildTree(scene, -bW / 2 - 3.0, 0,  bD * 0.15, 1.0);
  buildTree(scene,  bW / 2 + 3.0, 0,  bD * 0.15, 1.25);
  buildTree(scene,  bW / 2 + 2.2, 0, -bD * 0.3,  0.82);

  // ── Interior group ──────────────────────────────────────
  const interiorGroup = new THREE.Group();
  interiorGroup.visible = false;
  scene.add(interiorGroup);

  for (const sp of spaces) {
    const wc  = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);

    // Floor — room-specific material
    const floorColor = ROOM_FLOOR_COLORS[sp.space_type] || '#D4C8B8';
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(sp.width, sp.depth),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(floorColor), roughness: 0.75 })
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(wc.x, 0.02, wc.z);
    tile.receiveShadow = true;
    interiorGroup.add(tile);

    // Ceiling panel
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(sp.width, sp.depth),
      new THREE.MeshStandardMaterial({ color: '#F8F6F2', roughness: 0.75, side: THREE.DoubleSide })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(wc.x, bH, wc.z);
    interiorGroup.add(ceiling);

    // Room-specific wall color panels (opening-aware, open-boundary-aware)
    addRoomWalls(interiorGroup, sp, toW, cx, cy, bH,
      ROOM_WALL_COLORS[sp.space_type] || '#F0EBE1',
      planGeometry?.openings   || [],
      planGeometry?.inner_walls || [],
      planGeometry?.outer_edges || []);

    // Baseboard trim (opening-aware, open-boundary-aware)
    addBaseboard(interiorGroup, sp, toW, cx, cy,
      planGeometry?.openings   || [],
      planGeometry?.inner_walls || [],
      planGeometry?.outer_edges || []);

    // Per-room ceiling light
    const lColor = ROOM_LIGHT_COLORS[sp.space_type] || '#FFF8E8';
    const rLight = new THREE.PointLight(lColor, 0.60, Math.max(sp.width, sp.depth) * 2.4);
    rLight.position.set(wc.x, bH - 0.35, wc.z);
    interiorGroup.add(rLight);

    // Room label
    const label = LABEL_NAME_MAP[sp.space_type] || sp.space_type?.toUpperCase() || '';
    if (label) {
      const sprite = makeTextSprite(label);
      sprite.position.set(wc.x, 1.55, wc.z);
      interiorGroup.add(sprite);
    }

    // Room-specific furniture / details
    addRoomDetail(interiorGroup, sp, toW, cx, cy, bH, planGeometry?.openings || []);
  }

  // Wall panels with door/opening gaps — uses backend-classified wall data
  buildInteriorWalls(interiorGroup, planGeometry, cx, cy, bH);

  // Interior camera start position (near entrance, facing center)
  let interiorCamPos;
  const entrSp = spaces.find(s => s.space_type === 'entrance');
  if (entrSp) {
    const ew = toW(entrSp.x + entrSp.width / 2, entrSp.y + entrSp.depth / 2);
    interiorCamPos = new THREE.Vector3(ew.x, 1.65, ew.z);
  } else {
    interiorCamPos = new THREE.Vector3(0, 1.65, bD * 0.38);
  }
  const interiorTarget = new THREE.Vector3(0, 1.3, 0);

  return { wallMats, roofGroup, interiorGroup, roomBoxGroup, bH, interiorCamPos, interiorTarget };
}

// ─── Scene helper functions ───────────────────────────────
function countRooms(orderJson) {
  const spaces = orderJson?.required_spaces || [];
  return Math.max(spaces.reduce((s, str) => { const m = str.match(/(\d+)/); return s + (m ? +m[1] : 1); }, 0), 3);
}

function isLivingRoom(t) { return t === 'living_room' || t === 'living' || t === 'LivingRoom'; }

function getCenterLineWindowPlacement(edge, toW, minX, maxX, minY, maxY) {
  const mx = (edge.x1 + edge.x2) / 2, my = (edge.y1 + edge.y2) / 2;
  let { x, z } = toW(mx, my);
  const isHoriz = Math.abs(edge.y1 - edge.y2) < 0.01;
  const width   = Math.max(1.6, Math.sqrt((edge.x2 - edge.x1) ** 2 + (edge.y2 - edge.y1) ** 2) * 0.92);
  let rotY;
  if (isHoriz) {
    const isNorth = (edge.side === 'north') || (edge.side == null && my <= (minY + maxY) / 2);
    rotY = isNorth ? 0 : Math.PI;
    if (isNorth) z -= 0.01; else z += 0.01;
  } else {
    const isEast = (edge.side === 'east') || (edge.side == null && mx >= (minX + maxX) / 2);
    rotY = isEast ? Math.PI / 2 : -Math.PI / 2;
    if (isEast) x += 0.01; else x -= 0.01;
  }
  return { x, z, rotY, width };
}

// Returns true if another room occupies the given edge side of sp (plan coords).
// Returns array of [start, end] ranges (in edge-parallel plan coords) that have no neighbour.
function _exteriorSegments(sp, edge, spaces, eps = 0.05) {
  const covered = [];
  for (const other of spaces) {
    if (other === sp) continue;
    let s, e;
    if (edge === 'north') {
      if (Math.abs(other.y + other.depth - sp.y) >= eps) continue;
      s = Math.max(other.x, sp.x); e = Math.min(other.x + other.width, sp.x + sp.width);
    } else if (edge === 'south') {
      if (Math.abs(other.y - (sp.y + sp.depth)) >= eps) continue;
      s = Math.max(other.x, sp.x); e = Math.min(other.x + other.width, sp.x + sp.width);
    } else if (edge === 'west') {
      if (Math.abs(other.x + other.width - sp.x) >= eps) continue;
      s = Math.max(other.y, sp.y); e = Math.min(other.y + other.depth, sp.y + sp.depth);
    } else {  // east
      if (Math.abs(other.x - (sp.x + sp.width)) >= eps) continue;
      s = Math.max(other.y, sp.y); e = Math.min(other.y + other.depth, sp.y + sp.depth);
    }
    if (e > s + eps) covered.push([s, e]);
  }

  const fullS = (edge === 'north' || edge === 'south') ? sp.x : sp.y;
  const fullE = (edge === 'north' || edge === 'south') ? sp.x + sp.width : sp.y + sp.depth;

  covered.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const seg of covered) {
    if (!merged.length || seg[0] > merged[merged.length - 1][1] + eps) merged.push([...seg]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], seg[1]);
  }

  const exterior = [];
  let cur = fullS;
  for (const [cs, ce] of merged) {
    if (cs - cur > eps) exterior.push([cur, cs]);
    cur = Math.max(cur, ce);
  }
  if (fullE - cur > eps) exterior.push([cur, fullE]);
  return exterior;
}

function buildFlatRoof(target, spaces, toW, bH, mat) {
  const slabH = 0.18, paraH = 0.32, paraT = 0.14, oh = 0.06;

  for (const sp of spaces) {
    const w  = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    const sw = sp.width  + oh * 2;
    const sd = sp.depth  + oh * 2;

    addMesh(target, new THREE.BoxGeometry(sw, slabH, sd), mat,
      { x: w.x, y: bH + slabH / 2, z: w.z, castShadow: true });

    const py = bH + slabH + paraH / 2;
    const nZ = w.z + sd / 2 - paraT / 2;  // plan-north ↔ scene +Z
    const sZ = w.z - sd / 2 + paraT / 2;  // plan-south ↔ scene -Z
    const wX = w.x - sw / 2 + paraT / 2;  // plan-west  ↔ scene -X
    const eX = w.x + sw / 2 - paraT / 2;  // plan-east  ↔ scene +X

    // north/south: segments are in plan-X → scene-X
    for (const [s, e] of _exteriorSegments(sp, 'north', spaces))
      addMesh(target, new THREE.BoxGeometry(e - s, paraH, paraT), mat,
        { x: toW((s + e) / 2, sp.y).x, y: py, z: nZ, castShadow: true });
    for (const [s, e] of _exteriorSegments(sp, 'south', spaces))
      addMesh(target, new THREE.BoxGeometry(e - s, paraH, paraT), mat,
        { x: toW((s + e) / 2, sp.y).x, y: py, z: sZ, castShadow: true });
    // west/east: segments are in plan-Y → scene-Z (inverted)
    for (const [s, e] of _exteriorSegments(sp, 'west', spaces))
      addMesh(target, new THREE.BoxGeometry(paraT, paraH, e - s), mat,
        { x: wX, y: py, z: toW(sp.x, (s + e) / 2).z, castShadow: true });
    for (const [s, e] of _exteriorSegments(sp, 'east', spaces))
      addMesh(target, new THREE.BoxGeometry(paraT, paraH, e - s), mat,
        { x: eX, y: py, z: toW(sp.x, (s + e) / 2).z, castShadow: true });
  }
}

function buildGableRoof(target, spaces, toW, bH, mat) {
  // Build one gable roof per room so irregular footprints are handled correctly.
  const oh = 0.22;
  for (const sp of spaces) {
    const wc   = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    const spW  = sp.width, spD = sp.depth;
    const shape = new THREE.Shape();

    if (spW >= spD) {
      // Ridge E-W (longer axis). Pitch spans depth.
      const rH = spD * 0.24;
      shape.moveTo(-(spD / 2 + oh), 0); shape.lineTo(0, rH); shape.lineTo(spD / 2 + oh, 0); shape.closePath();
      const geo  = new THREE.ExtrudeGeometry(shape, { depth: spW + oh * 2, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(wc.x - (spW / 2 + oh), bH, wc.z);
      mesh.castShadow = true;
      target.add(mesh);
    } else {
      // Ridge N-S (longer axis). Pitch spans width.
      const rH = spW * 0.24;
      shape.moveTo(-(spW / 2 + oh), 0); shape.lineTo(0, rH); shape.lineTo(spW / 2 + oh, 0); shape.closePath();
      const geo  = new THREE.ExtrudeGeometry(shape, { depth: spD + oh * 2, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(wc.x, bH, wc.z - (spD / 2 + oh));
      mesh.castShadow = true;
      target.add(mesh);
    }
  }
}

function buildHipRoof(target, spaces, toW, bH, mat) {
  // Build one hip roof per room so irregular footprints are handled correctly.
  const oh = 0.22;
  for (const sp of spaces) {
    const wc = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
    _hipRoomPanel(target, mat, sp.width, sp.depth, bH, wc.x, wc.z, oh);
  }
}

function _hipRoomPanel(target, mat, spW, spD, bH, cx, cz, oh) {
  const hw  = spW / 2 + oh;
  const hd  = spD / 2 + oh;
  const rH  = Math.min(hw, hd) * 0.42;  // local ridge height (Y=0 = eave level)

  let verts;
  if (spW >= spD) {
    const rl = (spW - spD) / 2;
    verts = new Float32Array([
      // South slope
       hw, 0, -hd,  -hw, 0, -hd,  -rl, rH, 0,
       hw, 0, -hd,  -rl, rH,  0,   rl, rH, 0,
      // North slope
      -hw, 0,  hd,   hw, 0,  hd,   rl, rH, 0,
      -hw, 0,  hd,   rl, rH,  0,  -rl, rH, 0,
      // East hip
       hw, 0,  hd,   hw, 0, -hd,   rl, rH, 0,
      // West hip
      -hw, 0, -hd,  -hw, 0,  hd,  -rl, rH, 0,
      // Eave cap
      -hw, 0, -hd,   hw, 0, -hd,   hw, 0,  hd,
      -hw, 0, -hd,   hw, 0,  hd,  -hw, 0,  hd,
    ]);
  } else {
    const rl = (spD - spW) / 2;
    verts = new Float32Array([
      // East slope
       hw, 0,  hd,   hw, 0, -hd,    0, rH, -rl,
       hw, 0,  hd,    0, rH, -rl,    0, rH,  rl,
      // West slope
      -hw, 0, -hd,  -hw, 0,  hd,    0, rH,  rl,
      -hw, 0, -hd,    0, rH,  rl,    0, rH, -rl,
      // South hip
       hw, 0, -hd,  -hw, 0, -hd,    0, rH, -rl,
      // North hip
      -hw, 0,  hd,   hw, 0,  hd,    0, rH,  rl,
      // Eave cap
      -hw, 0, -hd,   hw, 0, -hd,   hw, 0,  hd,
      -hw, 0, -hd,   hw, 0,  hd,  -hw, 0,  hd,
    ]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, bH, cz);
  mesh.castShadow = true;
  target.add(mesh);
}


function buildEntrance(target, x, z, rotY, accentMat, stepMat) {
  const doorH = 2.2, doorW = 1.0;
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rotY;

  // Door panel — dark wood, flush with wall face
  const doorPanelMat = new THREE.MeshStandardMaterial({ color: '#3E2A1A', roughness: 0.72 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorPanelMat);
  door.position.set(0, doorH / 2, 0.02);
  grp.add(door);

  // Wall-mounted canopy — thin slab directly above the opening, no pillars
  const canopyW = doorW + 0.8;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(canopyW, 0.10, 0.55), accentMat);
  canopy.position.set(0, doorH + 0.12, 0.25);
  canopy.castShadow = true;
  grp.add(canopy);

  // Steps
  [0, 1].forEach(i => {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 0.4 + i * 0.3, 0.12, 0.36),
      stepMat
    );
    step.position.set(0, 0.06 + i * 0.12, 0.22 + (1 - i) * 0.36);
    grp.add(step);
  });

  target.add(grp);
}

// Floor-to-ceiling panoramic window with vertical mullion divisions
function buildPanoramicWindow(scene, frameMat, x, z, rotY, width, bH) {
  const fD = 0.10, fT = 0.06;
  const sill = 0.15, head = 0.15;
  const fH   = bH - sill - head;   // nearly full wall height
  const cy   = sill + fH / 2;      // center Y from floor (≈ bH/2)
  const grp  = new THREE.Group();

  // Outer frame rails + stiles
  const addBar = (w, h, px, py) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, fD), frameMat);
    m.position.set(px, py, 0); grp.add(m);
  };
  addBar(width, fT, 0,                  fH / 2 - fT / 2);   // top rail
  addBar(width, fT, 0,                -(fH / 2 - fT / 2));  // bottom rail
  addBar(fT,    fH, -(width / 2 - fT / 2), 0);              // left stile
  addBar(fT,    fH,   width / 2 - fT / 2,  0);              // right stile

  // Vertical mullions — one every ~1.40 m
  const panelCount = Math.max(2, Math.round(width / 1.40));
  const panelW     = width / panelCount;
  for (let i = 1; i < panelCount; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fT * 0.8, fH - fT * 2, fD), frameMat);
    m.position.set(-width / 2 + panelW * i, 0, 0); grp.add(m);
  }

  // Glass panes — front + back per panel
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#A8D4F0', roughness: 0.04, metalness: 0.25,
    transparent: true, opacity: 0.60, side: THREE.DoubleSide,
  });
  const glassH = fH - fT * 2;
  for (let i = 0; i < panelCount; i++) {
    const px    = -width / 2 + panelW * i + panelW / 2;
    const glassW = panelW - fT;
    const geo   = new THREE.PlaneGeometry(glassW, glassH);
    [-1, 1].forEach(sign => {
      const g = new THREE.Mesh(geo, glassMat);
      g.position.set(px, 0, sign * (fD / 2 - 0.002));
      grp.add(g);
    });
  }

  grp.position.set(x, cy, z);
  grp.rotation.y = rotY;
  scene.add(grp);
}

function buildWindow(scene, winMat, frameMat, x, y, z, rotY, width = 1.0) {
  const grp = new THREE.Group();
  const fH = 1.0, fD = 0.08, fT = 0.06;

  // Four border bars (open centre — see-through from inside)
  const bar = (w, h, px, py) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, fD), frameMat);
    m.position.set(px, py, 0); grp.add(m);
  };
  bar(width,          fT,           0,                   fH / 2 - fT / 2);
  bar(width,          fT,           0,                 -(fH / 2 - fT / 2));
  bar(fT,   fH - fT * 2,  -(width / 2 - fT / 2),         0);
  bar(fT,   fH - fT * 2,    width / 2 - fT / 2,           0);

  // Glass — two panes at each face of the frame so it's visible regardless of rotY orientation
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#A8D4F0', roughness: 0.04, metalness: 0.25,
    transparent: true, opacity: 0.62, side: THREE.DoubleSide,
  });
  const glassGeo = new THREE.PlaneGeometry(width - fT * 2, fH - fT * 2);
  [-1, 1].forEach(sign => {
    const g = new THREE.Mesh(glassGeo, glassMat);
    g.position.z = sign * (fD / 2 - 0.002); // one at each face of the frame
    grp.add(g);
  });

  grp.position.set(x, y, z); grp.rotation.y = rotY; scene.add(grp);
}

function buildTree(scene, x, y, z, scale = 1.0) {
  const s = scale;
  const trunkMat  = new THREE.MeshStandardMaterial({ color: '#5C3D1E', roughness: 0.95 });
  const mk = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.98 });

  // Root flare + main trunk
  addMesh(scene, new THREE.CylinderGeometry(0.20 * s, 0.30 * s, 0.40 * s, 8),
    trunkMat, { x, y: y + 0.20 * s, z, castShadow: true });
  addMesh(scene, new THREE.CylinderGeometry(0.10 * s, 0.20 * s, 1.90 * s, 8),
    trunkMat, { x, y: y + 1.35 * s, z, castShadow: true });

  // Canopy — five overlapping spheres of varying size, offset asymmetrically
  // Central/upper mass
  addMesh(scene, new THREE.SphereGeometry(1.10 * s, 9, 7), mk('#358035'),
    { x,               y: y + 3.10 * s, z,               castShadow: true });
  // Lower-left cluster (darker — shadow side)
  addMesh(scene, new THREE.SphereGeometry(0.90 * s, 8, 6), mk('#2A6B2A'),
    { x: x - 0.70 * s, y: y + 2.50 * s, z: z + 0.38 * s, castShadow: true });
  // Lower-right cluster
  addMesh(scene, new THREE.SphereGeometry(0.82 * s, 8, 6), mk('#3A7D35'),
    { x: x + 0.62 * s, y: y + 2.65 * s, z: z - 0.30 * s, castShadow: true });
  // Upper-front cluster (lighter — sunlit)
  addMesh(scene, new THREE.SphereGeometry(0.75 * s, 8, 6), mk('#45943C'),
    { x: x + 0.28 * s, y: y + 3.75 * s, z: z + 0.48 * s, castShadow: true });
  // Upper-back cluster
  addMesh(scene, new THREE.SphereGeometry(0.65 * s, 8, 6), mk('#2E7030'),
    { x: x - 0.38 * s, y: y + 3.55 * s, z: z - 0.42 * s, castShadow: true });
}

function addMesh(target, geo, mat, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  if (opts.x  !== undefined) mesh.position.x = opts.x;
  if (opts.y  !== undefined) mesh.position.y = opts.y;
  if (opts.z  !== undefined) mesh.position.z = opts.z;
  if (opts.rx !== undefined) mesh.rotation.x = opts.rx;
  if (opts.castShadow)    mesh.castShadow    = true;
  if (opts.receiveShadow) mesh.receiveShadow = true;
  target.add(mesh); return mesh;
}

// ─── Interior wall builder ────────────────────────────────
function isOpOnEdge(op, edge) {
  const eps = 0.12;
  const edgeHoriz = Math.abs(edge.y1 - edge.y2) < 0.01;
  const opHoriz   = Math.abs(op.y1  - op.y2)   < 0.10;
  if (edgeHoriz !== opHoriz) return false;
  if (edgeHoriz) {
    if (Math.abs((op.y1 + op.y2) / 2 - edge.y1) > eps) return false;
    const ex0 = Math.min(edge.x1, edge.x2), ex1 = Math.max(edge.x1, edge.x2);
    const ox0 = Math.min(op.x1,  op.x2),   ox1 = Math.max(op.x1,  op.x2);
    return ox0 < ex1 - eps && ox1 > ex0 + eps;
  } else {
    if (Math.abs((op.x1 + op.x2) / 2 - edge.x1) > eps) return false;
    const ey0 = Math.min(edge.y1, edge.y2), ey1 = Math.max(edge.y1, edge.y2);
    const oy0 = Math.min(op.y1,  op.y2),   oy1 = Math.max(op.y1,  op.y2);
    return oy0 < ey1 - eps && oy1 > ey0 + eps;
  }
}

// Uses backend-classified data: inner_walls (actual walls), outer_edges (exterior),
// open_edges (no wall — skipped). Openings matched by space_a/space_b ID pair.
function buildInteriorWalls(group, planGeometry, cx, cy, bH) {
  const innerWalls  = planGeometry?.inner_walls || [];
  const outerEdges  = planGeometry?.outer_edges || [];
  const openings    = (planGeometry?.openings || []).filter(op => op.placement === 'interior');
  const extOpenings = (planGeometry?.openings || []).filter(op => op.placement === 'exterior');
  const wallT = 0.12;
  const doorH = 2.2;
  const winBot = bH * 0.27;  // ~0.86 m sill (regular windows)
  const winTop = bH * 0.62;  // ~1.98 m top  (regular windows)
  const panBot = 0.15;        // panoramic living-room window: tiny sill
  const panTop = bH - 0.15;  // panoramic living-room window: to ceiling
  const wallMat    = new THREE.MeshStandardMaterial({ color: '#F0EBE1', roughness: 0.85, side: THREE.DoubleSide });
  const lintMat    = new THREE.MeshStandardMaterial({ color: '#E0D8CC', roughness: 0.85, side: THREE.DoubleSide });
  const intDoorMat = new THREE.MeshStandardMaterial({ color: '#3E2A1A', roughness: 0.72, side: THREE.DoubleSide });

  // Exterior walls — solid panels with opening cutouts
  // Windows: sill + lintel preserved. Entry doors: full-height cut + interior door panel.
  for (const edge of outerEdges) {
    const edgeOps = extOpenings.filter(op => isOpOnEdge(op, edge));
    if (!edgeOps.length) {
      buildWallPanel(group, edge, cx, cy, bH, wallT, wallMat);
      continue;
    }
    const isHoriz = Math.abs(edge.y1 - edge.y2) < 0.01;
    if (isHoriz) {
      const wz = cy - edge.y1;
      const x0 = Math.min(edge.x1, edge.x2), x1 = Math.max(edge.x1, edge.x2);
      const sorted = edgeOps
        .filter(op => Math.abs(op.y1 - op.y2) < 0.1)
        .sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
      let cur = x0;
      for (const op of sorted) {
        const isEntry = op.source_edge_type === 'entry';
        const ox0 = Math.max(x0, Math.min(op.x1, op.x2));
        const ox1 = Math.min(x1, Math.max(op.x1, op.x2));
        if (ox0 > cur + 0.01)
          addMesh(group, new THREE.BoxGeometry(ox0 - cur, bH, wallT), wallMat,
            { x: (cur + ox0) / 2 - cx, y: bH / 2, z: wz });
        if (isEntry) {
          // Lintel above door only
          if (bH - doorH > 0.05)
            addMesh(group, new THREE.BoxGeometry(ox1 - ox0, bH - doorH, wallT), lintMat,
              { x: (ox0 + ox1) / 2 - cx, y: doorH + (bH - doorH) / 2, z: wz });
          // Interior-facing door panel (visible in interior mode)
          addMesh(group, new THREE.BoxGeometry(ox1 - ox0, doorH, 0.06), intDoorMat,
            { x: (ox0 + ox1) / 2 - cx, y: doorH / 2, z: wz });
        } else {
          const wBot = isLivingRoom(op.space_type) ? panBot : winBot;
          const wTop = isLivingRoom(op.space_type) ? panTop : winTop;
          if (wBot > 0.05)
            addMesh(group, new THREE.BoxGeometry(ox1 - ox0, wBot, wallT), wallMat,
              { x: (ox0 + ox1) / 2 - cx, y: wBot / 2, z: wz });
          if (bH - wTop > 0.05)
            addMesh(group, new THREE.BoxGeometry(ox1 - ox0, bH - wTop, wallT), lintMat,
              { x: (ox0 + ox1) / 2 - cx, y: wTop + (bH - wTop) / 2, z: wz });
        }
        cur = ox1;
      }
      if (cur < x1 - 0.01)
        addMesh(group, new THREE.BoxGeometry(x1 - cur, bH, wallT), wallMat,
          { x: (cur + x1) / 2 - cx, y: bH / 2, z: wz });
    } else {
      const wx = edge.x1 - cx;
      const y0 = Math.min(edge.y1, edge.y2), y1 = Math.max(edge.y1, edge.y2);
      const sorted = edgeOps
        .filter(op => Math.abs(op.x1 - op.x2) < 0.1)
        .sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
      let cur = y0;
      for (const op of sorted) {
        const isEntry = op.source_edge_type === 'entry';
        const oy0 = Math.max(y0, Math.min(op.y1, op.y2));
        const oy1 = Math.min(y1, Math.max(op.y1, op.y2));
        if (oy0 > cur + 0.01)
          addMesh(group, new THREE.BoxGeometry(wallT, bH, oy0 - cur), wallMat,
            { x: wx, y: bH / 2, z: cy - (cur + oy0) / 2 });
        if (isEntry) {
          if (bH - doorH > 0.05)
            addMesh(group, new THREE.BoxGeometry(wallT, bH - doorH, oy1 - oy0), lintMat,
              { x: wx, y: doorH + (bH - doorH) / 2, z: cy - (oy0 + oy1) / 2 });
          addMesh(group, new THREE.BoxGeometry(0.06, doorH, oy1 - oy0), intDoorMat,
            { x: wx, y: doorH / 2, z: cy - (oy0 + oy1) / 2 });
        } else {
          const wBot = isLivingRoom(op.space_type) ? panBot : winBot;
          const wTop = isLivingRoom(op.space_type) ? panTop : winTop;
          if (wBot > 0.05)
            addMesh(group, new THREE.BoxGeometry(wallT, wBot, oy1 - oy0), wallMat,
              { x: wx, y: wBot / 2, z: cy - (oy0 + oy1) / 2 });
          if (bH - wTop > 0.05)
            addMesh(group, new THREE.BoxGeometry(wallT, bH - wTop, oy1 - oy0), lintMat,
              { x: wx, y: wTop + (bH - wTop) / 2, z: cy - (oy0 + oy1) / 2 });
        }
        cur = oy1;
      }
      if (cur < y1 - 0.01)
        addMesh(group, new THREE.BoxGeometry(wallT, bH, y1 - cur), wallMat,
          { x: wx, y: bH / 2, z: cy - (cur + y1) / 2 });
    }
  }

  // Interior walls — panels with door/wide-opening gaps
  for (const wall of innerWalls) {
    const wallOps = openings.filter(op =>
      (op.space_a === wall.space_a && op.space_b === wall.space_b) ||
      (op.space_a === wall.space_b && op.space_b === wall.space_a)
    );
    buildWallWithGaps(group, wall, wallOps, cx, cy, bH, doorH, wallT, wallMat, lintMat);
  }
  // open_edges → no wall (skipped entirely)
}

function buildWallPanel(group, edge, cx, cy, bH, wallT, mat) {
  const isHoriz = Math.abs(edge.y1 - edge.y2) < 0.01;
  if (isHoriz) {
    const x0 = Math.min(edge.x1, edge.x2), x1 = Math.max(edge.x1, edge.x2);
    addMesh(group, new THREE.BoxGeometry(x1 - x0, bH, wallT), mat,
      { x: (x0 + x1) / 2 - cx, y: bH / 2, z: cy - edge.y1 });
  } else {
    const y0 = Math.min(edge.y1, edge.y2), y1 = Math.max(edge.y1, edge.y2);
    addMesh(group, new THREE.BoxGeometry(wallT, bH, y1 - y0), mat,
      { x: edge.x1 - cx, y: bH / 2, z: cy - (y0 + y1) / 2 });
  }
}

function buildWallWithGaps(group, wall, ops, cx, cy, bH, doorH, wallT, wallMat, lintMat) {
  const isHoriz = Math.abs(wall.y1 - wall.y2) < 0.01;

  if (isHoriz) {
    const wz = cy - wall.y1;
    const x0 = Math.min(wall.x1, wall.x2), x1 = Math.max(wall.x1, wall.x2);
    const sorted = ops
      .filter(op => Math.abs(op.y1 - op.y2) < 0.1)
      .sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));

    let cur = x0;
    for (const op of sorted) {
      const isWide = op.kind === 'wide_opening' || op.access_type === 'wide_opening';
      const ox0 = Math.max(x0, Math.min(op.x1, op.x2));
      const ox1 = Math.min(x1, Math.max(op.x1, op.x2));
      if (ox0 > cur + 0.01)
        addMesh(group, new THREE.BoxGeometry(ox0 - cur, bH, wallT), wallMat,
          { x: (cur + ox0) / 2 - cx, y: bH / 2, z: wz });
      if (!isWide && bH > doorH + 0.01) {
        const lH = bH - doorH;
        addMesh(group, new THREE.BoxGeometry(ox1 - ox0, lH, wallT), lintMat,
          { x: (ox0 + ox1) / 2 - cx, y: doorH + lH / 2, z: wz });
      }
      cur = ox1;
    }
    if (cur < x1 - 0.01)
      addMesh(group, new THREE.BoxGeometry(x1 - cur, bH, wallT), wallMat,
        { x: (cur + x1) / 2 - cx, y: bH / 2, z: wz });

  } else {
    const wx = wall.x1 - cx;
    const y0 = Math.min(wall.y1, wall.y2), y1 = Math.max(wall.y1, wall.y2);
    const sorted = ops
      .filter(op => Math.abs(op.x1 - op.x2) < 0.1)
      .sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));

    let cur = y0;
    for (const op of sorted) {
      const isWide = op.kind === 'wide_opening' || op.access_type === 'wide_opening';
      const oy0 = Math.max(y0, Math.min(op.y1, op.y2));
      const oy1 = Math.min(y1, Math.max(op.y1, op.y2));
      if (oy0 > cur + 0.01)
        addMesh(group, new THREE.BoxGeometry(wallT, bH, oy0 - cur), wallMat,
          { x: wx, y: bH / 2, z: cy - (cur + oy0) / 2 });
      if (!isWide && bH > doorH + 0.01) {
        const lH = bH - doorH;
        addMesh(group, new THREE.BoxGeometry(wallT, lH, oy1 - oy0), lintMat,
          { x: wx, y: doorH + lH / 2, z: cy - (oy0 + oy1) / 2 });
      }
      cur = oy1;
    }
    if (cur < y1 - 0.01)
      addMesh(group, new THREE.BoxGeometry(wallT, bH, y1 - cur), wallMat,
        { x: wx, y: bH / 2, z: cy - (cur + y1) / 2 });
  }
}

// ─── Procedural canvas textures ──────────────────────────
function makeWoodTex(light = '#A08060', dark = '#7A5C40') {
  const sz = 256;
  const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, sz, sz);
  ctx.strokeStyle = dark; ctx.lineWidth = 1.0;
  for (let y = 1; y < sz; y += 3 + Math.random() * 5) {
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x < sz; x += 25)
      ctx.quadraticCurveTo(x + 12, y + (Math.random() - 0.5) * 4, x + 25, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeTileTex(base = '#D4DCDC', line = '#B0BCBC', grid = 24) {
  const sz = 256;
  const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, sz, sz);
  ctx.strokeStyle = line; ctx.lineWidth = 1.5;
  for (let i = 0; i <= sz; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, sz); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(sz, i); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeFabricTex(base = '#8A7870') {
  const sz = 128;
  const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, sz, sz);
  for (let y = 0; y < sz; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, y, sz, 2); }
  for (let x = 0; x < sz; x += 8) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x, 0, 4, sz); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ─── Room-specific interior furniture ────────────────────
function addRoomDetail(group, sp, toW, cx, cy, bH, allOpenings) {
  const wc = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
  const wx = wc.x, wz = wc.z;
  const sw = sp.width, sd = sp.depth;
  const type = sp.space_type;

  // floorY = bottom edge of box
  const box = (ww, hh, dd, mat, px = 0, floorY = 0, pz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), mat);
    m.position.set(wx + px, floorY + hh / 2, wz + pz);
    m.castShadow = true; group.add(m);
  };
  const smat = (color, rough, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

  if (type === 'bathroom') {
    // Tile floor
    const floorTex = makeTileTex('#C8D4D2', '#A4B4B2', 18);
    floorTex.repeat.set(Math.ceil(sw), Math.ceil(sd));
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sw - 0.14, sd - 0.14),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35 })
    );
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.set(wx, 0.025, wz);
    group.add(floorMesh);

    // Wall tile — two narrow bands (sill below window, header above window)
    // Openings on this room's walls are cut out to prevent tile blocking doorways
    const eps = 0.20;
    const inset = 0.10;
    const tileBands = [
      { y0: 0.10, h: 0.68 },   // sill band (below window)
      { y0: 2.05, h: 0.60 },   // header band (above window)
    ];

    // N/S tile walls — run along scene-x
    [
      { planY: sp.y + sp.depth, dz: -sd / 2 + inset, rotY: 0 },
      { planY: sp.y,            dz:  sd / 2 - inset,  rotY: Math.PI },
    ].forEach(wall => {
      const x0 = sp.x - cx, x1 = sp.x + sp.width - cx;
      const gaps = allOpenings
        .filter(op => Math.abs(op.y1 - op.y2) < 0.10 &&
                      Math.abs((op.y1 + op.y2) / 2 - wall.planY) < eps &&
                      Math.min(op.x1, op.x2) < sp.x + sp.width &&
                      Math.max(op.x1, op.x2) > sp.x)
        .map(op => [Math.min(op.x1, op.x2) - cx, Math.max(op.x1, op.x2) - cx]);
      tileBands.forEach(({ y0, h }) => {
        const tex = makeTileTex('#D0E2E4', '#B0CCCE', 16);
        tex.repeat.set(2, 0.5);
        const tileMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22 });
        for (const [segA, segB] of segmentsExcluding(x0, x1, gaps)) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(segB - segA, h), tileMat);
          s.rotation.y = wall.rotY;
          s.position.set((segA + segB) / 2, y0 + h / 2, wz + wall.dz);
          group.add(s);
        }
      });
    });

    // E/W tile walls — run along scene-z
    [
      { planX: sp.x,            dx: -sw / 2 + inset, rotY:  Math.PI / 2 },
      { planX: sp.x + sp.width, dx:  sw / 2 - inset, rotY: -Math.PI / 2 },
    ].forEach(wall => {
      const z0 = cy - (sp.y + sp.depth), z1 = cy - sp.y;
      const gaps = allOpenings
        .filter(op => Math.abs(op.x1 - op.x2) < 0.10 &&
                      Math.abs((op.x1 + op.x2) / 2 - wall.planX) < eps &&
                      Math.min(op.y1, op.y2) < sp.y + sp.depth &&
                      Math.max(op.y1, op.y2) > sp.y)
        .map(op => [cy - Math.max(op.y1, op.y2), cy - Math.min(op.y1, op.y2)]);
      tileBands.forEach(({ y0, h }) => {
        const tex = makeTileTex('#D0E2E4', '#B0CCCE', 16);
        tex.repeat.set(1.5, 0.5);
        const tileMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22 });
        for (const [segA, segB] of segmentsExcluding(z0, z1, gaps)) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(segB - segA, h), tileMat);
          s.rotation.y = wall.rotY;
          s.position.set(wx + wall.dx, y0 + h / 2, (segA + segB) / 2);
          group.add(s);
        }
      });
    });

    // Toilet
    const ceramic = smat('#F6F6F6', 0.30, { metalness: 0.05 });
    const tw = Math.min(0.42, sw * 0.28), td = Math.min(0.34, sd * 0.22);
    const tx = sw * 0.24, tz = -sd * 0.30;
    box(tw,        0.18, td,   ceramic, tx, 0,    tz);
    box(tw - 0.04, 0.10, td - 0.04, smat('#FAFAFA', 0.25), tx, 0.18, tz);
    box(tw,        0.12, 0.18, ceramic, tx, 0.38, tz + td * 0.5 + 0.08);

    // Sink pedestal + basin
    const metal = smat('#C4C8C8', 0.30, { metalness: 0.45 });
    const sx = -sw * 0.22, sz2 = -sd * 0.28;
    box(0.06, 0.80, 0.06, metal, sx, 0, sz2);
    box(0.50, 0.05, 0.34, ceramic, sx, 0.80, sz2);
    box(0.04, 0.18, 0.04, metal, sx, 0.85, sz2 - 0.12); // faucet

  } else if (type === 'kitchen') {
    const woodTex = makeWoodTex('#9A8872', '#7A6852');
    woodTex.repeat.set(2, 1);
    const counterMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65 });
    const stoneTex = makeTileTex('#C4BCB0', '#A8A098', 32);
    stoneTex.repeat.set(2, 1);
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.40 });

    const cl = Math.min(sw * 0.78, 2.8), cd = Math.min(0.60, sd * 0.35);
    const cz = -(sd / 2 - cd / 2 - 0.04);
    box(cl, 0.88, cd,   counterMat, 0, 0,    cz);
    box(cl, 0.03, cd,   stoneMat,   0, 0.88, cz);
    box(Math.min(cl, 2.4), 0.62, 0.30, smat('#ECEAE4', 0.70), 0, 1.52, cz - cd/2 + 0.15);
    box(0.52, 0.06, 0.40, smat('#A0ACAC', 0.20, { metalness: 0.6 }), sw * 0.08, 0.86, cz);
    box(0.04, 0.18, 0.04, smat('#A8ACAC', 0.15, { metalness: 0.8 }), sw * 0.08, 0.92, cz - 0.06);

  } else if (type === 'living_room') {
    const fabricTex = makeFabricTex('#7E7468');
    fabricTex.repeat.set(3, 2);
    const sofaMat = new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 0.90 });
    const woodTex = makeWoodTex('#6A5438', '#5A4428');
    woodTex.repeat.set(2, 1);
    const tableMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 });
    const legMat = smat('#5C4830', 0.60);

    const sfW = Math.min(2.0, sw * 0.60), sfD = 0.82, sfZ = sd * 0.24;
    box(sfW,        0.44, sfD,  sofaMat, 0,               0,    sfZ);
    box(sfW,        0.38, 0.15, sofaMat, 0,               0.44, sfZ + sfD/2 - 0.08);
    box(0.15, 0.44, sfD, sofaMat,  sfW/2 + 0.08, 0, sfZ);
    box(0.15, 0.44, sfD, sofaMat, -sfW/2 - 0.08, 0, sfZ);
    // Sofa legs
    [[sfW/2-0.10, sfD/2-0.08],[-(sfW/2-0.10), sfD/2-0.08],
     [sfW/2-0.10,-(sfD/2-0.08)],[-(sfW/2-0.10),-(sfD/2-0.08)]].forEach(([px,pz]) =>
      box(0.06, 0.10, 0.06, legMat, px, 0, sfZ + pz));
    // Coffee table
    const tl = Math.min(1.0, sfW * 0.55), th = 0.40;
    box(tl, 0.04, 0.52, tableMat, 0, th - 0.04, sd * 0.07);
    [[tl/2-0.06, 0.22],[-(tl/2-0.06), 0.22],[tl/2-0.06,-0.22],[-(tl/2-0.06),-0.22]].forEach(([px,pz]) =>
      box(0.05, th - 0.04, 0.05, legMat, px, 0, sd * 0.07 + pz));
    // Rug
    const rugTex = makeFabricTex('#9A8C7C');
    rugTex.repeat.set(2, 1);
    const rugMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sfW + 0.6, 1.6),
      new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
    );
    rugMesh.rotation.x = -Math.PI / 2;
    rugMesh.position.set(wx, 0.022, wz + sd * 0.16);
    group.add(rugMesh);

  } else if (type === 'bedroom' || type === 'master_bedroom' || type === 'child_bedroom') {
    const woodTex = makeWoodTex('#8C7060', '#6C5040');
    woodTex.repeat.set(2, 2);
    const frameMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.70 });
    const mattressTex = makeFabricTex('#E8DDD0');
    mattressTex.repeat.set(2, 3);
    const mattressMat = new THREE.MeshStandardMaterial({ map: mattressTex, roughness: 0.85 });

    const bW = type === 'master_bedroom' ? Math.min(1.8, sw * 0.68) : Math.min(1.2, sw * 0.58);
    const bD = Math.min(2.0, sd * 0.62);
    const bZ = -sd * 0.12;
    box(bW,        0.22, bD,        frameMat, 0, 0,    bZ);
    box(bW - 0.08, 0.16, bD - 0.08, mattressMat, 0, 0.22, bZ);
    box(bW - 0.10, 0.10, 0.12, smat('#F5F0EA', 0.75), 0, 0.38, bZ - bD/2 + 0.06);
    box(bW, 0.55, 0.10, frameMat, 0, 0, bZ - bD/2 - 0.05);
    // Bed legs
    [[bW/2-0.06, bD/2-0.08],[-(bW/2-0.06), bD/2-0.08],
     [bW/2-0.06,-(bD/2-0.08)],[-(bW/2-0.06),-(bD/2-0.08)]].forEach(([px,pz]) =>
      box(0.06, 0.08, 0.06, frameMat, px, 0, bZ + pz));
    // Bed cover
    const coverTex = makeFabricTex('#C0CEDC');
    coverTex.repeat.set(2, 3);
    const cover = new THREE.Mesh(
      new THREE.PlaneGeometry(bW - 0.08, bD * 0.65),
      new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.88 })
    );
    cover.rotation.x = -Math.PI / 2;
    cover.position.set(wx, 0.38, wz + bZ + bD * 0.17);
    group.add(cover);
    // Side table
    const stTex = makeWoodTex('#9A8070', '#7A6050');
    stTex.repeat.set(2, 2);
    box(0.42, 0.50, 0.38, new THREE.MeshStandardMaterial({ map: stTex, roughness: 0.65 }),
      bW/2 + 0.26, 0, bZ);

  }
}

// ─── Helper: check if a structural wall exists at this face ──
// Returns true if inner_walls or outer_edges has a segment at the given plan coordinate
// that overlaps with the room's span along the perpendicular axis.
function hasStructuralWall(planCoord, isHorizWall, sp, innerWalls, outerEdges, eps = 0.20) {
  for (const w of [...innerWalls, ...outerEdges]) {
    const wHoriz = Math.abs(w.y1 - w.y2) < 0.01;
    if (wHoriz !== isHorizWall) continue;
    if (isHorizWall) {
      if (Math.abs((w.y1 + w.y2) / 2 - planCoord) > eps) continue;
      const wx0 = Math.min(w.x1, w.x2), wx1 = Math.max(w.x1, w.x2);
      if (wx0 < sp.x + sp.width - 0.02 && wx1 > sp.x + 0.02) return true;
    } else {
      if (Math.abs((w.x1 + w.x2) / 2 - planCoord) > eps) continue;
      const wy0 = Math.min(w.y1, w.y2), wy1 = Math.max(w.y1, w.y2);
      if (wy0 < sp.y + sp.depth - 0.02 && wy1 > sp.y + 0.02) return true;
    }
  }
  return false;
}

// ─── Helper: split a 1D range around door/window gaps ────
function segmentsExcluding(wallStart, wallEnd, gaps, margin = 0.04) {
  const sorted = gaps
    .map(([a, b]) => [Math.min(a, b) - margin, Math.max(a, b) + margin])
    .filter(([a, b]) => b > wallStart && a < wallEnd)
    .sort((a, b) => a[0] - b[0]);
  const segs = [];
  let pos = wallStart;
  for (const [ga, gb] of sorted) {
    const ca = Math.max(ga, wallStart);
    const cb = Math.min(gb, wallEnd);
    if (ca > pos + 0.02) segs.push([pos, ca]);
    pos = Math.max(pos, cb);
  }
  if (pos < wallEnd - 0.02) segs.push([pos, wallEnd]);
  return segs;
}

// ─── Room wall color panels (opening-aware, window-height-aware) ─────────
function addRoomWalls(group, sp, toW, cx, cy, bH, color, allOpenings, innerWalls = [], outerEdges = []) {
  const wc = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
  const sw = sp.width, sd = sp.depth;
  const inset = 0.07;
  const panelBot = 0.10, panelTop = bH - 0.02;   // full panel y range
  const mat   = new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.FrontSide });
  const eps   = 0.20;

  // Window height range — panoramic (floor-to-ceiling) for living room, standard otherwise
  const isLivRoom = isLivingRoom(sp.space_type);
  const winSill   = isLivRoom ? 0.15         : bH * 0.45 - 0.50;
  const winLintel = isLivRoom ? bH - 0.15    : bH * 0.45 + 0.50;

  // Place a rectangle strip on a wall (segA..segB along the free axis, y0..y0+h vertically)
  function strip(segA, segB, y0, h, fixedCoord, rotY, horizWall) {
    const len = segB - segA;
    if (len < 0.02 || h < 0.02) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
    m.rotation.y = rotY;
    const mid = (segA + segB) / 2, yMid = y0 + h / 2;
    m.position.set(horizWall ? mid : fixedCoord, yMid, horizWall ? fixedCoord : mid);
    group.add(m);
  }

  // Compute portions of [range0, range1] NOT covered by any inner_wall/outer_edge.
  // These uncovered portions are open boundaries (no wall) → treated as full-height gaps.
  function openGapRanges(planCoord, isHorizWall, range0, range1) {
    const covered = [];
    for (const w of [...innerWalls, ...outerEdges]) {
      const wHoriz = Math.abs(w.y1 - w.y2) < 0.01;
      if (wHoriz !== isHorizWall) continue;
      if (isHorizWall) {
        if (Math.abs((w.y1 + w.y2) / 2 - planCoord) > eps) continue;
        covered.push([Math.min(w.x1, w.x2) - cx, Math.max(w.x1, w.x2) - cx]);
      } else {
        if (Math.abs((w.x1 + w.x2) / 2 - planCoord) > eps) continue;
        covered.push([cy - Math.max(w.y1, w.y2), cy - Math.min(w.y1, w.y2)]);
      }
    }
    // segmentsExcluding with covered ranges = the UNcovered portions
    return segmentsExcluding(range0, range1, covered, 0.01);
  }

  function buildWall(wallOps, range0, range1, fixedCoord, rotY, horizWall, extraGaps = []) {
    const doorGaps = [
      ...wallOps.filter(op => op.kind !== 'window')
        .map(op => horizWall
          ? [Math.min(op.x1, op.x2) - cx, Math.max(op.x1, op.x2) - cx]
          : [cy - Math.max(op.y1, op.y2), cy - Math.min(op.y1, op.y2)]),
      ...extraGaps,   // open-boundary segments count as full-height gaps
    ];
    const winSegs = wallOps.filter(op => op.kind === 'window')
      .map(op => horizWall
        ? [Math.min(op.x1, op.x2) - cx, Math.max(op.x1, op.x2) - cx]
        : [cy - Math.max(op.y1, op.y2), cy - Math.min(op.y1, op.y2)]);

    for (const [segA, segB] of segmentsExcluding(range0, range1, doorGaps)) {
      const wins = winSegs.filter(([wa, wb]) => wa < segB - 0.01 && wb > segA + 0.01);
      if (wins.length === 0) {
        strip(segA, segB, panelBot, panelTop - panelBot, fixedCoord, rotY, horizWall);
      } else {
        for (const [subA, subB] of segmentsExcluding(segA, segB, wins)) {
          strip(subA, subB, panelBot, panelTop - panelBot, fixedCoord, rotY, horizWall);
        }
        for (const [wa, wb] of wins) {
          const ca = Math.max(wa - 0.04, segA), cb = Math.min(wb + 0.04, segB);
          const sillH = Math.max(0, winSill - panelBot);
          strip(ca, cb, panelBot, sillH, fixedCoord, rotY, horizWall);
          const hdrH = Math.max(0, panelTop - winLintel);
          strip(ca, cb, winLintel, hdrH, fixedCoord, rotY, horizWall);
        }
      }
    }

    // Lintel cover: room-color panel above each door/opening gap (not above open-boundary gaps)
    const doorH = 2.2;
    const lintBot = doorH + 0.01;
    const lintH   = panelTop - lintBot;
    if (lintH > 0.02) {
      for (const op of wallOps.filter(op => op.kind !== 'window')) {
        const [da, db] = horizWall
          ? [Math.min(op.x1, op.x2) - cx, Math.max(op.x1, op.x2) - cx]
          : [cy - Math.max(op.y1, op.y2), cy - Math.min(op.y1, op.y2)];
        const ca = Math.max(da - 0.04, range0);
        const cb = Math.min(db + 0.04, range1);
        if (cb > ca + 0.02) strip(ca, cb, lintBot, lintH, fixedCoord, rotY, horizWall);
      }
    }
  }

  // N/S walls — compute open gaps (uncovered by any structural wall)
  [
    { planY: sp.y + sp.depth, dz: -sd / 2 + inset, rotY: 0 },
    { planY: sp.y,            dz:  sd / 2 - inset,  rotY: Math.PI },
  ].forEach(wall => {
    const x0 = sp.x - cx, x1 = sp.x + sp.width - cx;
    const openGaps = openGapRanges(wall.planY, true, x0, x1);
    const ops = allOpenings.filter(op =>
      Math.abs(op.y1 - op.y2) < 0.10 &&
      Math.abs((op.y1 + op.y2) / 2 - wall.planY) < eps &&
      Math.min(op.x1, op.x2) < sp.x + sp.width &&
      Math.max(op.x1, op.x2) > sp.x);
    buildWall(ops, x0, x1, wc.z + wall.dz, wall.rotY, true, openGaps);
  });

  // E/W walls — compute open gaps
  [
    { planX: sp.x,            dx: -sw / 2 + inset, rotY:  Math.PI / 2 },
    { planX: sp.x + sp.width, dx:  sw / 2 - inset, rotY: -Math.PI / 2 },
  ].forEach(wall => {
    const z0 = cy - (sp.y + sp.depth), z1 = cy - sp.y;
    const openGaps = openGapRanges(wall.planX, false, z0, z1);
    const ops = allOpenings.filter(op =>
      Math.abs(op.x1 - op.x2) < 0.10 &&
      Math.abs((op.x1 + op.x2) / 2 - wall.planX) < eps &&
      Math.min(op.y1, op.y2) < sp.y + sp.depth &&
      Math.max(op.y1, op.y2) > sp.y);
    buildWall(ops, z0, z1, wc.x + wall.dx, wall.rotY, false, openGaps);
  });
}

// ─── Baseboard trim (opening-aware, open-boundary-aware) ──────────────────
function addBaseboard(group, sp, toW, cx, cy, allOpenings, innerWalls = [], outerEdges = []) {
  const wc = toW(sp.x + sp.width / 2, sp.y + sp.depth / 2);
  const sw = sp.width, sd = sp.depth;
  const bbH = 0.09, bbD = 0.04;
  const mat = new THREE.MeshStandardMaterial({ color: '#E6E0D6', roughness: 0.72 });
  const eps = 0.20;

  function bbOpenGaps(planCoord, isHorizWall, range0, range1) {
    const covered = [];
    for (const w of [...innerWalls, ...outerEdges]) {
      const wHoriz = Math.abs(w.y1 - w.y2) < 0.01;
      if (wHoriz !== isHorizWall) continue;
      if (isHorizWall) {
        if (Math.abs((w.y1 + w.y2) / 2 - planCoord) > eps) continue;
        covered.push([Math.min(w.x1, w.x2) - cx, Math.max(w.x1, w.x2) - cx]);
      } else {
        if (Math.abs((w.x1 + w.x2) / 2 - planCoord) > eps) continue;
        covered.push([cy - Math.max(w.y1, w.y2), cy - Math.min(w.y1, w.y2)]);
      }
    }
    return segmentsExcluding(range0, range1, covered, 0.01);
  }

  // N/S baseboards — run along scene-x
  // dz inset by bbD/2 so box sits fully inside the room (avoids z-fighting with adjacent room's baseboard)
  [
    { planY: sp.y + sp.depth, dz: -sd / 2 + bbD / 2 },
    { planY: sp.y,            dz:  sd / 2 - bbD / 2 },
  ].forEach(wall => {
    const x0 = sp.x - cx, x1 = sp.x + sp.width - cx;
    const openGaps = bbOpenGaps(wall.planY, true, x0, x1);
    const gaps = [
      ...allOpenings
        .filter(op => Math.abs(op.y1 - op.y2) < 0.10 &&
                      Math.abs((op.y1 + op.y2) / 2 - wall.planY) < eps &&
                      Math.min(op.x1, op.x2) < sp.x + sp.width &&
                      Math.max(op.x1, op.x2) > sp.x)
        .map(op => [Math.min(op.x1, op.x2) - cx, Math.max(op.x1, op.x2) - cx]),
      ...openGaps,
    ];
    for (const [segA, segB] of segmentsExcluding(x0, x1, gaps)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(segB - segA, bbH, bbD), mat);
      m.position.set((segA + segB) / 2, bbH / 2, wc.z + wall.dz);
      group.add(m);
    }
  });

  // E/W baseboards — run along scene-z
  // dx inset by bbD/2 so box sits fully inside the room
  [
    { planX: sp.x,            dx: -sw / 2 + bbD / 2 },
    { planX: sp.x + sp.width, dx:  sw / 2 - bbD / 2 },
  ].forEach(wall => {
    const z0 = cy - (sp.y + sp.depth), z1 = cy - sp.y;
    const openGaps = bbOpenGaps(wall.planX, false, z0, z1);
    const gaps = [
      ...allOpenings
        .filter(op => Math.abs(op.x1 - op.x2) < 0.10 &&
                      Math.abs((op.x1 + op.x2) / 2 - wall.planX) < eps &&
                      Math.min(op.y1, op.y2) < sp.y + sp.depth &&
                      Math.max(op.y1, op.y2) > sp.y)
        .map(op => [cy - Math.max(op.y1, op.y2), cy - Math.min(op.y1, op.y2)]),
      ...openGaps,
    ];
    for (const [segA, segB] of segmentsExcluding(z0, z1, gaps)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bbD, bbH, segB - segA), mat);
      m.position.set(wc.x + wall.dx, bbH / 2, (segA + segB) / 2);
      group.add(m);
    }
  });
}
