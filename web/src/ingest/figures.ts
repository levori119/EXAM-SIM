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
const CELL = 3; // connected-component grid resolution, in render pixels
/** Minimum non-text ink (pixels at render scale) for a shape to count as a picture. */
const MIN_DRAWING_INK = 400;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Shape extends Box {
  /** Ink pixels outside text lines — real drawing, not glyphs. */
  drawingInk: number;
}

type CaptionSide = 'below' | 'above';

const overlapX = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.left, b.left);
const union = (boxes: Box[]): Box => ({
  left: Math.min(...boxes.map((b) => b.left)),
  right: Math.max(...boxes.map((b) => b.right)),
  top: Math.min(...boxes.map((b) => b.top)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
});

/**
 * Picture pages are grids of picture + caption ("תמונה 36"). The page is rendered and split into
 * connected shapes (text lines excluded); each caption takes the shape right next to it — however
 * wide (a picture spanning two grid columns) — plus any detached pieces inside its own cell.
 * Titles and paragraphs are never the nearest shape to a caption, so they stay out. Works for
 * raster images and vector drawings alike.
 */
async function extractPdfFigures(file: File): Promise<FigureExtraction> {
  const pdf = await loadPdf(file);
  const figures: ExtractedFigure[] = [];
  let side: CaptionSide = 'below'; // the most common layout; refined per page

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    // Captions of a row of pictures share a baseline, so look at each gap-separated piece of a line.
    const lines = (await pageLines(page)).flatMap((l) => (l.segments.length ? l.segments : [l]));
    if (!lines.some((l) => captionRef(l.text))) continue;

    const viewport = page.getViewport({ scale: SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport, background: '#fff' }).promise;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const toBox = (l: PdfLine): Box => {
      const [x1, y1] = viewport.convertToViewportPoint(l.x0, l.yBottom) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(l.x1, l.yTop) as [number, number];
      // Pad for ascenders/descenders and anti-aliasing.
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const h = bottom - top;
      return { left: Math.min(x1, x2), right: Math.max(x1, x2), top: top - h * 0.2, bottom: bottom + h * 0.35 };
    };
    const caps = lines.flatMap((l) => {
      const ref = captionRef(l.text);
      return ref ? [{ ref, box: toBox(l) }] : [];
    });
    const textBoxes = lines.filter((l) => !captionRef(l.text)).map(toBox);
    // Captions and paragraph-width lines never join a shape; short labels inside drawings do.
    const barriers = [...caps.map((c) => c.box), ...textBoxes.filter((t) => t.right - t.left > canvas.width * 0.35)];
    const shapes = findShapes(pixels, canvas.width, canvas.height, textBoxes, barriers);

    // The shape nearest to a caption on one side, overlapping it horizontally.
    const nearest = (cap: Box, dir: CaptionSide) => {
      let best: Shape | null = null;
      let bestGap = Infinity;
      for (const s of shapes) {
        if (overlapX(s, cap) <= 0) continue;
        const gap = dir === 'below' ? cap.top - s.bottom : s.top - cap.bottom;
        // Captions often touch their picture, so the padded caption box may overlap it slightly.
        if (gap >= -(cap.bottom - cap.top) && gap < bestGap) {
          best = s;
          bestGap = gap;
        }
      }
      return best ? { shape: best, gap: bestGap } : null;
    };

    // Picture above its caption, or below it? The side where shapes sit closer, on this page.
    const gapsAbove = caps.map((c) => nearest(c.box, 'below')?.gap ?? Infinity).sort((a, b) => a - b);
    const gapsBelow = caps.map((c) => nearest(c.box, 'above')?.gap ?? Infinity).sort((a, b) => a - b);
    const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];
    if (median(gapsAbove) < median(gapsBelow)) side = 'below';
    else if (median(gapsBelow) < median(gapsAbove)) side = 'above';

    // Each caption's cell: halfway to the neighbouring captions in its row, up to the next caption above/below.
    const cellOf = (i: number): Box => {
      const c = caps[i].box;
      const cx = (c.left + c.right) / 2;
      const cy = (c.top + c.bottom) / 2;
      const rowTol = (c.bottom - c.top) * 3;
      let left = 0;
      let right = canvas.width;
      for (const o of caps) {
        const ox = (o.box.left + o.box.right) / 2;
        if (o === caps[i] || Math.abs((o.box.top + o.box.bottom) / 2 - cy) > rowTol) continue;
        if (ox < cx) left = Math.max(left, (ox + cx) / 2);
        else if (ox > cx) right = Math.min(right, (ox + cx) / 2);
      }
      const sameColumn = caps.filter((o) => o !== caps[i] && overlapX(o.box, { left, right, top: 0, bottom: 0 }) > 0);
      const top = side === 'below' ? Math.max(0, ...sameColumn.filter((o) => o.box.bottom <= c.top).map((o) => o.box.bottom)) : c.bottom;
      const bottom = side === 'below' ? c.top : Math.min(canvas.height, ...sameColumn.filter((o) => o.box.top >= c.bottom).map((o) => o.box.top));
      return { left, right, top, bottom };
    };

    const claimed = new Set<Shape>();
    for (let i = 0; i < caps.length; i++) {
      const primary = nearest(caps[i].box, side);
      if (!primary || claimed.has(primary.shape)) continue;
      const cell = cellOf(i);
      // Detached pieces of the same picture (white-background diagrams): wholly inside this cell and
      // close to what has been gathered so far — a page title further up the cell is not part of it.
      const inCell = shapes.filter(
        (s) =>
          s !== primary.shape &&
          !claimed.has(s) &&
          s.left >= cell.left &&
          s.right <= cell.right &&
          s.top >= cell.top &&
          s.bottom <= cell.bottom,
      );
      const parts: Shape[] = [primary.shape];
      for (let grew = true; grew; ) {
        grew = false;
        const box = union(parts);
        const reach = Math.max(30, (box.bottom - box.top) * 0.15);
        for (const s of inCell) {
          if (parts.includes(s)) continue;
          const dx = Math.max(0, s.left - box.right, box.left - s.right);
          const dy = Math.max(0, s.top - box.bottom, box.top - s.bottom);
          if (dx <= reach && dy <= reach) {
            parts.push(s);
            grew = true;
          }
        }
      }
      if (parts.reduce((sum, s) => sum + s.drawingInk, 0) < MIN_DRAWING_INK) continue; // only text
      parts.forEach((s) => claimed.add(s));
      const box = union(parts);
      // Labels just outside the drawing (axis titles, arrows' text) belong to it — not captions.
      const labels = textBoxes.filter(
        (t) =>
          t.right - t.left < (box.right - box.left) * 1.2 &&
          overlapX(t, box) > 0 &&
          t.bottom > box.top - 12 &&
          t.top < box.bottom + 12,
      );
      const area = union([box, ...labels]);
      // Never reach into the caption itself.
      const cap = caps[i].box;
      if (side === 'below') area.bottom = Math.min(area.bottom, cap.top);
      else area.top = Math.max(area.top, cap.bottom);
      const blob = await crop(canvas, area, side === 'below' ? { bottom: cap.top } : { top: cap.bottom });
      if (blob) figures.push({ ref: caps[i].ref, blob });
    }
  }
  return { figures, missed: [] };
}

/**
 * Connected shapes of ink on the rendered page, on a coarse grid (text lines masked out so
 * captions and paragraphs don't glue pictures together).
 */
function findShapes(pixels: Uint8ClampedArray, width: number, height: number, textBoxes: Box[], barriers: Box[]): Shape[] {
  const gw = Math.ceil(width / CELL);
  const gh = Math.ceil(height / CELL);
  // 1 = text (label), 2 = barrier (caption / paragraph): ignored completely.
  const textMask = new Uint8Array(width * height);
  const paint = (b: Box, value: number) => {
    const x0 = Math.max(0, Math.floor(b.left));
    const x1 = Math.min(width, Math.ceil(b.right));
    for (let y = Math.max(0, Math.floor(b.top)); y < Math.min(height, Math.ceil(b.bottom)); y++) {
      if (x1 > x0) textMask.fill(value, y * width + x0, y * width + x1);
    }
  };
  textBoxes.forEach((b) => paint(b, 1));
  barriers.forEach((b) => paint(b, 2));

  // Per cell: any ink at all (for connectivity, labels included) and drawing ink (outside text).
  const cellInk = new Uint8Array(gw * gh);
  const cellDrawing = new Uint32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const gy = (y / CELL) | 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11 >= INK) continue;
      const g = gy * gw + ((x / CELL) | 0);
      const mask = textMask[y * width + x];
      if (mask === 2) continue;
      if (mask === 1) {
        // Text inside a drawing still connects it; isolated text lines are dropped below.
        cellInk[g] = cellInk[g] || 2;
      } else {
        cellInk[g] = 1;
        cellDrawing[g]++;
      }
    }
  }

  const label = new Int32Array(gw * gh).fill(-1);
  const shapes: Shape[] = [];
  const stack: number[] = [];
  for (let start = 0; start < gw * gh; start++) {
    if (cellInk[start] !== 1 || label[start] !== -1) continue; // shapes grow from drawing ink
    const id = shapes.length;
    let minX = gw;
    let minY = gh;
    let maxX = 0;
    let maxY = 0;
    let drawingInk = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const g = stack.pop()!;
      const gx = g % gw;
      const gy = (g / gw) | 0;
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
      drawingInk += cellDrawing[g];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ng = ny * gw + nx;
          if (cellInk[ng] && label[ng] === -1) {
            label[ng] = id;
            stack.push(ng);
          }
        }
      }
    }
    shapes.push({
      left: minX * CELL,
      top: minY * CELL,
      right: Math.min(width, (maxX + 1) * CELL),
      bottom: Math.min(height, (maxY + 1) * CELL),
      drawingInk,
    });
  }
  // Specks (dust, table rules' corners) aren't pictures.
  return shapes.filter((s) => s.right - s.left >= 12 && s.bottom - s.top >= 12);
}

/** Cuts a box (plus a little white margin, never past `limit`) out of the rendered page. */
async function crop(canvas: HTMLCanvasElement, b: Box, limit: { top?: number; bottom?: number } = {}): Promise<Blob | null> {
  const pad = 6;
  const x = Math.max(0, Math.floor(b.left) - pad);
  const y = Math.max(0, limit.top ?? 0, Math.floor(b.top) - pad);
  const w = Math.min(canvas.width, Math.ceil(b.right) + pad) - x;
  const h = Math.min(canvas.height, limit.bottom ?? Infinity, Math.ceil(b.bottom) + pad) - y;
  if (w < 12 || h < 12) return null;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
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
