/* Drive Coach 4.1 — 2D drawings of the real controls (그랜저 Hybrid 2027 취급설명서 배치 기준).
   window.CTRL.overview(sel)    → 운전석 전체 그림 (D3). 기능 위치에 누를 수 있는 점(.spot[data-spot])
   window.CTRL.view(name, opt)  → 조작부 확대 그림 (D3 확대, D4 가상 실습, D2 미리보기)
     name: "wheel" | "stalk" | "console" | "climate"
     opt: { parts, labels, interactive, next, sel, state, compact }
       parts/labels: 누를 수 있는 키 id와 이름 (D.features[k].parts / pad). 키는 data-vb=parts 순서로 그려져요
       next: 지금 눌러야 하는 키 id (파랗게 깜빡여요) · sel: 강조만 하는 키 id 목록
   모든 그림은 버튼 위치와 순서만 설명서와 같게 그린 예시예요. 크기와 질감은 실제와 달라요. */
(function () {
  "use strict";
  const FF = "Pretendard Variable,Pretendard,sans-serif";
  const BLUE = "#1F6FE0", LIT = "#3FA2FF", INK = "#E6E9EE", SUB = "#AEB4BE";
  let uid = 0;

  const t = (x, y, s, size = 12, fill = INK, w = 600, anchor = "middle") =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" font-family="${FF}">${s}</text>`;

  /* one pressable key. glow: shape drawn under the key when it is next/selected. hit: transparent hit area */
  function key(o, id, body, glow, hit) {
    const i = o.parts ? o.parts.indexOf(id) : -1, act = !!o.interactive && i > -1;
    const cls = "key" + (o.next === id ? " next" : "") + (o.sel && o.sel.includes(id) ? " sel" : "") + (act ? " act" : "");
    const a = act ? ` data-vb="${i}" role="button" tabindex="0" aria-label="${(o.labels && o.labels[i]) || id}"` : "";
    return `<g class="${cls}" data-k="${id}"${a}><g class="glow" fill="${BLUE}">${glow}</g>${body}<g class="hit" fill="transparent">${hit}</g></g>`;
  }
  const bg = (id, w, h, r = 18) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3F47"/><stop offset="1" stop-color="#1E2126"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>`;
  const svg = (vb, w, h, inner, label) =>
    `<svg class="ctl" width="${w}" height="${h}" viewBox="${vb}" role="img" aria-label="${label}" style="display:block">${inner}</svg>`;

  /* ---------- small icons (stroke, drawn at 0,0) ---------- */
  const IC = {
    // car side + speedometer: 주행 보조 통합 버튼
    assist: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
<path d="M-15 4h15M-15 4v-4l3-5h8l3 5h2"/><circle cx="-11" cy="5" r="1.6"/><circle cx="-3" cy="5" r="1.6"/>
<path d="M4 6a7 7 0 1112 0"/><path d="M10 6l3-4"/></g>`,
    // vehicle with distance bars: 차간거리
    gap: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
<path d="M-7 -3h14l-2-5H-5z"/><path d="M-11 3h22M-8 8h16"/></g>`,
    // speedometer with pin: 제한 속도(ISLA)
    isla: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
<path d="M-11 5a8 8 0 1116 0"/><path d="M-3 5l3-4"/><circle cx="9" cy="-1" r="2.6"/><path d="M9 1.6v5"/></g>`,
    // steering wheel between lane lines: 차로 주행 보조
    lfa: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round">
<path d="M-18 9l6-18M18 9l-6-18"/><circle r="6.5"/><path d="M-6.5 0h13M0 0v6.5"/></g>`,
    // windshield + heat waves: 앞유리 습기 제거
    defog: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M-11 6q11-6 22 0l-3-12q-8-3-16 0z"/><path d="M-4 -1q-2-2 0-4t0-4M0 -1q-2-2 0-4t0-4M4 -1q-2-2 0-4t0-4" transform="translate(0 0)"/></g>`,
    // rear window + heat waves: 뒷유리 열선
    rear: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<rect x="-10" y="-8" width="20" height="13" rx="2"/><path d="M-4 9q-2-2 0-4M0 9q-2-2 0-4M4 9q-2-2 0-4" transform="translate(0 -9)"/></g>`,
    // car with circular arrow: 내부 공기 순환
    recirc: (c = INK) => `<g fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M-11 5h22M-11 5v-3l3-4h14l3 4v3"/><path d="M-4 -6a5 4 0 018 0"/><path d="M4 -6l1-2.5M4 -6l-2.6-.6"/></g>`,
    fan: (c = INK) => `<g fill="${c}"><circle r="1.8"/><path d="M0-2c-1-4 2-7 4-5s-1 4-4 5zM2 0c4-1 7 2 5 4s-4-1-5-4zM0 2c1 4-2 7-4 5s1-4 4-5zM-2 0c-4 1-7-2-5-4s4 1 5 4z"/></g>`,
    chev: (up, c) => `<path d="M-6 ${up ? 3 : -3}l6 ${up ? -6 : 6} 6 ${up ? 6 : -6}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    phone: (c = INK) => `<path d="M-6 -6c1 6 6 11 12 12l2-3-4-2-2 2c-2-1-4-3-5-5l2-2-2-4z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  };

  /* ---------- 운전대 왼쪽 패드 (SCC · 차로 유지 보조) ---------- */
  function wheel(o) {
    const g = "cg" + (++uid), C = 170;
    const pad = `<rect x="40" y="14" width="260" height="204" rx="26" fill="#2B2E33" stroke="#474B52" stroke-width="1.5"/>
<rect x="100" y="26" width="140" height="132" rx="32" fill="#25282C" stroke="#3E4249" stroke-width="1.5"/>
<path d="M114 40l26 26M226 40l-26 26M114 144l26-26M226 144l-26-26" stroke="#4A4F57" stroke-width="2" stroke-linecap="round"/>
<path d="M56 170h228M170 176v36" stroke="#474B52" stroke-width="1.5"/>`;
    const keys = [
      key(o, "setUp", t(C, 55, "+SET", 15), `<ellipse cx="${C}" cy="49" rx="44" ry="19"/>`, `<rect x="128" y="28" width="84" height="38" rx="12"/>`),
      key(o, "setDown", t(C, 147, "−SET", 15), `<ellipse cx="${C}" cy="141" rx="44" ry="19"/>`, `<rect x="128" y="120" width="84" height="38" rx="12"/>`),
      key(o, "gap", `<g transform="translate(121 94)">${IC.gap()}</g>`, `<ellipse cx="121" cy="92" rx="22" ry="28"/>`, `<rect x="101" y="66" width="40" height="52" rx="10"/>`),
      key(o, "isla", `<g transform="translate(219 93)">${IC.isla()}</g>`, `<ellipse cx="219" cy="92" rx="22" ry="28"/>`, `<rect x="199" y="66" width="40" height="52" rx="10"/>`),
      key(o, "assist", `<rect x="142" y="70" width="56" height="44" rx="12" fill="#1C1F23" stroke="#5A606A" stroke-width="1.5"/><g transform="translate(${C} 92)">${IC.assist()}</g>`,
        `<rect x="134" y="62" width="72" height="60" rx="18"/>`, `<rect x="142" y="70" width="56" height="44" rx="12"/>`),
      key(o, "lfa", `<g transform="translate(108 194)">${IC.lfa()}</g>`, `<ellipse cx="108" cy="194" rx="50" ry="17"/>`, `<rect x="52" y="176" width="114" height="38" rx="12"/>`),
      key(o, "drive", t(232, 191, "DRIVE", 11, INK, 600) + t(232, 205, "MODE", 11, INK, 600), `<ellipse cx="232" cy="194" rx="50" ry="17"/>`, `<rect x="174" y="176" width="114" height="38" rx="12"/>`),
    ].join("");
    if (o.compact) return svg("34 8 272 216", 214, 170, bg(g, 340, 232, 0) + pad + keys, "운전대 왼쪽 패드 그림");
    // small steering wheel on the right: where the pad is
    const thumb = `<g transform="translate(0 2)">
<rect x="338" y="40" width="148" height="152" rx="46" fill="none" stroke="#15171A" stroke-width="13"/>
<rect x="344" y="102" width="136" height="24" rx="6" fill="#1E2024"/>
<rect x="354" y="96" width="34" height="34" rx="7" fill="#34373C"/><rect x="436" y="96" width="34" height="34" rx="7" fill="#34373C"/>
<rect x="390" y="88" width="44" height="44" rx="13" fill="#2A2D32" stroke="#3A3E45"/>
${[401, 409, 417, 425].map(x => `<circle cx="${x}" cy="100" r="1.6" fill="#C9CDD3"/>`).join("")}
<path d="M396 132h32v58h-32z" fill="#1E2024"/><rect x="402" y="158" width="20" height="22" rx="3" fill="#2A2E35"/>
<rect x="349" y="91" width="44" height="44" rx="10" fill="none" stroke="#4E9BFF" stroke-width="2"/></g>
<path d="M349 115H300" stroke="#4E9BFF" stroke-width="1.5"/>
${t(412, 222, "운전대 왼쪽", 11, SUB, 500)}`;
    return svg("0 0 504 232", 504, 232, bg(g, 504, 232) + thumb + pad + keys, "운전대 왼쪽 패드 그림");
  }

  /* ---------- 왼쪽 레버 끝 와이퍼 노브 ---------- */
  const POS = ["OFF", "1", "2", "3", "LO", "HI"]; // 아래에서 위로 · 1~3: 자동(레인 센서) 감도
  function stalk(o) {
    const g = "cg" + (++uid), pos = (o.state && o.state.pos) || 0;
    const rows = POS.map((p, i) => {
      const y = 151 - i * 13, on = i === pos;
      const mark = /\d/.test(p)
        ? Array.from({ length: +p }, (_, k) => `<circle cx="${230 + k * 7}" cy="${y - 4}" r="2.4" fill="${INK}"/>`).join("")
        : t(226, y, p, 11, INK, 600, "start");
      return `<rect x="208" y="${y - 7}" width="9" height="5" rx="2" fill="${on ? LIT : "#2D3036"}"${on ? ` filter="url(#${g}b)"` : ""}/>${mark}`;
    }).join("");
    const body = `<defs><filter id="${g}b" x="-1" y="-2" width="3" height="5"><feGaussianBlur stdDeviation="1.6"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="176" y="62" width="360" height="108" rx="40" fill="#1F2226"/>
<rect x="196" y="76" width="282" height="80" rx="16" fill="#121417" stroke="#3A3E45"/>${rows}
<g transform="translate(352 104)" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M2-8a8 8 0 010 16z"/><path d="M-4-6h-6M-4-2h-6M-4 2h-6M-4 6h-6"/></g>${t(354, 130, "AUTO", 9)}
<g transform="translate(424 110)" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M-4-6l-8 6 8 6v-3h4v-6h-4z"/><path d="M4-6l8 6-8 6v-3h-4v-6h4z"/></g>
<rect x="170" y="62" width="9" height="108" rx="3" fill="#B9BEC6"/>
<rect x="96" y="58" width="78" height="116" rx="14" fill="#2A2D33"/>
${Array.from({ length: 8 }, (_, k) => `<path d="M${116 + k * 5} 70v92" stroke="#3B3F46" stroke-width="1.6"/>`).join("")}
${t(68, 118, "와이퍼 노브", 11, SUB, 500, "end")}`;
    const keys = [
      key(o, "knobUp", `<g transform="translate(152 90)">${IC.chev(true, INK)}</g>`, `<ellipse cx="135" cy="88" rx="46" ry="32"/>`, `<rect x="106" y="58" width="68" height="56" rx="12"/>`),
      key(o, "knobDown", `<g transform="translate(152 142)">${IC.chev(false, INK)}</g>`, `<ellipse cx="135" cy="144" rx="46" ry="32"/>`, `<rect x="106" y="118" width="68" height="56" rx="12"/>`),
      key(o, "wash", `<ellipse cx="96" cy="116" rx="14" ry="57" fill="#24272C" stroke="#3A3E45"/>${t(96, 106, "1x", 10)}<g transform="translate(96 126)" fill="none" stroke="${INK}" stroke-width="1.4"><path d="M-5 3l5-7 5 7"/></g>`,
        `<ellipse cx="96" cy="116" rx="24" ry="44"/>`, `<ellipse cx="96" cy="116" rx="15" ry="57"/>`),
    ].join("");
    return svg("0 0 504 232", 504, 232, bg(g, 504, 232) + body + keys + t(20, 220, "왼쪽 레버 · 운전대 뒤", 11, SUB, 500, "start"), "왼쪽 레버 와이퍼 노브 그림");
  }

  /* ---------- 센터 콘솔 (오토 홀드) + 브레이크 페달 ---------- */
  function console_(o) {
    const g = "cg" + (++uid), s = o.state || {}, dy = s.brake ? 8 : 0;
    const body = `<rect x="16" y="16" width="160" height="200" rx="14" fill="#26292E"/>${t(30, 36, "발밑", 11, SUB, 500, "start")}
<rect x="134" y="72" width="20" height="118" rx="6" fill="#3A3E45"/>${[90, 110, 130, 150, 170].map(y => `<path d="M138 ${y}h12" stroke="#50555D" stroke-width="1.5"/>`).join("")}
${t(144, 208, "가속", 10, SUB, 500)}
<rect x="196" y="16" width="292" height="200" rx="18" fill="#C9CDD3"/>
<rect x="212" y="28" width="260" height="64" rx="12" fill="#1E2024"/>
<circle cx="262" cy="60" r="20" fill="#2B2E33" stroke="#4A4F57"/><rect x="255" y="51" width="14" height="18" rx="3" fill="none" stroke="#7C838E" stroke-width="1.5"/>
<rect x="306" y="40" width="7" height="40" rx="3" fill="#121417"/>
<rect x="212" y="100" width="260" height="108" rx="12" fill="#D9DCE0"/>
<rect x="352" y="108" width="112" height="92" rx="12" fill="#CDD0D5"/><path d="M362 122h92M362 186h92" stroke="#BFC3C9"/>
${t(408, 158, "암레스트", 10, "#8D939C", 500)}`;
    const keys = [
      key(o, "brake", `<g transform="translate(0 ${dy})"><rect x="70" y="40" width="12" height="76" fill="#2F3237"/><rect x="38" y="110" width="76" height="62" rx="10" fill="${s.brake ? "#2E3238" : "#3A3E45"}" stroke="#50555D"/>
${[124, 134, 144, 154].map(y => `<path d="M48 ${y}h56" stroke="#50555D" stroke-width="1.5"/>`).join("")}</g>${t(76, 198, s.brake ? "브레이크 · 밟음" : "브레이크", 12)}`,
        `<rect x="30" y="${102 + dy}" width="92" height="78" rx="16"/>`, `<rect x="34" y="36" width="84" height="146" rx="12"/>`),
      key(o, "start", `<circle cx="262" cy="136" r="24" fill="#2A2D33" stroke="#9AA0A8" stroke-width="2"/>${t(262, 131, "ENGINE", 7)}${t(262, 140, "START", 7)}${t(262, 149, "STOP", 7)}`,
        `<circle cx="262" cy="136" r="33"/>`, `<circle cx="262" cy="136" r="26"/>`),
      key(o, "autohold", `<rect x="232" y="168" width="56" height="34" rx="7" fill="#2F3237"/><rect x="252" y="171" width="16" height="3" rx="1.5" fill="${s.hold ? "#FFFFFF" : "#50555D"}"/>${t(260, 186, "AUTO", 9)}${t(260, 197, "HOLD", 9)}`,
        `<rect x="224" y="160" width="72" height="50" rx="12"/>`, `<rect x="232" y="168" width="56" height="34" rx="7"/>`),
      key(o, "pview", `<rect x="292" y="168" width="40" height="34" rx="7" fill="#2F3237"/><path d="M302 177h-4v16h4M322 177h4v16h-4" fill="none" stroke="${INK}" stroke-width="1.4"/>${t(312, 190, "P", 12)}`,
        `<rect x="285" y="160" width="54" height="50" rx="12"/>`, `<rect x="292" y="168" width="40" height="34" rx="7"/>`),
    ].join("");
    return svg("0 0 504 232", 504, 232, bg(g, 504, 232) + body + keys, "센터 콘솔과 브레이크 페달 그림");
  }

  /* ---------- 공조 화면 (Pleos Connect) ---------- */
  function climate(o) {
    const g = "cg" + (++uid), s = o.state || {}, fan = s.fan || 2, df = !!s.defog;
    const cell = (x, w, fill = "#2A2D33") => `<rect x="${x}" y="18" width="${w}" height="34" rx="8" fill="${fill}"/>`;
    const green = "#2BD46B";
    const body = `<rect x="6" y="6" width="492" height="220" rx="16" fill="#1B1D21"/>
${cell(18, 44)}${t(40, 40, "ON", 12, green)}
${cell(70, 88)}<path d="M114 22v26" stroke="#1B1D21" stroke-width="2"/>${t(92, 33, "AUTO", 9, df ? "#8D939C" : green)}${t(92, 44, "MED", 9, df ? "#8D939C" : green)}
${cell(166, 72)}<path d="M202 22v26" stroke="#1B1D21" stroke-width="2"/>
${cell(248, 88)}<rect x="252" y="22" width="42" height="26" rx="6" fill="#3A3E45"/>${t(273, 39, "FRONT", 9)}${t(315, 39, "REAR", 9, "#8D939C")}
${cell(346, 78)}<path d="M384 22v26" stroke="#1B1D21" stroke-width="2"/><g transform="translate(365 37)">${IC.recirc(INK)}</g>${t(404, 39, "SYNC", 10, green)}
${t(486, 30, "OUTSIDE", 9, SUB, 500, "end")}${t(486, 46, "24°C", 12, INK, 600, "end")}
<rect x="18" y="64" width="44" height="106" rx="10" fill="#2A2D33"/><g transform="translate(40 82)">${IC.chev(true, "#E5484D")}</g>${t(40, 124, "22.0", 14)}<g transform="translate(40 156)">${IC.chev(false, "#4E9BFF")}</g>
<rect x="70" y="64" width="44" height="106" rx="10" fill="#2A2D33"/><g transform="translate(92 110)">${IC.fan(INK)}</g>${t(92, 136, String(fan), 14)}<g transform="translate(92 156)">${IC.chev(false, INK)}</g>
<rect x="442" y="64" width="44" height="106" rx="10" fill="#2A2D33"/><g transform="translate(464 82)">${IC.chev(true, "#E5484D")}</g>${t(464, 124, "22.0", 14)}<g transform="translate(464 156)">${IC.chev(false, "#4E9BFF")}</g>
<path d="M136 160q144-26 288 0" fill="none" stroke="#33373E" stroke-width="2"/><rect x="250" y="76" width="64" height="40" rx="5" fill="none" stroke="#33373E" stroke-width="2"/>
${[150, 214, 296, 360].map(x => `<rect x="${x}" y="130" width="54" height="18" rx="9" fill="#D9DCE0"/><circle cx="${x + 27}" cy="139" r="4" fill="none" stroke="#5A606A" stroke-width="2"/>`).join("")}
${df ? [177, 241, 323, 387].map(x => `<path d="M${x} 126q-6-22 4-46" fill="none" stroke="${LIT}" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>`).join("") + t(282, 70, "앞유리로 바람", 10, LIT, 600) : ""}
${[18, 70].map(x => `<rect x="${x}" y="182" width="44" height="32" rx="8" fill="#2A2D33"/>`).join("")}<rect x="124" y="182" width="126" height="32" rx="8" fill="#2A2D33"/>
<rect x="360" y="182" width="74" height="32" rx="8" fill="#2A2D33"/><rect x="442" y="182" width="44" height="32" rx="8" fill="#2A2D33"/>`;
    const keys = [
      key(o, "ac", t(136, 39, "A/C", 11, green), `<rect x="112" y="12" width="50" height="46" rx="12"/>`, `<rect x="116" y="18" width="42" height="34" rx="8"/>`),
      key(o, "defog", `${df ? `<rect x="166" y="18" width="36" height="34" rx="8" fill="#23324A"/>` : ""}<g transform="translate(184 36)">${IC.defog(df ? LIT : INK)}</g>`,
        `<rect x="160" y="12" width="48" height="46" rx="12"/>`, `<rect x="166" y="18" width="36" height="34" rx="8"/>`),
      key(o, "rear", `<g transform="translate(220 37)">${IC.rear(INK)}</g>`, `<rect x="198" y="12" width="44" height="46" rx="12"/>`, `<rect x="204" y="18" width="34" height="34" rx="8"/>`),
      key(o, "fanUp", `<g transform="translate(92 82)">${IC.chev(true, INK)}</g>`, `<rect x="64" y="60" width="56" height="44" rx="12"/>`, `<rect x="70" y="64" width="44" height="34" rx="10"/>`),
    ].join("");
    return svg("0 0 504 232", 504, 232, bg(g, 504, 232) + body + keys, "공조 화면 그림");
  }

  /* ---------- 운전석 전체 (위치 찾기) ---------- */
  const SPOTS = { // [x, y] in the overview drawing
    scc: [116, 191], lka: [103, 222], wiper: [46, 160], autohold: [357, 343], defog: [385, 150],
  };
  function overview(sel, names) {
    const W = 540, H = 448;
    const wheelC = [170, 200];
    const art = `<defs><linearGradient id="ovw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4E8EE"/><stop offset="1" stop-color="#F3F5F8"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#ovw)"/>
<path d="M0 104Q270 76 540 104V162H0z" fill="#3B3F46"/>
<path d="M0 156H540" stroke="#2A2D32" stroke-width="5"/>
<path d="M0 162H540V340H0z" fill="#D7DADF"/>
<rect x="8" y="114" width="44" height="18" rx="6" fill="#23272D"/><rect x="496" y="114" width="40" height="18" rx="6" fill="#23272D"/>
<rect x="84" y="72" width="172" height="36" rx="6" fill="#1E2023" stroke="#555A62"/>${t(110, 95, "P", 13, "#E6E9EE")}<path d="M138 86h50M138 94h34" stroke="#5E7DA8" stroke-width="3" stroke-linecap="round"/>
<rect x="300" y="66" width="172" height="140" rx="10" fill="#15171A" stroke="#5C626C" stroke-width="1.5"/>
<rect x="310" y="76" width="152" height="92" rx="6" fill="#1F2329"/><path d="M322 96h60M322 106h40" stroke="#4E6A90" stroke-width="3" stroke-linecap="round"/>
<rect x="310" y="174" width="152" height="24" rx="5" fill="#262A31"/>${[324, 344, 364, 384, 404, 424, 444].map(x => `<rect x="${x - 6}" y="180" width="12" height="12" rx="3" fill="#3A3F47"/>`).join("")}
${t(386, 128, "Pleos Connect", 10, "#8D9AAE", 600)}
<rect x="312" y="214" width="148" height="16" rx="5" fill="#2A2D32"/><rect x="376" y="216" width="20" height="12" rx="2" fill="#E5191C"/>
<circle cx="326" cy="222" r="6" fill="#B9BEC6"/><circle cx="446" cy="222" r="6" fill="#B9BEC6"/>
<rect x="16" y="226" width="22" height="16" rx="3" fill="#C2C6CC" stroke="#A9AEB6"/><rect x="40" y="226" width="22" height="16" rx="3" fill="#C2C6CC" stroke="#A9AEB6"/>
<rect x="16" y="244" width="22" height="16" rx="3" fill="#C2C6CC" stroke="#A9AEB6"/><rect x="40" y="244" width="22" height="16" rx="3" fill="#C2C6CC" stroke="#A9AEB6"/>
<path d="M70 340L100 300H260L290 340z" fill="#C9CDD3"/>
<path d="M0 340H540V448H0z" fill="#3A3E45"/>
<rect x="150" y="372" width="44" height="52" rx="8" fill="#2A2D32" stroke="#50555D"/><rect x="214" y="364" width="14" height="66" rx="4" fill="#2A2D32" stroke="#50555D"/>
<path d="M322 236H452L470 448H304z" fill="#C3C7CD"/>
<rect x="332" y="248" width="110" height="46" rx="8" fill="#1E2024"/><circle cx="360" cy="271" r="12" fill="#2B2E33" stroke="#4A4F57"/>
<rect x="326" y="302" width="122" height="72" rx="8" fill="#D2D5DA"/>
<circle cx="357" cy="320" r="9" fill="#2A2D33" stroke="#9AA0A8" stroke-width="1.5"/>
<rect x="346" y="337" width="20" height="12" rx="2" fill="#2F3237"/><rect x="369" y="337" width="14" height="12" rx="2" fill="#2F3237"/>
<rect x="392" y="304" width="52" height="66" rx="6" fill="#CDD0D5"/>
<rect x="476" y="250" width="64" height="44" rx="8" fill="#CDD0D5" stroke="#BABFC6"/>
<path d="M140 168L46 160" stroke="#26292E" stroke-width="10" stroke-linecap="round"/><ellipse cx="44" cy="160" rx="7" ry="9" fill="#33363C"/>
<path d="M200 168L292 160" stroke="#26292E" stroke-width="10" stroke-linecap="round"/><rect x="286" y="152" width="18" height="16" rx="4" fill="#2C2F35"/>
<g transform="translate(${wheelC[0]} ${wheelC[1]})">
<rect x="-104" y="-92" width="208" height="184" rx="62" fill="none" stroke="#1C1E22" stroke-width="14"/>
<rect x="-98" y="-10" width="196" height="22" rx="6" fill="#1E2024"/>
<rect x="-80" y="-20" width="44" height="46" rx="8" fill="#34373C"/><rect x="36" y="-20" width="44" height="46" rx="8" fill="#34373C"/>
<rect x="-70" y="-15" width="24" height="22" rx="6" fill="#26292E"/><rect x="-62" y="-9" width="8" height="10" rx="2" fill="#1C1F23"/>
<path d="M-78 12h40M-58 12v12" stroke="#474B52"/>
<rect x="46" y="-15" width="24" height="22" rx="6" fill="#26292E"/><circle cx="58" cy="-4" r="4" fill="#1C1F23"/>
<rect x="-32" y="-26" width="64" height="52" rx="16" fill="#2A2D32" stroke="#3A3E45"/>
${[-12, -4, 4, 12].map(x => `<circle cx="${x}" cy="-12" r="1.8" fill="#C9CDD3"/>`).join("")}${t(0, 12, "AIRBAG", 7, "#9AA0A8", 600)}
<path d="M-24 26h48v66h-48z" fill="#1E2024"/><rect x="-14" y="56" width="28" height="24" rx="3" fill="#C9CDD3"/></g>`;
    const label = (k) => {
      const [x, y] = SPOTS[k], name = (names && names[k]) || k, w = name.length * 13 + 24;
      const lx = Math.max(8, Math.min(W - w - 8, x - w / 2)), up = y > 90, ly = up ? y - 52 : y + 26;
      return `<g class="callout" pointer-events="none"><path d="M${x} ${up ? y - 14 : y + 14}V${up ? ly + 30 : ly}" stroke="${BLUE}" stroke-width="2"/>
<rect x="${lx}" y="${ly}" width="${w}" height="30" rx="10" fill="${BLUE}"/>${t(lx + w / 2, ly + 20, name, 13, "#fff", 600)}</g>`;
    };
    const spots = Object.keys(SPOTS).map(k => {
      const [x, y] = SPOTS[k], on = k === sel;
      return `<g class="spot${on ? " on" : ""}" data-spot="${k}" role="button" tabindex="0" aria-label="${(names && names[k]) || k} 위치 보기" transform="translate(${x} ${y})">
${on ? `<circle class="halo" r="20"/>` : ""}<circle r="18" fill="transparent"/><circle class="ring" r="10"/><circle class="dot" r="4"/></g>`;
    }).join("");
    return svg(`0 0 ${W} ${H}`, W, H, art + spots + (sel && SPOTS[sel] ? label(sel) : ""), "운전석 실내 그림 · 기능 위치");
  }

  const VIEWS = { wheel, stalk, console: console_, climate };
  window.CTRL = {
    overview,
    view: (name, opt = {}) => (VIEWS[name] || wheel)(opt),
  };
})();
