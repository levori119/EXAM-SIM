import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { isAnswerKeyLine } from './parseQuestions';

/** One visual text line of a PDF page, with its box in PDF units (origin bottom-left, y up). */
export interface PdfLine {
  text: string;
  x0: number;
  x1: number;
  yBottom: number;
  yTop: number;
  /** Pieces of the line separated by wide gaps — e.g. the captions of a row of pictures. */
  segments: PdfLine[];
}

const loaded = new WeakMap<File, Promise<PDFDocumentProxy>>();

/** Opens a PDF once per File, so text and figure extraction share the parse. */
export function loadPdf(file: File): Promise<PDFDocumentProxy> {
  let doc = loaded.get(file);
  if (!doc) {
    // Loaded lazily: pdf.js is large and only admins uploading files need it.
    doc = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
      async ([pdfjs, { default: workerUrl }]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      },
    );
    loaded.set(file, doc);
  }
  return doc;
}

const HEBREW_RE = /[֐-׿]/g;
const LATIN_OR_DIGIT_RE = /[A-Za-z0-9]/g;

/**
 * Hebrew lines read right-to-left, but a line like "46 a 93 ג 140 b" (an English answer key with
 * one Hebrew letter) must stay left-to-right — so direction follows the majority script.
 */
export function isRtlLine(text: string): boolean {
  return (text.match(HEBREW_RE)?.length ?? 0) > (text.match(LATIN_OR_DIGIT_RE)?.length ?? 0);
}

interface Run {
  x: number;
  y: number;
  width: number;
  height: number;
  str: string;
}

export async function pageLines(page: PDFPageProxy): Promise<PdfLine[]> {
  const content = await page.getTextContent();
  const runs: Run[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    runs.push({ x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || 10, str: item.str });
  }

  // Group runs into visual lines, top to bottom. Table cells in one row can sit a little
  // above or below each other, so a run joins the line if it's within ~half a line height.
  runs.sort((a, b) => b.y - a.y);
  const groups: Run[][] = [];
  for (const run of runs) {
    const line = groups[groups.length - 1];
    if (line && Math.abs(line[0].y - run.y) <= Math.max(2, Math.min(line[0].height, run.height) * 0.5)) line.push(run);
    else groups.push([run]);
  }

  return groups.map((line) => {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    const segments: Run[][] = [];
    for (const run of sorted) {
      const seg = segments[segments.length - 1];
      const prev = seg?.[seg.length - 1];
      if (prev && run.x - (prev.x + prev.width) < Math.max(prev.height, run.height) * 2) seg.push(run);
      else segments.push([run]);
    }
    return {
      ...toLine(line),
      segments: segments.length > 1 ? segments.map((s) => ({ ...toLine(s), segments: [] })) : [],
    };
  });
}

function toLine(line: Run[]): Omit<PdfLine, 'segments'> {
  const join = (rs: Run[]) => rs.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
  const ltr = join([...line].sort((a, b) => a.x - b.x));
  const rtl = join([...line].sort((a, b) => b.x - a.x));
  // Answer-key rows ("1 ב 4 ד 7 א") can't be told apart by script majority —
  // prefer whichever reading order yields clean "number letter" pairs.
  const ltrKey = isAnswerKeyLine(ltr);
  const text = ltrKey !== isAnswerKeyLine(rtl) ? (ltrKey ? ltr : rtl) : isRtlLine(ltr) ? rtl : ltr;
  return {
    text,
    x0: Math.min(...line.map((r) => r.x)),
    x1: Math.max(...line.map((r) => r.x + r.width)),
    yBottom: Math.min(...line.map((r) => r.y)),
    yTop: Math.max(...line.map((r) => r.y + r.height)),
  };
}
