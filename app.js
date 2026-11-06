/* Kaimotion Prompter — app logic. Static, no server; everything stays on this device. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const M = window.PrompterMatcher;

  // ---------------------------------------------------------------- settings / storage
  const KEY_SETTINGS = "kprompter.settings.v1";
  const KEY_SCRIPT = "kprompter.script.v1";
  const KEY_POS = "kprompter.pos.v1";
  const DEFAULTS = {
    fontSize: Math.round(Math.min(96, Math.max(34, window.innerWidth / 14))),
    lineHeight: 1.45,
    margin: window.innerWidth < 700 ? 5 : 10,
    readingLine: 33,
    speed: 4,
    font: "sans",
    marker: "both",
    mirror: "none",
    textColor: "#ffffff",
    bgColor: "#000000",
    spokenColor: "#6e6e6e",
    markerColor: "#1c8af9",
    caps: false,
    centerText: false,
    showHearing: true,
    dimSpoken: true,
    mode: "voice",
  };
  const SAMPLE = `Welcome to Kaimotion Prompter.

Press Script to paste your own script, or open a text or Word file.

Choose Voice and press Start. Then just read out loud. The script follows your voice and keeps the line you're reading on the band.

[Notes in square brackets show in yellow and aren't read.]

You can ad-lib, pause, or skip a line. It waits for you, then catches up when you're back on the script.

Tap any word to jump there. Use Mirror when the screen sits under teleprompter glass.

Thanks for watching, and we'll see you in the next video.`;

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: ignore */ }
  }

  const S = Object.assign({}, DEFAULTS, load(KEY_SETTINGS, {}));
  let scriptText = load(KEY_SCRIPT, null);
  if (typeof scriptText !== "string" || !scriptText.trim()) scriptText = SAMPLE;

  // ---------------------------------------------------------------- DOM refs
  const stage = $("stage"), textEl = $("text");
  const toastEl = $("toast"), hearingEl = $("hearing"), hearingText = $("hearingText");

  // ---------------------------------------------------------------- script rendering
  let wordEls = [];      // matchable word spans, in order
  let scriptWords = [];  // normalized form of each matchable word (one entry per matcher token)
  let tokenToEl = [];    // matcher token index -> index in wordEls
  let elFirstToken = []; // wordEls index -> first matcher token index

  function renderScript() {
    textEl.textContent = "";
    wordEls = []; scriptWords = []; tokenToEl = []; elFirstToken = [];
    const paragraphs = scriptText.replace(/\r\n?/g, "\n").split(/\n/);
    for (const para of paragraphs) {
      const p = document.createElement("p");
      // Split into [cue] blocks and plain text.
      const parts = para.split(/(\[[^\]]*\])/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\[[^\]]*\]$/.test(part)) {
          const c = document.createElement("span");
          c.className = "cue";
          c.textContent = part;
          p.appendChild(c);
          continue;
        }
        const pieces = part.split(/(\s+)/);
        for (const piece of pieces) {
          if (!piece) continue;
          if (/^\s+$/.test(piece)) { p.appendChild(document.createTextNode(" ")); continue; }
          const tokens = M.tokenize(piece);
          if (!tokens.length) { p.appendChild(document.createTextNode(piece)); continue; }
          const span = document.createElement("span");
          span.className = "w";
          span.textContent = piece;
          const ei = wordEls.length;
          span.dataset.i = ei;
          wordEls.push(span);
          elFirstToken.push(scriptWords.length);
          for (const t of tokens) { scriptWords.push(t); tokenToEl.push(ei); }
          p.appendChild(span);
        }
      }
      textEl.appendChild(p);
    }
    if (!wordEls.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No script yet. Press Script to add one.";
      textEl.appendChild(p);
    }
    saidUpTo = 0;
    curEl = null;
    layoutDirty = true;
  }

  // ---------------------------------------------------------------- apply settings
  function applySettings() {
    const r = document.documentElement.style;
    r.setProperty("--font-size", S.fontSize + "px");
    r.setProperty("--line-height", S.lineHeight);
    r.setProperty("--margin", S.margin + "%");
    r.setProperty("--text", S.textColor);
    r.setProperty("--bg", S.bgColor);
    r.setProperty("--spoken", S.spokenColor);
    r.setProperty("--marker", S.markerColor);
    updateReadingPx();
    textEl.className = `font-${S.font}` + (S.caps ? " caps" : "") + (S.centerText ? " center" : "") + (S.dimSpoken ? " dim" : "");
    stage.className = `marker-${S.marker}` + (S.mirror !== "none" ? ` mirror-${S.mirror}` : "");
    $("mirrorLabel").textContent = "Mirror: " + ({ none: "off", h: "left-right", v: "upside down", both: "both" })[S.mirror];
    $("btnMirror").classList.toggle("primary", S.mirror !== "none");
    $("speedVal").textContent = S.speed;
    document.body.classList.toggle("mode-voice", S.mode === "voice");
    document.body.classList.toggle("mode-auto", S.mode === "auto");
    $("modeVoice").setAttribute("aria-pressed", S.mode === "voice");
    $("modeAuto").setAttribute("aria-pressed", S.mode === "auto");
    document.querySelector('meta[name="theme-color"]').content = S.bgColor;
    syncSettingsForm();
    updateHearingVisibility();
    layoutDirty = true;
    save(KEY_SETTINGS, S);
  }
  function updateReadingPx() {
    document.documentElement.style.setProperty("--reading-px", Math.round(window.innerHeight * S.readingLine / 100) + "px");
  }

  const FORM_KEYS = ["fontSize", "lineHeight", "margin", "readingLine", "speed", "font", "marker", "mirror",
    "textColor", "bgColor", "spokenColor", "markerColor", "caps", "centerText", "showHearing", "dimSpoken"];
  const FORMAT = { fontSize: (v) => v + " px", lineHeight: (v) => Number(v).toFixed(2), margin: (v) => v + "%", readingLine: (v) => v + "% down", speed: (v) => v };
  function syncSettingsForm() {
    for (const k of FORM_KEYS) {
      const el = $(k);
      if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k];
      const out = document.querySelector(`output[data-for="${k}"]`);
      if (out) out.textContent = FORMAT[k] ? FORMAT[k](S[k]) : S[k];
    }
  }
  for (const k of FORM_KEYS) {
    const el = $(k);
    el.addEventListener("input", () => {
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "range") v = Number(v);
      setSetting(k, v);
    });
  }
  function setSetting(k, v) {
    const anchor = currentAnchorEl();
    S[k] = v;
    applySettings();
    // Keep the same spot on the reading line after the text reflows.
    if (anchor && ["fontSize", "lineHeight", "margin", "readingLine", "font", "caps", "centerText"].includes(k)) {
      measure();
      offset = target = offsetFor(anchor);
    }
  }

  // ---------------------------------------------------------------- scrolling
  let offset = 0;        // current scroll (px the text has moved up)
  let target = 0;        // where we're easing toward
  let layoutDirty = true;
  let maxOffset = 0;
  let lineH = 64;
  let running = false;   // Start pressed (voice listening or auto-scrolling)
  let lastFrame = 0;
  let manualUntil = 0;   // while the user drags/wheels, voice follow doesn't fight them

  function measure() {
    lineH = S.fontSize * S.lineHeight;
    const last = textEl.lastElementChild;
    const contentBottom = last ? last.offsetTop + last.offsetHeight : 0;
    maxOffset = Math.max(0, contentBottom - readingPx() - lineH);
    layoutDirty = false;
  }
  function readingPx() { return Math.round(window.innerHeight * S.readingLine / 100); }
  /** Scroll offset that puts this element's line inside the reading band. */
  function offsetFor(el) {
    const center = el.offsetTop + el.offsetHeight / 2;
    return clamp(center - (readingPx() + lineH / 2), 0, maxOffset);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  /** The word span currently sitting on the reading line. */
  function currentAnchorEl() {
    if (!wordEls.length) return null;
    const y = offset + readingPx() + lineH / 2;
    // binary search by offsetTop
    let lo = 0, hi = wordEls.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = wordEls[mid];
      if (el.offsetTop <= y - lineH / 2 + 2) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // first word on that line
    const top = wordEls[best].offsetTop;
    while (best > 0 && Math.abs(wordEls[best - 1].offsetTop - top) < 2) best--;
    return wordEls[best];
  }

  function frame(t) {
    const dt = Math.min(0.1, lastFrame ? (t - lastFrame) / 1000 : 0);
    lastFrame = t;
    if (layoutDirty) measure();
    if (running && S.mode === "auto" && performance.now() > manualUntil) {
      target = clamp(target + autoPxPerSec() * dt, 0, maxOffset);
      offset = target;
      if (target >= maxOffset && maxOffset > 0) stop("end");
    } else {
      const k = 1 - Math.exp(-dt / 0.28); // smooth ease, about a quarter second
      offset += (target - offset) * k;
      if (Math.abs(target - offset) < 0.3) offset = target;
    }
    textEl.style.transform = `translate3d(0, ${-Math.round(offset * 10) / 10}px, 0)`;
    requestAnimationFrame(frame);
  }
  function autoPxPerSec() { return S.speed * lineH * 0.1; } // speed 4 = about 0.4 lines a second

  function nudge(lines) {
    target = clamp(target + lines * lineH, 0, maxOffset);
    if (S.mode === "auto") offset = target;
    afterManualMove();
  }
  /** After the user moves the script by hand, voice follow continues from the new spot. */
  let manualTimer = 0;
  function afterManualMove() {
    clearTimeout(manualTimer);
    manualTimer = setTimeout(() => {
      const el = currentAnchorEl();
      if (el) setVoicePos(elFirstToken[+el.dataset.i], false);
      savePos();
    }, 350);
  }

  // ---------------------------------------------------------------- voice position
  let pos = 0;           // matcher token index of the next word the speaker should say
  let saidUpTo = 0;      // number of wordEls marked as said
  let curEl = null;

  function setVoicePos(p, scroll) {
    pos = clamp(p, 0, scriptWords.length);
    listener.resetHeard();
    paintSaid();
    if (scroll) scrollToPos();
  }
  function paintSaid() {
    const n = pos >= scriptWords.length ? wordEls.length : (tokenToEl[pos] ?? wordEls.length);
    if (n > saidUpTo) for (let i = saidUpTo; i < n; i++) wordEls[i].classList.add("said");
    else for (let i = n; i < saidUpTo; i++) wordEls[i].classList.remove("said");
    saidUpTo = n;
    const next = wordEls[Math.min(n, wordEls.length - 1)] || null;
    if (curEl !== next) {
      if (curEl) curEl.classList.remove("cur");
      curEl = S.mode === "voice" && running ? next : null;
      if (curEl) curEl.classList.add("cur");
    }
  }
  function scrollToPos() {
    if (!wordEls.length) return;
    const i = pos >= scriptWords.length ? wordEls.length - 1 : tokenToEl[pos];
    if (layoutDirty) measure();
    target = offsetFor(wordEls[i]);
  }
  let posSaveTimer = 0;
  function savePos() {
    clearTimeout(posSaveTimer);
    posSaveTimer = setTimeout(() => save(KEY_POS, { pos, offset: target, len: scriptText.length }), 500);
  }

  function onHeard(words) {
    if (S.mode !== "voice" || !running) return;
    if (performance.now() < manualUntil) return;
    const r = M.locate(scriptWords, words, pos);
    if (r.moved) {
      if (window.__prompterDebug) console.log(`move ${pos} -> ${r.pos} score=${r.score.toFixed(2)} heard="${words.slice(-10).join(" ")}"`);
      pos = r.pos;
      paintSaid();
      scrollToPos();
      savePos();
      if (pos >= scriptWords.length) toast("End of script.", "", 2500);
    }
  }

  // ---------------------------------------------------------------- speech recognition
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listener = createListener();

  function createListener() {
    let rec = null, wanted = false, startedAt = 0, quickFails = 0, restartTimer = 0;
    let carried = [];      // words heard in earlier recognition sessions (recent only)
    let ignore = 0;        // words of the current session to ignore (heard before a jump)
    let session = [];      // words heard in the current session
    let lastWordsAt = 0;

    function heardWords() { return carried.concat(session.slice(ignore)); }

    function build() {
      const r = new Recognition();
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => { startedAt = Date.now(); setHearing("Listening…", "idle"); };
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += " " + e.results[i][0].transcript;
        const words = M.tokenize(text);
        if (words.length < ignore) ignore = words.length; // recognizer revised itself
        session = words;
        lastWordsAt = Date.now();
        quickFails = 0;
        const shown = text.trim().split(/\s+/).slice(-12).join(" ");
        setHearing(shown || "Listening…", "talking");
        onHeard(heardWords());
      };
      r.onerror = (e) => {
        const err = e.error;
        if (err === "no-speech" || err === "aborted") return; // normal; we restart on end
        if (err === "not-allowed" || err === "service-not-allowed") {
          wanted = false;
          stop("mic");
          toast("The microphone is blocked. Allow the microphone for this site in your browser settings, then press Start again. (On iPhone/iPad, Siri & Dictation must be turned on.)", "error", 9000);
          setHearing("Microphone blocked", "error");
          return;
        }
        if (err === "audio-capture") {
          toast("No microphone found. Plug one in or check your sound settings.", "error", 7000);
          setHearing("No microphone", "error");
          return;
        }
        if (err === "network") {
          toast("Voice follow needs an internet connection in this browser. You can use Auto mode offline.", "warn", 7000);
          setHearing("No connection, retrying…", "error");
          return;
        }
        if (err === "language-not-supported") {
          toast("This browser can't recognize English speech.", "error", 7000);
          wanted = false; stop("mic");
        }
      };
      r.onend = () => {
        // Keep the words from this session so matching stays smooth across restarts.
        carried = carried.concat(session.slice(ignore)).slice(-12);
        session = []; ignore = 0;
        if (!wanted) { setHearing("Paused", "idle"); return; }
        const quick = Date.now() - startedAt < 1500;
        quickFails = quick ? quickFails + 1 : 0;
        const delay = quickFails > 3 ? Math.min(4000, 400 * quickFails) : 60;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRec, delay);
      };
      return r;
    }
    function startRec() {
      if (!wanted) return;
      try {
        rec = build();
        // Automated tests can feed a recording instead of the microphone (Chrome supports start(track)).
        if (window.__prompterTestTrack) rec.start(window.__prompterTestTrack); else rec.start();
      } catch (err) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRec, 500);
      }
    }
    // Show "Listening…" again after a few seconds of silence.
    setInterval(() => {
      if (wanted && lastWordsAt && Date.now() - lastWordsAt > 2500 && hearingEl.classList.contains("talking")) {
        hearingEl.classList.remove("talking");
      }
    }, 1000);

    return {
      supported: !!Recognition,
      start() { if (!Recognition) return false; wanted = true; quickFails = 0; startRec(); return true; },
      stop() { wanted = false; clearTimeout(restartTimer); try { rec && rec.abort(); } catch { } rec = null; },
      resetHeard() { carried = []; ignore = session.length; },
      /** For automated tests: feed text as if the recognizer heard it. */
      _feed(text) { session = M.tokenize(text); onHeard(heardWords()); },
    };
  }

  function setHearing(text, state) {
    hearingText.textContent = "‎" + text + "‎"; // keep punctuation in place in the RTL-ellipsis box
    hearingEl.classList.remove("idle", "talking", "error");
    if (state) hearingEl.classList.add(state);
  }
  function updateHearingVisibility() {
    hearingEl.hidden = !(S.showHearing && S.mode === "voice" && running);
  }

  // ---------------------------------------------------------------- start / stop
  async function start() {
    if (!wordEls.length) { openPanel("scriptPanel"); return; }
    if (S.mode === "voice") {
      if (!listener.supported) {
        toast("This browser doesn't have speech recognition, so it can't follow your voice. Use Chrome, Edge or Safari, or switch to Auto mode.", "warn", 9000);
        return;
      }
      // Start from the line on the reading band.
      const el = currentAnchorEl();
      if (el && !(tokenToEl[pos] !== undefined && Math.abs(offsetFor(wordEls[tokenToEl[pos]]) - target) < lineH)) {
        pos = elFirstToken[+el.dataset.i];
      }
      running = true;
      listener.start();
      setHearing("Starting microphone…", "idle");
      paintSaid();
    } else {
      if (target >= maxOffset - 1) { target = offset = 0; }
      running = true;
    }
    document.body.classList.add("running");
    $("playLabel").textContent = S.mode === "voice" ? "Stop" : "Pause";
    updateHearingVisibility();
    keepAwake(true);
    scheduleHideBar();
  }
  function stop(reason) {
    running = false;
    listener.stop();
    document.body.classList.remove("running");
    $("playLabel").textContent = "Start";
    updateHearingVisibility();
    paintSaid();
    keepAwake(false);
    showBar();
    savePos();
  }
  function toggle() { running ? stop() : start(); }

  // ---------------------------------------------------------------- wake lock
  let wakeLock = null, wantAwake = false;
  async function keepAwake(on) {
    wantAwake = on;
    try {
      if (on && "wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release(); wakeLock = null;
      }
    } catch { /* not allowed right now; fine */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wantAwake) keepAwake(true);
  });

  // ---------------------------------------------------------------- toolbar auto-hide
  let hideTimer = 0;
  function showBar() {
    document.body.classList.remove("bar-hidden");
    scheduleHideBar();
  }
  function scheduleHideBar() {
    clearTimeout(hideTimer);
    if (!running) return;
    hideTimer = setTimeout(() => {
      if (running && !document.querySelector(".panel:not([hidden])") && !$("toolbar").matches(":hover")) document.body.classList.add("bar-hidden");
    }, 3000);
  }
  document.addEventListener("mousemove", (e) => { if (e.movementX || e.movementY) showBar(); });
  $("showBar").addEventListener("click", showBar);

  // ---------------------------------------------------------------- pointer: tap to jump, drag to scroll
  const flipV = () => S.mirror === "v" || S.mirror === "both";
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, startOffset: target, moved: false, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 8 && Math.abs(e.clientX - drag.x) < 8) return;
    drag.moved = true;
    manualUntil = performance.now() + 400;
    target = offset = clamp(drag.startOffset - dy * (flipV() ? -1 : 1), 0, maxOffset);
  });
  stage.addEventListener("pointerup", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) { afterManualMove(); return; }
    // Tap: jump to the word under the finger.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const w = hit && hit.closest && hit.closest(".w");
    if (w) jumpToEl(w);
    else showBar();
  });
  stage.addEventListener("pointercancel", () => { drag = null; });
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    manualUntil = performance.now() + 400;
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    target = offset = clamp(target + dy * (flipV() ? -1 : 1), 0, maxOffset);
    afterManualMove();
  }, { passive: false });

  function jumpToEl(el) {
    const i = +el.dataset.i;
    pos = elFirstToken[i];
    listener.resetHeard();
    paintSaid();
    target = offsetFor(el);
    if (S.mode === "auto") offset = target; // auto mode jumps instantly so speed stays steady
    savePos();
  }

  // ---------------------------------------------------------------- keyboard
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input" || tag === "select") {
      if (e.key === "Escape") closePanels();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const panelOpen = document.querySelector(".panel:not([hidden])");
    if (panelOpen) { if (e.key === "Escape") closePanels(); return; }
    let handled = true;
    switch (e.key) {
      case " ": case "Spacebar": toggle(); break;
      case "ArrowDown": nudge(1); break;
      case "ArrowUp": nudge(-1); break;
      case "PageDown": nudge(Math.max(1, Math.floor(window.innerHeight * 0.6 / lineH))); break;
      case "PageUp": nudge(-Math.max(1, Math.floor(window.innerHeight * 0.6 / lineH))); break;
      case "ArrowRight": changeSpeed(1); break;
      case "ArrowLeft": changeSpeed(-1); break;
      case "Home": goTop(); break;
      case "End": target = maxOffset; afterManualMove(); break;
      case "m": case "M": cycleMirror(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "+": case "=": changeSize(4); break;
      case "-": case "_": changeSize(-4); break;
      case "Escape": if (running) stop(); else handled = false; break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  function changeSpeed(d) {
    setSetting("speed", clamp(S.speed + d, 1, 20));
    toast(`Speed ${S.speed}`, "", 900);
  }
  function changeSize(d) { setSetting("fontSize", clamp(S.fontSize + d, 20, 200)); }
  function cycleMirror() {
    const order = ["none", "h", "v", "both"];
    setSetting("mirror", order[(order.indexOf(S.mirror) + 1) % order.length]);
    toast($("mirrorLabel").textContent, "", 1200);
  }
  function goTop() {
    target = 0;
    if (S.mode === "auto") offset = 0;
    setVoicePos(0, false);
    savePos();
  }

  // ---------------------------------------------------------------- fullscreen
  const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (!canFullscreen) $("btnFull").hidden = true;
  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (canFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch?.(() => { });
  }

  // ---------------------------------------------------------------- panels
  function openPanel(id) {
    closePanels();
    $(id).hidden = false;
    showBar();
    if (id === "scriptPanel") { const ta = $("scriptInput"); ta.value = scriptText === SAMPLE ? "" : scriptText; ta.focus(); }
  }
  function closePanels() {
    for (const p of document.querySelectorAll(".panel")) {
      if (!p.hidden && p.id === "scriptPanel") commitScript();
      p.hidden = true;
    }
  }
  function commitScript() {
    const v = $("scriptInput").value.replace(/\s+$/, "");
    const next = v.trim() ? v : SAMPLE;
    if (next === scriptText) return;
    const wasRunning = running;
    if (running) stop();
    scriptText = next;
    save(KEY_SCRIPT, next === SAMPLE ? "" : next);
    renderScript();
    measure();
    pos = 0; offset = target = 0;
    paintSaid();
    savePos();
    if (wasRunning) toast("Script updated. Press Start when you're ready.", "", 2500);
  }
  for (const p of document.querySelectorAll(".panel")) {
    p.addEventListener("click", (e) => { if (e.target === p || e.target.closest("[data-close]")) closePanels(); });
  }
  $("btnScript").addEventListener("click", () => openPanel("scriptPanel"));
  $("btnSettings").addEventListener("click", () => openPanel("settingsPanel"));
  $("btnHelp").addEventListener("click", () => openPanel("helpPanel"));
  $("btnScriptDone").addEventListener("click", closePanels);
  $("btnClear").addEventListener("click", () => { $("scriptInput").value = ""; $("scriptInput").focus(); });
  $("btnReset").addEventListener("click", () => {
    const mode = S.mode;
    Object.assign(S, DEFAULTS, { mode });
    applySettings();
    measure();
    scrollToPos();
  });

  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) await openFile(file);
  });
  async function openFile(file) {
    try {
      let text;
      if (/\.docx$/i.test(file.name)) text = await window.docxToText(await file.arrayBuffer());
      else if (/\.doc$/i.test(file.name)) throw new Error("Old .doc files can't be opened. In Word, use Save As → Word Document (.docx) or Plain Text (.txt).");
      else text = await file.text();
      $("scriptInput").value = text;
      toast(`Opened ${file.name}`, "", 2000);
    } catch (err) {
      toast(err.message || "Couldn't open that file.", "error", 7000);
    }
  }
  // Drag a file onto the window.
  window.addEventListener("dragover", (e) => { e.preventDefault(); });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (!file) return;
    openPanel("scriptPanel");
    await openFile(file);
  });

  // ---------------------------------------------------------------- toolbar buttons
  $("btnPlay").addEventListener("click", toggle);
  $("modeVoice").addEventListener("click", () => setMode("voice"));
  $("modeAuto").addEventListener("click", () => setMode("auto"));
  function setMode(m) {
    if (S.mode === m) return;
    const wasRunning = running;
    if (running) stop();
    S.mode = m;
    applySettings();
    if (m === "voice") { const el = currentAnchorEl(); if (el) setVoicePos(elFirstToken[+el.dataset.i], false); }
    if (!listener.supported && m === "voice") {
      toast("This browser doesn't have speech recognition. Voice follow works in Chrome, Edge and Safari. Auto mode works everywhere.", "warn", 8000);
    }
    if (wasRunning) start();
  }
  $("speedDown").addEventListener("click", () => changeSpeed(-1));
  $("speedUp").addEventListener("click", () => changeSpeed(1));
  $("sizeDown").addEventListener("click", () => changeSize(-4));
  $("sizeUp").addEventListener("click", () => changeSize(4));
  $("btnMirror").addEventListener("click", cycleMirror);
  $("btnTop").addEventListener("click", goTop);
  $("btnFull").addEventListener("click", toggleFullscreen);
  // Buttons shouldn't keep keyboard focus, or Space would "click" them instead of play/pause.
  for (const b of document.querySelectorAll("#toolbar button")) b.addEventListener("mouseup", () => b.blur());

  // ---------------------------------------------------------------- toast
  let toastTimer = 0;
  function toast(msg, kind, ms) {
    toastEl.textContent = msg;
    toastEl.className = kind || "";
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 3000);
  }
  toastEl.addEventListener("click", () => { toastEl.hidden = true; });

  // ---------------------------------------------------------------- resize
  window.addEventListener("resize", () => {
    const anchor = currentAnchorEl();
    updateReadingPx();
    measure();
    if (anchor) offset = target = offsetFor(anchor);
  });

  // ---------------------------------------------------------------- install / offline
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => { });
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("installHint").innerHTML = isIOS
    ? "<b>Add to Home Screen:</b> tap Share, then “Add to Home Screen”. It then opens full screen like an app."
    : "<b>Install:</b> in Chrome or Edge, use the install icon in the address bar (or menu → Install / Add to Home screen).";

  // ---------------------------------------------------------------- boot
  renderScript();
  applySettings();
  measure();
  const savedPos = load(KEY_POS, null);
  if (savedPos && savedPos.len === scriptText.length) {
    pos = clamp(savedPos.pos | 0, 0, scriptWords.length);
    offset = target = clamp(savedPos.offset || 0, 0, maxOffset);
    paintSaid();
  }
  if (!listener.supported && S.mode === "voice") {
    setTimeout(() => toast("This browser can't follow your voice (no speech recognition). Use Chrome, Edge or Safari, or use Auto mode.", "warn", 8000), 400);
  }
  requestAnimationFrame(frame);

  // Test hook (used by automated tests only).
  window.__prompter = {
    feed: (t) => listener._feed(t), get pos() { return pos; }, get offset() { return offset; }, get target() { return target; },
    words: () => scriptWords.slice(), setRunning(v) { running = v; }, settings: S,
  };
})();
