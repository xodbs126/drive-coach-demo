/* Drive Coach 4.1 — interactive mockup logic (simulation only) */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const D = window.D, IC = window.ICONS;

  /* ------------------------------------------------------------ state */
  const ST = {
    seg: 3, checked: new Set([1, 2]), feature: "scc", prog: "commute", b3: 4,
    learned: { wiper: true }, rev: { wiper: true, scc: false, lka: false },
    rec: true, coach: true, freq: 2, voice: true, speed: 1, profile: "지민",
  };

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

  /* ------------------------------------------------------------ stage scale */
  function fit() {
    const s = Math.min(innerWidth / 1280, innerHeight / 720);
    $("#stage").style.transform = `scale(${s})`;
  }
  addEventListener("resize", fit); fit();

  /* ------------------------------------------------------------ speech (TTS) */
  const TTS = { q: [], busy: false, voices: [], cur: null };
  const hasTTS = "speechSynthesis" in window;
  function loadVoices() { if (hasTTS) TTS.voices = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)); }
  if (hasTTS) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

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
    const est = 500 + item.text.length * 85;
    const done = () => { if (ended) return; ended = true; TTS.busy = false; TTS.cur = null; item.onend && item.onend(); setTimeout(pump, 180); };
    if (ST.voice && hasTTS) {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = "ko-KR";
      const v = TTS.voices;
      if (item.kind === "nav") { if (v[0]) u.voice = v[0]; u.rate = 1.08; u.pitch = 1.0; }
      else { const alt = v[1] || v[0]; if (alt) u.voice = alt; u.rate = 1.02; u.pitch = v[1] ? 1.0 : 1.25; }
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
      setTimeout(done, est * 1.4 + 1500); // Chrome sometimes drops onend
    } else setTimeout(done, est);
  }
  function hush() { TTS.q = []; if (hasTTS) speechSynthesis.cancel(); TTS.busy = false; TTS.cur = null; }
  function sayUI(text) { hush(); speak({ text, kind: "ui" }); }

  /* ------------------------------------------------------------ router */
  let cur = null;
  function show() {
    let id = (location.hash || "#A1").slice(1);
    if (!document.getElementById(id) || !/^([A-F]\d|L0)$/.test(id)) id = "L0";
    if (cur === id) return;
    if (cur) leave(cur);
    $$(".scr.on").forEach(e => e.classList.remove("on"));
    $("#" + id).classList.add("on");
    cur = id; enter(id);
    syncPanel();
  }
  function go(id) { if (location.hash === "#" + id) { cur = null; show(); } else location.hash = id; }
  addEventListener("hashchange", show);

  function enter(id) {
    ({ A3: renderA3, A4: enterA4, A5: enterA5, B3: renderB3, C2: renderC2, D2: syncLearn, D3: enterD3, D4: enterD4, F4: syncSettings }[id] || (() => {}))();
  }
  function leave(id) {
    hush();
    if (id === "A5") stopSim();
    if (id === "A4") cancelAnimationFrame(A4.raf);
    if (id === "D3" && window.D3S) window.D3S.pause();
  }

  /* ------------------------------------------------------------ A3 rehearsal */
  function renderA3() {
    const rows = D.segs.map(s => {
      const on = s.n === ST.seg, chk = ST.checked.has(s.n);
      const bar = chk ? "#1FB83A" : on ? "#1F6FE0" : "#E0E0E5";
      const tail = s.hard ? '<span class="chip red">어려운 구간</span>' : chk ? icon("check", 18, "#1FB83A") : "";
      return `<a href="#" class="tl-row${on ? " on" : ""}" data-seg="${s.n}"><span style="width:3px;height:34px;border-radius:2px;background:${bar}"></span>
<span style="width:28px;display:flex;justify-content:center">${icon(s.ic, 21, "#111418")}</span>
<div><div class="num" style="font-size:15px;font-weight:600">${s.km}km</div><div class="xs" style="color:#4B515A">${s.title} · ${s.sub}</div></div>
<span style="margin-left:auto;display:flex">${tail}${s.hard && chk ? '<span style="margin-left:6px;display:flex">' + icon("check", 18, "#1FB83A") + "</span>" : ""}</span></a>`;
    }).join("");
    $("#a3-rows").innerHTML = rows;
    $("#a3-count").textContent = `${ST.checked.size}/7 확인`;
    $("#a3-seg").innerHTML = D.segs.map(s => `<i class="${ST.checked.has(s.n) ? "g" : s.n === ST.seg ? "b" : ""}"></i>`).join("");
    const s = D.segs[ST.seg - 1];
    $("#a3-hl").setAttribute("transform", `translate(${s.pos[0]} ${s.pos[1]})`);
    $("#a3-ic").innerHTML = icon(s.ic, 22, "#111418");
    $("#a3-title").textContent = s.type === "S" ? `${s.n} · ${s.title}` : `${s.n} · ${s.sub} ${s.title}`;
    $("#a3-sub").textContent = `출발 ${s.km}km · 약 ${Math.max(1, Math.round(s.km / 12.4 * 26))}분 뒤`;
    $("#a3-hard").style.display = s.hard ? "" : "none";
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
    $("#a4-hard").style.display = s.hard ? "" : "none";
    $("#a4-h").textContent = s.h;
    $("#a4-desc").textContent = s.desc;
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
  const NAVTXT = { 1: "단지 앞 큰길로 우회전", 2: "어린이 보호구역 진입", 3: "시청 사거리에서 좌회전", 4: "회전교차로 첫 번째 출구", 5: "도시고속도로 진입", 6: "회사 앞에서 유턴", 7: "좌회전 후 목적지" };
  const SIM = { run: false, paused: false, km: 0, spd: 0, raf: 0, last: 0, fired: new Set(), cam: { x: 120, y: 520 }, head: 0, finished: false, idleT: 0 };

  function enterA5() {
    stopSim(); hush();
    Object.assign(SIM, { run: true, paused: false, km: 0, spd: 0, last: 0, fired: new Set(), cam: { x: 120, y: 500 }, head: 0, finished: false });
    coachIdle(); $("#a5-navsub").classList.remove("on"); $("#a5-navspk").classList.remove("on");
    updateA5(0);
    setTimeout(() => { if (SIM.run && cur === "A5") { SIM.raf = requestAnimationFrame(tick); } }, 700);
  }
  function stopSim() { SIM.run = false; cancelAnimationFrame(SIM.raf); }
  function tick(t) {
    if (!SIM.run) return;
    if (!SIM.last) SIM.last = t;
    const rdt = Math.min(0.05, (t - SIM.last) / 1000); SIM.last = t;
    if (!SIM.paused && !SIM.finished) {
      const talking = TTS.busy || TTS.q.length > 0;
      const dt = talking ? rdt : rdt * ST.speed;      // playback speed only applies between voice lines
      const K = talking ? 4 : 28;                     // time warp: slow down while voice is playing
      const tgt = interp(D.speeds, SIM.km);
      SIM.spd += (tgt - SIM.spd) * Math.min(1, dt * 2.4);
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
    SIM.finished = true; SIM.spd = 0;
    const wait = () => {
      if (!SIM.run) return;
      if (TTS.busy || TTS.q.length) return setTimeout(wait, 300);
      setTimeout(() => { if (cur === "A5") { toast("도착 · 주행 기록을 자동 저장했어요"); go("B1"); } }, 900);
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
    $(".cl-speed", sc).textContent = Math.round(SIM.finished ? 0 : SIM.spd);
    $(".cl-gear", sc).textContent = SIM.finished ? "P" : "D";
    $(".cl-limit", sc).textContent = limitAt(SIM.km);
    $(".cl-odo", sc).textContent = (5035 + SIM.km).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/, ",") + "km";
    const mins = 5 + Math.round(26 * SIM.km / 12.4);
    $(".sb-t", sc).textContent = `8:${String(mins).padStart(2, "0")} AM`;
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

  /* ------------------------------------------------------------ C2 */
  function renderC2() {
    const learnedScc = !!ST.learned.scc;
    $("#c2-progs").innerHTML = D.progs.map(p => {
      const done = p.missions.filter(m => m[3] === "done" || (m[5] === "scc" && learnedScc)).length;
      const st = done ? `${done} / ${p.missions.length} 완료` : "시작 전";
      const on = p.key === ST.prog;
      return `<a href="#" data-prog="${p.key}" class="card" style="display:block;padding:13px 15px;border-radius:14px;${on ? "background:#EEF4FE;border-color:#B9D2F6;" : ""}">
<div class="row"><span style="font-size:15px;font-weight:600">${p.title}</span><span class="xs" style="margin-left:auto">${st}</span></div>
<div class="xs" style="margin-top:3px">${p.sub}</div><div class="prog" style="margin-top:10px"><i style="width:${done / p.missions.length * 100}%"></i></div></a>`;
    }).join("");
    const p = D.progs.find(q => q.key === ST.prog);
    const done = p.missions.filter(m => m[3] === "done" || (m[5] === "scc" && learnedScc)).length;
    const rows = p.missions.map((m, i) => {
      let [title, kind, tag, st, href, feat] = m;
      if (feat === "scc" && learnedScc) st = "done";
      const stH = st === "done" ? `<span class="row" style="gap:4px;font-size:13px;color:#1A7F33;font-weight:600">${icon("check", 16, "#1FB83A")}완료</span>`
        : st === "prog" ? '<span style="font-size:13px;font-weight:600;color:#1A6FD0">진행 중 3/3</span>'
        : `<a href="${href}" ${feat ? `data-feature="${feat}"` : ""} class="btn ${st === "go" ? "pri" : "sec"} sm" style="height:34px">${st === "go" && feat ? "이어서" : "시작"}</a>`;
      const tagH = tag === "rec" ? '<span class="chip blue">추천</span>' : '<span class="chip gray">기본</span>';
      const kindH = `<span class="row xs" style="gap:4px">${icon(kind === "주행" ? "nav" : "lock", 12, "#646B76")}${kind}</span>`;
      return `<div class="row" style="gap:12px;padding:0 16px;height:${p.missions.length > 5 ? 54 : 62}px;border-top:1px solid #F0F0F3;${st === "go" ? "background:#F7FAFF;" : ""}">
<span class="num" style="width:22px;height:22px;border-radius:50%;background:${st === "done" ? "#1FB83A" : "#EFEFF2"};color:${st === "done" ? "#fff" : "#4B515A"};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="flex:1"><div class="row" style="gap:6px"><span style="font-size:15px;font-weight:600">${title}</span>${tagH}</div><div style="margin-top:3px">${kindH}</div></div>${stH}</div>`;
    }).join("");
    $("#c2-detail").innerHTML = `<div style="padding:16px 16px 12px"><div class="row"><span class="h2">${p.title}</span><span class="chip ${done ? "green" : "gray"}" style="margin-left:8px">${done ? p.badge : "시작 전"}</span><span class="sm num" style="margin-left:auto">${done} / ${p.missions.length} 완료</span></div>
<div class="sm" style="margin-top:4px">${p.desc}</div></div>${rows}
<div class="xs" style="margin-top:auto;padding:12px 16px;border-top:1px solid #F0F0F3;line-height:1.45">${p.note}</div>`;
  }

  /* ------------------------------------------------------------ D (features) */
  function syncLearn() {
    $$("[data-learn]").forEach(el => {
      const k = el.dataset.learn;
      if (ST.learned[k]) { el.textContent = "학습 완료"; el.style.color = "#1A7F33"; }
    });
    const st = $("#f4-scc-st");
    if (st && ST.learned.scc) st.textContent = "학습 완료 · 고속도로 등 관련 상황";
  }
  function enterD3() {
    const f = D.features[ST.feature];
    $("#d3-name").textContent = f.name;
    $("#d3-sub").textContent = `내 차 기능 · ${f.cat} · ${f.loc}`;
    $("#d3-prog").textContent = ST.learned[ST.feature] ? "3/3" : f.prog;
    $("#d3-when").textContent = f.when;
    $("#d3-caut").innerHTML = f.caut.map(c => `<li>${c}</li>`).join("");
    if (window.D3S) { window.D3S.select(ST.feature); window.D3S.resume(); return; }
    if (location.protocol === "file:") return; // ES modules need http(s); keep 2D fallback
    import("./three-scene.js").then(m => {
      window.D3S = m.init($("#d3-canvas"), $("#d3-markers"), (key) => { ST.feature = key; enterD3(); });
      $("#d3-fallback").style.display = "none";
      window.D3S.select(ST.feature);
    }).catch(err => { console.warn("3D 로드 실패 · 2D 그림으로 표시", err); });
  }
  const D4S = { step: 0 };
  function enterD4() { D4S.step = 0; renderD4(); $("#d4-msg").className = "d4msg"; }
  function renderD4() {
    const key = ST.feature, f = D.features[key], n = f.seq.length, st = D4S.step, done = st >= n;
    $("#d4-pad").innerHTML = f.pad.map((b, i) => {
      const doneB = f.seq.indexOf(i) > -1 && f.seq.indexOf(i) < st;
      const next = !done && f.seq[st] === i;
      return `<button class="vbtn${doneB ? " done" : ""}${next ? " next" : ""}" data-vb="${i}"><b>${b[0]}</b><small>${b[1]}</small><span class="ok">${icon("check", 13, "#fff")}</span></button>`;
    }).join("");
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
  function pressVB(i, el) {
    const f = D.features[ST.feature];
    if (D4S.step >= f.seq.length) return;
    if (f.seq[D4S.step] === i) {
      D4S.step++;
      const m = $("#d4-msg"); m.className = "d4msg ok"; m.textContent = `좋아요! ${f.stepText[D4S.step - 1]} 완료`;
      if (D4S.step >= f.seq.length) {
        ST.learned[ST.feature] = true; syncLearn();
        sayUI(`${f.name} 학습을 완료했어요.`);
      }
      renderD4();
    } else {
      el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
      const m = $("#d4-msg"); m.className = "d4msg warn"; m.textContent = `지금은 ${f.pad[f.seq[D4S.step]][0]} 버튼을 눌러요`;
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

  /* ------------------------------------------------------------ clicks */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a,button,.tgl,.pick");
    if (!a) return;
    if (a.matches('a[href="#"]')) e.preventDefault();
    if (a.dataset.feature) ST.feature = a.dataset.feature;
    if (a.dataset.toast) toast(a.dataset.toast);
    if (a.dataset.launch || a.matches(".dock-hit.dc")) { e.preventDefault(); return cur === "L0" ? launch() : go("A1"); }
    if (a.matches(".dock-hit.grid")) { e.preventDefault(); return go("L0"); }
    if (a.dataset.say) {
      e.preventDefault();
      const s = D.segs[ST.seg - 1];
      sayUI({ brief: D.brief, seg: segBrief(s), feature: D.features[ST.feature].say }[a.dataset.say]);
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
      const nxt = D.segs.find(s => !ST.checked.has(s.n) && s.n > ST.seg) || D.segs.find(s => !ST.checked.has(s.n));
      if (nxt) { ST.seg = nxt.n; toast(`확인 완료 · 다음은 ${nxt.n}번 ${nxt.sub} ${nxt.title}`); }
      else toast("7개 구간을 모두 확인했어요. 이제 출발해도 좋아요");
      return go("A3");
    }
    // A5
    if (a.id === "a5-skip") { stopSim(); hush(); toast("도착 · 주행 기록을 자동 저장했어요"); return go("B1"); }
    // B3
    if (a.matches(".b3pt")) { ST.b3 = +a.dataset.seg; renderB3(); if (ST.b3 === 3) toast("이미 어려운 구간으로 표시한 곳이에요"); return; }
    if (a.matches(".pick")) { a.classList.toggle("on"); return; }
    if (a.id === "b3-save") { toast(`'${D.b3names[ST.b3]}'을 어려운 구간으로 저장했어요`); return go("B4"); }
    // C2
    if (a.dataset.prog) { ST.prog = a.dataset.prog; renderC2(); return; }
    // D4
    if (a.matches(".vbtn")) return pressVB(+a.dataset.vb, a);
    if (a.id === "d4-tgl") { setRev(ST.feature, !ST.rev[ST.feature]); renderD4(); return; }
    if (a.id === "d4-retry") { D4S.step = 0; $("#d4-msg").className = "d4msg"; return renderD4(); }
    // D3 views
    if (a.closest("#d3-views") && a.dataset.view) { $$("#d3-views .tab").forEach(t => t.classList.toggle("on", t === a)); window.D3S && window.D3S.view(a.dataset.view); return; }
    // E2
    if (a.closest("#e2-tg") && a.dataset.c) {
      $$("#e2-tg .tab").forEach(t => t.classList.toggle("on", t === a));
      $("#e2-same").style.display = a.dataset.c === "same" ? "" : "none";
      $("#e2-all").style.display = a.dataset.c === "all" ? "" : "none"; return;
    }
    // F2
    if (a.matches(".ptile")) {
      if (a.dataset.prof === "add") return toast("프로필 추가는 목업에서 생략했어요");
      $$(".ptile").forEach(t => t.classList.toggle("on", t === a)); ST.profile = a.dataset.prof; return;
    }
    if (a.id === "f2-go") { if (ST.profile !== "지민") toast("시연 데이터는 지민 프로필만 있어요"); return go("A1"); }
    // F4
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
  const LOAD_STEPS = ["차량 정보를 확인하고 있어요", "지민 님의 프로필을 불러오고 있어요", "오늘의 출근길을 준비하고 있어요"];
  function launch() {
    if (launching) return;
    launching = true;
    const sp = $("#splash"), st = $(".sp-st", sp);
    $("#L0").classList.add("launching");
    st.textContent = LOAD_STEPS[0];
    sp.classList.remove("out"); void sp.offsetWidth; sp.classList.add("on");
    setTimeout(() => (st.textContent = LOAD_STEPS[1]), 1500);
    setTimeout(() => (st.textContent = LOAD_STEPS[2]), 2050);
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
<div class="grp"><b>모의 주행 재생 속도</b><div class="rowp">${[0.5, 1, 1.5, 2].map(v => `<button data-p-speed="${v}">${v}x</button>`).join("")}</div></div>
<div class="grp"><b>시나리오 설정</b>
<label><input type="checkbox" id="p-voice"> 음성(TTS) 재생</label>
<label><input type="checkbox" id="p-coach"> 운전 코칭 켜기</label>
<label><input type="checkbox" id="p-scc"> 크루즈 학습 완료 + 주행 중 복습 동의</label></div>
<div class="grp"><b>단축키</b><div class="muted" style="margin:0;line-height:1.7"><kbd>Space</kbd> 모의 주행 일시정지 · <kbd>R</kbd> 현재 화면 다시 시작<br><kbd>F</kbd> 전체 화면 · <kbd>\`</kbd> 패널 열기/닫기</div></div>
<div class="grp"><button id="p-reset" style="width:100%">처음 상태로 초기화</button></div>`;
  }
  function syncPanel() {
    if (P.hidden) return;
    $$("[data-p-go]", P).forEach(b => b.classList.toggle("on", b.dataset.pGo === cur));
    $$("[data-p-speed]", P).forEach(b => b.classList.toggle("on", +b.dataset.pSpeed === ST.speed));
    $("#p-voice").checked = ST.voice; $("#p-coach").checked = ST.coach; $("#p-scc").checked = !!(ST.learned.scc && ST.rev.scc);
  }
  P.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pGo) go(b.dataset.pGo);
    if (b.dataset.pSpeed) ST.speed = +b.dataset.pSpeed;
    if (b.id === "p-reset") { location.hash = "A1"; location.reload(); }
    syncPanel();
  });
  P.addEventListener("change", (e) => {
    if (e.target.id === "p-voice") { ST.voice = e.target.checked; if (!ST.voice) hush(); }
    if (e.target.id === "p-coach") { ST.coach = e.target.checked; if (cur === "A5") coachIdle(); }
    if (e.target.id === "p-scc") { ST.learned.scc = e.target.checked || ST.learned.scc; ST.rev.scc = e.target.checked; syncLearn(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("textarea,input")) return;
    if (e.key === "`") { P.hidden = !P.hidden; syncPanel(); }
    else if (e.key === "Escape") P.hidden = true;
    else if (e.key === " " && cur === "A5") { e.preventDefault(); SIM.paused = !SIM.paused; if (hasTTS) SIM.paused ? speechSynthesis.pause() : speechSynthesis.resume(); toast(SIM.paused ? "일시정지" : "재생", 900); }
    else if (e.key === "f" || e.key === "F") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
    else if (e.key === "r" || e.key === "R") { const c = cur; leave(c); cur = null; show(); }
  });

  /* ------------------------------------------------------------ boot */
  buildPanel();
  if (!location.hash) history.replaceState(null, "", "#L0");
  show();
  syncSettings();
  setTimeout(() => toast("` 키: 시연 패널 · F: 전체 화면", 3200), 600);
})();
