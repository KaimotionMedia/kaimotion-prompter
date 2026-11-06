/*
 * Reads the plain text out of a Word .docx file in the browser, with no libraries:
 * a .docx is a zip; we find word/document.xml, inflate it and keep the paragraph text.
 */
(function (root) {
  "use strict";

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser can't open Word files. Save the script as .txt, or copy and paste it.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZipEntry(buf, wanted) {
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    // End of central directory record: search backward for its signature.
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("That file doesn't look like a Word document.");
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (name === wanted) {
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const data = u8.subarray(start, start + compSize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error("Unsupported Word file compression.");
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error("No document text found in that Word file.");
  }

  async function docxToText(arrayBuffer) {
    const xmlBytes = await readZipEntry(arrayBuffer, "word/document.xml");
    const xml = new TextDecoder().decode(xmlBytes);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const paras = doc.getElementsByTagNameNS(W, "p");
    const lines = [];
    for (const para of paras) {
      let line = "";
      const walker = doc.createTreeWalker(para, NodeFilter.SHOW_ELEMENT);
      let node = walker.currentNode;
      while (node) {
        if (node.namespaceURI === W) {
          if (node.localName === "t") line += node.textContent;
          else if (node.localName === "tab") line += " ";
          else if (node.localName === "br" || node.localName === "cr") line += "\n";
        }
        node = walker.nextNode();
      }
      lines.push(line);
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  root.docxToText = docxToText;
})(self);
