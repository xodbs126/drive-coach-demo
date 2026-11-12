/* Drive Coach 4.1 — interactive mockup logic (simulation only) */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const D = window.D, IC = window.ICONS;

  /* ------------------------------------------------------------ state */
  const ST = {
    feature: "scc", b1: 0, b3: 4, voice: true, speed: 1, profile: "지민", d3view: "all",
    navVoice: "", coachVoice: "", // voiceURI picked in the demo panel ("" = automatic)
  };

  /* ------------------------------------------------------------ driver profiles
     Each driver keeps their own progress and settings (PER). Switching stores the current
     driver's values and loads the other driver's. D.profiles holds the starting values. */
  const PER = ["learned", "rev", "checked", "prog", "seg", "b4", "rec", "coach", "freq", "stage", "drove", "missions", "mission"];
  const PSTORE = {};
  const prof = () => D.profiles[ST.profile];
  function freshProfile(name) {
    const p = D.profiles[name];
    return {
      learned: { ...p.learned }, rev: { ...p.rev }, checked: new Set(p.checked), prog: p.prog, seg: p.seg, b4: null,
      rec: true, coach: true, freq: 2, drove: false, missions: {}, mission: null,
      stage: p.stage ? { ...p.stage } : Object.fromEntries(Object.entries(D.features).map(([k, f]) => [k, parseInt(f.prog, 10) || 0])),
    };
  }
  Object.assign(ST, freshProfile(ST.profile));

  /* ------------------------------------------------------------ helpers */
  function icon(name, size = 22, color = "currentColor") {
    if (name === "s30" || name === "s80") return sign(name.slice(1), size + 4);
    const svg = (IC[name] || "").replace('width="24" height="24"', `width="${size}" height="${size}"`);
    return `<span style="display:inline-flex;color:${color}">${svg}</span>`;
  }
  function sign(n, s) {
    return `<span style="flex:none;width:${s}px;height:${s}px;border-radius:50%;border:${Math.max(3, s / 9 | 0)}px solid #E5191C;background:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:${(s * 0.42) | 0}px;font-weight:700;color:#111418">${n}</span>`;
  }
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return lerp(y0, y1, (x - x0) / (x1 - x0 || 1)); }
    }
    return table[table.length - 1][1];
  }
  const invTable = (t) => t.map(([a, b]) => [b, a]);

  /* ------------------------------------------------------------ clock
     Every status bar shows the real time. Minutes driven in the A5 simulation are added
     (CLOCK.off) so the clock never goes back after arriving. */
  const CLOCK = { off: 0 };
  const now = () => new Date(Date.now() + CLOCK.off);
  const p2 = (n) => String(n).padStart(2, "0");
  const hm24 = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const hm12 = (d) => `${d.getHours() % 12 || 12}:${p2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
  function tickClock() {
    const d = now();
    $$(".sb-t").forEach(el => { if (!(SIM.t0 && el.closest("#A5"))) el.textContent = hm12(d); });
    $$(".l0-time").forEach(el => { el.textContent = `${d.getHours() % 12 || 12}:${p2(d.getMinutes())}`; });
    const eta = new Date(d.getTime() + 26 * 60000); // 집 → 회사 약 26분
    $$("[data-eta]").forEach(el => { el.textContent = hm24(eta); });
  }

  /* ------------------------------------------------------------ vehicle state (simulation)
     One source for the left cluster on every screen. Two inputs drive it:
     - A5 모의 주행 (while SIM.run, updateA5 writes VS)
     - 시연 패널의 기어 · ACCEL · BRAKE (or ↑ ↓ keys): simple physics in vsStep()
     Screens in LOCK open only while parked (기획 원칙 3). As in Android Automotive's
     CarUxRestrictionsManager, 'parked' means gear P — stopped in D/R/N (신호 대기) is not enough
     (기획서 8.1: 단순 속도 0km/h 판정이 아니라 차량 UX 제한 상태). */
  const VS = { gear: "P", speed: 0, odo: 5035, limit: 50, pedal: null, moved: false, raf: 0, last: 0, warned: false,
    turn: null, doors: { fl: false, fr: false, rl: false, rr: false, trunk: false } };
  const ROAD_LIMIT = 50; // 시연 패널로 움직일 때의 도로 제한속도 (집 근처 도심 · 시뮬레이션)
  const doorOpen = () => Object.values(VS.doors).some(Boolean);
  const LOCK = { A3: "첫길 리허설", A4: "구간 상세 학습", B3: "지도 분석", D3: "실내 그림 조작", D4: "가상 실습", F2: "프로필 전환" };
  const moving = () => VS.speed >= 0.5;
  /* driving state: "parked" (P) · "idling" (stopped in D/R/N) · "moving" */
  const uxState = () => (moving() ? "moving" : VS.gear === "P" ? "parked" : "idling");
  const parked = () => uxState() === "parked";
  const fmtOdo = () => (VS.moved ? VS.odo.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : VS.odo.toLocaleString("en-US")) + "km";
  let wasUx = "parked";
  function syncCluster() {
    const sp = String(Math.round(VS.speed)), odo = fmtOdo();
    // road limit sign: shown while driving; red when over it (지능형 속도 제한 보조처럼)
    const showLim = moving() || simDriving(), over = Math.round(VS.speed) > VS.limit;
    $$(".cl").forEach(c => {
      $(".cl-speed", c).textContent = sp; $(".cl-gear", c).textContent = VS.gear; $(".cl-odo", c).textContent = odo;
      let lim = $(".cl-limit", c);
      if (!lim) { lim = document.createElement("div"); lim.className = "cl-limit"; c.appendChild(lim); }
      lim.textContent = VS.limit; lim.style.display = showLim ? "" : "none"; lim.classList.toggle("over", over);
    });
    $$("[data-vs=gear]").forEach(e => { e.textContent = VS.gear; });
    $$("[data-vs=state]").forEach(e => { e.textContent = moving() ? "주행 중" : "정차 중"; });
    if (uxState() !== wasUx) { wasUx = uxState(); syncLock(); }
    if (!P.hidden) {
      $("#p-vs-speed").textContent = sp;
      $$("[data-p-gear]", P).forEach(b => b.classList.toggle("on", b.dataset.pGear === VS.gear));
      $$("[data-p-turn]", P).forEach(b => b.classList.toggle("on", b.dataset.pTurn === VS.turn));
      $$("[data-p-door]", P).forEach(b => b.classList.toggle("on", VS.doors[b.dataset.pDoor]));
    }
  }
  /* cover the current screen unless parked · removed when the gear goes to P */
  function syncLock() {
    const id = cur, sc = id && $("#" + id);
    $$(".drvlock").forEach(o => { if (!sc || !sc.contains(o)) o.style.display = "none"; });
    if (!sc || !LOCK[id]) return;
    const bd = $(".bd", sc);
    let ov = $(".drvlock", bd);
    if (parked()) { if (ov) ov.style.display = "none"; return; }
    if (!ov) { ov = document.createElement("div"); ov.className = "drvlock"; bd.appendChild(ov); }
    const idle = uxState() === "idling";
    ov.style.display = "";
    ov.innerHTML = `<div class="norec-in"><span class="norec-ic">${icon("lock", 30, "#1F6FE0")}</span>
<div class="h2">${idle ? "기어를 P로 바꾸면 열려요" : "주행 중에는 쓸 수 없어요"}</div>
<div class="sm" style="line-height:1.55">${idle ? `신호 대기처럼 ${VS.gear}에 두고 멈춘 상태에서는 ${LOCK[id]}을 할 수 없어요.<br/>주차(P)한 뒤에 이 화면이 다시 열려요.`
    : `${LOCK[id]}은 주차(P)한 상태에서만 할 수 있어요.<br/>차를 세우고 P로 바꾸면 이 화면이 다시 열려요.`}</div></div>`;
  }
  const simDriving = () => SIM.run && !SIM.finished;
  function setGear(g) {
    if (simDriving()) return toast("모의 주행 중에는 A5가 차를 움직여요");
    if (g === VS.gear) return;
    if (moving()) return toast("차를 멈춘 뒤 기어를 바꿔요");
    VS.gear = g; VS.warned = false; syncCluster();
  }
  function setPedal(p) {
    if (simDriving()) { VS.pedal = null; return; }
    VS.pedal = p;
    if (p === "accel" && (VS.gear === "P" || VS.gear === "N") && !VS.warned) { VS.warned = true; toast("기어를 D로 바꾸고 ACCEL을 누르면 출발해요"); }
    if (p === "accel" && doorOpen()) { VS.pedal = null; return toast("문이 열려 있어요 · 닫은 뒤 출발해요"); }
    vsKick();
  }
  /* 3D car in the cluster (js/car3d.js). One WebGL canvas moves into the cluster of the shown screen.
     It is an ES module: it needs http(s) and a JavaScript MIME type. Some servers send .js as
     text/plain (python -m http.server on some Windows PCs); then the files are re-loaded as Blob URLs.
     If it still fails, the cluster keeps the flat picture (assets/cluster-cars.png). */
  let CAR = null;
  const carState = () => ({
    gear: VS.gear, speed: VS.speed, turn: VS.turn, doors: VS.doors,
    braking: simDriving() ? SIM.braking : VS.pedal === "brake" || ((VS.gear === "D" || VS.gear === "R") && !moving()),
  });
  function loadCar() {
    if (location.protocol === "file:") return;
    fetch("js/car3d.js", { method: "HEAD", cache: "no-store" })
      .then(r => /javascript|ecmascript/i.test(r.headers.get("content-type") || ""), () => true)
      .then(ok => (ok ? import("./car3d.js") : importCarViaBlob()))
      .then(m => {
        CAR = m.initCar(carState);
        $("#stage").classList.add("car3d-on");
        if (cur) CAR.mount($(`#${cur} .cl`));
      })
      .catch(err => console.warn("3D 차량을 불러오지 못해서 그림으로 보여요", err));
  }
  async function importCarViaBlob() {
    const src = (u) => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.text(); });
    const blob = (code) => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const three = blob(await src("vendor/three.module.min.js")), code = await src("js/car3d.js");
    const from = '"../vendor/three.module.min.js"';
    if (!code.includes(from)) throw new Error("car3d.js: three import not found");
    return import(blob(code.split(from).join(JSON.stringify(three))));
  }
  function setTurn(t) {
    if (simDriving()) return toast("모의 주행 중에는 A5가 방향지시등을 켜요");
    VS.turn = VS.turn === t ? null : t; syncCluster();
  }
  function toggleDoor(k) {
    if (simDriving() || moving()) return toast("주행 중에는 문을 열 수 없어요");
    VS.doors[k] = !VS.doors[k]; syncCluster();
  }
  function vsKick() { if (!VS.raf) { VS.last = 0; VS.raf = requestAnimationFrame(vsStep); } }
  function vsStep(t) {
    VS.raf = 0;
    if (simDriving()) return;                         // A5 writes VS itself
    const dt = VS.last ? Math.min(0.05, (t - VS.last) / 1000) : 0; VS.last = t;
    // rates of a mid-size sedan: 0→100km/h in about 15s with a steady pedal, 12km/h per second braking,
    // 1.5km/h per second when coasting (regenerative braking)
    const max = VS.gear === "R" ? 15 : 180, drive = VS.gear === "D" || VS.gear === "R";
    if (VS.pedal === "accel" && drive) VS.speed = Math.min(max, VS.speed + (9 - VS.speed * 0.045) * dt);
    else if (VS.pedal === "brake") VS.speed = Math.max(0, VS.speed - 12 * dt);
    else VS.speed = Math.max(0, VS.speed - 1.5 * dt);
    if (VS.speed > 0) { VS.odo += VS.speed * dt / 3600; VS.moved = true; } else if (VS.speed < 0.5) VS.speed = 0;
    syncCluster();
    if (VS.pedal || VS.speed > 0) VS.raf = requestAnimationFrame(vsStep);
  }

  /* ------------------------------------------------------------ stage scale */
  function fit() {
    const s = Math.min(innerWidth / 1280, innerHeight / 720);
    $("#stage").style.transform = `scale(${s})`;
  }
  addEventListener("resize", fit); fit();

  /* ------------------------------------------------------------ speech (TTS) */
  const TTS = { q: [], busy: false, voices: [], cur: null, gen: 0 }; // gen: bumped by hush() so late callbacks of cancelled lines are ignored
  const hasTTS = "speechSynthesis" in window;
  // Rank Korean voices so the softest, most natural female voice comes first:
  // Edge "SunHi Online (Natural)" > other Natural/online voices (Chrome "Google 한국의") > OS voices (Heami).
  const FEMALE = /SunHi|JiMin|SeoHyeon|SoonBok|YuJin|Yuna|Google|Heami/i;
  function voiceScore(v) {
    return (/Natural/i.test(v.name) ? 40 : 0) + (/Online|Google/i.test(v.name) || !v.localService ? 20 : 0)
      + (FEMALE.test(v.name) ? 10 : 0) + (/SunHi/i.test(v.name) ? 5 : 0);
  }
  function loadVoices() {
    if (!hasTTS) return;
    TTS.voices = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
    syncVoiceSelects();
  }
  if (hasTTS) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  /* nav: best voice. coach: a different voice when one of similar quality exists, so the two are easy to tell apart */
  function pickVoice(kind) {
    const v = TTS.voices, want = kind === "nav" ? ST.navVoice : ST.coachVoice;
    const chosen = want && v.find(x => x.voiceURI === want);
    if (chosen) return chosen;
    if (kind === "nav" || !v[1]) return v[0];
    return voiceScore(v[1]) >= 50 ? v[1] : v[0];
  }

  /* item: {text, kind:'nav'|'coach'|'review'|'ui', onstart, onend, stale()} */
  function speak(item) {
    if (item.kind === "nav") {
      const i = TTS.q.findIndex(q => q.kind !== "nav"); // nav voice always goes first
      if (i < 0) TTS.q.push(item); else TTS.q.splice(i, 0, item);
    } else TTS.q.push(item);
    pump();
  }
  function pump() {
    if (TTS.busy) return;
    let item;
    while ((item = TTS.q.shift())) { if (!(item.stale && item.stale())) break; }
    if (!item) return;
    TTS.busy = true; TTS.cur = item;
    item.onstart && item.onstart();
    let ended = false;
    const gen = TTS.gen, est = 500 + item.text.length * 85;
    const done = () => { if (ended) return; ended = true; if (gen !== TTS.gen) return; TTS.busy = false; TTS.cur = null; item.onend && item.onend(); setTimeout(pump, 180); };
    if (ST.voice && hasTTS) {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = "ko-KR";
      const v = pickVoice(item.kind === "nav" ? "nav" : "coach");
      if (v) u.voice = v;
      u.rate = item.kind === "nav" ? 1.03 : 1.0; u.pitch = 1.0;
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
      setTimeout(done, est * 1.4 + 1500); // Chrome sometimes drops onend
    } else setTimeout(done, est);
  }
  function hush() { TTS.gen++; TTS.q = []; if (hasTTS) speechSynthesis.cancel(); TTS.busy = false; TTS.cur = null; }
  function sayUI(text) { hush(); speak({ text, kind: "ui" }); }

  /* ------------------------------------------------------------ router */
  let cur = null;
  function show() {
    if (!$(".scr")) return; // screens/*.html not loaded yet
    let id = (location.hash || "#A1").slice(1);
    if (!document.getElementById(id) || !/^([A-F]\d|L0)$/.test(id)) id = "L0";
    if (cur === id) return;
    if (cur) leave(cur);
    $$(".scr.on").forEach(e => e.classList.remove("on"));
    $("#" + id).classList.add("on");
    cur = id; enter(id);
    syncCluster(); syncLock();
    if (CAR) CAR.mount($(".cl", $("#" + id)));
    syncPanel();
  }
  function go(id) { if (location.hash === "#" + id) { cur = null; show(); } else location.hash = id; }
  addEventListener("hashchange", show);

  function enter(id) {
    if (/^(B[134]|E[23])$/.test(id)) noRecords(id);
    ({ A1: renderA1, A3: renderA3, A4: enterA4, A5: enterA5, B1: renderB1, B3: renderB3, B4: renderB4, C2: renderC2, D2: enterD2, D3: enterD3, D4: enterD4, F2: syncF2, F4: syncSettings }[id] || (() => {}))();
  }
  function leave(id) {
    hush();
    if (id === "A5") stopSim();
    if (id === "A4") cancelAnimationFrame(A4.raf);
  }

  /* ------------------------------------------------------------ A1 home */
  function renderA1() {
    const L = D.lastDrive;
    $("#a1-last-h").textContent = `지난번 이 길 · ${L.date}`;
    $("#a1-last-s").textContent = `${L.score}점`;
    $("#a1-last").innerHTML = L.pens.map(q => `<div class="a1-pen"><div class="row" style="gap:5px">${icon(q.ic, 17, "#1A9BE8")}<span>${q.t}</span></div>
<div class="num"><b>${q.n}</b><span>회</span></div></div>`).join("");
    const bars = (all, n) => Array.from({ length: all }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");
    const p = D.progs.find(q => q.key === prof().prog);
    if (p) { $("#a1-prog").innerHTML = bars(p.missions.length, doneOf(p)); $("#a1-progs").textContent = `${doneOf(p)}/${p.missions.length}`; }
    $("#a1-learn").innerHTML = bars(3, stageOf("scc"));
    $("#a1-spark").innerHTML = spark(D.growth);
    $("#a1-spark").setAttribute("aria-label", "같은 길 점수 " + D.growth.map(p => `${p[0]} ${p[1]}점`).join(", "));
  }
  /* A1 '같은 길 성장': small score line, dates under each point */
  function spark(pts) {
    const x = (i) => 14 + i * (122 / (pts.length - 1)), y = (v) => 46 - (v - 72) * 2, last = pts.length - 1;
    return `<polyline points="${pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")}" fill="none" stroke="#1A9BE8" stroke-width="2" stroke-linejoin="round"/>`
      + pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="${i === last ? 4 : 3}" fill="${i === last ? "#1A9BE8" : "#fff"}" stroke="#1A9BE8" stroke-width="2"/>`
      + `<text x="${x(i)}" y="${y(p[1]) - 8}" text-anchor="middle" font-size="12" font-weight="${i === last ? 700 : 500}" fill="${i === last ? "#1A6FD0" : "#646B76"}">${p[1]}</text>`
      + `<text x="${x(i)}" y="56" text-anchor="middle" font-size="11" fill="#646B76">${p[0]}</text>`).join("");
  }
  /* B1, B3, B4, E2, E3 for a driver without records: cover the screen with an empty state */
  function noRecords(id) {
    const bd = $(`#${id} .bd`);
    let ov = $(".norec", bd);
    if (prof().records) { if (ov) ov.style.display = "none"; return; }
    if (!ov) { ov = document.createElement("div"); ov.className = "norec"; bd.appendChild(ov); }
    const after = ST.drove && id === "B1";
    ov.style.display = "";
    ov.innerHTML = `<div class="norec-in"><span class="norec-ic">${icon(after ? "check" : "route", 30, "#1F6FE0")}</span>
<div class="h2">${after ? "주행을 마쳤어요" : "아직 주행 기록이 없어요"}</div>
<div class="sm" style="line-height:1.55">${after ? "집 → 회사 · 12.4km · 시뮬레이션<br/>점수 리포트 예시는 지민 프로필에만 있어요."
    : `${ST.profile} 님이 주행을 마치면 점수와 리포트가 여기에 쌓여요.<br/>기록은 이 차량 안에만 저장돼요.`}</div>
<div class="row" style="gap:8px;margin-top:12px"><a href="#A3" class="btn pri" style="width:170px">첫길 리허설 하기</a><a href="#F2" class="btn sec" style="width:150px">프로필 바꾸기</a></div></div>`;
  }

  /* ------------------------------------------------------------ A3 rehearsal */
  const hardOf = (s) => !!s.hard && prof().records; // '어려운 구간' is the driver's own mark
  function renderA3() {
    const rows = D.segs.map(s => {
      const on = s.n === ST.seg, chk = ST.checked.has(s.n), hard = hardOf(s);
      const bar = chk ? "#1FB83A" : on ? "#1F6FE0" : "#E0E0E5";
      const tail = hard ? '<span class="chip red">어려운 구간</span>' : chk ? icon("check", 18, "#1FB83A") : "";
      return `<a href="#" class="tl-row${on ? " on" : ""}" data-seg="${s.n}"><span style="width:3px;height:34px;border-radius:2px;background:${bar}"></span>
<span style="width:28px;display:flex;justify-content:center">${icon(s.ic, 21, "#111418")}</span>
<div><div class="num" style="font-size:15px;font-weight:600">${s.km}km</div><div class="xs" style="color:#4B515A">${s.title} · ${s.sub}</div></div>
<span style="margin-left:auto;display:flex">${tail}${hard && chk ? '<span style="margin-left:6px;display:flex">' + icon("check", 18, "#1FB83A") + "</span>" : ""}</span></a>`;
    }).join("");
    $("#a3-rows").innerHTML = rows;
    $("#a3-count").textContent = `${ST.checked.size}/7 확인`;
    $("#a3-seg").innerHTML = D.segs.map(s => `<i class="${ST.checked.has(s.n) ? "g" : s.n === ST.seg ? "b" : ""}"></i>`).join("");
    const s = D.segs[ST.seg - 1];
    $("#a3-hl").setAttribute("transform", `translate(${s.pos[0]} ${s.pos[1]})`);
    $("#a3-ic").innerHTML = icon(s.ic, 22, "#111418");
    $("#a3-title").textContent = s.type === "S" ? `${s.n} · ${s.title}` : `${s.n} · ${s.sub} ${s.title}`;
    $("#a3-sub").textContent = `출발 ${s.km}km · 약 ${Math.max(1, Math.round(s.km / 12.4 * 26))}분 뒤`;
    $("#a3-hard").style.display = hardOf(s) ? "" : "none";
    $("#a3-tips").innerHTML = s.steps.map((t, i) => `<li class="row" style="gap:10px"><span style="flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid #111418;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center">${i + 1}</span>${t[0]} · ${t[1]}</li>`).join("");
  }
  function segBrief(s) { return `${s.sub} ${s.title}. ` + s.steps.map(t => `${t[0]}, ${t[1]}.`).join(" "); }

  /* ------------------------------------------------------------ A4 section detail */
  const A4 = { raf: 0 };
  function enterA4() {
    const s = D.segs[ST.seg - 1];
    $$(".a4type").forEach(e => e.classList.toggle("on", e.dataset.type === s.type));
    $("#a4-ic").innerHTML = icon(s.ic, 26, "#111418");
    $("#a4-title").textContent = s.title;
    $("#a4-sub").textContent = `${s.sub} · 출발 ${s.km}km`;
    $("#a4-lane").innerHTML = `<i class="dot" style="background:#1FB83A"></i> ${s.lane}`;
    $("#a4-idx").textContent = `구간 ${String(s.n).padStart(2, "0")} / 07`;
    $("#a4-hard").style.display = hardOf(s) ? "" : "none";
    $("#a4-h").textContent = s.h;
    $("#a4-desc").textContent = s.desc + (s.mine && prof().records ? " " + s.mine : "");
    $("#a4-steps").innerHTML = s.steps.map(t => `<div class="row" style="gap:10px;align-items:flex-start"><span class="chip navy" style="flex:none">${t[0]}</span>${t[1]}</div>`).join("");
    if (s.type === "S") {
      $("#s-num").textContent = s.speed; $("#s-paint").textContent = s.speed; $("#s-zone").textContent = s.zone;
      $("#s-zone-paint").setAttribute("fill", s.speed === 30 ? "#F6C7C7" : "#C9D6E8");
      $("#s-zone").setAttribute("fill", s.speed === 30 ? "#C8161A" : "#1A5FC4");
    }
    playA4();
  }
  function playA4() {
    cancelAnimationFrame(A4.raf);
    const s = D.segs[ST.seg - 1];
    const path = $("#p-" + s.type), car = $("#car-" + s.type);
    const L = path.getTotalLength(), dur = 5000;
    let t0 = null;
    const step = (t) => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = path.getPointAtLength(e * L), q = path.getPointAtLength(Math.min(L, e * L + 2));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
      car.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${ang})`);
      $("#a4-bar").style.width = (k * 100) + "%";
      $("#a4-time").textContent = `진행 0:0${Math.floor(k * 5)} / 0:05`;
      if (k < 1) A4.raf = requestAnimationFrame(step);
    };
    A4.raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------ A5 simulation */
  const R = D.route;
  const cum = [0]; for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]));
  const kmToU = (km) => interp(invTable(D.kmAnchors), km);
  function posAtU(u) {
    for (let i = 1; i < R.length; i++) {
      if (u <= cum[i] || i === R.length - 1) {
        const t = Math.max(0, Math.min(1, (u - cum[i - 1]) / (cum[i] - cum[i - 1])));
        return { x: lerp(R[i - 1][0], R[i][0], t), y: lerp(R[i - 1][1], R[i][1], t), i, ang: Math.atan2(R[i][1] - R[i - 1][1], R[i][0] - R[i - 1][0]) * 180 / Math.PI + 90 };
      }
    }
  }
  const limitAt = (km) => { let l = 50; for (const [k, v] of D.limits) if (km >= k) l = v; return l; };
  /* 방향지시등: D.signals 표를 따라요 (도로교통법 기준 · 시뮬레이션) */
  const turnAt = (km) => { const s = D.signals.find(([a, b]) => km >= a && km < b); return s ? s[2] : null; };
  const NAVTXT = { 1: "단지 앞 큰길로 우회전", 2: "어린이 보호구역 진입", 3: "시청 사거리에서 좌회전", 4: "회전교차로 첫 번째 출구", 5: "도시고속도로 진입", 6: "회사 앞에서 유턴", 7: "좌회전 후 목적지" };
  const SIM = { run: false, paused: false, km: 0, spd: 0, raf: 0, last: 0, fired: new Set(), cam: { x: 120, y: 520 }, head: 0, finished: false, idleT: 0, braking: false };
  const SIM_ACC = 5.5, SIM_DEC = 8, K_SLOW = 4, K_FAST = 24;
  const BRAKE_K = 2 * SIM_DEC * 0.8 * 3600 / K_SLOW; // (km/h)² per km of braking room, with a margin
  /* speed allowed now: the planned speed here, or lower if a slower point ahead needs braking already */
  function wantSpeed(km) {
    let w = interp(D.speeds, km);
    for (let i = 1; i <= 16; i++) {
      const x = 0.5 * i / 16, vt = interp(D.speeds, Math.min(12.4, km + x));
      w = Math.min(w, Math.sqrt(vt * vt + x * BRAKE_K));
    }
    return w;
  }

  function enterA5() {
    stopSim(); hush();
    Object.assign(SIM, { run: true, paused: false, km: 0, spd: 0, last: 0, fired: new Set(), cam: { x: 120, y: 500 }, head: 0, finished: false, t0: now().getTime(), mins: 0, odo0: VS.odo });
    VS.pedal = null; VS.moved = true; Object.keys(VS.doors).forEach(k => { VS.doors[k] = false; });
    $("#a5-eta").textContent = hm24(new Date(SIM.t0 + 26 * 60000)); // 도착 예정: 출발 + 26분
    coachIdle(); $("#a5-navsub").classList.remove("on"); $("#a5-navspk").classList.remove("on");
    updateA5(0);
    setTimeout(() => { if (SIM.run && cur === "A5") { SIM.raf = requestAnimationFrame(tick); } }, 700);
  }
  /* ends the simulated drive. arrive: [도착으로 건너뛰기] — count the whole route.
     Leaving A5 (arrived, skipped or in the middle) ends the drive: the car stands still in P. */
  function stopSim(arrive) {
    const active = !!SIM.t0;
    SIM.run = false; cancelAnimationFrame(SIM.raf);
    if (!active) return;
    if (arrive) { SIM.finished = true; SIM.km = 12.4; SIM.mins = 26; }
    CLOCK.off += SIM.mins * 60000; SIM.t0 = 0; SIM.mins = 0; tickClock(); // keep the minutes driven
    Object.assign(VS, { speed: 0, gear: "P", pedal: null, odo: SIM.odo0 + SIM.km, limit: ROAD_LIMIT, turn: null });
    syncCluster();
  }
  function tick(t) {
    if (!SIM.run) return;
    if (!SIM.last) SIM.last = t;
    const rdt = Math.min(0.05, (t - SIM.last) / 1000); SIM.last = t;
    if (!SIM.paused && !SIM.finished) {
      const talking = TTS.busy || TTS.q.length > 0;
      const dt = talking ? rdt : rdt * ST.speed;      // playback speed only applies between voice lines
      // The needle moves at real-car rates (SIM_ACC / SIM_DEC km/h per second) and brakes early enough
      // for the next slower point. Distance is fast-forwarded (K) only while the speed is steady.
      const tgt = wantSpeed(SIM.km), diff = tgt - SIM.spd;
      SIM.spd += Math.max(-SIM_DEC * dt, Math.min(SIM_ACC * dt, diff));
      SIM.braking = diff < -0.5;
      // also slow while an indicator is on, so it blinks a few times before the car turns
      const K = talking || turnAt(SIM.km) || Math.abs(tgt - SIM.spd) > 1.5 ? K_SLOW : K_FAST;
      SIM.km = Math.min(12.4, SIM.km + Math.max(SIM.spd, 6) / 3600 * dt * K);
      fireScript();
      if (SIM.km >= 12.4) finish();
    }
    updateA5(rdt);
    SIM.raf = requestAnimationFrame(tick);
  }
  function fireScript() {
    D.script.forEach((ev, i) => {
      if (SIM.fired.has(i) || SIM.km < ev.km) return;
      SIM.fired.add(i);
      if (ev.kind === "coach" && (!ST.coach || ev.lvl > ST.freq)) return;
      if (ev.kind === "review" && !(ST.learned[ev.feature] && ST.rev[ev.feature])) return;
      speak({
        text: ev.text, kind: ev.kind,
        stale: ev.ttl ? () => SIM.km > ev.ttl : null,
        onstart: () => ev.kind === "nav" ? navOn(ev.text) : coachOn(ev),
        onend: () => ev.kind === "nav" ? navOff() : coachOff(),
      });
    });
  }
  function navOn(text) { $("#a5-navsub").innerHTML = icon("vol", 14, "#fff") + " " + text; $("#a5-navsub").classList.add("on"); $("#a5-navspk").classList.add("on"); }
  function navOff() { setTimeout(() => { $("#a5-navsub").classList.remove("on"); }, 700); $("#a5-navspk").classList.remove("on"); }
  function coachIdle() {
    const c = $("#a5-coach"); c.className = "row coachbar idle";
    $("#a5-coach-tag").textContent = ST.coach ? "Drive Coach 코칭 · 내비 음성이 끝난 뒤" : "운전 코칭 꺼짐 · 주행 기록은 계속돼요";
    $("#a5-coach-text").textContent = ST.coach ? "코칭 대기 중 · 내비 안내가 먼저예요" : "설정에서 코칭을 다시 켤 수 있어요";
  }
  function coachOn(ev) {
    clearTimeout(SIM.idleT);
    const c = $("#a5-coach");
    c.className = "row coachbar talk" + (ev.kind === "review" ? " review" : "");
    $("#a5-coach-tag").textContent = ev.kind === "review" ? "내 차 기능 복습 · 스마트 크루즈 컨트롤 · 동의한 기능만" : "Drive Coach 코칭 · 내비 음성이 끝난 뒤";
    $("#a5-coach-ic").innerHTML = icon(ev.kind === "review" ? "wheel" : "vol", 22, "#fff");
    $("#a5-coach-text").textContent = "“" + ev.text + "”";
  }
  function coachOff() {
    $("#a5-coach").classList.remove("talk");
    SIM.idleT = setTimeout(() => { if (cur === "A5" && !(TTS.cur && TTS.cur.kind !== "nav")) { coachIdle(); $("#a5-coach-ic").innerHTML = icon("vol", 22, "#fff"); } }, 3500);
  }
  function finish() {
    SIM.finished = true; SIM.spd = 0; ST.drove = true;
    const mt = missionDone("drive");
    const wait = () => {
      if (!SIM.run) return;
      if (TTS.busy || TTS.q.length) return setTimeout(wait, 300);
      setTimeout(() => { if (cur === "A5") { toast(mt ? `도착 · ${mt}` : "도착 · 주행 기록을 자동 저장했어요"); go("B1"); } }, 900);
    };
    setTimeout(wait, 600);
  }
  function updateA5(rdt) {
    const u = kmToU(SIM.km), p = posAtU(u);
    // heading (smoothed)
    let d = p.ang - SIM.head; while (d > 180) d -= 360; while (d < -180) d += 360;
    SIM.head += d * Math.min(1, (rdt || 1) * 6);
    $("#a5-car").setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    $("#a5-car .hd").setAttribute("transform", `rotate(${SIM.head.toFixed(1)})`);
    // camera follow (look a little ahead)
    const rad = (SIM.head - 90) * Math.PI / 180, ax = p.x + Math.cos(rad) * 45, ay = p.y + Math.sin(rad) * 45;
    const k = rdt ? Math.min(1, rdt * 3) : 1;
    SIM.cam.x += (ax - SIM.cam.x) * k; SIM.cam.y += (ay - SIM.cam.y) * k;
    const W = 720, H = W * 504 / 854;
    $("#a5-map").setAttribute("viewBox", `${(SIM.cam.x - W / 2).toFixed(1)} ${(SIM.cam.y - H * 0.55).toFixed(1)} ${W} ${H.toFixed(1)}`);
    // driven polyline
    const pts = R.slice(0, p.i).map(q => q.join(",")); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    $("#a5-done").setAttribute("points", pts.join(" "));
    // cluster + status
    const sc = $("#A5");
    VS.speed = SIM.finished ? 0 : SIM.spd; VS.gear = SIM.finished ? "P" : "D"; VS.odo = SIM.odo0 + SIM.km;
    VS.limit = limitAt(SIM.km); VS.turn = SIM.finished ? null : turnAt(SIM.km);
    syncCluster();
    SIM.mins = Math.round(26 * SIM.km / 12.4);
    $(".sb-t", sc).textContent = hm12(new Date(SIM.t0 + SIM.mins * 60000));
    $("#a5-left").textContent = Math.max(0, 12.4 - SIM.km).toFixed(1);
    // TBT
    const next = D.segs.find(s => s.km > SIM.km + 0.015);
    let dist, txt, ic;
    if (next) { dist = next.km - SIM.km; txt = NAVTXT[next.n]; ic = next.ic; }
    else { dist = 12.4 - SIM.km; txt = SIM.finished ? "목적지에 도착했어요" : "목적지 · 회사"; ic = "flag"; }
    $("#a5-tbt-ic").innerHTML = icon(ic, 40, "#111418");
    $("#a5-tbt-dist").textContent = SIM.finished ? "도착" : dist >= 1 ? dist.toFixed(1) + "km" : Math.max(10, Math.round(dist * 100) * 10) + "m";
    $("#a5-tbt-text").textContent = txt;
    $("#a5-lanes").style.display = next && next.n === 3 && dist < 0.7 ? "" : "none";
  }

  /* ------------------------------------------------------------ B1: tap a deduction (list or map) to see where it happened */
  function renderB1() {
    const p = D.pens[ST.b1];
    $("#b1-pens").innerHTML = D.pens.map((q, i) => `<a href="#" class="b1pen${i === ST.b1 ? " on" : ""}" data-pen="${i}" aria-pressed="${i === ST.b1}">
<span class="b1pen-ic">${icon(D.segs[q.seg - 1].ic, 18, "#33383F")}</span>
<span style="flex:1;min-width:0"><span class="b1pen-t">${q.t}</span><span class="xs" style="display:block">${q.at}</span></span></a>`).join("");
    $("#b1-mks").innerHTML = D.pens.map((q, i) => `<a href="#" class="b1mk${i === ST.b1 ? " on" : ""}" data-pen="${i}" style="left:${q.mk[0]}px;top:${q.mk[1]}px" aria-label="${q.t} 위치"></a>`).join("");
    $("#b1-mapchip").textContent = p.at;
    $("#b1-practice").dataset.goseg = p.seg;
  }

  /* ------------------------------------------------------------ B3 */
  function renderB3() {
    const b = $(`.b3pt[data-seg="${ST.b3}"]`);
    const x = parseFloat(b.style.left) + 20, y = parseFloat(b.style.top) + 20;
    const sel = $("#b3-sel"); sel.style.left = (x - 16) + "px"; sel.style.top = (y - 16) + "px";
    const pop = $("#b3-pop");
    let px = x + 28, py = y - 12;
    if (px + 214 > 510) px = x - 28 - 214;
    if (py + 80 > 440) py = 440 - 80;
    pop.style.left = px + "px"; pop.style.top = Math.max(70, py) + "px";
    const [tm, title, sub] = D.b3[ST.b3];
    $("#b3-pop-time").textContent = tm; $("#b3-pop-title").textContent = title; $("#b3-pop-sub").textContent = sub;
    $("#b3-name").textContent = D.b3names[ST.b3];
  }

  /* ------------------------------------------------------------ B4: first card follows the point saved in B3 */
  function renderB4() {
    const r = ST.b4;
    if (r) { // not saved yet: keep the default card (회전교차로)
      $("#b4-title").innerHTML = D.b4titles[r.seg];
      $("#b4-km").textContent = `출발 ${D.segs[r.seg - 1].km}km`;
      $("#b4-map").dataset.b4map = r.seg;
      $("#b4-go").dataset.goseg = r.seg;
    }
    /* card thumbnails: a clean crop of the A3 map (roads and route only) with a pin, or the control drawing */
    $$("#B4 [data-b4map]").forEach(box => {
      const s = D.segs[box.dataset.b4map - 1], [x, y] = s.pos, c = box.dataset.b4color;
      const svg = $("#a3-hl").ownerSVGElement.cloneNode(true);
      svg.querySelectorAll('#a3-hl, text, rect[fill="#E2E4E8"], circle[r="6"]').forEach(el => el.remove());
      svg.setAttribute("viewBox", `${x - 170} ${y - 122} 340 244`);
      box.querySelectorAll("svg, .b4-pin").forEach(el => el.remove());
      box.prepend(svg);
      box.insertAdjacentHTML("beforeend", `<span class="b4-pin" style="box-shadow:0 0 0 2px ${c},0 0 0 12px ${c}26,0 6px 14px rgba(0,0,0,.18)">${icon(s.ic, 22, "#0B2A5B")}</span>`);
    });
    $$("#B4 [data-b4ctl]").forEach(box => {
      const f = D.features[box.dataset.b4ctl];
      if (box.querySelector("svg")) return;
      box.insertAdjacentHTML("afterbegin", CTRL.view(f.view, { compact: true, sel: [...new Set(f.seq.map(i => f.parts[i]))] }));
      box.querySelector("svg").setAttribute("preserveAspectRatio", "xMidYMid meet");
    });
  }

  /* ------------------------------------------------------------ C2 */
  /* ST.missions[prog][i]: times the mission's activity was finished. ST.mission: "prog:i" started with [시작] */
  const needOf = (m) => m[6] || 1;
  const countOf = (p, i) => (ST.missions[p.key] || [])[i] || 0;
  function missionState(p, m, i) {
    const c = countOf(p, i);
    return c >= needOf(m) ? "done" : ST.mission === `${p.key}:${i}` ? "go" : c ? "prog" : "todo";
  }
  const doneOf = (p) => p.missions.filter((m, i) => missionState(p, m, i) === "done").length;
  /* called when an activity ends (how: rh · drive · feat). Returns a toast text if the started mission moved on */
  function missionDone(how) {
    if (!ST.mission) return "";
    const [k, i] = ST.mission.split(":"), m = D.progs.find(q => q.key === k).missions[i];
    if (m[3] !== how || (how === "feat" && m[5] && m[5] !== ST.feature)) return "";
    const a = ST.missions[k] || (ST.missions[k] = []);
    a[i] = (a[i] || 0) + 1;
    if (a[i] < needOf(m)) return `미션 진행 · ${m[0]} ${a[i]}/${needOf(m)}`;
    ST.mission = null;
    return `미션 완료 · ${m[0]}`;
  }
  function renderC2() {
    $("#c2-progs").innerHTML = D.progs.map(p => {
      const done = doneOf(p);
      const st = done ? `${done} / ${p.missions.length} 완료` : "시작 전";
      const on = p.key === ST.prog;
      return `<a href="#" data-prog="${p.key}" class="card" style="display:block;padding:13px 15px;border-radius:14px;${on ? "background:#EEF4FE;border-color:#B9D2F6;" : ""}">
<div class="row"><span style="font-size:15px;font-weight:600">${p.title}</span><span class="xs" style="margin-left:auto">${st}</span></div>
<div class="xs" style="margin-top:3px">${p.sub}</div><div class="prog-seg" style="margin-top:10px" aria-hidden="true">${p.missions.map((m, i) => `<i${missionState(p, m, i) === "done" ? ' class="on"' : ""}></i>`).join("")}</div></a>`;
    }).join("");
    const p = D.progs.find(q => q.key === ST.prog);
    const done = doneOf(p), n = p.missions.length;
    const badge = done === n ? "완료" : done || (ST.mission || "").startsWith(p.key + ":") ? "진행 중" : "시작 전";
    const rows = p.missions.map((m, i) => {
      const [title, kind, tag, , href, feat] = m, st = missionState(p, m, i), c = countOf(p, i), need = needOf(m);
      const stH = st === "done" ? `<span class="row" style="gap:4px;font-size:13px;color:#1A7F33;font-weight:600">${icon("check", 16, "#1FB83A")}완료</span>`
        : `<a href="${href}" data-mission="${p.key}:${i}" ${feat ? `data-feature="${feat}"` : ""} class="btn ${st === "go" ? "pri" : "sec"} sm" style="height:34px">${st === "todo" ? "시작" : "이어서"}</a>`;
      const tagH = tag === "rec" ? '<span class="chip blue">추천</span>' : '<span class="chip gray">기본</span>';
      const kindH = `<span class="row xs" style="gap:4px">${icon(kind === "주행" ? "wheel" : "park", 14, "#646B76")}${kind}${need > 1 && st !== "done" ? ` · ${c}/${need}회` : ""}</span>`;
      return `<div class="row" style="flex:1;min-height:54px;gap:12px;padding:0 16px;border-top:1px solid #F0F0F3;${st === "go" ? "background:#F7FAFF;" : ""}">
<span class="num" style="width:22px;height:22px;border-radius:50%;background:${st === "done" ? "#1FB83A" : "#EFEFF2"};color:${st === "done" ? "#fff" : "#4B515A"};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="flex:1"><div class="row" style="gap:6px"><span style="font-size:15px;font-weight:600">${title}</span>${tagH}</div><div style="margin-top:3px">${kindH}</div></div>${stH}</div>`;
    }).join("");
    $("#c2-detail").innerHTML = `<div style="padding:16px 16px 12px"><div class="row"><span class="h2">${p.title}</span><span class="chip ${done ? "green" : "gray"}" style="margin-left:8px">${badge}</span><span class="sm num" style="margin-left:auto">${done} / ${n} 완료</span></div>
<div class="sm" style="margin-top:4px">${p.desc}</div></div>${rows}`;
  }

  /* ------------------------------------------------------------ D (features) */
  /* learning stage 0..3 (1 위치 찾기 · 2 조건과 주의 · 3 가상 실습), per driver */
  const stageOf = (k) => (ST.learned[k] ? 3 : ST.stage[k] || 0);
  const REVWHEN = { wiper: "비 오는 날 짧게 복습", scc: "고속도로 등 관련 상황", lka: "차선이 잘 보이는 도로" };
  function syncLearn() {
    $$("[data-learn]").forEach(el => {
      const n = stageOf(el.dataset.learn);
      el.textContent = n >= 3 ? "학습 완료" : el.dataset.fmt === "step" ? `${n}/3단계` : n > 0 ? `학습 중 ${n}/3` : "학습 전";
      el.style.color = n >= 3 ? "#1A7F33" : n > 0 ? "#1A6FD0" : "#646B76";
    });
    const n = { done: 0, prog: 0, todo: 0 };
    Object.keys(D.features).forEach(k => n[ST.learned[k] ? "done" : stageOf(k) > 0 ? "prog" : "todo"]++);
    Object.entries(n).forEach(([k, v]) => { const e = $("#d2-n-" + k); if (e) e.textContent = v; });
    $$("[data-revchip]").forEach(el => {
      const k = el.dataset.revchip;
      el.innerHTML = ST.learned[k] && ST.rev[k] ? '<span class="chip blue">주행 중 추천 켜짐</span>' : "";
    });
    Object.entries(REVWHEN).forEach(([k, when]) => {
      const e = $(`#f4-${k}-st`), s = stageOf(k);
      if (e) e.textContent = s >= 3 ? `학습 완료 · ${when}` : `${s > 0 ? "학습 중" : "학습 전"} · 학습을 마치면 켤 수 있어요`;
    });
  }
  function enterD2() {
    syncLearn();
    $("#d2-art").innerHTML = CTRL.view("wheel", { compact: true, sel: ["assist", "setUp", "setDown"] });
  }

  /* D3: 운전석 전체 그림에서 위치 찾기 · 확대 그림 · 설명서 그림 (js/controls.js) */
  function enterD3() {
    const f = D.features[ST.feature], n = stageOf(ST.feature);
    $("#d3-name").textContent = f.name;
    $("#d3-sub").textContent = `내 차 기능 · ${f.cat} · ${f.loc}`;
    $("#d3-prog").textContent = `${n}/3`;
    $("#d3-when").innerHTML = f.when + (f.note ? `<div class="xs" style="margin-top:5px;line-height:1.45;color:#1A5FC4">${f.note}</div>` : "");
    $("#d3-caut").innerHTML = f.caut.map(c => `<li>${c}</li>`).join("");
    // stage rows: done → check, current → 지금, later → 다음
    const dot = (i, on) => `<span style="width:18px;height:18px;border-radius:50%;${on ? "background:#1F6FE0;color:#fff" : "border:1.5px solid #9AA0A8"};font-size:10px;display:flex;align-items:center;justify-content:center">${i}</span>`;
    $("#d3-s1-ic").innerHTML = n >= 1 ? icon("check", 17, "#1FB83A") : dot(1, true);
    const s1 = $("#d3-s1"); s1.textContent = n >= 1 ? "완료" : "지금"; s1.style.color = n >= 1 ? "#1A7F33" : "#1A5FC4";
    const s2 = $("#d3-s2"); s2.textContent = n >= 3 ? "완료" : n >= 1 ? "지금" : "다음"; s2.className = "chip " + (n >= 3 ? "green" : n >= 1 ? "blue" : "gray");
    $("#d3-s3-ic").innerHTML = n >= 3 ? icon("check", 17, "#1FB83A") : dot(3, false);
    $("#d3-s3").textContent = n >= 3 ? "완료" : "다음";
    $("#d3-s3-row").classList.toggle("mut", n < 3);
    $("#d3-loc").innerHTML = icon("car", 14, "#1F6FE0") + f.loc;
    renderD3Art();
  }
  function renderD3Art() {
    const k = ST.feature, f = D.features[k], v = ST.d3view === "manual" && !f.manual ? "all" : ST.d3view;
    $$("#d3-views .tab").forEach(t => t.classList.toggle("on", t.dataset.view === v));
    $('#d3-views [data-view="manual"]').style.display = f.manual ? "" : "none";
    const art = $("#d3-art");
    if (v === "zoom") {
      art.innerHTML = `<div class="d3-zoom">${CTRL.view(f.view, { sel: [...new Set(f.seq.map(i => f.parts[i]))] })}</div>`;
    } else if (v === "manual") {
      art.innerHTML = `<div class="d3-man"><img src="${f.manual}" alt="${f.name} 조작부 · 취급설명서 그림"/><div class="xs">출처 · 그랜저 Hybrid 2027 취급설명서 (현대자동차) · 버튼 위치 참고용</div></div>`;
    } else {
      const names = Object.fromEntries(Object.entries(D.features).map(([key, x]) => [key, x.name]));
      art.innerHTML = CTRL.overview(k, names);
    }
  }

  /* D4: 확대 그림 위의 실제 버튼 자리를 순서대로 눌러요 */
  const D4S = { step: 0 };
  function enterD4() { D4S.step = 0; $("#d4-msg").className = "d4msg"; renderD4(); }
  /* what the drawing shows after `st` correct presses */
  function ctlState(k, st) {
    if (k === "wiper") return { pos: Math.min(st, 2) };              // OFF → 자동 느린 감도 → 보통 감도
    if (k === "autohold") return { brake: st >= 1, hold: st >= 2 };
    if (k === "defog") return { defog: st >= 1, fan: st >= 2 ? 3 : 2 };
    return {};
  }
  function renderD4() {
    const key = ST.feature, f = D.features[key], n = f.seq.length, st = D4S.step, done = st >= n;
    $("#d4-ctl").innerHTML = CTRL.view(f.view, {
      parts: f.parts, labels: f.pad.map(p => p[0]), interactive: !done,
      next: done ? null : f.parts[f.seq[st]], state: ctlState(key, st),
    });
    $("#d4-cnt").textContent = `${Math.min(st, n)} / ${n}`;
    $("#d4-preview").textContent = f.preview[Math.min(st, f.preview.length - 1)];
    const g = f.gap ? f.gap[Math.min(st, f.gap.length - 1)] : 0;
    $("#d4-gap").innerHTML = f.gap ? [0, 1, 2, 3].map(i => `<i style="width:8px;height:${10 + i * 5}px;border-radius:2px;background:${i < g ? "#1F6FE0" : "#D6D6DB"}"></i>`).join("") : "";
    $("#d4-steps").innerHTML = f.stepText.map((t, i) => `<div class="row" style="gap:8px;${i === st ? "font-weight:600" : i > st ? "color:#9AA0A8" : ""}">${i < st ? icon("check", 16, "#1FB83A") : `<span style="width:16px;height:16px;border-radius:50%;border:1.5px solid ${i === st ? "#1F6FE0" : "#C9CCD2"};display:inline-block"></span>`}${t}</div>`).join("");
    $("#d4-guide").style.display = done ? "none" : "flex";
    $("#d4-done").style.display = done ? "flex" : "none";
    if (!done) { $("#d4-now").textContent = `${st + 1}단계 · ${f.stepText[st]}`; $("#d4-hint").textContent = f.hint[st]; }
    else {
      $("#d4-done-sub").textContent = `${f.name} · ${n}단계 모두 완료`;
      const t = $("#d4-tgl"); t.classList.toggle("on", !!ST.rev[key]); t.setAttribute("aria-checked", !!ST.rev[key]);
    }
  }
  /* i: index in f.pad / f.parts. el: the pressed key in the drawing */
  function pressVB(i, el) {
    const f = D.features[ST.feature];
    if (D4S.step >= f.seq.length) return;
    if (f.seq[D4S.step] === i) {
      D4S.step++;
      const m = $("#d4-msg"); m.className = "d4msg ok"; m.textContent = `좋아요! ${f.stepText[D4S.step - 1]} 완료`;
      if (D4S.step >= f.seq.length) {
        ST.learned[ST.feature] = true; syncLearn();
        sayUI(`${f.name} 학습을 완료했어요.`);
        const mt = missionDone("feat"); if (mt) toast(mt);
      }
      renderD4();
      const nx = $("#d4-ctl .key.next");
      if (nx && document.activeElement === document.body) nx.focus({ preventScroll: true });
    } else {
      el.classList.remove("shake"); el.getBoundingClientRect(); el.classList.add("shake");
      const m = $("#d4-msg"); m.className = "d4msg warn"; m.textContent = `지금은 '${f.pad[f.seq[D4S.step]][0]}' 차례예요 · 파란색으로 빛나는 곳을 눌러요`;
    }
  }

  /* ------------------------------------------------------------ settings */
  function syncSettings() {
    syncLearn();
    $$("#F4 .tgl[data-key]").forEach(t => {
      const k = t.dataset.key; let on;
      if (k === "rec") on = ST.rec; else if (k === "coach") on = ST.coach; else on = !!ST.rev[k.slice(4)];
      t.classList.toggle("on", on); t.setAttribute("aria-checked", on);
      if (k.startsWith("rev_")) t.classList.toggle("dis", !ST.learned[k.slice(4)]);
    });
    $$("#f4-freq .tab").forEach(t => t.classList.toggle("on", +t.dataset.f === ST.freq));
  }
  function setRev(key, on) {
    ST.rev[key] = on; syncSettings();
    toast(on ? `${D.features[key].name} · 주행 중 복습을 켰어요` : `${D.features[key].name} · 주행 중 복습을 껐어요`);
  }

  /* ------------------------------------------------------------ profile switch (F2) */
  const F2 = { pick: ST.profile }; // tile picked on F2, applied by [이 프로필로 계속하기]
  function setProfile(name) {
    if (!D.profiles[name]) return;
    if (name !== ST.profile) {
      PSTORE[ST.profile] = Object.fromEntries(PER.map(k => [k, ST[k]]));
      Object.assign(ST, PSTORE[name] || freshProfile(name));
      ST.profile = name;
    }
    applyProfile();
  }
  /* name, avatar and [data-pf] texts on every screen. 지민 keeps the text written in the screen files */
  function applyProfile() {
    const p = prof(), name = ST.profile;
    $$(".prof").forEach(e => { e.innerHTML = `<span class="av">${p.av}</span>${name}`; });
    $$("[data-pname]").forEach(e => { e.textContent = name; });
    $$("[data-pav]").forEach(e => { e.textContent = p.av; });
    $$("[data-pf]").forEach(e => {
      if (e.pf0 === undefined) e.pf0 = e.innerHTML;
      const v = p.t && p.t[e.dataset.pf];
      e.innerHTML = v !== undefined ? v : e.pf0;
    });
    $$("[data-rec]").forEach(e => { e.style.display = p.records ? "" : "none"; });
    syncF2(); syncSettings(); renderA1();
  }
  function syncF2() {
    F2.pick = ST.profile;
    $$("#F2 .ptile").forEach(t => t.classList.toggle("on", t.dataset.prof === ST.profile));
    const chip = $("#F2 .ptile .chip.blue"), tile = $(`#F2 .ptile[data-prof="${ST.profile}"]`);
    if (chip && tile && chip.parentNode !== tile) tile.prepend(chip); // '현재 운전자' follows the driver
  }

  /* ------------------------------------------------------------ clicks */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a,button,.tgl,.pick,.key.act,.spot");
    if (!a) return;
    if (a.matches('a[href="#"]')) e.preventDefault();
    if (a.dataset.feature) ST.feature = a.dataset.feature;
    if (a.dataset.mission) ST.mission = a.dataset.mission; // C2 [시작]: only this mission counts
    if (a.dataset.goseg) ST.seg = +a.dataset.goseg; // B4 → A3 opens the recommended segment
    if (a.dataset.toast) toast(a.dataset.toast);
    if (a.dataset.launch || a.matches(".dock-hit.dc")) { e.preventDefault(); return cur === "L0" ? launch() : go("A1"); }
    if (a.matches(".dock-hit.grid")) { e.preventDefault(); return go("L0"); }
    if (a.dataset.say) {
      e.preventDefault();
      const s = D.segs[ST.seg - 1];
      sayUI({ seg: segBrief(s), feature: D.features[ST.feature].say }[a.dataset.say]);
      toast("음성 안내 재생 중");
      return;
    }
    // A3
    if (a.matches(".tl-row")) { ST.seg = +a.dataset.seg; renderA3(); return; }
    if (a.id === "a3-reset") { ST.checked = new Set(); ST.seg = 1; renderA3(); return; }
    // A4
    if (a.id === "a4-play") return playA4();
    if (a.id === "a4-prev") { ST.seg = Math.max(1, ST.seg - 1); return enterA4(); }
    if (a.closest("#a4-view") && a.dataset.v) {
      $$("#a4-view .tab").forEach(t => t.classList.toggle("on", t === a));
      $("#a4-stage").classList.toggle("three", a.dataset.v === "3d"); return;
    }
    if (a.id === "a4-ok") {
      ST.checked.add(ST.seg);
      const mt = missionDone("rh");
      const nxt = D.segs.find(s => !ST.checked.has(s.n) && s.n > ST.seg) || D.segs.find(s => !ST.checked.has(s.n));
      if (nxt) ST.seg = nxt.n;
      toast(mt || (nxt ? `확인 완료 · 다음은 ${nxt.n}번 ${nxt.sub} ${nxt.title}` : "7개 구간을 모두 확인했어요. 이제 출발해도 좋아요"));
      return go("A3");
    }
    // A5
    if (a.id === "a5-skip") { ST.drove = true; const mt = missionDone("drive"); stopSim(true); hush(); toast(mt ? `도착 · ${mt}` : "도착 · 주행 기록을 자동 저장했어요"); return go("B1"); }
    // B1
    if (a.matches(".b1pen,.b1mk")) {
      if (!parked()) return toast(moving() ? "주행 중에는 볼 수 없어요 · 주차(P)한 뒤 봐요" : "기어를 P로 바꾼 뒤 볼 수 있어요");
      ST.b1 = +a.dataset.pen; return renderB1();
    }
    // B3
    if (a.matches(".b3pt")) { ST.b3 = +a.dataset.seg; renderB3(); if (ST.b3 === 3) toast("이미 어려운 구간으로 표시한 곳이에요"); return; }
    if (a.matches(".pick")) { a.classList.toggle("on"); return; }
    if (a.id === "b3-save") { ST.b4 = { seg: ST.b3, why: $$("#B3 .pick.on").map(p => p.textContent.trim()) }; toast(`'${D.b3names[ST.b3]}'을 어려운 구간으로 저장했어요`); return go("B4"); }
    // C2
    if (a.dataset.prog) { ST.prog = a.dataset.prog; renderC2(); return; }
    // D4
    if (a.matches(".key.act")) return pressVB(+a.dataset.vb, a);
    if (a.id === "d4-tgl") { setRev(ST.feature, !ST.rev[ST.feature]); renderD4(); return; }
    if (a.id === "d4-retry") { D4S.step = 0; $("#d4-msg").className = "d4msg"; return renderD4(); }
    // D3: 다른 기능 위치 · 보기 전환
    if (a.matches(".spot")) { ST.feature = a.dataset.spot; return enterD3(); }
    if (a.closest("#d3-views") && a.dataset.view) { ST.d3view = a.dataset.view; return renderD3Art(); }
    // E2
    if (a.closest("#e2-tg") && a.dataset.c) {
      $$("#e2-tg .tab").forEach(t => t.classList.toggle("on", t === a));
      $("#e2-same").style.display = a.dataset.c === "same" ? "" : "none";
      $("#e2-all").style.display = a.dataset.c === "all" ? "" : "none"; return;
    }
    // F2
    if (a.matches(".ptile")) {
      if (a.dataset.prof === "add") return toast("프로필 추가는 목업에서 생략했어요");
      $$(".ptile").forEach(t => t.classList.toggle("on", t === a)); F2.pick = a.dataset.prof; return;
    }
    if (a.id === "f2-go") { const was = ST.profile; setProfile(F2.pick); if (ST.profile !== was) toast(`${ST.profile} 님 프로필로 바꿨어요`); return go("A1"); }
    // F4
    if ((a.matches(".tgl[data-key]") || a.closest("#f4-freq")) && !parked()) return toast(moving() ? "주행 중에는 바꿀 수 없어요 · 주차(P)한 뒤 바꿔요" : "기어를 P로 바꾼 뒤 바꿀 수 있어요");
    if (a.matches(".tgl[data-key]")) {
      const k = a.dataset.key;
      if (k === "rec") { ST.rec = !ST.rec; toast(ST.rec ? "주행 기록 수집을 다시 켰어요" : "새 주행 기록을 모으지 않아요 · 코칭은 따로 동작해요"); }
      else if (k === "coach") { ST.coach = !ST.coach; toast(ST.coach ? "운전 코칭을 켰어요" : "운전 코칭을 껐어요 · 주행 기록은 계속돼요"); }
      else { const f = k.slice(4); if (!ST.learned[f]) return toast("가상 실습을 마치면 켤 수 있어요"); return setRev(f, !ST.rev[f]); }
      return syncSettings();
    }
    if (a.closest("#f4-freq") && a.dataset.f) { ST.freq = +a.dataset.f; syncSettings(); toast(`코칭 빈도 · ${a.textContent}`); return; }
  });

  /* ------------------------------------------------------------ app launch (splash) */
  let launching = false;
  const LOAD_STEPS = () => ["차량 정보를 확인하고 있어요", `${ST.profile} 님의 프로필을 불러오고 있어요`, "오늘의 출근길을 준비하고 있어요"];
  function launch() {
    if (launching) return;
    launching = true;
    const sp = $("#splash"), st = $(".sp-st", sp);
    $("#L0").classList.add("launching");
    const steps = LOAD_STEPS();
    st.textContent = steps[0];
    sp.classList.remove("out"); void sp.offsetWidth; sp.classList.add("on");
    setTimeout(() => (st.textContent = steps[1]), 1500);
    setTimeout(() => (st.textContent = steps[2]), 2050);
    setTimeout(() => {
      go("A1");
      sp.classList.add("out");
      setTimeout(() => { sp.classList.remove("on", "out"); $("#L0").classList.remove("launching"); launching = false; }, 400);
    }, 2700);
  }

  /* ------------------------------------------------------------ demo panel */
  const P = $("#panel");
  function buildPanel() {
    const scr = $$(".scr").map(s => `<button data-p-go="${s.id}">${s.id} ${s.dataset.name}</button>`).join("");
    P.innerHTML = `<h3>시연 패널</h3><div class="muted">녹화 화면에는 나오지 않게 <kbd>\`</kbd> 키로 열고 닫아요</div>
<div class="grp"><b>화면 바로가기</b><div class="scrs">${scr}</div></div>
<div class="grp"><b>차량 상태 · 시뮬레이션</b>
<div class="vsrow"><span><span id="p-vs-speed" class="vsnum">0</span> km/h</span><span class="rowp">${["P", "R", "N", "D"].map(g => `<button data-p-gear="${g}">${g}</button>`).join("")}</span></div>
<div class="rowp" style="margin-top:6px"><button class="pedal" data-p-pedal="accel">ACCEL</button><button class="pedal" data-p-pedal="brake">BRAKE</button></div>
<div class="rowp" style="margin-top:6px"><button data-p-turn="L">◀ 왼쪽</button><button data-p-turn="H">비상등</button><button data-p-turn="R">오른쪽 ▶</button></div>
<div class="rowp" style="margin-top:6px">${[["fl", "운전석 문"], ["fr", "동승석 문"], ["rl", "뒤 왼쪽"], ["rr", "뒤 오른쪽"], ["trunk", "트렁크"]].map(([k, n]) => `<button data-p-door="${k}">${n}</button>`).join("")}</div>
<div class="muted" style="margin:6px 0 0">누르고 있는 동안 가속·감속해요(<kbd>↑</kbd> <kbd>↓</kbd>). 달리는 동안 계기판이 모든 화면에서 바뀌고, 정차 중에만 되는 화면은 잠겨요. 모의 주행(A5) 중에는 A5가 속도를 정해요.</div></div>
<div class="grp"><b>모의 주행 재생 속도</b><div class="rowp">${[0.5, 1, 1.5, 2].map(v => `<button data-p-speed="${v}">${v}x</button>`).join("")}</div></div>
<div class="grp"><b>시나리오 설정</b>
<label><input type="checkbox" id="p-voice"> 음성(TTS) 재생</label>
<label><input type="checkbox" id="p-coach"> 운전 코칭 켜기</label>
<label><input type="checkbox" id="p-scc"> 크루즈 학습 완료 + 주행 중 복습 동의</label></div>
<div class="grp"><b>목소리</b>
<label class="selp">내비 <select id="p-nav-voice"></select></label>
<label class="selp">코칭 <select id="p-coach-voice"></select></label>
<button id="p-voice-test" style="width:100%;margin-top:4px">두 목소리 들어보기</button>
<div class="muted" style="margin:6px 0 0">가장 자연스러운 목소리는 Edge의 "SunHi (Natural)"예요. Chrome은 "Google 한국의"를 써요.</div></div>
<div class="grp"><b>단축키</b><div class="muted" style="margin:0;line-height:1.7"><kbd>Space</kbd> 모의 주행 일시정지 · <kbd>R</kbd> 현재 화면 다시 시작<br><kbd>↑</kbd> ACCEL · <kbd>↓</kbd> BRAKE (누르고 있기)<br><kbd>F</kbd> 전체 화면 · <kbd>\`</kbd> 패널 열기/닫기</div></div>
<div class="grp"><button id="p-reset" style="width:100%">처음 상태로 초기화</button></div>`;
  }
  const VOICE_SAMPLE = { nav: "300미터 앞에서 우회전입니다.", coach: "오른쪽 끝 차로를 미리 유지해요." };
  function voiceLabel(v) {
    return v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s*-\s*Korean.*$/i, "").replace(/\s*\(Korean.*\)$/i, "") + (v.localService ? "" : " · 온라인");
  }
  function syncVoiceSelects() {
    [["p-nav-voice", "nav"], ["p-coach-voice", "coach"]].forEach(([id, kind]) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = pickVoice(kind);
      sel.innerHTML = TTS.voices.length
        ? TTS.voices.map(v => `<option value="${v.voiceURI}"${v === cur ? " selected" : ""}>${voiceLabel(v)}</option>`).join("")
        : "<option>한국어 음성 없음</option>";
      sel.disabled = !TTS.voices.length;
    });
  }
  function previewVoice(kind) { hush(); speak({ text: VOICE_SAMPLE[kind], kind: kind === "nav" ? "nav" : "ui" }); }
  function syncPanel() {
    if (P.hidden) return;
    $$("[data-p-go]", P).forEach(b => b.classList.toggle("on", b.dataset.pGo === cur));
    $$("[data-p-speed]", P).forEach(b => b.classList.toggle("on", +b.dataset.pSpeed === ST.speed));
    $("#p-voice").checked = ST.voice; $("#p-coach").checked = ST.coach; $("#p-scc").checked = !!(ST.learned.scc && ST.rev.scc);
    syncCluster();
  }
  /* ACCEL · BRAKE work while held down */
  P.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-p-pedal]"); if (!b) return;
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
    b.classList.add("on"); setPedal(b.dataset.pPedal);
  });
  ["pointerup", "pointercancel"].forEach(ev => P.addEventListener(ev, (e) => {
    const b = e.target.closest("[data-p-pedal]"); if (!b) return;
    b.classList.remove("on"); if (VS.pedal === b.dataset.pPedal) setPedal(null);
  }));
  P.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pGo) go(b.dataset.pGo);
    if (b.dataset.pSpeed) ST.speed = +b.dataset.pSpeed;
    if (b.dataset.pGear) setGear(b.dataset.pGear);
    if (b.dataset.pTurn) setTurn(b.dataset.pTurn);
    if (b.dataset.pDoor) toggleDoor(b.dataset.pDoor);
    if (b.id === "p-reset") { location.hash = "A1"; location.reload(); }
    if (b.id === "p-voice-test") { hush(); speak({ text: VOICE_SAMPLE.nav, kind: "nav" }); speak({ text: VOICE_SAMPLE.coach, kind: "ui" }); }
    syncPanel();
  });
  P.addEventListener("change", (e) => {
    if (e.target.id === "p-voice") { ST.voice = e.target.checked; if (!ST.voice) hush(); }
    if (e.target.id === "p-coach") { ST.coach = e.target.checked; if (cur === "A5") coachIdle(); }
    if (e.target.id === "p-nav-voice") { ST.navVoice = e.target.value; previewVoice("nav"); }
    if (e.target.id === "p-coach-voice") { ST.coachVoice = e.target.value; previewVoice("coach"); }
    if (e.target.id === "p-scc") { ST.learned.scc = e.target.checked || ST.learned.scc; ST.rev.scc = e.target.checked; syncLearn(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("textarea,input")) return;
    // keys and spots in the 2D drawings are SVG groups: Enter/Space presses them like buttons
    const k = e.target.closest(".key.act,.spot");
    if (k && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); k.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.target.matches("select")) { e.preventDefault(); if (!e.repeat) setPedal(e.key === "ArrowUp" ? "accel" : "brake"); return; }
    if (e.key === "`") { P.hidden = !P.hidden; syncPanel(); }
    else if (e.key === "Escape") P.hidden = true;
    else if (e.key === " " && cur === "A5") { e.preventDefault(); SIM.paused = !SIM.paused; if (hasTTS) SIM.paused ? speechSynthesis.pause() : speechSynthesis.resume(); toast(SIM.paused ? "일시정지" : "재생", 900); }
    else if (e.key === "f" || e.key === "F") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
    else if (e.key === "r" || e.key === "R") { const c = cur; leave(c); cur = null; show(); }
  });
  document.addEventListener("keyup", (e) => {
    if ((e.key === "ArrowUp" && VS.pedal === "accel") || (e.key === "ArrowDown" && VS.pedal === "brake")) setPedal(null);
  });
  addEventListener("blur", () => { if (VS.pedal) { setPedal(null); $$("[data-p-pedal]", P).forEach(b => b.classList.remove("on")); } });

  /* ------------------------------------------------------------ boot */
  // Each screen lives in screens/<ID>.html. Order matters: it is the DOM order
  // inside #stage (and the order of the demo panel shortcuts).
  const SCREENS = ["L0", "A1", "A2", "A3", "A4", "A5", "B1", "B3", "B4", "C2", "D2", "D3", "D4", "E2", "E3", "F2", "F4"];
  function loadScreens() {
    return Promise.all(SCREENS.map(id => fetch(`screens/${id}.html`).then(r => {
      if (!r.ok) throw new Error(`screens/${id}.html: HTTP ${r.status}`);
      return r.text();
    }))).then(parts => $("#splash").insertAdjacentHTML("beforebegin", parts.join("")));
  }
  loadScreens().then(() => {
    buildPanel();
    syncVoiceSelects();
    if (!location.hash) history.replaceState(null, "", "#L0");
    applyProfile();
    tickClock(); setInterval(tickClock, 5000);
    show();
    loadCar();
    setTimeout(() => toast("` 키: 시연 패널 · F: 전체 화면", 3200), 600);
  }).catch(err => {
    console.error("화면 파일을 불러오지 못했어요", err);
    toast("화면을 불러오지 못했어요 · python serve.py로 열어 주세요", 60000);
  });
})();
