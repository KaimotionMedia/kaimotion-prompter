// Simulates a speaker reading the script with mistakes; run: node tests/matcher.test.js
const M = require("../matcher.js");
const scriptText = `Welcome to Kaimotion Media. Today we're going to talk about how to light a small room for video.
First, find your key light. Place it about forty five degrees to the side of your subject.
Next, add a fill light on the other side, at about half the brightness.
Finally, a back light separates your subject from the background. That's the classic three point setup.
Thanks for watching, and we'll see you in the next video.`;
const script = M.tokenize(scriptText);
let fails = 0;
function run(name, spokenChunks, expectEnd, opts = {}) {
  let pos = opts.start || 0, heard = [], trace = [];
  for (const chunk of spokenChunks) {
    // feed word by word like interim results
    for (const w of M.tokenize(chunk)) {
      heard.push(w);
      const r = M.locate(script, heard, pos);
      if (r.moved) pos = r.pos;
      trace.push(pos);
    }
  }
  const ok = typeof expectEnd === "function" ? expectEnd(pos, trace) : Math.abs(pos - expectEnd) <= 1;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: pos=${pos} (${script[pos - 1]}) expected ${typeof expectEnd === "function" ? "custom" : expectEnd}`);
}
const idx = (phraseEnd) => { // index after the last word of the given phrase
  const t = M.tokenize(phraseEnd); for (let i = 0; i <= script.length - t.length; i++) if (t.every((w, k) => script[i + k] === w)) return i + t.length; return -1; };

run("clean read", [scriptText], script.length);
run("misheard words", ["welcome to kai motion media today we are going to talk about how to lite a small room for video first find your key lite"], idx("find your key light"));
run("ad-lib in middle", ["welcome to kaimotion media", "um so yeah I love this stuff it's great", "today we're going to talk about how to light a small room"], idx("light a small room"));
run("skip a line", ["welcome to kaimotion media today we're going to talk about how to light a small room for video", "next add a fill light on the other side"], idx("fill light on the other side"));
run("pause then continue (no movement on silence)", ["welcome to kaimotion media"], idx("welcome to kaimotion media"));
run("random talk doesn't move", ["hey can everyone hear me okay let me check the camera"], (p) => p <= 1);
run("numbers as digits", ["first find your key light place it about 45 degrees to the side of your subject"], idx("side of your subject"), { start: idx("small room for video") });
run("no backward on wobble", ["next add a fill light on the other side at about half the brightness", "half the brightness"], idx("half the brightness"), { start: idx("separates your subject") - 20 });
run("clear repeat goes back", ["finally a back light separates your subject from the background", "first find your key light place it about forty five degrees"], idx("about forty five degrees"));
run("does not leap far ahead on common words", ["welcome to kaimotion media", "the"], idx("welcome to kaimotion media"));
run("ad-lib with sound-alike word (let/light) holds still", ["welcome to kaimotion media today we are going to talk about how to light a small room for video", "okay so let me just say I really love this part its my favorite"], idx("small room for video"));
run("stray common word at end of ad-lib holds still", ["welcome to kaimotion media today we are going to talk about how to light a small room for video", "of okay so let"], idx("small room for video"));
process.exit(fails ? 1 : 0);
