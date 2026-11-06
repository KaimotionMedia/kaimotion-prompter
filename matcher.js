/*
 * Voice-follow matcher.
 *
 * Given the script's words and the words the speech recognizer has heard so far, works out where
 * in the script the speaker is. It looks only a little ahead of the current spot, tolerates
 * misheard words, ad-libs and skipped words, and only moves backward when the speaker clearly
 * repeats an earlier passage.
 *
 * Works in the browser (window.PrompterMatcher) and in Node (module.exports) for testing.
 */
(function (root) {
  "use strict";

  const SMALL_NUMBERS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen", "twenty",
  ];
  const TENS = { 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety", 100: "hundred" };
  const ALIASES = {
    ok: "okay", "&": "and", "%": "percent", mr: "mister", mrs: "missus", dr: "doctor", st: "saint",
    vs: "versus", gonna: "going", wanna: "want", lets: "let", "1st": "first", "2nd": "second",
    "3rd": "third",
  };

  /** Lowercase, strip punctuation/accents, map digits and common spellings to one form. */
  function normalizeWord(raw) {
    let w = String(raw).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[‘’ʼ']/g, "")
      .replace(/^[^a-z0-9&%$]+|[^a-z0-9%]+$/g, "");
    if (w.startsWith("$")) w = w.slice(1);
    w = w.replace(/,/g, "");
    if (/^\d+$/.test(w)) {
      const n = parseInt(w, 10);
      if (n <= 20) return SMALL_NUMBERS[n];
      if (TENS[n]) return TENS[n];
      return w;
    }
    w = w.replace(/[^a-z0-9%&]/g, "");
    return ALIASES[w] || w;
  }

  /** Split text into words the way the matcher sees them (hyphens and slashes split words). */
  function tokenize(text) {
    const out = [];
    for (const piece of String(text).split(/[\s—–\-\/]+/)) {
      const n = normalizeWord(piece);
      if (!n) continue;
      // 21..99 -> "forty five" so "45" in a transcript matches "forty-five" in a script.
      if (/^\d\d$/.test(n)) {
        const v = +n, t = Math.floor(v / 10) * 10;
        out.push(TENS[t] || (t === 20 ? "twenty" : n));
        if (v % 10) out.push(SMALL_NUMBERS[v % 10]);
        continue;
      }
      out.push(n);
    }
    return out;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  /** Rough "sounds alike" key: drop vowels after the first letter, collapse doubles. */
  function skeleton(w) {
    const v = w.replace(/gh/g, "").replace(/ph/g, "f").replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k");
    return (v[0] || "") + v.slice(1).replace(/[aeiouyhw]/g, "").replace(/(.)\1+/g, "$1");
  }

  /** 0..1 similarity between two normalized words. */
  function similarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    // plurals / -ed / -ing endings
    const sa = a.replace(/(ing|ed|es|s)$/, ""), sb = b.replace(/(ing|ed|es|s)$/, "");
    if (sa.length >= 3 && sa === sb) return 0.9;
    const len = Math.max(a.length, b.length);
    let s = 1 - levenshtein(a, b) / len;
    if (Math.min(a.length, b.length) >= 4 && skeleton(a) === skeleton(b)) s = Math.max(s, 0.8);
    // Very short words must match exactly to count (a/the/an/in/on are easy to confuse).
    if (Math.min(a.length, b.length) <= 2) return s >= 0.99 ? 1 : 0;
    return s;
  }

  /** How much a word is worth when matched: common little words are worth less. */
  const COMMON = new Set(("a an the and or but of to in on at for with is are was were be been it its this that " +
    "these those i you he she we they me my your our their his her them us so as if then than there here " +
    "do does did not no yes just can will would could should have has had from by up out about what when " +
    "who how all some more very").split(" "));
  function weight(w) {
    if (COMMON.has(w)) return 0.6;
    return w.length >= 6 ? 1.25 : 1;
  }

  const DEFAULTS = {
    heardTail: 10,      // how many of the most recent heard words to align
    lookBack: 4,        // script words before the current spot that may still match (re-reads)
    lookAhead: 28,      // how far ahead of the current spot we look (skipped lines)
    repeatBack: 80,     // how far back a clearly repeated passage may pull us
    gapScript: 0.45,    // cost of a script word the speaker skipped
    gapHeard: 0.6,      // cost of an ad-lib / misheard extra word
    mismatch: 0.7,
    minScore: 1.5,      // minimum alignment score to move at all
    distancePenalty: 0.06, // per word of jump ahead, so the nearest good match wins
    backScore: 4.5,     // a backward jump needs a strong match (about 4 solid words)
  };

  /**
   * Local alignment (Smith-Waterman) of the heard tail against a slice of the script.
   * Returns, for each script position j in the slice, the best score of an alignment whose last
   * matched script word is j and whose last heard word is near the end of the tail.
   */
  function alignEnds(heard, script, from, to, opt) {
    const m = heard.length, n = to - from;
    const H = [];
    const matches = [];
    for (let i = 0; i <= m; i++) {
      H.push(new Float32Array(n + 1));
      matches.push(new Uint8Array(n + 1));
    }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const sw = script[from + j - 1];
        const sim = similarity(heard[i - 1], sw);
        let diag;
        let isMatch = 0;
        if (sim >= 0.72) { diag = H[i - 1][j - 1] + 2 * sim * weight(sw); isMatch = 1; }
        else diag = H[i - 1][j - 1] - opt.mismatch;
        const up = H[i - 1][j] - opt.gapHeard;   // heard word not in the script
        const left = H[i][j - 1] - opt.gapScript; // script word skipped
        let best = 0, bm = 0;
        if (diag > best) { best = diag; bm = isMatch ? matches[i - 1][j - 1] + 1 : matches[i - 1][j - 1]; }
        if (up > best) { best = up; bm = matches[i - 1][j]; }
        if (left > best) { best = left; bm = matches[i][j - 1]; }
        // Only alignments that END on a real match count as "the speaker is at j".
        H[i][j] = best;
        matches[i][j] = bm;
      }
    }
    // Score of ending exactly on script word j with a match: re-evaluate the diagonal step.
    const ends = new Array(n).fill(null);
    for (let j = 1; j <= n; j++) {
      let best = -Infinity, bestMatches = 0, bestSim = 0;
      for (let i = Math.max(1, m - 3); i <= m; i++) {
        const sw = script[from + j - 1];
        const sim = similarity(heard[i - 1], sw);
        if (sim < 0.72) continue;
        const s = H[i - 1][j - 1] + 2 * sim * weight(sw) - (m - i) * opt.gapHeard;
        if (s > best) { best = s; bestMatches = matches[i - 1][j - 1] + 1; bestSim = sim; }
      }
      if (best > -Infinity) ends[j - 1] = { score: best, matches: bestMatches, sim: bestSim };
    }
    return ends;
  }

  /**
   * True when at least 2 of the last 4 heard words appear among the few script words ending at j,
   * and at least one of them is a meaningful (not common) word.
   */
  function recentSupport(tail, script, j) {
    const recent = tail.slice(-4);
    const near = script.slice(Math.max(0, j - 5), j + 1);
    let hits = 0, strong = false;
    for (const h of recent) {
      if (near.some((s) => similarity(h, s) >= 0.8)) {
        hits++;
        if (!COMMON.has(h)) strong = true;
      }
    }
    return hits >= 2 && strong;
  }

  /**
   * Decide the new position.
   * @param {string[]} script normalized script words
   * @param {string[]} heard normalized heard words (most recent last)
   * @param {number} pos index of the next script word the speaker is expected to say
   * @returns {{pos:number, score:number, moved:boolean}}
   */
  function locate(script, heard, pos, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const tail = heard.slice(-opt.heardTail);
    if (!tail.length || !script.length) return { pos, score: 0, moved: false };

    // Forward / nearby search.
    const from = Math.max(0, pos - opt.lookBack - tail.length);
    const to = Math.min(script.length, pos + opt.lookAhead);
    let best = null;
    if (to > from) {
      const ends = alignEnds(tail, script, from, to, opt);
      for (let k = 0; k < ends.length; k++) {
        const e = ends[k];
        if (!e) continue;
        const j = from + k;              // script index of the last matched word
        const jump = Math.max(0, j - pos);
        let score = e.score - jump * opt.distancePenalty;
        // A single matched word is only trusted right next to the current spot.
        if (e.matches < 2 && (jump > 2 || script[j].length < 4)) continue;
        // A jump of more than a few words must land on a clearly heard word, not a near-miss.
        if (jump > 3 && e.sim < 0.85) continue;
        // ...and the speaker must be saying script words right now (not one stray word in an ad-lib).
        if (jump > 3 && !recentSupport(tail, script, j)) continue;
        if (j + 1 < pos - opt.lookBack) continue;
        if (score < opt.minScore) continue;
        if (!best || score > best.score || (score === best.score && j < best.j)) best = { j, score };
      }
    }

    // Clear repeat of an earlier passage: search further back with a strict threshold.
    if (pos > opt.lookBack + 2) {
      const bFrom = Math.max(0, pos - opt.repeatBack);
      const bTo = Math.max(bFrom, pos - opt.lookBack);
      if (bTo - bFrom > 1) {
        const ends = alignEnds(tail, script, bFrom, bTo, opt);
        for (let k = 0; k < ends.length; k++) {
          const e = ends[k];
          if (!e || e.matches < 4 || e.score < opt.backScore) continue;
          // Must beat any forward candidate clearly.
          if (best && e.score < best.score + 2) continue;
          if (!best || e.score > best.score) best = { j: bFrom + k, score: e.score, back: true };
        }
      }
    }

    if (!best) return { pos, score: 0, moved: false };
    const newPos = best.j + 1;
    // Small backward wobble (re-reading the last couple of words) does not move us back.
    if (newPos < pos && !best.back) return { pos, score: best.score, moved: false };
    return { pos: newPos, score: best.score, moved: newPos !== pos };
  }

  const api = { normalizeWord, tokenize, similarity, locate, DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PrompterMatcher = api;
})(typeof self !== "undefined" ? self : this);
