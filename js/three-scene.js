/* Drive Coach 4.1 — simple procedural 3D cockpit (representative model, not a real vehicle) */
import * as THREE from "../vendor/three.module.min.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const NAMES = { scc: "스마트 크루즈 컨트롤 버튼", lka: "차로 유지 보조 버튼", wiper: "오토 와이퍼 레버", autohold: "오토 홀드 버튼", defog: "앞유리 김서림 제거 버튼" };

export function init(container, markersEl, onSelect) {
  const W = container.clientWidth || 540, H = container.clientHeight || 448;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const pr = () => Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, Math.min(innerWidth / 1280, innerHeight / 720)));
  renderer.setPixelRatio(pr());
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe6ebf2, 6, 40);
  const camera = new THREE.PerspectiveCamera(52, W / H, 0.02, 80);
  camera.position.set(-0.36, 1.3, 1.16);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1.5, 3, 2.5); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(-2, 1, 1); scene.add(fill);

  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...o });
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const feat = {}; // key -> {meshes:[], anchor:Object3D}
  const reg = (key, mesh, anchor) => { (feat[key] ||= { meshes: [], anchor: anchor || mesh }).meshes.push(mesh); mesh.userData.feature = key; mesh.material = mesh.material.clone(); };

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
  // A-pillars + roof edge
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
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.02), [M(0x111111), M(0x111111), M(0x111111), M(0x111111), new THREE.MeshBasicMaterial({ map: tex }), M(0x111111)]);
  disp.position.set(-0.2, 1.14, -0.04); disp.rotation.x = -0.18; scene.add(disp);

  // HVAC panel + defog button
  box(0.3, 0.14, 0.02, M(0x23272d), 0.12, 0.86, 0.17);
  const defog = box(0.06, 0.035, 0.015, M(0x3b414a), 0.04, 0.87, 0.185); reg("defog", defog);
  box(0.06, 0.035, 0.015, M(0x3b414a), 0.12, 0.87, 0.185); box(0.06, 0.035, 0.015, M(0x3b414a), 0.2, 0.87, 0.185);
  // vents
  box(0.22, 0.05, 0.02, M(0x1c1f24), -0.75, 0.93, 0.17); box(0.22, 0.05, 0.02, M(0x1c1f24), 0.62, 0.93, 0.17);
  // console: gear knob + auto hold
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 32), trimM); knob.position.set(0.08, 0.74, 0.4); scene.add(knob);
  const ah = box(0.05, 0.014, 0.035, M(0x3b414a), 0.18, 0.73, 0.52); reg("autohold", ah);
  box(0.05, 0.014, 0.035, M(0x3b414a), 0.18, 0.73, 0.6);

  // steering column + wheel
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.38, 24), M(0x2a2e34));
  col.position.set(-0.38, 0.88, 0.25); col.rotation.x = Math.PI / 2 - 0.4; scene.add(col);
  const wheel = new THREE.Group(); wheel.position.set(-0.38, 0.95, 0.44); wheel.rotation.x = -0.38; scene.add(wheel);
  const rimM = M(0x1c1f24, { roughness: 0.55 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 20, 64), rimM));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.04, 32), M(0x2b2f36)); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  box(0.12, 0.028, 0.02, rimM, -0.115, 0, 0, wheel); box(0.12, 0.028, 0.02, rimM, 0.115, 0, 0, wheel);
  const low = box(0.03, 0.12, 0.02, rimM, 0, -0.11, 0, wheel);
  // spoke button panels
  const lp = box(0.075, 0.07, 0.008, M(0x30353c), -0.115, 0.004, 0.017, wheel);
  const btnM = M(0x4a505a);
  const sccAnchor = new THREE.Object3D(); sccAnchor.position.set(-0.115, 0.012, 0.03); wheel.add(sccAnchor);
  [[-0.135, 0.02], [-0.095, 0.02], [-0.135, -0.005], [-0.095, -0.005]].forEach(([x, y]) => reg("scc", box(0.03, 0.018, 0.008, btnM, x, y, 0.024, wheel), sccAnchor));
  reg("lka", box(0.07, 0.016, 0.008, btnM, -0.115, -0.026, 0.024, wheel));
  box(0.075, 0.07, 0.008, M(0x30353c), 0.115, 0.004, 0.017, wheel);
  [[0.095, 0.015], [0.135, 0.015], [0.115, -0.015]].forEach(([x, y]) => box(0.028, 0.018, 0.008, btnM, x, y, 0.024, wheel));
  // stalks
  const stalkM = M(0x24282d);
  const wip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 16), stalkM);
  wip.position.set(-0.24, 0.92, 0.36); wip.rotation.z = Math.PI / 2 + 0.15; scene.add(wip); reg("wiper", wip);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 16), M(0x3b414a)); tip.position.set(-0.155, 0.932, 0.36); tip.rotation.z = Math.PI / 2 + 0.15; scene.add(tip); reg("wiper", tip, tip);
  const turn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 16), stalkM);
  turn.position.set(-0.52, 0.92, 0.36); turn.rotation.z = Math.PI / 2 - 0.15; scene.add(turn);

  // controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-0.22, 0.93, 0.0);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.35; controls.maxDistance = 1.8;
  controls.minAzimuthAngle = -1.05; controls.maxAzimuthAngle = 0.95;
  controls.minPolarAngle = 0.95; controls.maxPolarAngle = 1.75;
  controls.rotateSpeed = 0.55;
  controls.update();

  // markers (HTML overlay)
  markersEl.innerHTML = Object.keys(feat).map(k => `<button class="d3mk" data-k="${k}" aria-label="${NAMES[k]}"></button>`).join("") + '<div class="d3lab" id="d3-lab"></div>';
  const mk = {}; markersEl.querySelectorAll(".d3mk").forEach(b => { mk[b.dataset.k] = b; b.addEventListener("click", (e) => { e.stopPropagation(); onSelect(b.dataset.k); }); });
  const lab = markersEl.querySelector("#d3-lab");

  // raycast click on meshes
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.userData.feature);
    if (hit) onSelect(hit.object.userData.feature);
  });

  let sel = "scc", running = true, anim = null;
  const tmp = new THREE.Vector3();
  const VIEWS = {
    driver: { p: [-0.36, 1.3, 1.16], t: [-0.22, 0.93, 0.0] },
    center: { p: [0.02, 1.22, 1.05], t: [0.1, 0.78, 0.2] },
  };
  function fly(p, t) { anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t), s: performance.now() }; }
  function view(v) {
    if (v === "zoom") { feat[sel].anchor.getWorldPosition(tmp); fly([tmp.x + 0.08, tmp.y + 0.1, tmp.z + 0.32], [tmp.x, tmp.y, tmp.z]); }
    else fly(VIEWS[v].p, VIEWS[v].t);
  }
  function select(k) {
    sel = k;
    Object.entries(feat).forEach(([key, f]) => f.meshes.forEach(m => { m.material.emissive.set(key === k ? 0x1f6fe0 : 0x000000); m.material.emissiveIntensity = key === k ? 0.8 : 0; }));
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
    feat[sel] && feat[sel].meshes.forEach(m => m.material.emissiveIntensity = pulse);
    renderer.render(scene, camera);
    // project markers
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
  addEventListener("resize", () => renderer.setPixelRatio(pr()));

  return {
    select, view,
    pause() { running = false; },
    resume() { if (!running) { running = true; requestAnimationFrame(frame); } },
  };
}
