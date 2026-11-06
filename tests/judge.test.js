const M = require("../matcher.js");
const script = M.tokenize("Welcome back to the channel. Today we are talking about teleprompter rigs and how to read naturally on camera.");
let fails = 0;
function check(name, heardText, end, wantBad, wantOkIncludes) {
  const r = M.judge(script, M.tokenize(heardText), end);
  const bad = r.filter((x) => !x.ok).map((x) => script[x.j]);
  const ok = r.filter((x) => x.ok).map((x) => script[x.j]);
  const pass = JSON.stringify(bad) === JSON.stringify(wantBad) && (wantOkIncludes || []).every((w) => ok.includes(w));
  if (!pass) fails++;
  console.log((pass ? "PASS " : "FAIL ") + name + "  bad=" + JSON.stringify(bad) + " ok=" + ok.join(","));
}
const at = (w) => script.indexOf(w) + 1;
check("clean read", "today we are talking about teleprompter rigs", at("rigs"), [], ["teleprompter"]);
check("misread word", "today we are talking about telepromoter rigs and how", at("how"), [], ["rigs"]); // near-miss: not red
check("wrong word", "today we are walking about teleprompter rigs", at("rigs"), ["talking"]);
check("dropped word", "today we are talking about rigs and how to read", at("read"), ["teleprompter"]);
check("skipped line not red", "welcome back to the channel naturally on camera", script.length, []);
check("ad-lib before", "um so yeah okay today we are talking about", at("about"), []);
check("reread clears", "talking about teleprompter rigs and how", at("how"), [], ["talking"]);
// Recognizer spelling differences that must not turn red.
const s2 = M.tokenize("Today we're going to talk about lights. Place it about forty five degrees to the side of your subject.");
function check2(name, heardText, end, wantBad) {
  const bad = M.judge(s2, M.tokenize(heardText), end).filter((x) => !x.ok).map((x) => s2[x.j]);
  const pass = JSON.stringify(bad) === JSON.stringify(wantBad);
  if (!pass) fails++;
  console.log((pass ? "PASS " : "FAIL ") + name + "  bad=" + JSON.stringify(bad));
}
check2("contraction written out", "today we are going to talk about lights", s2.indexOf("lights") + 1, []);
check2("degree sign", "place it about 45° to the side of your subject", s2.length, []);
check2("homophone spelling", "today we're going to talk about lites place it", s2.indexOf("it") + 1, []);
// Spanish
const s3 = M.tokenize("Bienvenidos al programa. Hoy hablamos de cómo iluminar una habitación pequeña.");
const bad3 = M.judge(s3, M.tokenize("bienvenidos al programa hoy hablamos de como eliminar una habitacion pequena"), s3.length).filter((x) => !x.ok).map((x) => s3[x.j]);
console.log((JSON.stringify(bad3) === '["iluminar"]' ? "PASS" : (fails++, "FAIL")) + " spanish wrong word  bad=" + JSON.stringify(bad3));
process.exit(fails ? 1 : 0);
