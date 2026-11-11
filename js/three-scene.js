/* Drive Coach 4.1 — simple procedural 3D cockpit (representative model, not a real vehicle)
   Steering-wheel switch layout follows the 2026 Grandeur (GN7) owner's manual, left spoke:
     [driving assist | -]  /  [+ · pause · − switch | roller]  /  [distance | lane following assist]
   Shapes and icons are drawn here; no manufacturer logo or styling is reproduced.
   init()     → D3 3D interior (orbit, feature markers)
   practice() → D4 3D virtual practice (press the real-position parts) */
import * as THREE from "../vendor/three.module.min.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const NAMES = { scc: "스마트 크루즈 컨트롤 버튼", lka: "차로 주행 보조 버튼", wiper: "오토 와이퍼 레버", autohold: "오토 홀드 버튼", defog: "앞유리 김서림 제거 버튼" };
const PART_NAMES = {
  assist: "주행 보조 버튼 누르기", swUp: "스위치 위로 올리기", swDown: "스위치 아래로 내리기", swPress: "스위치 가운데 누르기",
  gap: "차간거리 버튼 누르기", lfa: "차로 주행 보조 버튼 누르기", wiperTip: "레버를 AUTO로 올리기", wiperRing: "감도 링 돌리기",
  autohold: "AUTO HOLD 버튼 누르기", epb: "P 버튼", defog: "앞유리 버튼 누르기", ac: "A/C 버튼",
};
const WHEEL_TILT = -0.38;
const WHEEL_N = new THREE.Vector3(0, -Math.sin(WHEEL_TILT), Math.cos(WHEEL_TILT)); // wheel face normal (world)
const BLUE = 0x1f6fe0, GREEN = 0x1fb83a, RED = 0xe5191c;

/* ------------------------------------------------------------ icon textures */
function tex(draw, w = 128, h = 76, bg = "#3B414A") {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = g.fillStyle = "#E8EBF0"; g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
  if (draw) draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const line = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const ICON = {
  assist(g) { // car side view + small gauge
    line(g, [[18, 50], [18, 41], [30, 37], [40, 27], [62, 27], [72, 37], [84, 40], [84, 50], [18, 50]]);
    g.beginPath(); g.arc(102, 46, 13, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    line(g, [[102, 46], [109, 38]]);
  },
  gap(g) { // car (rear) with distance bars above
    [[16, 14], [24, 19], [32, 24]].forEach(([y, hw]) => line(g, [[64 - hw, y], [64 + hw, y]]));
    line(g, [[46, 62], [46, 52], [52, 43], [76, 43], [82, 52], [82, 62]]);
  },
  lfa(g) { // lane lines + steering wheel
    line(g, [[30, 62], [42, 14]]); line(g, [[98, 62], [86, 14]]);
    g.beginPath(); g.arc(64, 38, 14, 0, Math.PI * 2); g.stroke();
    line(g, [[50, 36], [78, 36]]); line(g, [[64, 38], [64, 52]]);
  },
  switchLabel(g) { // "+", pause/resume, "−" stacked
    g.lineWidth = 4;
    line(g, [[24, 10], [24, 26]]); line(g, [[16, 18], [32, 18]]);
    line(g, [[10, 56], [18, 56]]); line(g, [[10, 64], [18, 64]]);
    g.beginPath(); g.arc(30, 60, 8, -Math.PI * 0.6, Math.PI * 0.9); g.stroke();
    line(g, [[16, 104], [32, 104]]);
  },
  defog(g) { // windshield + heat waves
    g.beginPath(); g.moveTo(26, 58); g.quadraticCurveTo(64, 30, 102, 58); g.stroke();
    [48, 64, 80].forEach(x => { g.beginPath(); g.moveTo(x, 50); g.bezierCurveTo(x - 6, 40, x + 6, 32, x, 18); g.stroke(); });
  },
  text: (s, size = 26) => (g, w, h) => { g.font = `700 ${size}px 'Pretendard Variable', sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, w / 2, h / 2 + 2); },
  knurl(g, w, h) { g.fillStyle = "#8E959F"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 4, h); },
};

/* ------------------------------------------------------------ shared view (renderer, camera, controls) */
function createView(container, fov) {
  const W = container.clientWidth || 540, H = container.clientHeight || 448;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const pr = () => Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, Math.min(innerWidth / 1280, innerHeight / 720)));
  renderer.setPixelRatio(pr());
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);
  addEventListener("resize", () => renderer.setPixelRatio(pr()));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe6ebf2, 6, 40);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1.5, 3, 2.5); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6); fill.position.set(-2, 1, 2); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.01, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.55;
  return { renderer, scene, camera, controls };
}

/* tap (not drag) on the canvas → first hit object that has userData[key] */
function onTap(view, key, cb) {
  const { renderer, camera, scene } = view;
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.userData[key]);
    if (hit) cb(hit.object.userData[key]);
  });
}

const mats = (m) => (Array.isArray(m.material) ? m.material : [m.material]);
function glow(mesh, color, k) { mats(mesh).forEach(x => { x.emissive.setHex(color); x.emissiveIntensity = k; }); }

/* ------------------------------------------------------------ cockpit model */
function buildCockpit(scene) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...o });
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const rrect = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  const slab = (w, h, r, depth, mat, x, y, z, parent) => {
    const geo = new THREE.ExtrudeGeometry(rrect(w, h, r), { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 10 });
    geo.center(); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  // a key whose given face (4 = +z, 2 = +y) shows an icon texture
  const key = (w, h, d, t, x, y, z, parent = scene, face = 4) => {
    const side = M(0x30353c), arr = [side, side, side, side, side, side];
    arr[face] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), arr); m.position.set(x, y, z); parent.add(m); return m;
  };

  const feat = {};   // feature key -> { meshes, anchor }
  const parts = {};  // part id -> { mesh, obj, prop, axis, delta, ms, back }
  const own = (mesh) => { mesh.material = Array.isArray(mesh.material) ? mesh.material.map(x => x.clone()) : mesh.material.clone(); };
  const reg = (k, mesh, anchor) => { (feat[k] ||= { meshes: [], anchor: anchor || mesh }).meshes.push(mesh); mesh.userData.feature = k; };
  const part = (id, mesh, anim) => {
    own(mesh); mesh.userData.part = id;
    const obj = anim.obj || mesh;
    parts[id] = { mesh, obj, ...anim, base: { position: obj.position.clone(), rotation: obj.rotation.clone() } };
  };
  const press = (axis = "z", delta = -0.003) => ({ prop: "position", axis, delta, ms: 200, back: true });

  // road ahead (context through the windshield)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 70), M(0xc4cad3, { roughness: 1 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.2, -36); scene.add(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), M(0xdfe5dc, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.22, -60); scene.add(ground);
  for (let z = -2; z > -70; z -= 4) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.8), M(0xffffff)); l.rotation.x = -Math.PI / 2; l.position.set(0.9, -0.19, z); scene.add(l); }

  // body / dashboard
  const dashM = M(0x2b2f36), faceM = M(0x41464f), trimM = M(0x9aa0aa, { metalness: 0.4, roughness: 0.4 }), consoleM = M(0x50565f);
  box(1.9, 0.07, 0.62, dashM, 0, 1.02, -0.16);                 // dash top
  box(1.9, 0.42, 0.08, faceM, 0, 0.79, 0.12);                  // dash face
  box(1.9, 0.012, 0.012, trimM, 0, 0.99, 0.165);               // trim line
  box(0.3, 0.3, 0.7, consoleM, 0.12, 0.56, 0.48);              // center console
  box(0.3, 0.02, 0.7, M(0x2e3238), 0.12, 0.715, 0.48);         // console top
  const pillarM = M(0x3a3f47);
  [-0.9, 0.9].forEach(x => { const p = box(0.07, 0.95, 0.07, pillarM, x, 1.45, -0.25); p.rotation.x = -0.55; });
  box(1.9, 0.06, 0.12, pillarM, 0, 1.86, -0.52);

  // wide integrated display with canvas texture
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 170;
  const g = cv.getContext("2d");
  g.fillStyle = "#14171b"; g.fillRect(0, 0, 1024, 170);
  g.fillStyle = "#1e232a"; g.fillRect(16, 16, 420, 138);
  g.fillStyle = "#e6e9ee"; g.font = "600 64px 'Pretendard Variable', sans-serif"; g.fillText("0", 50, 100);
  g.font = "500 22px 'Pretendard Variable', sans-serif"; g.fillText("km/h", 54, 132); g.fillText("P", 220, 60);
  g.fillStyle = "#26303c"; g.fillRect(452, 16, 556, 138);
  g.strokeStyle = "#5e7da8"; g.lineWidth = 8; g.lineCap = "round";
  g.beginPath(); g.moveTo(490, 120); g.lineTo(600, 120); g.lineTo(600, 60); g.lineTo(760, 60); g.stroke();
  g.fillStyle = "#9fb3d1"; g.font = "600 24px 'Pretendard Variable', sans-serif"; g.fillText("Drive Coach", 800, 70);
  const dtex = new THREE.CanvasTexture(cv); dtex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.02), [M(0x111111), M(0x111111), M(0x111111), M(0x111111), new THREE.MeshBasicMaterial({ map: dtex }), M(0x111111)]);
  disp.position.set(-0.2, 1.14, -0.04); disp.rotation.x = -0.18; scene.add(disp);

  // HVAC panel: defog · A/C · blank
  box(0.3, 0.14, 0.02, M(0x23272d), 0.12, 0.86, 0.17);
  const defog = key(0.06, 0.035, 0.015, tex(ICON.defog), 0.04, 0.87, 0.185); reg("defog", defog); part("defog", defog, press());
  const ac = key(0.06, 0.035, 0.015, tex(ICON.text("A/C", 30)), 0.12, 0.87, 0.185); part("ac", ac, press());
  box(0.06, 0.035, 0.015, M(0x3b414a), 0.2, 0.87, 0.185);
  box(0.22, 0.05, 0.02, M(0x1c1f24), -0.75, 0.93, 0.17); box(0.22, 0.05, 0.02, M(0x1c1f24), 0.62, 0.93, 0.17); // vents

  // console: gear knob + AUTO HOLD + P (labels on the top face)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 32), trimM); knob.position.set(0.08, 0.74, 0.4); scene.add(knob);
  const ah = key(0.05, 0.014, 0.035, tex(ICON.text("AUTO HOLD", 20), 128, 90), 0.18, 0.73, 0.52, scene, 2); reg("autohold", ah); part("autohold", ah, press("y"));
  const epb = key(0.05, 0.014, 0.035, tex(ICON.text("P", 40), 128, 90), 0.18, 0.73, 0.6, scene, 2); part("epb", epb, press("y"));

  // steering column + wheel
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.38, 24), M(0x2a2e34));
  col.position.set(-0.38, 0.88, 0.25); col.rotation.x = Math.PI / 2 - 0.4; scene.add(col);
  const wheel = new THREE.Group(); wheel.position.set(-0.38, 0.95, 0.44); wheel.rotation.x = WHEEL_TILT; scene.add(wheel);
  const rimM = M(0x1c1f24, { roughness: 0.55 });
  // rim: rounded-square loop (superellipse) like the manual drawing
  const rimPts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = 2.6;
    rimPts.push(new THREE.Vector3(0.196 * Math.sign(c) * Math.abs(c) ** (2 / n), 0.186 * Math.sign(s) * Math.abs(s) ** (2 / n) - 0.004, 0));
  }
  wheel.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 160, 0.021, 16, true), rimM));
  const hubM = M(0x2b2f36, { roughness: 0.6 });
  slab(0.13, 0.098, 0.03, 0.026, hubM, 0, 0.004, 0.008, wheel);                    // airbag pad (no logo)
  box(0.012, 0.11, 0.02, rimM, -0.028, -0.115, -0.002, wheel);                     // lower twin spokes
  box(0.012, 0.11, 0.02, rimM, 0.028, -0.115, -0.002, wheel);
  box(0.075, 0.016, 0.02, rimM, 0, -0.064, 0.002, wheel);
  // side spokes + switch bezels
  const bezelM = M(0x24282e, { roughness: 0.5 });
  [-1, 1].forEach(sx => {
    box(0.03, 0.04, 0.018, rimM, sx * 0.174, 0.004, -0.002, wheel);
    box(0.02, 0.05, 0.018, rimM, sx * 0.074, 0.004, 0.0, wheel);
    slab(0.08, 0.088, 0.016, 0.008, bezelM, sx * 0.122, 0.002, 0.014, wheel);
  });
  const KX = [-0.139, -0.105], KY = [0.027, 0, -0.027], KZ = 0.026, KW = 0.03, KH = 0.019, KD = 0.007;
  // left spoke: top row
  const assist = key(KW, KH, KD, tex(ICON.assist), KX[0], KY[0], KZ, wheel); part("assist", assist, press());
  key(KW, KH, KD, tex(null), KX[1], KY[0], KZ, wheel);
  // left spoke: + · pause · − switch (one paddle, three press zones) and roller
  box(0.024, 0.021, 0.006, M(0x16181c), -0.136, 0, 0.02, wheel);                  // recess
  const sw = new THREE.Group(); sw.position.set(-0.136, 0, 0.023); wheel.add(sw);
  const swM = M(0x4a505a, { roughness: 0.45 }), swFace = M(0x5c636e, { roughness: 0.4 });
  const swUp = box(0.019, 0.0065, 0.008, swM, 0, 0.0058, 0.001, sw);
  const swPress = box(0.019, 0.005, 0.0085, swFace, 0, 0, 0.0013, sw);
  const swDown = box(0.019, 0.0065, 0.008, swM, 0, -0.0058, 0.001, sw);
  part("swUp", swUp, { obj: sw, prop: "rotation", axis: "x", delta: -0.5, ms: 380, back: true });
  part("swDown", swDown, { obj: sw, prop: "rotation", axis: "x", delta: 0.5, ms: 380, back: true });
  part("swPress", swPress, { obj: sw, prop: "position", axis: "z", delta: -0.0035, ms: 220, back: true });
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.0085, 0.026), new THREE.MeshBasicMaterial({ map: tex(ICON.switchLabel, 48, 120, "#24282E") }));
  lab.position.set(-0.1555, 0, 0.0235); wheel.add(lab); // just in front of the bezel face (z ≈ 0.022)
  const knurl = tex(ICON.knurl, 64, 16, "#5A616C"); knurl.wrapS = knurl.wrapT = THREE.RepeatWrapping; knurl.repeat.set(1, 3);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.022, 24), M(0xffffff, { map: knurl, roughness: 0.5 }));
  roller.rotation.z = Math.PI / 2; roller.position.set(-0.106, 0, 0.02); wheel.add(roller);
  // left spoke: bottom row
  const gap = key(KW, KH, KD, tex(ICON.gap), KX[0], KY[2], KZ, wheel); part("gap", gap, press());
  const lfa = key(KW, KH, KD, tex(ICON.lfa), KX[1], KY[2], KZ, wheel); part("lfa", lfa, press());
  // right spoke (media · phone): mirrored, not part of the lessons
  [0.105, 0.139].forEach(x => { key(KW, KH, KD, tex(null), x, KY[0], KZ, wheel); key(KW, KH, KD, tex(null), x, KY[2], KZ, wheel); });
  box(0.024, 0.021, 0.006, M(0x16181c), 0.136, 0, 0.02, wheel); box(0.019, 0.018, 0.008, swM, 0.136, 0, 0.024, wheel);
  const roller2 = roller.clone(); roller2.position.x = 0.106; wheel.add(roller2);

  const sccAnchor = new THREE.Object3D(); sccAnchor.position.set(-0.122, 0.004, 0.03); wheel.add(sccAnchor);
  [assist, swUp, swPress, swDown, gap].forEach(m => reg("scc", m, sccAnchor));
  reg("lka", lfa);

  // stalks: wiper (right of the column, pivots up to AUTO) and turn signal (left)
  const stalkM = M(0x24282d);
  const wg = new THREE.Group(); wg.position.set(-0.31, 0.915, 0.36); wg.rotation.z = 0.15; scene.add(wg);
  const wip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 16), stalkM); wip.rotation.z = Math.PI / 2; wip.position.x = 0.075; wg.add(wip);
  const ringT = tex(ICON.knurl, 64, 16, "#3B414A"); ringT.wrapS = ringT.wrapT = THREE.RepeatWrapping; ringT.repeat.set(1, 4);
  const ringG = new THREE.Group(); ringG.position.x = 0.118; wg.add(ringG);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.018, 20), M(0xffffff, { map: ringT })); ring.rotation.z = Math.PI / 2; ringG.add(ring);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 16), M(0x3b414a)); tip.rotation.z = Math.PI / 2; tip.position.x = 0.158; wg.add(tip);
  [wip, ring, tip].forEach(m => reg("wiper", m, tip));
  part("wiperTip", tip, { obj: wg, prop: "rotation", axis: "z", delta: 0.16, ms: 420, back: false });
  part("wiperRing", ring, { obj: ringG, prop: "rotation", axis: "x", delta: 1.4, ms: 520, back: false });
  const turn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 16), stalkM);
  turn.position.set(-0.52, 0.92, 0.36); turn.rotation.z = Math.PI / 2 - 0.15; scene.add(turn);

  // registered feature meshes get their own materials so they can glow independently
  Object.values(feat).forEach(f => f.meshes.forEach(m => { if (!m.userData.part) own(m); }));
  return { feat, parts };
}

/* ------------------------------------------------------------ small tween helper */
function tweener() {
  const list = [];
  return {
    add(p) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].obj === p.obj && list[i].prop === p.prop && list[i].axis === p.axis) { list[i].obj[p.prop][p.axis] = list[i].end; list.splice(i, 1); }
      const from = p.obj[p.prop][p.axis];
      list.push({ ...p, from, end: p.back ? from : from + p.delta, s: performance.now() });
    },
    step(t) {
      for (let i = list.length - 1; i >= 0; i--) {
        const w = list[i], k = Math.min(1, (t - w.s) / w.ms);
        const e = w.back ? Math.sin(k * Math.PI) : 1 - Math.pow(1 - k, 3);
        w.obj[w.prop][w.axis] = w.from + w.delta * e;
        if (k >= 1) { w.obj[w.prop][w.axis] = w.end; list.splice(i, 1); }
      }
    },
    clear() { list.length = 0; },
  };
}

/* camera placement looking at a world point from a direction */
function frameOn(target, dir, dist) {
  return { p: target.clone().addScaledVector(dir.clone().normalize(), dist), t: target.clone() };
}
const FOCUS = { // D4 practice framing per feature
  scc: { at: "sccPanel", dir: WHEEL_N, dist: 0.2 },
  lka: { at: "sccPanel", dir: WHEEL_N, dist: 0.2 },
  wiper: { at: [-0.19, 0.935, 0.36], dir: new THREE.Vector3(1, 0.4, 0.55), dist: 0.28 }, // from the right so the rim does not hide the stalk
  autohold: { at: [0.18, 0.73, 0.56], dir: new THREE.Vector3(-0.2, 1, 0.7), dist: 0.28 },
  defog: { at: [0.12, 0.87, 0.185], dir: new THREE.Vector3(0, 0.25, 1), dist: 0.3 },
};

/* ------------------------------------------------------------ D3: 3D interior */
export function init(container, markersEl, onSelect) {
  const view = createView(container, 52);
  const { scene, camera, controls, renderer } = view;
  const { feat } = buildCockpit(scene);
  camera.position.set(-0.36, 1.3, 1.16);
  controls.target.set(-0.22, 0.93, 0.0);
  controls.minDistance = 0.2; controls.maxDistance = 1.8;
  controls.minAzimuthAngle = -1.05; controls.maxAzimuthAngle = 0.95;
  controls.minPolarAngle = 0.95; controls.maxPolarAngle = 1.75;
  controls.update();

  markersEl.innerHTML = Object.keys(feat).map(k => `<button class="d3mk" data-k="${k}" aria-label="${NAMES[k]}"></button>`).join("") + '<div class="d3lab" id="d3-lab"></div>';
  const mk = {}; markersEl.querySelectorAll(".d3mk").forEach(b => { mk[b.dataset.k] = b; b.addEventListener("click", (e) => { e.stopPropagation(); onSelect(b.dataset.k); }); });
  const lab = markersEl.querySelector("#d3-lab");
  onTap(view, "feature", onSelect);

  let sel = "scc", running = true, anim = null;
  const tmp = new THREE.Vector3();
  const VIEWS = {
    driver: { p: [-0.36, 1.3, 1.16], t: [-0.22, 0.93, 0.0] },
    center: { p: [0.02, 1.22, 1.05], t: [0.1, 0.78, 0.2] },
  };
  const fly = (p, t) => { anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, s: performance.now() }; };
  function view_(v) {
    if (v === "zoom") {
      feat[sel].anchor.getWorldPosition(tmp);
      const onWheel = sel === "scc" || sel === "lka";
      const f = frameOn(tmp, onWheel ? WHEEL_N.clone().add(new THREE.Vector3(0.12, 0.05, 0)) : new THREE.Vector3(0.25, 0.3, 1), onWheel ? 0.24 : 0.34);
      fly(f.p, f.t);
    } else fly(new THREE.Vector3(...VIEWS[v].p), new THREE.Vector3(...VIEWS[v].t));
  }
  function select(k) {
    sel = k;
    Object.entries(feat).forEach(([key, f]) => f.meshes.forEach(m => glow(m, key === k ? BLUE : 0x000000, key === k ? 0.8 : 0)));
    Object.entries(mk).forEach(([key, b]) => b.classList.toggle("on", key === k));
    lab.textContent = NAMES[k];
  }

  function frame(t) {
    if (!running) return;
    if (anim) {
      const k = Math.min(1, (t - anim.s) / 650), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e);
      if (k >= 1) anim = null;
    }
    controls.update();
    const pulse = 0.55 + 0.45 * Math.sin(t / 220);
    feat[sel] && feat[sel].meshes.forEach(m => mats(m).forEach(x => (x.emissiveIntensity = pulse)));
    renderer.render(scene, camera);
    const w = container.clientWidth, h = container.clientHeight;
    Object.entries(feat).forEach(([k, f]) => {
      f.anchor.getWorldPosition(tmp); tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      const b = mk[k]; b.style.display = vis ? "" : "none"; b.style.left = x + "px"; b.style.top = y + "px";
      if (k === sel) { lab.style.display = vis ? "" : "none"; lab.style.left = x + "px"; lab.style.top = y + "px"; }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    select, view: view_,
    pause() { running = false; },
    resume() { if (!running) { running = true; requestAnimationFrame(frame); } },
  };
}

/* ------------------------------------------------------------ D4: 3D virtual practice
   onPress(partId) is called when a lesson part is tapped. The app decides right/wrong
   and calls act(id) / wrong(id) / mark(nextId, doneIds). */
export function practice(container, tipEl, onPress) {
  const view = createView(container, 36);
  const { scene, camera, controls, renderer } = view;
  scene.fog = null;
  const { feat, parts } = buildCockpit(scene);
  controls.minDistance = 0.1; controls.maxDistance = 0.45;
  const tw = tweener(), tmp = new THREE.Vector3();
  let ids = [], next = null, done = new Set(), flash = null, running = true;

  onTap(view, "part", (id) => { if (ids.includes(id)) onPress(id); });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const r = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(ids.map(id => parts[id].mesh), false)[0];
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
  });

  function focus(key) {
    const f = FOCUS[key] || FOCUS.scc;
    if (f.at === "sccPanel") feat.scc.anchor.getWorldPosition(tmp); else tmp.set(...f.at);
    const fr = frameOn(tmp, f.dir, f.dist);
    camera.position.copy(fr.p); controls.target.copy(fr.t); controls.update();
    // allow only a small look-around from the framed view
    const az = controls.getAzimuthalAngle(), po = controls.getPolarAngle();
    controls.minAzimuthAngle = az - 0.45; controls.maxAzimuthAngle = az + 0.45;
    controls.minPolarAngle = Math.max(0.05, po - 0.35); controls.maxPolarAngle = Math.min(Math.PI - 0.05, po + 0.35);
  }
  function reset() {
    tw.clear();
    Object.values(parts).forEach(p => { p.obj.position.copy(p.base.position); p.obj.rotation.copy(p.base.rotation); glow(p.mesh, 0x000000, 0); });
    flash = null;
  }

  function frame(t) {
    if (!running) return;
    tw.step(t);
    controls.update();
    const pulse = 0.45 + 0.45 * Math.sin(t / 200);
    ids.forEach(id => {
      const m = parts[id].mesh;
      if (flash && flash.id === id && t - flash.s < 450) glow(m, RED, 0.9);
      else if (id === next) glow(m, BLUE, pulse);
      else if (done.has(id)) glow(m, GREEN, 0.35);
      else glow(m, 0x000000, 0);
    });
    renderer.render(scene, camera);
    if (next && tipEl) {
      parts[next].mesh.getWorldPosition(tmp); tmp.project(camera);
      const w = container.clientWidth, h = container.clientHeight;
      tipEl.style.left = (tmp.x * 0.5 + 0.5) * w + "px"; tipEl.style.top = (-tmp.y * 0.5 + 0.5) * h + "px";
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const act = (id) => { const p = parts[id]; if (p) tw.add({ obj: p.obj, prop: p.prop, axis: p.axis, delta: p.delta, ms: p.ms, back: p.back }); };
  return {
    /* show a feature: partIds in pad order */
    setFeature(key, partIds) { reset(); ids = partIds.filter(id => parts[id]); next = null; done = new Set(); focus(key); },
    mark(nextId, doneIds) {
      next = nextId || null; done = new Set(doneIds || []);
      if (tipEl) { tipEl.textContent = next ? PART_NAMES[next] : ""; tipEl.classList.toggle("on", !!next); }
    },
    act,
    wrong(id) { act(id); flash = { id, s: performance.now() }; },
    reset,
    pause() { running = false; },
    resume() { if (!running) { running = true; requestAnimationFrame(frame); } },
  };
}
