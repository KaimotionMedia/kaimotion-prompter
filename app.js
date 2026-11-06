/* Kaimotion Prompter — app logic. Static, no server; everything stays on this device. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const M = window.PrompterMatcher;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  // ---------------------------------------------------------------- settings / storage
  const KEY_SETTINGS = "kprompter.settings.v1";
  const KEY_LIB = "kprompter.library.v1";
  const KEY_OLD_SCRIPT = "kprompter.script.v1";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEFAULTS = {
    fontSize: Math.round(clamp(Math.min(window.innerWidth / 16, window.innerHeight / 7.5), 30, 96)),
    lineHeight: 1.4,
    margin: window.innerWidth < 1000 ? 5 : 10,
    readingLine: 2,
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
    lockLandscape: true,
    markMisses: true,
    fumbleSecs: 5,
    fumbleOpacity: 10,
    mode: "voice",
    lang: "auto",
  };
  const SAMPLE = `Welcome to Kaimotion Prompter.

Press Edit to write or paste your own script, or import a text or Word file.

Choose Voice and press Start. Then just read out loud. The script follows your voice and keeps the line you're reading on the band.

[Notes in square brackets show in yellow and aren't read.]

You can ad-lib, pause, or skip a line. It waits for you, then catches up when you're back on the script.

Tap any word to jump there. Double-tap a word to edit the script right there. Use Mirror when the screen sits under teleprompter glass.

[ES]
También funciona en español. Una línea con ES entre corchetes cambia el idioma de escucha.

[EN]
Thanks for watching, and we'll see you in the next video.`;

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / full: ignore */ }
  }

  const S = Object.assign({}, DEFAULTS, load(KEY_SETTINGS, {}));
  // v2: the reading line moved to the top of the screen (it used to sit a third of the way down).
  if (S.settingsVersion !== 2) { S.readingLine = DEFAULTS.readingLine; S.settingsVersion = 2; }

  // ---------------------------------------------------------------- script library (saved on this device)
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let lib = load(KEY_LIB, null);
  if (!lib || !Array.isArray(lib.scripts) || !lib.scripts.length) {
    lib = { scripts: [], currentId: null };
    const old = load(KEY_OLD_SCRIPT, null);
    if (typeof old === "string" && old.trim()) lib.scripts.push({ id: newId(), name: "My script", text: old, posChar: 0, updated: Date.now() });
    lib.scripts.push({ id: newId(), name: "Welcome (sample)", text: SAMPLE, posChar: 0, updated: Date.now() });
    lib.currentId = lib.scripts[0].id;
    save(KEY_LIB, lib);
  }
  function cur() { return lib.scripts.find((s) => s.id === lib.currentId) || lib.scripts[0]; }
  let libTimer = 0;
  function saveLib(now) {
    clearTimeout(libTimer);
    if (now) save(KEY_LIB, lib); else libTimer = setTimeout(() => save(KEY_LIB, lib), 300);
  }
  const cleanText = (t) => String(t).replace(/\r\n?/g, "\n");

  // ---------------------------------------------------------------- DOM refs
  const stage = $("stage"), textEl = $("text");
  const toastEl = $("toast"), hearingEl = $("hearing"), hearingText = $("hearingText");

  // ---------------------------------------------------------------- script rendering
  let wordEls = [];      // matchable word spans, in order
  let scriptWords = [];  // normalized matcher tokens
  let tokenToEl = [];    // matcher token index -> index in wordEls
  let elFirstToken = []; // wordEls index -> first matcher token index
  let tokenLang = [];    // matcher token index -> "es" / "en" from an [ES]/[EN] tag, or null
  let wordPara = [];     // wordEls index -> paragraph number
  let paraFirstEl = [];  // paragraph number -> first wordEls index in it
  let detectedFamily = "en";
  const LANG_TAG = /^\[\s*(es|esp|espa[ñn]ol|spanish|en|eng|english|ingl[ée]s)\s*\]$/i;

  function renderScript() {
    const text = cleanText(cur().text);
    textEl.textContent = "";
    wordEls = []; scriptWords = []; tokenToEl = []; elFirstToken = []; tokenLang = []; wordPara = []; paraFirstEl = [];
    let para = -1;
    let section = null;
    let lineStart = 0;
    let plain = "", untagged = "";
    for (const line of text.split("\n")) {
      if (!line.trim()) { lineStart += line.length + 1; continue; } // blank lines: the paragraph gap does it
      const p = document.createElement("p");
      para++;
      let off = lineStart;
      for (const part of line.split(/(\[[^\]]*\])/)) {
        if (!part) continue;
        if (/^\[[^\]]*\]$/.test(part)) {
          const c = document.createElement("span");
          const tag = LANG_TAG.exec(part);
          if (tag) {
            section = /^(es|esp|espa)/i.test(tag[1]) || /spanish/i.test(tag[1]) ? "es" : "en";
            c.className = "cue lang";
          } else c.className = "cue";
          c.textContent = part;
          p.appendChild(c);
          off += part.length;
          continue;
        }
        plain += part + "\n";
        if (!section) untagged += part + "\n";
        for (const piece of part.split(/(\s+)/)) {
          if (!piece) continue;
          if (/^\s+$/.test(piece)) { p.appendChild(document.createTextNode(" ")); off += piece.length; continue; }
          const tokens = M.tokenize(piece);
          if (!tokens.length) { p.appendChild(document.createTextNode(piece)); off += piece.length; continue; }
          const span = document.createElement("span");
          span.className = "w";
          span.textContent = piece;
          const ei = wordEls.length;
          span.dataset.i = ei;
          span.dataset.c = off;
          wordEls.push(span);
          wordPara.push(para);
          if (paraFirstEl[para] === undefined) paraFirstEl[para] = ei;
          elFirstToken.push(scriptWords.length);
          for (const t of tokens) { scriptWords.push(t); tokenToEl.push(ei); tokenLang.push(section); }
          p.appendChild(span);
          off += piece.length;
        }
      }
      textEl.appendChild(p);
      lineStart += line.length + 1;
    }
    if (!wordEls.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "This script is empty. Press Edit to write one.";
      textEl.appendChild(p);
    }
    // Auto language comes from the text that has no [ES]/[EN] tag (or from everything if all is tagged).
    detectedFamily = M.detectLanguage(untagged.trim() ? untagged : plain);
    updateAutoLabel();
    saidUpTo = 0;
    curEl = null;
    layoutDirty = true;
  }

  /** Character offset in the script of the word at the voice position. */
  function charOfPos() {
    if (!wordEls.length) return 0;
    if (pos >= scriptWords.length) return cleanText(cur().text).length;
    return +wordEls[tokenToEl[pos]].dataset.c;
  }
  /** Token index of the word at (or right after) a character offset. */
  function posFromChar(c) {
    if (!wordEls.length) return 0;
    let lo = 0, hi = wordEls.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (+wordEls[mid].dataset.c <= c) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return 0;
    const el = wordEls[best];
    if (c < +el.dataset.c + el.textContent.length) return elFirstToken[best];
    return best + 1 < wordEls.length ? elFirstToken[best + 1] : scriptWords.length;
  }

  /** Show the current script in the prompter, positioned at a character offset. */
  function loadCurrent(atChar) {
    renderScript();
    measure();
    pos = posFromChar(atChar || 0);
    listener.resetHeard();
    paintSaid();
    if (wordEls.length) {
      const i = pos >= scriptWords.length ? wordEls.length - 1 : tokenToEl[pos];
      offset = target = offsetFor(wordEls[i]);
    } else offset = target = 0;
    updateListenerLang();
  }

  // ---------------------------------------------------------------- language
  const LANG_NAMES = { "en-US": "English", "es-US": "Español (Latinoamérica)", "es-MX": "Español (México)", "es-EC": "Español (Ecuador)" };
  const langFallback = {};
  function resolveFamily(fam) {
    if (S.lang !== "auto" && S.lang.startsWith(fam)) return S.lang;
    return fam === "es" ? "es-US" : "en-US";
  }
  function defaultFamily() { return S.lang === "auto" ? detectedFamily : S.lang.slice(0, 2); }
  function langAt(p) {
    const fam = (tokenLang.length ? tokenLang[Math.min(p, tokenLang.length - 1)] : null) || defaultFamily();
    const l = resolveFamily(fam);
    return langFallback[l] || l;
  }
  function updateListenerLang() { listener.setLang(langAt(pos)); }
  function updateAutoLabel() {
    const opt = $("lang").querySelector('option[value="auto"]');
    if (opt) opt.textContent = "Auto: " + (detectedFamily === "es" ? "Español" : "English");
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
    textEl.className = `font-${S.font}` + (S.caps ? " caps" : "") + (S.centerText ? " center" : "") + (S.dimSpoken ? " dim" : "") + (S.markMisses ? " marks" : "");
    stage.className = `marker-${S.marker}` + (S.mirror !== "none" ? ` mirror-${S.mirror}` : "");
    $("mirrorLabel").textContent = "Mirror: " + ({ none: "off", h: "left-right", v: "upside down", both: "both" })[S.mirror];
    $("btnMirror").classList.toggle("primary", S.mirror !== "none");
    $("speedVal").textContent = S.speed;
    document.body.classList.toggle("mode-voice", S.mode === "voice");
    document.body.classList.toggle("mode-auto", S.mode === "auto");
    $("modeVoice").setAttribute("aria-pressed", S.mode === "voice");
    $("modeAuto").setAttribute("aria-pressed", S.mode === "auto");
    document.querySelector('meta[name="theme-color"]').content = S.bgColor;
    r.setProperty("--fumble-opacity", S.fumbleOpacity / 100);
    // Controls sit on the side away from the reading line (it's at the bottom when flipped upside down).
    document.body.classList.toggle("bar-top", S.mirror === "v" || S.mirror === "both");
    updateBarH();
    syncSettingsForm();
    updateHearingVisibility();
    layoutDirty = true;
    save(KEY_SETTINGS, S);
  }
  function updateBarH() {
    document.documentElement.style.setProperty("--bar-h", $("toolbar").offsetHeight + "px");
  }
  function updateReadingPx() {
    document.documentElement.style.setProperty("--reading-px", readingPx() + "px");
  }

  const FORM_KEYS = ["fontSize", "lineHeight", "margin", "readingLine", "speed", "font", "marker", "mirror",
    "textColor", "bgColor", "spokenColor", "markerColor", "caps", "centerText", "showHearing", "dimSpoken",
    "lockLandscape", "lang", "markMisses", "fumbleSecs", "fumbleOpacity"];
  const FORMAT = {
    fontSize: (v) => v + " px", lineHeight: (v) => Number(v).toFixed(2), margin: (v) => v + "%",
    readingLine: (v) => (v <= 2 ? "top" : v + "% down"), speed: (v) => v,
    fumbleSecs: (v) => (v ? v + " s" : "off"), fumbleOpacity: (v) => v + "%",
  };
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
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "range") v = Number(v);
      setSetting(k, v);
      if (el.tagName === "SELECT") el.blur();
    });
  }
  function setSetting(k, v) {
    const anchor = currentAnchorEl();
    S[k] = v;
    applySettings();
    if (k === "lang") updateListenerLang();
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
  /** The first word on the line currently sitting on the reading band. */
  function currentAnchorEl() {
    if (!wordEls.length) return null;
    const y = offset + readingPx() + lineH / 2;
    let lo = 0, hi = wordEls.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wordEls[mid].offsetTop <= y - lineH / 2 + 2) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
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
    if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } // the browser must never scroll the stage itself
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
    resetFumble();
    paintSaid();
    updateListenerLang();
    if (scroll) scrollToPos();
  }
  function paintSaid() {
    const n = pos >= scriptWords.length ? wordEls.length : (tokenToEl[pos] ?? wordEls.length);
    if (n > saidUpTo) for (let i = saidUpTo; i < n; i++) wordEls[i].classList.add("said");
    else for (let i = n; i < saidUpTo; i++) wordEls[i].classList.remove("said");
    saidUpTo = n;
    const next = wordEls[Math.min(n, wordEls.length - 1)] || null;
    const want = S.mode === "voice" && running ? next : null;
    if (curEl !== want) {
      if (curEl) curEl.classList.remove("cur");
      curEl = want;
      if (curEl) curEl.classList.add("cur");
    }
  }
  function scrollToPos() {
    if (!wordEls.length) return;
    const i = pos >= scriptWords.length ? wordEls.length - 1 : tokenToEl[pos];
    if (layoutDirty) measure();
    target = offsetFor(wordEls[i]);
  }
  function savePos() {
    let c = charOfPos();
    if (S.mode === "auto" && running) { const a = currentAnchorEl(); if (a) c = +a.dataset.c; }
    cur().posChar = c;
    saveLib();
  }

  function onHeard(words, info) {
    if (S.mode !== "voice" || !running) return;
    if (info && info.changed) {
      lastSpeechAt = Date.now();
      fumbleArmed = true;
      if (countdown) hideCountdown();
    }
    if (performance.now() < manualUntil) return;
    const r = M.locate(scriptWords, words, pos);
    const oldPos = pos;
    if (r.moved) {
      if (window.__prompterDebug) console.log(`move ${pos} -> ${r.pos} score=${r.score.toFixed(2)} heard="${words.slice(-10).join(" ")}"`);
      pos = r.pos;
      markCount = listener.count;
      paintSaid();
      scrollToPos();
      savePos();
      updateListenerLang();
      if (pos >= scriptWords.length) toast("End of script.", "", 2500);
    }
    markMisses(words, r.moved && r.pos - oldPos > 3 ? oldPos : -1);
  }

  // ---------------------------------------------------------------- misheard words (red until read clearly)
  function markMisses(words, jumpedFrom) {
    const res = M.judge(scriptWords, words, pos);
    // After a jump ahead (a skipped line), words around the old spot were skipped, not misread:
    // clear marks the matcher may have left there while it was catching up.
    if (jumpedFrom >= 0) {
      const bad = new Set(res.filter((x) => !x.ok).map((x) => tokenToEl[x.j]));
      const a = tokenToEl[Math.max(0, jumpedFrom - 6)], b = pos >= scriptWords.length ? wordEls.length : tokenToEl[pos];
      for (let i = a; i < b; i++) if (!bad.has(i)) wordEls[i].classList.remove("miss");
    }
    for (const { j, ok } of res) {
      const el = wordEls[tokenToEl[j]];
      if (!el) continue;
      el.classList.toggle("miss", !ok);
      if (ok) timerUsed.delete(el);
    }
  }

  // ---------------------------------------------------------------- fumble timer
  // After a fumble (a red word, or words that aren't in the script) the reader goes quiet:
  // a faint countdown appears, then the prompter goes back to the start of that paragraph.
  const fumbleEl = $("fumble");
  let markCount = 0;      // listener word count at the last move / jump
  let lastSpeechAt = 0;
  let fumbleArmed = false; // something was said since the last jump / cancel
  let countdown = null;   // { deadline, el }
  // Each red word starts the timer only once (until it's read clearly), so a name the phone never
  // gets right can't keep sending the reader back.
  const timerUsed = new WeakSet();
  function resetFumble() {
    markCount = listener.count;
    fumbleArmed = false;
    if (countdown) hideCountdown();
  }
  function hideCountdown() { countdown = null; fumbleEl.hidden = true; }
  function fumbleTarget() {
    if (!wordEls.length) return null;
    const curI = pos >= scriptWords.length ? wordEls.length : tokenToEl[pos];
    // A red word already passed in this paragraph (or the one just finished).
    const paras = new Set([wordPara[curI], wordPara[curI - 1]].filter((x) => x !== undefined));
    for (let i = curI - 1; i >= 0 && paras.has(wordPara[i]); i--) {
      if (S.markMisses && wordEls[i].classList.contains("miss") && !timerUsed.has(wordEls[i])) {
        timerUsed.add(wordEls[i]);
        return wordEls[paraFirstEl[wordPara[i]]];
      }
    }
    // Words that didn't match the script since the last move (a short stumble, not a long ad-lib).
    const extra = listener.count - markCount;
    if (curI < wordEls.length && extra >= 2 && extra <= 12) return wordEls[paraFirstEl[wordPara[curI]]];
    return null;
  }
  setInterval(() => {
    if (!running || S.mode !== "voice" || !S.fumbleSecs) { if (countdown) hideCountdown(); return; }
    const now = Date.now();
    if (countdown) {
      const left = countdown.deadline - now;
      if (left <= 0) {
        const el = countdown.el;
        hideCountdown();
        if (window.__prompterDebug) console.log("fumble: back to paragraph start", el.textContent);
        jumpToEl(el);
        return;
      }
      fumbleEl.textContent = Math.ceil(left / 1000);
      return;
    }
    if (!fumbleArmed || now - lastSpeechAt < 1200) return;
    const el = fumbleTarget();
    if (!el) return;
    countdown = { deadline: now + S.fumbleSecs * 1000, el };
    fumbleEl.textContent = S.fumbleSecs;
    fumbleEl.hidden = false;
  }, 200);

  // ---------------------------------------------------------------- speech recognition
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listener = createListener();

  function createListener() {
    let rec = null, wanted = false, startedAt = 0, quickFails = 0, restartTimer = 0;
    let lang = "en-US", switching = false;
    let carried = [];      // words heard in earlier recognition sessions (recent only)
    let ignore = 0;        // words of the current session to ignore (heard before a jump)
    let session = [];      // words heard in the current session
    let lastWordsAt = 0;
    let carriedTotal = 0;  // all words heard in earlier sessions (a running count)
    let lastText = "";

    function heardWords() { return carried.concat(session.slice(ignore)); }
    const langShort = () => (lang.startsWith("es") ? "ES" : "EN");

    function build() {
      const r = new Recognition();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => { startedAt = Date.now(); setHearing(`Listening… (${LANG_NAMES[lang] || lang})`, "idle"); };
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += " " + e.results[i][0].transcript;
        const words = M.tokenize(text);
        if (words.length < ignore) ignore = words.length; // recognizer revised itself
        session = words;
        lastWordsAt = Date.now();
        quickFails = 0;
        const joined = words.join(" ");
        const changed = joined !== lastText;
        lastText = joined;
        const shown = text.trim().split(/\s+/).slice(-12).join(" ");
        setHearing(`${langShort()} · ${shown}`, "talking");
        onHeard(heardWords(), { changed });
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
          const fb = lang.startsWith("es") ? "es-US" : "en-US";
          if (lang !== fb) {
            langFallback[lang] = fb;
            toast(`This browser can't listen in ${LANG_NAMES[lang] || lang}; using ${LANG_NAMES[fb]} instead.`, "warn", 6000);
            lang = fb; // onend restarts with it
          } else {
            toast(`This browser can't recognize ${LANG_NAMES[lang]} speech.`, "error", 7000);
            wanted = false; stop("mic");
          }
        }
      };
      r.onend = () => {
        // Keep the words from this session so matching stays smooth across restarts.
        carried = carried.concat(session.slice(ignore)).slice(-12);
        carriedTotal += session.length;
        session = []; ignore = 0; lastText = "";
        if (!wanted) { setHearing("Paused", "idle"); return; }
        const quick = !switching && Date.now() - startedAt < 1500;
        switching = false;
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
    // Drop the "talking" pulse after a few seconds of silence.
    setInterval(() => {
      if (wanted && lastWordsAt && Date.now() - lastWordsAt > 2500 && hearingEl.classList.contains("talking")) {
        hearingEl.classList.remove("talking");
      }
    }, 1000);

    return {
      supported: !!Recognition,
      get lang() { return lang; },
      /** Running count of words heard (never goes down across restarts). */
      get count() { return carriedTotal + session.length; },
      start() { if (!Recognition) return false; wanted = true; quickFails = 0; startRec(); return true; },
      stop() { wanted = false; clearTimeout(restartTimer); try { rec && rec.abort(); } catch { } rec = null; },
      /** Switch the listening language (restarts the recognizer if it's running). */
      setLang(l) {
        if (l === lang) return;
        lang = l;
        if (window.__prompterDebug) console.log("lang " + l);
        if (wanted && rec) { switching = true; carried = []; try { rec.abort(); } catch { } }
      },
      resetHeard() { carried = []; ignore = session.length; },
      /** For automated tests: feed text as if the recognizer heard it. */
      _feed(text) {
        const words = M.tokenize(text);
        if (words.length < ignore) ignore = words.length;
        const changed = words.join(" ") !== lastText;
        lastText = words.join(" ");
        session = words;
        onHeard(heardWords(), { changed });
      },
      /** For automated tests: end the current recognition session (as after a pause). */
      _endSession() { carried = carried.concat(session.slice(ignore)).slice(-12); carriedTotal += session.length; session = []; ignore = 0; lastText = ""; },
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
  let sidewaysTipShown = false;
  async function start() {
    if (!wordEls.length) { openEditor(0); return; }
    if (S.mode === "voice" && !listener.supported) {
      toast("This browser doesn't have speech recognition, so it can't follow your voice. Use Chrome, Edge or Safari, or switch to Auto mode.", "warn", 9000);
      return;
    }
    landscapeForPrompting();
    if (S.mode === "voice") {
      // Start from the line on the reading band.
      const el = currentAnchorEl();
      if (el && !(tokenToEl[pos] !== undefined && Math.abs(offsetFor(wordEls[tokenToEl[pos]]) - target) < lineH)) {
        pos = elFirstToken[+el.dataset.i];
      }
      running = true;
      resetFumble();
      listener.setLang(langAt(pos));
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
  function stop() {
    running = false;
    listener.stop();
    document.body.classList.remove("running");
    $("playLabel").textContent = "Start";
    updateHearingVisibility();
    paintSaid();
    keepAwake(false);
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch { }
    showBar();
    savePos();
  }
  function toggle() { running ? stop() : start(); }

  /** On phones: go fullscreen and lock to landscape where the browser allows it (Android). */
  function landscapeForPrompting() {
    if (!coarse || !S.lockLandscape) return;
    const lock = () => {
      try {
        const p = screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape");
        if (p && p.catch) p.catch(() => { });
      } catch { }
    };
    const d = document, el = d.documentElement;
    if (canFullscreen && !(d.fullscreenElement || d.webkitFullscreenElement)) {
      try {
        const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (p && p.then) p.then(lock, () => { }); else lock();
      } catch { lock(); }
    } else lock();
    setTimeout(() => {
      if (!sidewaysTipShown && window.innerHeight > window.innerWidth) {
        sidewaysTipShown = true;
        toast("Tip: turn your phone sideways for a wider view.", "", 3500);
      }
    }, 900);
  }

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
      if (running && !document.querySelector(".panel:not([hidden])") && (coarse || !$("toolbar").matches(":hover")) &&
        !$("toolbar").contains(document.activeElement)) document.body.classList.add("bar-hidden");
    }, 4000);
  }
  document.addEventListener("mousemove", (e) => { if (e.movementX || e.movementY) showBar(); });
  $("showBar").addEventListener("click", showBar);
  // Touching the controls keeps them up.
  $("toolbar").addEventListener("pointerdown", showBar);

  // ---------------------------------------------------------------- pointer: tap to jump, double-tap to edit, drag to scroll
  const flipV = () => S.mirror === "v" || S.mirror === "both";
  let drag = null, lastTap = { t: 0, el: null };
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
    // While the countdown shows, a tap cancels it.
    if (countdown) { hideCountdown(); fumbleArmed = false; return; }
    // While the controls are hidden, the first tap only brings them back (it doesn't jump).
    if (document.body.classList.contains("bar-hidden")) { showBar(); return; }
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const w = hit && hit.closest && hit.closest(".w");
    if (!w) { showBar(); return; }
    const now = performance.now();
    if (lastTap.el === w && now - lastTap.t < 400) { lastTap = { t: 0, el: null }; openEditor(+w.dataset.c); return; }
    lastTap = { t: now, el: w };
    jumpToEl(w);
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
    pos = elFirstToken[+el.dataset.i];
    listener.resetHeard();
    resetFumble();
    paintSaid();
    updateListenerLang();
    target = offsetFor(el);
    if (S.mode === "auto") offset = target; // auto mode jumps instantly so speed stays steady
    savePos();
  }

  // ---------------------------------------------------------------- keyboard
  document.addEventListener("keydown", (e) => {
    if (!editorEl.hidden) return; // the editor handles its own keys
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
      case "e": case "E": openEditor(); break;
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
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (canFullscreen) { const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (p && p.catch) p.catch(() => { }); }
    } catch { }
  }

  // ---------------------------------------------------------------- panels (settings, help)
  function openPanel(id) {
    closePanels();
    $(id).hidden = false;
    showBar();
  }
  function closePanels() {
    for (const p of document.querySelectorAll(".panel")) p.hidden = true;
  }
  for (const p of document.querySelectorAll(".panel")) {
    p.addEventListener("click", (e) => { if (e.target === p || e.target.closest("[data-close]")) closePanels(); });
  }
  $("btnSettings").addEventListener("click", () => openPanel("settingsPanel"));
  $("btnHelp").addEventListener("click", () => openPanel("helpPanel"));
  $("btnReset").addEventListener("click", () => {
    const keep = { mode: S.mode, lang: S.lang };
    Object.assign(S, DEFAULTS, keep);
    applySettings();
    measure();
    scrollToPos();
  });

  // ---------------------------------------------------------------- script editor
  const editorEl = $("editor"), ta = $("scriptInput"), edScripts = $("edScripts"), edSaved = $("edSaved");
  let ed = null; // { id, origText, origChar } — the script and spot the editor was opened on

  function fillScriptList() {
    edScripts.textContent = "";
    const sorted = lib.scripts.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const s of sorted) {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.name;
      edScripts.appendChild(o);
    }
    edScripts.value = cur().id;
  }

  function openEditor(atChar) {
    if (running) stop();
    closePanels();
    const s = cur();
    ed = { id: s.id, origText: cleanText(s.text), origChar: atChar == null ? charOfPos() : atChar };
    fillScriptList();
    ta.value = cleanText(s.text);
    histReset();
    edSaved.textContent = "Saved";
    editorEl.hidden = false;
    document.body.classList.add("editing");
    fitEditor();
    placeCaret(ed.origChar);
  }
  function closeEditor() {
    if (editorEl.hidden) return;
    flushSave();
    histCommit();
    const s = cur();
    const text = cleanText(s.text);
    let c;
    if (ed && s.id === ed.id) c = adjustChar(ed.origText, text, ed.origChar);
    else c = s.posChar || 0;
    ta.blur();
    editorEl.hidden = true;
    document.body.classList.remove("editing");
    ed = null;
    loadCurrent(c);
    savePos();
  }

  /** Where a character offset lands after an edit (so the prompter resumes at the same spot). */
  function adjustChar(oldT, newT, c) {
    if (oldT === newT) return c;
    let p = 0;
    const max = Math.min(oldT.length, newT.length);
    while (p < max && oldT.charCodeAt(p) === newT.charCodeAt(p)) p++;
    let q = 0;
    while (q < max - p && oldT.charCodeAt(oldT.length - 1 - q) === newT.charCodeAt(newT.length - 1 - q)) q++;
    if (c <= p) return c;
    if (c >= oldT.length - q) return c + (newT.length - oldT.length);
    return p; // the spot itself was edited: resume at the start of the change
  }

  function placeCaret(c) {
    c = clamp(c || 0, 0, ta.value.length);
    try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
    ta.setSelectionRange(c, c);
    scrollCaretIntoView();
  }
  /** Scroll the text area so the caret sits about a third of the way down. */
  function scrollCaretIntoView() {
    const cs = getComputedStyle(ta);
    const m = document.createElement("div");
    for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingLeft", "paddingRight", "paddingTop", "borderLeftWidth", "borderRightWidth", "boxSizing", "tabSize"]) m.style[p] = cs[p];
    m.style.position = "absolute"; m.style.visibility = "hidden"; m.style.whiteSpace = "pre-wrap"; m.style.overflowWrap = "break-word";
    m.style.width = ta.clientWidth + "px";
    m.textContent = ta.value.slice(0, ta.selectionStart);
    const mark = document.createElement("span"); mark.textContent = "​"; m.appendChild(mark);
    document.body.appendChild(m);
    const top = mark.offsetTop;
    m.remove();
    ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
  }

  // Keep the editor above the on-screen keyboard (phones, landscape especially).
  function fitEditor() {
    if (editorEl.hidden) return;
    const vv = window.visualViewport;
    if (vv) {
      editorEl.style.height = vv.height + "px";
      editorEl.style.top = vv.offsetTop + "px";
    } else { editorEl.style.height = ""; editorEl.style.top = ""; }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitEditor);
    window.visualViewport.addEventListener("scroll", fitEditor);
  }

  // Autosave while typing.
  let saveTimer = 0;
  function scheduleSave() {
    edSaved.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    const s = cur();
    const v = cleanText(ta.value);
    if (!editorEl.hidden && s.text !== v) { s.text = v; s.updated = Date.now(); }
    saveLib(true);
    edSaved.textContent = "Saved";
  }

  // Undo / redo (our own history, so the buttons work on phones too).
  let hist = [], hi = 0, histTimer = 0;
  function histReset() { hist = [{ v: ta.value, s: ta.selectionStart }]; hi = 0; updateUndoButtons(); }
  function histCommit() {
    clearTimeout(histTimer);
    if (hist[hi] && hist[hi].v === ta.value) return;
    hist = hist.slice(0, hi + 1);
    hist.push({ v: ta.value, s: ta.selectionStart });
    if (hist.length > 300) hist.shift();
    hi = hist.length - 1;
    updateUndoButtons();
  }
  function histApply(st) {
    ta.value = st.v;
    ta.setSelectionRange(st.s, st.s);
    scrollCaretIntoView();
    scheduleSave();
    updateUndoButtons();
  }
  function undo() { histCommit(); if (hi > 0) { hi--; histApply(hist[hi]); } }
  function redo() { histCommit(); if (hi < hist.length - 1) { hi++; histApply(hist[hi]); } }
  function updateUndoButtons() {
    $("edUndo").disabled = hi <= 0 && (!hist[hi] || hist[hi].v === ta.value);
    $("edRedo").disabled = hi >= hist.length - 1;
  }
  ta.addEventListener("input", () => {
    clearTimeout(histTimer);
    histTimer = setTimeout(histCommit, 700);
    $("edUndo").disabled = false;
    scheduleSave();
  });
  ta.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); }
    else if (mod && ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); }
    else if (e.key === "Escape") { e.preventDefault(); closeEditor(); }
  });
  editorEl.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target !== ta) { e.preventDefault(); closeEditor(); } });

  function insertText(t) {
    histCommit();
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.focus();
    ta.setRangeText(cleanText(t), s, e, "end");
    histCommit();
    scheduleSave();
  }
  $("edUndo").addEventListener("click", undo);
  $("edRedo").addEventListener("click", redo);
  $("edPaste").addEventListener("click", async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) insertText(t); else toast("The clipboard is empty.", "", 2000);
    } catch {
      toast("This browser didn't allow pasting from the button. Press and hold in the text, then choose Paste (or Ctrl+V).", "warn", 6000);
    }
  });
  $("edDone").addEventListener("click", closeEditor);

  function switchScript(id) {
    flushSave();
    histCommit();
    lib.currentId = id;
    saveLib(true);
    const s = cur();
    ed = { id: s.id, origText: cleanText(s.text), origChar: s.posChar || 0 };
    ta.value = cleanText(s.text);
    histReset();
    fillScriptList();
    placeCaret(ed.origChar);
  }
  edScripts.addEventListener("change", () => switchScript(edScripts.value));
  function addScript(name, text) {
    const s = { id: newId(), name, text: cleanText(text || ""), posChar: 0, updated: Date.now() };
    lib.scripts.push(s);
    saveLib(true);
    return s;
  }
  function uniqueName(base) {
    const names = new Set(lib.scripts.map((s) => s.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }
  $("edNew").addEventListener("click", () => {
    const name = window.prompt("Name for the new script:", uniqueName("New script"));
    if (name == null) return;
    const s = addScript(uniqueName(name.trim() || "New script"), "");
    switchScript(s.id);
  });
  $("edRename").addEventListener("click", () => {
    const s = cur();
    const name = window.prompt("Rename this script:", s.name);
    if (name == null || !name.trim() || name.trim() === s.name) return;
    s.name = uniqueName(name.trim());
    saveLib(true);
    fillScriptList();
  });
  $("edDelete").addEventListener("click", () => {
    const s = cur();
    if (!window.confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    lib.scripts = lib.scripts.filter((x) => x.id !== s.id);
    if (!lib.scripts.length) lib.scripts.push({ id: newId(), name: "New script", text: "", posChar: 0, updated: Date.now() });
    lib.currentId = lib.scripts[0].id;
    saveLib(true);
    const n = cur();
    ed = { id: n.id, origText: cleanText(n.text), origChar: n.posChar || 0 };
    ta.value = cleanText(n.text);
    histReset();
    fillScriptList();
    toast(`Deleted "${s.name}".`, "", 2500);
  });
  $("edExport").addEventListener("click", async () => {
    flushSave();
    const s = cur();
    const fileName = (s.name.replace(/[\\/:*?"<>|]+/g, "").trim() || "script") + ".txt";
    const blob = new Blob([cleanText(s.text).replace(/\n/g, "\r\n")], { type: "text/plain" });
    try {
      const file = new File([blob], fileName, { type: "text/plain" });
      if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: s.name });
        return;
      }
    } catch (err) { if (err && err.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) await importFile(file);
  });
  async function importFile(file) {
    try {
      let text;
      if (/\.docx$/i.test(file.name)) text = await window.docxToText(await file.arrayBuffer());
      else if (/\.doc$/i.test(file.name)) throw new Error("Old .doc files can't be opened. In Word, use Save As → Word Document (.docx) or Plain Text (.txt).");
      else text = await file.text();
      if (editorEl.hidden) openEditor(0);
      const s = addScript(uniqueName(file.name.replace(/\.[^.]+$/, "") || "Imported script"), text);
      switchScript(s.id);
      placeCaret(0);
      toast(`Imported "${s.name}".`, "", 2500);
    } catch (err) {
      toast(err.message || "Couldn't open that file.", "error", 7000);
    }
  }
  // Drag a file onto the window to import it.
  window.addEventListener("dragover", (e) => { e.preventDefault(); });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) await importFile(file);
  });

  // ---------------------------------------------------------------- toolbar buttons
  $("btnEdit").addEventListener("click", () => openEditor());
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

  // ---------------------------------------------------------------- resize / rotate
  window.addEventListener("resize", () => {
    const anchor = currentAnchorEl();
    updateReadingPx();
    updateBarH();
    measure();
    if (anchor) offset = target = offsetFor(anchor);
    fitEditor();
  });

  // ---------------------------------------------------------------- install / offline
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => { });
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("installHint").innerHTML = isIOS
    ? "<b>Add to Home Screen:</b> tap Share, then “Add to Home Screen”. It then opens full screen like an app. iPhone can't lock the screen sideways from a web page, so turn off Portrait Orientation Lock and hold the phone sideways."
    : "<b>Install:</b> in Chrome or Edge, use the install icon in the address bar (or menu → Install / Add to Home screen).";

  // ---------------------------------------------------------------- boot
  applySettings();
  loadCurrent(cur().posChar || 0);
  if (!listener.supported && S.mode === "voice") {
    setTimeout(() => toast("This browser can't follow your voice (no speech recognition). Use Chrome, Edge or Safari, or use Auto mode.", "warn", 8000), 400);
  }
  requestAnimationFrame(frame);

  // Test hook (used by automated tests only).
  window.__prompter = {
    feed: (t) => listener._feed(t), get pos() { return pos; }, get offset() { return offset; }, get target() { return target; },
    words: () => scriptWords.slice(), setRunning(v) { running = v; paintSaid(); }, settings: S,
    endSession: () => listener._endSession(), jumpToWord: (i) => jumpToEl(wordEls[i]), get countdown() { return countdown ? fumbleEl.textContent : null; },
    misses: () => wordEls.filter((w) => w.classList.contains("miss")).map((w) => w.textContent),
    get lang() { return listener.lang; }, langAt: (p) => langAt(p), library: () => JSON.parse(JSON.stringify(lib)),
  };
})();
