const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert(start >= 0 && end > start, `Missing source section: ${from}`);
  return source.slice(start, end);
}

// Execute the production queue and A5 caption handlers with controllable browser callbacks.
function setup({ voice = true, hasTTS = true } = {}) {
  let now = 0, seq = 0;
  const timers = new Map(), nodes = new Map(), spoken = [];
  const clock = {
    advance(ms) {
      const target = now + ms;
      for (let count = 0; count < 10000; count++) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { now = target; return; }
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      throw new Error("Timer loop did not settle");
    },
  };
  function $(selector) {
    if (!nodes.has(selector)) {
      let text = "", html = "";
      const n = { classes: new Set() };
      Object.defineProperties(n, {
        className: { get: () => [...n.classes].join(" "), set: v => { n.classes = new Set(v.split(/\s+/)); } },
        textContent: { get: () => text, set: v => { text = html = v; } },
        innerHTML: { get: () => html, set: v => { html = v; text = v.replace(/<[^>]*>/g, ""); } },
      });
      n.classList = {
        add: v => n.classes.add(v), remove: v => n.classes.delete(v), contains: v => n.classes.has(v),
        toggle(v, force) { if (force ?? !n.classes.has(v)) n.classes.add(v); else n.classes.delete(v); },
      };
      nodes.set(selector, n);
    }
    return nodes.get(selector);
  }
  const speech = {
    speaking: false, pending: false, paused: false, current: null, cancelEvents: false,
    getVoices: () => [],
    speak(u) { spoken.push(u); this.current = u; this.pending = true; },
    cancel() {
      const old = this.current;
      this.current = null; this.speaking = this.pending = false;
      if (this.cancelEvents && old) old.onerror();
    },
    pause() { this.paused = true; }, resume() { this.paused = false; },
    start() { this.pending = false; this.speaking = true; this.current.onstart(); },
    end() { const u = this.current; this.current = null; this.speaking = false; u.onend(); },
  };
  const ctx = vm.createContext({
    $, window: hasTTS ? { speechSynthesis: speech } : {}, speechSynthesis: speech,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    performance: { now: () => now },
    setTimeout(fn, ms) { timers.set(++seq, { at: now + ms, fn }); return seq; },
    clearTimeout: id => timers.delete(id), syncVoiceSelects() {},
    icon: name => `<svg>${name}</svg>`, cur: "A5",
    ST: { voice, coach: true, freq: 3, learned: { scc: true }, rev: { scc: true } },
    SIM: { km: 0, fired: new Set(), navT: 0, idleT: 0 },
    D: { script: [], features: { scc: { name: "스마트 크루즈 컨트롤" } } },
  });
  vm.runInContext(section("  const TTS =", "  /* ------------------------------------------------------------ router */")
    + section("  function fireScript()", "  function finish()"), ctx);
  const tts = vm.runInContext("TTS", ctx);
  function event(kind, text, extra = {}) {
    ctx.D.script.push({ km: 0, kind, text, lvl: 1, feature: "scc", ...extra });
    ctx.fireScript();
  }
  return { ctx, tts, clock, $, speech, spoken, event };
}

test("navigation interrupts coaching; cancelled callbacks cannot end the new navigation", () => {
  const h = setup(); h.speech.cancelEvents = true;
  h.event("coach", "coach", { ttl: 2 }); h.speech.start();
  const old = h.spoken[0];
  assert(h.$("#a5-coach").classList.contains("talk"));
  h.event("nav", "nav");
  assert.equal(h.tts.cur.kind, "nav");
  assert.equal(h.tts.q[0].kind, "coach");
  assert(h.$("#a5-coach").classList.contains("idle"));
  assert(!h.$("#a5-navspk").classList.contains("on")); // wait for actual onstart
  h.speech.start(); old.onend(); old.onerror(); old.onstart();
  assert.equal(h.tts.cur.kind, "nav");
  assert(h.$("#a5-navspk").classList.contains("on"));
  h.speech.end(); h.clock.advance(180); h.speech.start();
  assert.equal(h.tts.cur.kind, "coach");
  assert(!h.$("#a5-navsub").classList.contains("on"));
});

test("coaching interrupts review; navigation stays FIFO and outranks both", () => {
  const h = setup();
  h.event("review", "review"); h.speech.start();
  h.event("coach", "coach"); h.speech.start();
  h.event("nav", "nav-1"); h.speech.start();
  h.event("nav", "nav-2");
  assert.equal(h.tts.cur.text, "nav-1");
  assert.equal(h.tts.q.map(x => x.text).join(","), "nav-2,coach,review");
  for (const text of ["nav-2", "coach", "review"]) {
    h.speech.end(); h.clock.advance(180); h.speech.start();
    assert.equal(h.tts.cur.text, text);
  }
});

test("expired interrupted coaching is skipped without showing its caption", () => {
  const h = setup();
  h.event("coach", "expired-coach", { ttl: 1 }); h.speech.start();
  h.event("nav", "nav"); h.speech.start(); h.ctx.SIM.km = 1.1;
  h.speech.end(); h.clock.advance(4000);
  assert.equal(h.tts.cur, null); assert.equal(h.spoken.length, 2);
  assert(!h.$("#a5-coach-text").textContent.includes("expired-coach"));
});

test("older navigation hide timer cannot hide the next navigation caption", () => {
  const h = setup();
  h.event("nav", "nav-1"); h.speech.start(); h.speech.end();
  h.event("nav", "nav-2"); h.speech.start(); h.clock.advance(800);
  assert(h.$("#a5-navsub").classList.contains("on"));
  assert(h.$("#a5-navsub").textContent.includes("nav-2"));
  assert(h.$("#a5-navspk").classList.contains("on"));
});

test("muted captions and missing speech API never claim audio is playing", () => {
  for (const options of [{ voice: false }, { hasTTS: false }]) {
    const h = setup(options);
    h.event("nav", "caption-nav");
    assert(h.$("#a5-navsub").textContent.includes("자막"));
    assert(!h.$("#a5-navspk").classList.contains("on"));
    h.event("coach", "caption-coach"); h.clock.advance(2000);
    assert(h.$("#a5-coach-text").textContent.includes("caption-coach"));
    assert(!h.$("#a5-coach").classList.contains("talk"));
    assert.equal(h.spoken.length, 0);
  }
});

test("muting an active navigation preserves it as a caption and preserves queued coaching", () => {
  const h = setup();
  h.event("nav", "nav"); h.speech.start(); h.event("coach", "coach");
  const old = h.spoken[0]; h.ctx.setSpeechVoice(false); old.onend();
  assert.equal(h.tts.cur.text, "nav"); assert.equal(h.tts.q[0].text, "coach");
  assert(!h.$("#a5-navspk").classList.contains("on"));
  assert(h.$("#a5-navsub").textContent.includes("자막"));
  h.clock.advance(2000); assert.equal(h.tts.cur, null);
});

test("caption-only pause freezes the remaining duration and queue", () => {
  const h = setup({ voice: false });
  h.event("nav", "nav"); h.event("coach", "coach");
  h.clock.advance(200); h.ctx.pauseSpeech(true); h.clock.advance(30000);
  assert.equal(h.tts.cur.text, "nav"); assert.equal(h.tts.q.length, 1);
  assert(h.$("#a5-navsub").textContent.includes("일시정지"));
  h.ctx.pauseSpeech(false); h.clock.advance(554);
  assert.equal(h.tts.cur.text, "nav");
  h.clock.advance(181); assert.equal(h.tts.cur.text, "coach");
});

test("audio pause stops pulse; a late end event cannot advance until resume", () => {
  const h = setup();
  h.event("coach", "coach"); h.speech.start(); h.ctx.pauseSpeech(true);
  assert(!h.$("#a5-coach").classList.contains("talk"));
  assert(h.$("#a5-coach-tag").textContent.includes("일시정지"));
  h.event("nav", "nav"); // interrupt is queued while paused, never starts audio
  assert.equal(h.tts.cur, null); assert.equal(h.spoken.length, 1);
  h.clock.advance(30000); h.ctx.pauseSpeech(false);
  assert.equal(h.tts.cur.kind, "nav"); h.speech.start();
  h.ctx.pauseSpeech(true); h.speech.end(); h.clock.advance(30000);
  assert.equal(h.tts.cur.kind, "nav");
  h.ctx.pauseSpeech(false); h.clock.advance(180);
  assert.equal(h.tts.cur.kind, "coach");
});

test("watchdog handles missing onend without cutting long speech short", () => {
  const h = setup();
  h.event("nav", "nav"); h.speech.start(); h.clock.advance(10000);
  assert.equal(h.tts.cur.kind, "nav");
  h.speech.speaking = false; h.clock.advance(500);
  assert.equal(h.tts.cur, null);
});

test("watchdog time is frozen while audio is paused", () => {
  const h = setup();
  h.event("nav", "nav"); h.speech.start(); h.clock.advance(500);
  h.ctx.pauseSpeech(true); h.speech.speaking = false; h.clock.advance(30000);
  assert.equal(h.tts.cur.kind, "nav");
  h.ctx.pauseSpeech(false); h.clock.advance(1000);
  assert.equal(h.tts.cur.kind, "nav");
  h.clock.advance(2000); assert.equal(h.tts.cur, null);
});

test("settings changes drop ineligible queued coaching and active review", () => {
  const h = setup();
  h.event("review", "review"); h.speech.start();
  h.ctx.ST.rev.scc = false; h.ctx.pruneSpeech();
  assert.equal(h.tts.cur, null); assert(!h.$("#a5-coach").classList.contains("review"));
  h.event("nav", "nav"); h.speech.start(); h.event("coach", "coach");
  h.ctx.ST.coach = false; h.ctx.pruneSpeech();
  assert.equal(h.tts.q.length, 0); assert.equal(h.tts.cur.kind, "nav");
});

test("hush clears subtitles, styles, timers and pause state across restart", () => {
  const h = setup();
  h.event("nav", "old-nav"); h.speech.start(); h.speech.end();
  h.event("review", "review"); h.speech.start(); h.ctx.pauseSpeech(true);
  const old = h.spoken.at(-1); h.ctx.hush();
  assert.equal(h.tts.cur, null); assert.equal(h.tts.q.length, 0); assert.equal(h.tts.paused, false);
  assert(!h.$("#a5-coach").classList.contains("review"));
  assert(!h.$("#a5-coach").classList.contains("talk"));
  assert.equal(h.$("#a5-navsub").textContent, "");
  h.event("nav", "new-nav"); h.speech.start(); old.onend(); old.onerror(); h.clock.advance(800);
  assert(h.$("#a5-navsub").textContent.includes("new-nav"));
  assert(h.$("#a5-navsub").classList.contains("on"));
});

function addDriveLifecycle(h) {
  const frames = [], routes = [];
  Object.assign(h.ctx, {
    VS: { odo: 5035, doors: { fl: false } }, CLOCK: { off: 0 }, ROAD_LIMIT: 50,
    now: () => new Date("2026-11-12T01:00:00Z"), hm24: () => "10:26",
    updateA5() {}, tickClock() {}, syncCluster() {}, tick() {}, toast() {}, missionDone: () => null,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    go: id => routes.push(id),
  });
  vm.runInContext(section("  function enterA5()", "  function tick(t)")
    + section("  function finish()", "  function updateA5(rdt)"), h.ctx);
  return { frames, routes };
}

test("restart before departure cancels the previous delayed animation loop", () => {
  const h = setup(), { frames } = addDriveLifecycle(h);
  h.ctx.enterA5(); h.clock.advance(100); h.ctx.enterA5(); h.clock.advance(650);
  assert.equal(frames.length, 0);
  h.clock.advance(50); assert.equal(frames.length, 1);
});

test("restart during arrival delay cannot redirect the new drive to B1", () => {
  const h = setup(), { routes } = addDriveLifecycle(h);
  h.ctx.enterA5(); h.clock.advance(800); h.ctx.finish(); h.clock.advance(700);
  h.ctx.enterA5(); h.clock.advance(2000);
  assert.deepEqual(routes, []);
  assert.equal(h.ctx.SIM.finished, false);
});

test("arrival transition waits through pause even after the last voice has ended", () => {
  const h = setup(), { routes } = addDriveLifecycle(h);
  h.ctx.enterA5(); h.ctx.finish(); h.clock.advance(600);
  h.ctx.SIM.paused = true; h.clock.advance(3000);
  assert.deepEqual(routes, []);
  h.ctx.SIM.paused = false; h.clock.advance(1500);
  assert.deepEqual(routes, ["B1"]);
});
