# Kaimotion Prompter

A teleprompter that runs in the browser on any device (computer, phone, tablet) and scrolls along
with the speaker's voice. Static files only: no server, no accounts. Scripts and settings stay on
the device they were typed on.

## How to use it

1. **Edit** → write or paste the script, or **Import** a .txt or Word .docx file (each import becomes
   a new saved script). The editor saves as you type, has Undo/Redo and Paste buttons (handy on
   phones), and keeps several scripts on the device: pick one from the list, **+** for a new one,
   **Rename**, **Delete**, **Export** (saves a .txt; on phones it opens the share sheet). Press
   **Prompt** to go back. You can also drag a file onto the window.
   Text in `[square brackets]` shows in yellow and is skipped by voice follow, so use it for notes
   like `[PAUSE]`.
2. **Edit right where you are:** tap a word (or double-tap it) in the prompter, fix the text, press
   **Prompt**, and it picks up at the same spot, even if you added or removed text above it.
3. Pick **Voice** (follows the speaker) or **Auto** (scrolls at a set speed, with − / + for speed).
4. Pick the **language** next to it: **Auto** guesses English or Spanish from the script, or choose
   English (US), Español (Latinoamérica), Español (México) or Español (Ecuador). Your choice is
   remembered on that device and always wins over the guess. If a browser can't listen in Ecuador
   Spanish, it switches to Latin American Spanish and says so.
5. **Mixed English and Spanish:** put `[ES]` on its own line before a Spanish part and `[EN]` before an
   English part. The prompter switches the listening language when the reader gets there. It listens
   to one language at a time, so a single sentence that mixes both languages follows less well.
6. Press **Start**. The first time, allow the microphone.
7. The speaker reads the line on the blue band at the top of the screen (so as much of the script as
   possible shows below it). Words already said turn gray. If they ad-lib, pause or skip a line, the
   prompter waits and then catches up when they're back on the script. It only goes backward if they
   clearly repeat an earlier passage.
   - **Red words:** a word the mic heard as a different word turns red until it's read again clearly.
     Little words, contractions ("we are" for "we're") and numbers are never flagged, and one word
     heard as two ("Kai motion") counts as right. A slightly mispronounced word the mic still
     understood can't be caught.
   - **Fumble timer:** after a stumble (a red word, or a few words that aren't in the script) the
     reader goes quiet, and a faint countdown appears (5 s, 10% visible by default). When it runs out
     the prompter goes back to the start of that paragraph for a retake. Talking or tapping the screen
     cancels it. Each red word starts the timer only once, so a name the mic never gets right can't
     keep sending the reader back. A long ad-lib (more than about 12 words) doesn't start it.
     Settings: timer length (0 = off), how visible it is, red words on/off.
8. Tap or click any word to jump there; drag or use the mouse wheel to move by hand.
9. **Mirror** (or the M key) cycles: off → flip left-right (the usual setting for beam-splitter glass)
   → flip upside down → both. Only the script flips; the buttons stay readable.
10. **Settings**: text size, line spacing, side margins, reading-line height, fumble timer, font,
   colors, marker style, ALL CAPS, centered text, red words.

Each line of the script is a paragraph, with half a line of space between paragraphs (extra blank
lines don't add more space).

**Phones:** made to be held sideways. On Android, Start goes full screen and locks the screen
sideways (turn this off in Settings). iPhone doesn't let web pages lock the rotation: turn off
Portrait Orientation Lock in Control Center and hold the phone sideways. The button bar sits at the
bottom of the screen, away from the teleprompter glass (at the top when Mirror is set to upside down,
so it never covers the reading line). Buttons are at least 48 px, and double-tap zoom is off so
quick taps all count. It hides itself while prompting; the first tap on the script brings it back
(that tap doesn't jump).

Keys: Space = start/pause · ↑ ↓ = nudge a line · ← → = slower/faster · Page Up/Down · Home = top ·
E = edit · M = mirror · F = fullscreen · + / − = text size · Esc = stop. Presentation clickers send these keys,
so they work too.

While running, the button bar hides after 4 seconds; move the mouse or tap the ••• button to bring
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

## Online

Live at **https://kaimotionmedia.github.io/kaimotion-prompter/** (GitHub Pages, from the `main`
branch of `KaimotionMedia/kaimotion-prompter`). The repo is public, but scripts are never uploaded:
they stay in the browser of each device. Send that link to the talent; on a phone they can **Add to
Home Screen** (Safari: Share → Add to Home Screen; Chrome: menu → Install app) and it opens full
screen like an app, and works offline in Auto mode.

**Updating it later:** change the files, bump `CACHE` in `sw.js` (e.g. `kprompter-v4`), push. Phones
that already have it pick up the new version the second time they open it.

## For developers

- `index.html`, `style.css`, `app.js` (UI, scrolling, speech recognition, settings), `matcher.js`
  (voice → script position), `docx.js` (Word text extraction, no libraries), `sw.js` (offline cache).
- `node tests/judge.test.js` tests the red-word check (`judge` in matcher.js).
- `node tests/matcher.test.js` and `node tests/matcher-es.test.js` run the matcher tests (misheard
  words, ad-libs, skipped lines, pauses, repeats; Spanish accents, ¿ ¡, ñ, numbers as digits or
  words in both languages).
- Scripts are stored in localStorage (`kprompter.library.v1`); positions are saved as character
  offsets so they survive edits.
- Real-speech test in Chrome: Chrome's `SpeechRecognition.start(track)` can take an audio track, so
  an automated test can set `window.__prompterTestTrack` to a track playing a recording (e.g. a
  Windows text-to-speech WAV) before pressing Start. `window.__prompterDebug = true` logs every move.
- Possible later upgrade: on-device recognition (Whisper/Vosk in WebAssembly) for voice follow with
  no internet; heavier on phones.
