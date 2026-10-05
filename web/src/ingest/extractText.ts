import { isAnswerKeyLine } from './parseQuestions';

/** Returns the plain text of an uploaded file, or null if it has no text layer we can read. */
export async function extractText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return extractPdfText(file);
  if (name.endsWith('.docx')) return extractDocxText(file);
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return file.text();
  // Images need OCR (Tesseract / Claude Vision) — not wired in yet.
  return null;
}

const HEBREW_RE = /[֐-׿]/g;
const LATIN_OR_DIGIT_RE = /[A-Za-z0-9]/g;

/**
 * Hebrew lines read right-to-left, but a line like "46 a 93 ג 140 b" (an English answer key with
 * one Hebrew letter) must stay left-to-right — so direction follows the majority script.
 */
function isRtlLine(text: string): boolean {
  return (text.match(HEBREW_RE)?.length ?? 0) > (text.match(LATIN_OR_DIGIT_RE)?.length ?? 0);
}

interface Run {
  x: number;
  y: number;
  height: number;
  str: string;
}

async function extractPdfText(file: File): Promise<string> {
  // Loaded lazily: pdf.js is large and only admins uploading files need it.
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const runs: Run[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      runs.push({ x: item.transform[4], y: item.transform[5], height: item.height || 10, str: item.str });
    }

    // Group runs into visual lines, top to bottom. Table cells in one row can sit a little
    // above or below each other, so a run joins the line if it's within ~half a line height.
    runs.sort((a, b) => b.y - a.y);
    const lines: Run[][] = [];
    for (const run of runs) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line[0].y - run.y) <= Math.max(2, Math.min(line[0].height, run.height) * 0.5)) line.push(run);
      else lines.push([run]);
    }

    pages.push(
      lines
        .map((line) => {
          const join = (runs: Run[]) => runs.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
          const ltr = join([...line].sort((a, b) => a.x - b.x));
          const rtl = join([...line].sort((a, b) => b.x - a.x));
          // Answer-key rows ("1 ב 4 ד 7 א") can't be told apart by script majority —
          // prefer whichever reading order yields clean "number letter" pairs.
          const ltrKey = isAnswerKeyLine(ltr);
          if (ltrKey !== isAnswerKeyLine(rtl)) return ltrKey ? ltr : rtl;
          return isRtlLine(ltr) ? rtl : ltr;
        })
        .join('\n'),
    );
  }
  return pages.join('\n');
}

/**
 * Word: paragraphs become lines and each table row becomes one line ("45 b 92 b 139 d").
 * Auto-numbered lists lose their numbers in conversion, so they are re-added: top-level items
 * are numbered continuously across the document (questions), nested items get letters (options).
 */
async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  let questionNumber = 0;

  const ownText = (li: Element) =>
    [...li.childNodes]
      .filter((n) => !(n instanceof Element && (n.tagName === 'OL' || n.tagName === 'UL')))
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  const walkList = (list: Element, depth: number) => {
    let index = 0;
    for (const li of list.children) {
      if (li.tagName !== 'LI') continue;
      const text = ownText(li);
      let prefix = '';
      if (list.tagName === 'OL') {
        if (depth === 0) prefix = `${++questionNumber}. `;
        else prefix = `${(isRtlLine(text) ? 'אבגדהוזח' : 'abcdefgh')[index] ?? ''}. `;
      }
      index++;
      if (text) lines.push(prefix + text);
      for (const nested of li.children) {
        if (nested.tagName === 'OL' || nested.tagName === 'UL') walkList(nested, depth + 1);
      }
    }
  };

  const walk = (el: Element) => {
    for (const child of el.children) {
      const tag = child.tagName;
      if (tag === 'TABLE') {
        for (const row of child.querySelectorAll('tr')) {
          lines.push([...row.children].map((cell) => cell.textContent?.trim() ?? '').filter(Boolean).join(' '));
        }
      } else if (tag === 'OL' || tag === 'UL') {
        walkList(child, 0);
      } else if (/^(P|H[1-6])$/.test(tag)) {
        lines.push(child.textContent?.trim() ?? '');
      } else {
        walk(child);
      }
    }
  };
  walk(doc.body);
  return lines.filter(Boolean).join('\n');
}
