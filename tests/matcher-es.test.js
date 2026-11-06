// Spanish and mixed-language matcher tests; run: node tests/matcher-es.test.js
const M = require("../matcher.js");
const scriptText = `¡Bienvenidos a Kaimotion Media! Hoy vamos a hablar de cómo iluminar una habitación pequeña para video.
Primero, busca tu luz principal. Colócala a unos cuarenta y cinco grados al lado de tu sujeto.
Después, añade una luz de relleno del otro lado, con la mitad del brillo.
¿Listo? Finalmente, una contraluz separa a tu sujeto del fondo. Esa es la clásica iluminación de tres puntos.
Gracias por ver, y nos vemos en el próximo video. Son veintiún años de experiencia.`;
const script = M.tokenize(scriptText);
let fails = 0;
function run(name, chunks, expectEnd, start = 0) {
  let pos = start, heard = [];
  for (const c of chunks) for (const w of M.tokenize(c)) { heard.push(w); const r = M.locate(script, heard, pos); if (r.moved) pos = r.pos; }
  const ok = typeof expectEnd === "function" ? expectEnd(pos) : Math.abs(pos - expectEnd) <= 1;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: pos=${pos} (${script[pos - 1]}) expected ${typeof expectEnd === "function" ? "custom" : expectEnd}`);
}
const idx = (p) => { const t = M.tokenize(p); for (let i = 0; i <= script.length - t.length; i++) if (t.every((w, k) => script[i + k] === w)) return i + t.length; return -1; };

console.log("tokens sample:", M.tokenize("¿Listo? Añade cuarenta y cinco, 45, veintiún, 1.000 pingüinos").join(" "));
run("clean read (no accents from recognizer)", ["bienvenidos a kaimotion media hoy vamos a hablar de como iluminar una habitacion pequena para video"], idx("habitación pequeña para video"));
run("digits for numbers", ["primero busca tu luz principal colocala a unos 45 grados al lado de tu sujeto"], idx("al lado de tu sujeto"), idx("pequeña para video"));
run("ad-lib holds still", ["bienvenidos a kaimotion media hoy vamos a hablar de como iluminar una habitacion pequena para video", "bueno eh la verdad me encanta esta parte es mi favorita"], idx("pequeña para video"));
run("skip a line", ["primero busca tu luz principal colocala a unos cuarenta y cinco grados al lado de tu sujeto", "listo finalmente una contraluz separa a tu sujeto del fondo"], idx("separa a tu sujeto del fondo"), idx("pequeña para video"));
run("misheard words", ["gracias por ver y nos vemos en el proximo vídeo son 21 anos de experiencia"], script.length, idx("tres puntos"));
run("random talk doesn't move", ["oye me escuchas bien voy a revisar la camara"], (p) => p <= 1);
console.log("detect:", M.detectLanguage(scriptText), M.detectLanguage("Welcome to the show, today we talk about light."), M.detectLanguage("Hola, ¿cómo están? Hoy hablamos de luz."));
if (M.detectLanguage(scriptText) !== "es" || M.detectLanguage("Welcome to the show, today we talk about light.") !== "en") fails++;
process.exit(fails ? 1 : 0);
