# Kaimotion Prompter

A teleprompter that runs in the browser on any device (computer, phone, tablet) and scrolls along
with the speaker's voice. Static files only: no server, no accounts. Scripts and settings stay on
the device they were typed on.

## How to use it

1. **Script** → paste the script, or **Open file** (.txt or Word .docx). You can also drag a file onto
   the window. Text in `[square brackets]` shows in yellow and is skipped by voice follow, so use it
   for notes like `[PAUSE]`.
2. Pick **Voice** (follows the speaker) or **Auto** (scrolls at a set speed, with − / + for speed).
3. Press **Start**. The first time, allow the microphone.
4. The speaker reads the line on the blue band. Words already said turn gray. If they ad-lib, pause
   or skip a line, the prompter waits and then catches up when they're back on the script. It only
   goes backward if they clearly repeat an earlier passage.
5. Tap or click any word to jump there; drag or use the mouse wheel to move by hand.
6. **Mirror** (or the M key) cycles: off → flip left-right (the usual setting for beam-splitter glass)
   → flip upside down → both. Only the script flips; the buttons stay readable.
7. **Settings**: text size, line spacing, side margins, reading-line height, font, colors, marker
   style, ALL CAPS, centered text.

Keys: Space = start/pause · ↑ ↓ = nudge a line · ← → = slower/faster · Page Up/Down · Home = top ·
M = mirror · F = fullscreen · + / − = text size · Esc = stop. Presentation clickers send these keys,
so they work too.

While running, the button bar hides after 3 seconds; move the mouse or tap the ••• button to bring
it back. The screen stays awake while it's running.

### Which browsers

| | Voice follow | Auto scroll |
| --- | --- | --- |
| Chrome / Edge (Windows, Mac, Android) | Yes, needs internet (the voice goes to Google/Microsoft to be recognized) | Yes, offline too |
| Safari (Mac, iPhone, iPad) | Yes (Apple's recognition). On iPhone/iPad, Siri & Dictation must be on | Yes |
| Firefox | No (the app says so) | Yes |

The microphone only works on a secure (https) address, or on the computer itself at `localhost`.

## Try it on this computer

In a terminal, in this folder:

```
python -m http.server 5310
```

Then open http://localhost:5310 in Chrome. (Opening `index.html` by double-clicking works for Auto
mode, but browsers block the microphone that way.)

## Put it online (free, GitHub Pages)

Not done yet: it needs your OK to create the repository. Once you say so:

1. Create a public repo, e.g. `KaimotionMedia/prompter`, and push this folder to it.
2. On GitHub: repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`,
   folder `/ (root)` → Save.
3. After a minute it's live at `https://kaimotionmedia.github.io/prompter/`. Send that link to the
   talent; on a phone they can **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome:
   menu → Install app) and it opens full screen like an app, and works offline in Auto mode.

**Updating it later:** change the files, bump `CACHE` in `sw.js` (e.g. `kprompter-v2`), push. Phones
that already have it pick up the new version the second time they open it.

## For developers

- `index.html`, `style.css`, `app.js` (UI, scrolling, speech recognition, settings), `matcher.js`
  (voice → script position), `docx.js` (Word text extraction, no libraries), `sw.js` (offline cache).
- `node tests/matcher.test.js` runs the matcher tests (misheard words, ad-libs, skipped lines, pauses,
  repeats).
- Real-speech test in Chrome: Chrome's `SpeechRecognition.start(track)` can take an audio track, so
  an automated test can set `window.__prompterTestTrack` to a track playing a recording (e.g. a
  Windows text-to-speech WAV) before pressing Start. `window.__prompterDebug = true` logs every move.
- Possible later upgrade: on-device recognition (Whisper/Vosk in WebAssembly) for voice follow with
  no internet; heavier on phones.
