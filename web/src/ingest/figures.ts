import { loadDocx } from './extractText';
import { captionRef, compressImageBlob } from './images';
import { loadPdf, pageLines, type PdfLine } from './pdf';

/** A picture cut out of a document, identified by the number in its caption ("תמונה 36"). */
export interface ExtractedFigure {
  ref: string;
  blob: Blob;
}

export interface FigureExtraction {
  figures: ExtractedFigure[];
  /** Captions found whose picture could not be extracted (e.g. Word EMF drawings). */
  missed: string[];
}

export async function extractFigures(file: File): Promise<FigureExtraction> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return extractPdfFigures(file);
  if (name.endsWith('.docx')) return extractDocxFigures(file);
  return { figures: [], missed: [] };
}

// ---------------------------------------------------------------- PDF

const SCALE = 2;
const INK = 235; // luminance below this counts as "ink"

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type CaptionSide = 'below' | 'above';

/**
 * Picture pages are laid out as picture + caption cells (often in a grid). For every caption line
 * the page is rendered and the area between it and its neighbour caption in the same column is cut
 * out and trimmed — this captures raster images and vector drawings alike.
 */
async function extractPdfFigures(file: File): Promise<FigureExtraction> {
  const pdf = await loadPdf(file);
  const figures: ExtractedFigure[] = [];
  let side: CaptionSide = 'below'; // the most common layout; refined per page

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    // Captions of a row of pictures share a baseline, so look at each gap-separated piece of a line.
    const lines = (await pageLines(page)).flatMap((l) => (l.segments.length ? l.segments : [l]));
    const captions = lines.flatMap((line) => {
      const ref = captionRef(line.text);
      return ref ? [{ ref, line }] : [];
    });
    if (!captions.length) continue;

    const viewport = page.getViewport({ scale: SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport, background: '#fff' }).promise;

    const toBox = (l: PdfLine): Box => {
      const [x1, y1] = viewport.convertToViewportPoint(l.x0, l.yBottom) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(l.x1, l.yTop) as [number, number];
      // Pad for ascenders/descenders and anti-aliasing, so neighbouring text never bleeds into a crop.
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const h = bottom - top;
      return { left: Math.min(x1, x2), right: Math.max(x1, x2), top: top - h * 0.2, bottom: bottom + h * 0.35 };
    };
    const caps = captions.map((c) => ({ ref: c.ref, box: toBox(c.line) }));
    const center = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

    // Column of each caption: halfway to the nearest caption left/right of it in the same row.
    const columns = caps.map((c) => {
      const cc = center(c.box);
      const rowHeight = (c.box.bottom - c.box.top) * 3;
      let left = 0;
      let right = canvas.width;
      for (const o of caps) {
        if (o === c || Math.abs(center(o.box).y - cc.y) > rowHeight) continue;
        const ox = center(o.box).x;
        if (ox < cc.x) left = Math.max(left, (ox + cc.x) / 2);
        else if (ox > cc.x) right = Math.min(right, (ox + cc.x) / 2);
      }
      return { left, right };
    });

    // Paragraph-like text (wide lines) bounds a picture; short labels inside drawings don't.
    const obstacles = lines.filter((l) => !captionRef(l.text)).map(toBox);
    const blockers = (col: { left: number; right: number }) => [
      ...obstacles.filter((b) => b.right > col.left && b.left < col.right && b.right - b.left >= (col.right - col.left) * 0.5),
      ...caps.map((c) => c.box).filter((b) => (b.left + b.right) / 2 > col.left && (b.left + b.right) / 2 < col.right),
    ];
    const spanAbove = (box: Box, col: { left: number; right: number }) =>
      Math.max(0, ...blockers(col).filter((b) => b.bottom <= box.top + 1 && b !== box).map((b) => b.bottom));
    const spanBelow = (box: Box, col: { left: number; right: number }) =>
      Math.min(canvas.height, ...blockers(col).filter((b) => b.top >= box.bottom - 1 && b !== box).map((b) => b.top));

    const inkIn = (r: Box) => {
      const w = Math.floor(r.right - r.left);
      const h = Math.floor(r.bottom - r.top);
      if (w <= 0 || h <= 0) return 0;
      const data = ctx.getImageData(Math.floor(r.left), Math.floor(r.top), w, h).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 16) if (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < INK) ink++;
      return ink;
    };

    // Is the picture above its caption or below it? Compare the ink above the topmost caption
    // of each column with the ink below the bottommost one.
    let above = 0;
    let below = 0;
    caps.forEach((c, i) => {
      const col = columns[i];
      const sameCol = caps.filter((_, j) => columns[j].left === col.left && columns[j].right === col.right);
      if (sameCol.every((o) => o.box.top >= c.box.top)) above += inkIn({ ...col, top: spanAbove(c.box, col), bottom: c.box.top });
      if (sameCol.every((o) => o.box.bottom <= c.box.bottom)) below += inkIn({ ...col, top: c.box.bottom, bottom: spanBelow(c.box, col) });
    });
    if (above > below * 1.5) side = 'below';
    else if (below > above * 1.5) side = 'above';

    for (let i = 0; i < caps.length; i++) {
      const { ref, box } = caps[i];
      const col = columns[i];
      const region =
        side === 'below'
          ? { ...col, top: spanAbove(box, col), bottom: box.top }
          : { ...col, top: box.bottom, bottom: spanBelow(box, col) };
      const blob = await cropTrimmed(canvas, ctx, region);
      if (blob) figures.push({ ref, blob });
    }
  }
  return { figures, missed: [] };
}

/** Cuts a region, trims the white margin around the drawing, and encodes it. */
async function cropTrimmed(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, r: Box): Promise<Blob | null> {
  const x = Math.max(0, Math.floor(r.left));
  const y = Math.max(0, Math.floor(r.top));
  const w = Math.min(canvas.width, Math.ceil(r.right)) - x;
  const h = Math.min(canvas.height, Math.ceil(r.bottom)) - y;
  if (w < 8 || h < 8) return null;
  const { data } = ctx.getImageData(x, y, w, h);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < INK) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (maxX - minX < 12 || maxY - minY < 12) return null; // nothing drawn here

  // A little breathing room around the drawing, but never past the region (that's the neighbour's).
  const pad = 8;
  const cx = x + Math.max(0, minX - pad);
  const cy = y + Math.max(0, minY - pad);
  const cw = Math.min(x + w, x + maxX + 1 + pad) - cx;
  const ch = Math.min(y + h, y + maxY + 1 + pad) - cy;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return new Promise((resolve) => out.toBlob(resolve, 'image/webp', 0.9));
}

// ---------------------------------------------------------------- Word

const BROWSER_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)/i;

type DocEvent = { kind: 'img'; src: string } | { kind: 'cap'; ref: string };

/**
 * Word: pictures are embedded <img>s next to their caption paragraphs, or in table cells.
 * A cell holding one picture and one caption is paired directly; a row of pictures followed by
 * a row of captions is paired column by column; anything else is paired in reading order.
 */
async function extractDocxFigures(file: File): Promise<FigureExtraction> {
  const doc = await loadDocx(file);
  const pairs: { ref: string; src: string }[] = [];
  const loose: DocEvent[] = [];

  const eventsIn = (el: Element): DocEvent[] => {
    const out: DocEvent[] = [];
    const visit = (node: Element) => {
      if (node.tagName === 'IMG') {
        out.push({ kind: 'img', src: node.getAttribute('src') ?? '' });
        return;
      }
      if (/^(P|LI|H[1-6]|TD|TH)$/.test(node.tagName) && !node.querySelector('p, li, table')) {
        const ref = captionRef(node.textContent ?? '');
        if (ref) out.push({ kind: 'cap', ref });
      }
      for (const child of node.children) visit(child);
    };
    visit(el);
    return out;
  };

  const walk = (el: Element) => {
    for (const child of el.children) {
      if (child.tagName !== 'TABLE') {
        if (child.querySelector('table')) walk(child);
        else loose.push(...eventsIn(child));
        continue;
      }
      const rows = [...child.querySelectorAll(':scope > tbody > tr, :scope > tr')].map((tr) =>
        [...tr.children].map((cell) => eventsIn(cell)),
      );
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const imgsOnly = row.every((cell) => cell.every((e) => e.kind === 'img')) && row.some((c) => c.length);
        const next = rows[r + 1];
        const nextCapsOnly = next?.every((cell) => cell.every((e) => e.kind === 'cap'));
        if (imgsOnly && next && nextCapsOnly && next.length === row.length) {
          row.forEach((cell, c) => {
            const img = cell[0];
            const cap = next[c][0];
            if (img?.kind === 'img' && cap?.kind === 'cap') pairs.push({ ref: cap.ref, src: img.src });
          });
          r++;
          continue;
        }
        for (const cell of row) {
          const imgs = cell.filter((e) => e.kind === 'img');
          const caps = cell.filter((e) => e.kind === 'cap');
          if (imgs.length === 1 && caps.length === 1) pairs.push({ ref: caps[0].ref, src: imgs[0].src });
          else loose.push(...cell);
        }
      }
    }
  };
  walk(doc.body);

  // Reading order: whichever comes first in the document (picture or caption) leads each pair.
  const capsAfter = loose.find((e) => e.kind === 'img' || e.kind === 'cap')?.kind === 'img';
  for (let i = 0; i < loose.length; i++) {
    const a = loose[i];
    const b = loose[i + 1];
    if (!b) break;
    if (capsAfter && a.kind === 'img' && b.kind === 'cap') pairs.push({ ref: b.ref, src: a.src });
    else if (!capsAfter && a.kind === 'cap' && b.kind === 'img') pairs.push({ ref: a.ref, src: b.src });
    else continue;
    i++;
  }

  const figures: ExtractedFigure[] = [];
  const missed: string[] = [];
  for (const { ref, src } of pairs) {
    if (!BROWSER_IMAGE.test(src)) {
      missed.push(ref); // EMF/WMF drawings can't be shown in a browser
      continue;
    }
    figures.push({ ref, blob: await compressImageBlob(await (await fetch(src)).blob()) });
  }
  return { figures, missed };
}
