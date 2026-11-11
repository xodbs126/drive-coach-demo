/* Drive Coach 4.1 — 3D car in the left cluster (Three.js r170 from vendor/, ES module).
   A simple sedan shaped after the 그랜저's proportions with full-width front/rear light bars.
   It is not the real car model: body, doors and lamps only show the simulated vehicle state.

   initCar(getState) → { el, mount(parent), dispose() }
     getState() returns { gear, speed, braking, turn: null|"L"|"R"|"H", doors: { fl, fr, rl, rr, trunk } }
   Coordinates: metres, the car faces +x, left side (운전석) is +z. */
import * as THREE from "../vendor/three.module.min.js";

const W = 340, H = 270;
const BODY = 0xB9BFC7, GLASS = 0x1B222C, TIRE = 0x1A1C20, RIM = 0xB9BEC6;

export function initCar(getState) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xffffff, 1);
  const el = renderer.domElement;
  el.className = "cl-car3d";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "차량 상태 3D 모델 · 시뮬레이션");

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 15, 34);
  scene.environment = studioEnv(renderer);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xC9CED6, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 9, 6); scene.add(sun);

  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 60);

  /* ---------- road ---------- */
  const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshStandardMaterial({ color: 0xF1F3F6, roughness: 1 }));
  road.rotation.x = -Math.PI / 2; scene.add(road);
  const dashes = new THREE.Group(); scene.add(dashes);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xC9CED6 }), dashGeo = new THREE.PlaneGeometry(1.6, 0.12);
  for (const z of [-1.9, 1.9]) {
    for (let i = 0; i < 16; i++) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(-24 + i * 3.2, 0.005, z); dashes.add(d);
    }
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.0), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; scene.add(shadow);

  /* ---------- car ---------- */
  const car = new THREE.Group(); scene.add(car);
  const paint = new THREE.MeshPhysicalMaterial({ color: BODY, metalness: 0.65, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const glass = new THREE.MeshPhysicalMaterial({ color: GLASS, metalness: 0.2, roughness: 0.08, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2A2E35, roughness: 0.6 });

  // lower body: side profile extruded across the width, with wheel arches
  const WB = 1.48, R = 0.36, ARCH = 0.43;
  const s = new THREE.Shape();
  s.moveTo(-2.40, 0.30);
  s.lineTo(-WB - ARCH, 0.30); s.absarc(-WB, R, ARCH, Math.PI, 0, true);
  s.lineTo(WB - ARCH, 0.30); s.absarc(WB, R, ARCH, Math.PI, 0, true);
  s.lineTo(2.36, 0.30);
  s.quadraticCurveTo(2.52, 0.34, 2.53, 0.55);
  s.quadraticCurveTo(2.52, 0.76, 2.36, 0.80);
  s.quadraticCurveTo(1.80, 0.86, 1.20, 0.93);
  s.lineTo(-1.60, 0.97);
  s.quadraticCurveTo(-2.20, 1.00, -2.42, 0.95);
  s.quadraticCurveTo(-2.53, 0.80, -2.50, 0.55);
  s.quadraticCurveTo(-2.48, 0.32, -2.40, 0.30);
  const body = extrude(s, 1.80, 0.07, paint);
  bend(body.geometry, (y) => 1 - 0.05 * Math.min(1, ((y - 0.64) / 0.34) ** 2)); // sides bulge a little
  car.add(body);

  // greenhouse (dark glass) on top, narrower than the body
  const g = new THREE.Shape();
  g.moveTo(1.22, 0.92);
  g.quadraticCurveTo(0.60, 1.30, 0.20, 1.40);
  g.lineTo(-0.80, 1.43);
  g.quadraticCurveTo(-1.55, 1.30, -2.02, 0.99);
  g.lineTo(-1.60, 0.96);
  g.lineTo(1.22, 0.92);
  const cabin = extrude(g, 1.46, 0.06, glass);
  bend(cabin.geometry, (y) => 1 - 0.2 * Math.max(0, Math.min(1, (y - 0.92) / 0.52))); // tumblehome: narrower at the roof
  car.add(cabin);
  // roof rails (body colour) so the roof reads as a roof
  for (const z of [-0.70, 0.70]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.05), paint);
    rail.position.set(-0.30, 1.44, z * 0.82); car.add(rail);
  }

  // doors: body-coloured panels hinged at their front edge
  const doors = {};
  const doorDef = { fl: [0.12, 1.18, 1], fr: [0.12, 1.18, -1], rl: [-1.02, 0.10, 1], rr: [-1.02, 0.10, -1] };
  for (const [k, [x0, x1, side]] of Object.entries(doorDef)) {
    const hinge = new THREE.Group(); hinge.position.set(x1, 0, side * 0.915); // body side surface ≈ ±0.90 car.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.50, 0.035), paint);
    panel.position.set(-(x1 - x0) / 2, 0.66, 0); hinge.add(panel);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.01, 0.51, 0.03), trim);
    seam.position.set(-(x1 - x0) / 2, 0.66, -side * 0.006); hinge.add(seam);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), trim);
    handle.position.set(-(x1 - x0) * 0.75, 0.80, side * 0.025); hinge.add(handle);
    doors[k] = { hinge, side, a: 0 };
  }
  // trunk lid hinged at the rear window
  const trunk = new THREE.Group(); trunk.position.set(-1.96, 1.00, 0); car.add(trunk);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 1.70), paint); lid.position.set(-0.24, 0, 0); trunk.add(lid);
  const trunkS = { a: 0 };

  // lamps
  const lamp = (color, w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0 }));
  // lamps sit on the bevelled surface (front face x≈2.54 at y 0.72, rear face x≈-2.53 at y 0.85)
  const front = lamp(0xEAF4FF, 0.07, 0.035, 1.64); front.position.set(2.52, 0.72, 0); car.add(front);
  const rear = lamp(0xFF1E1E, 0.07, 0.055, 1.70); rear.position.set(-2.52, 0.85, 0); car.add(rear);
  const rev = [1, -1].map(zs => { const m = lamp(0xFFFFFF, 0.07, 0.05, 0.18); m.position.set(-2.54, 0.60, zs * 0.60); car.add(m); return m; });
  const turnL = [], turnR = [];
  for (const [x, y] of [[2.51, 0.66], [-2.53, 0.78]]) {
    for (const zs of [1, -1]) {
      const m = lamp(0xFFA21A, 0.07, 0.05, 0.16); m.position.set(x, y, zs * 0.74); car.add(m);
      (zs > 0 ? turnL : turnR).push(m);
    }
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 1.2), trim); grille.position.set(2.56, 0.48, 0); car.add(grille);

  // wheels
  const wheels = [];
  const tireG = new THREE.CylinderGeometry(R, R, 0.24, 36), rimG = new THREE.CylinderGeometry(0.24, 0.24, 0.245, 28);
  const tireM = new THREE.MeshStandardMaterial({ color: TIRE, roughness: 0.9 });
  const rimM = new THREE.MeshStandardMaterial({ color: RIM, metalness: 0.9, roughness: 0.25 });
  for (const x of [WB, -WB]) {
    for (const zs of [1, -1]) {
      const w = new THREE.Group(); w.position.set(x, R, zs * 0.83);
      const t = new THREE.Mesh(tireG, tireM); t.rotation.x = Math.PI / 2; w.add(t);
      const r = new THREE.Mesh(rimG, rimM); r.rotation.x = Math.PI / 2; w.add(r);
      for (let i = 0; i < 5; i++) { // spokes, so the spin is visible
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.045, 0.02), trim);
        sp.position.z = zs * 0.125; sp.rotation.z = i * Math.PI / 5; w.add(sp);
      }
      car.add(w); wheels.push(w);
    }
  }

  /* ---------- camera rigs ---------- */
  const PARK = { pos: new THREE.Vector3(8.2, 5.0, 7.6), at: new THREE.Vector3(0, 0.45, 0) };   // 앞쪽 3/4
  const DRIVE = { pos: new THREE.Vector3(-10.5, 4.4, 0.0), at: new THREE.Vector3(2.0, 0.5, 0) }; // 뒤에서 따라가기
  const camPos = PARK.pos.clone(), camAt = PARK.at.clone();
  camera.position.copy(camPos); camera.lookAt(camAt);

  /* ---------- loop ---------- */
  let raf = 0, last = 0, blink = 0, roll = 0;
  const ease = (cur, to, k) => cur + (to - cur) * Math.min(1, k);
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!el.isConnected || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
    const st = getState();
    const v = st.speed / 3.6 * (st.gear === "R" ? -1 : 1); // m/s, sign = direction

    // camera: parked → front 3/4, in gear and rolling → chase view
    const rig = (st.gear === "D" || st.gear === "R") && st.speed > 0.5 ? DRIVE : PARK;
    camPos.lerp(rig.pos, Math.min(1, dt * 1.6)); camAt.lerp(rig.at, Math.min(1, dt * 1.6));
    camera.position.copy(camPos); camera.lookAt(camAt);

    // road moves under the car; wheels turn (slowed down so the spokes stay readable)
    roll = (roll + v * dt) % 3.2;
    dashes.position.x = -roll;
    wheels.forEach(w => { w.rotation.z -= v * dt / R * 0.35; });

    // doors and trunk swing
    for (const [k, d] of Object.entries(doors)) {
      d.a = ease(d.a, st.doors[k] ? 1 : 0, dt * 5);
      d.hinge.rotation.y = d.side * d.a * 1.05;
    }
    trunkS.a = ease(trunkS.a, st.doors.trunk ? 1 : 0, dt * 4);
    trunk.rotation.z = -trunkS.a * 1.15;

    // lamps
    blink = (blink + dt) % 0.8;
    const on = blink < 0.42;
    front.material.emissiveIntensity = 2.2;
    rear.material.emissiveIntensity = st.braking ? 3.2 : 0.9;
    rev.forEach(m => { m.material.emissiveIntensity = st.gear === "R" ? 2.4 : 0; });
    const l = on && (st.turn === "L" || st.turn === "H"), r = on && (st.turn === "R" || st.turn === "H");
    turnL.forEach(m => { m.material.emissiveIntensity = l ? 2.6 : 0; });
    turnR.forEach(m => { m.material.emissiveIntensity = r ? 2.6 : 0; });

    // a little body pitch when braking or accelerating
    car.rotation.z = ease(car.rotation.z, st.braking && st.speed > 1 ? -0.012 : 0, dt * 4);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    el,
    mount(parent) { if (parent && el.parentNode !== parent) parent.appendChild(el); },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); el.remove(); },
  };
}

/* scale z (width) by f(y): rounds the flat extruded sides */
function bend(geo, f) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * f(p.getY(i)));
  p.needsUpdate = true; geo.computeVertexNormals();
}

function extrude(shape, width, bevel, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 28,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/* soft studio reflections without an HDR file: a few bright panels around the car */
function studioEnv(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xDDE2E8);
  const panel = (w, h, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(12, 3, 0, 10, 0, 0xFFFFFF); panel(8, 4, 10, 4, 6, 0xF4F7FA); panel(8, 4, -10, 4, -6, 0xF4F7FA);
  panel(30, 30, 0, -8, 0, 0x8E959E);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  return tex;
}

function shadowTex() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(128, 64, 8, 128, 64, 120);
  gr.addColorStop(0, "rgba(20,24,30,0.45)"); gr.addColorStop(0.55, "rgba(20,24,30,0.18)"); gr.addColorStop(1, "rgba(20,24,30,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
