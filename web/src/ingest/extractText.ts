import { isRtlLine, loadPdf, pageLines } from './pdf';

/** Returns the plain text of an uploaded file, or null if it has no text layer we can read. */
export async function extractText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return extractPdfText(file);
  if (name.endsWith('.docx')) return extractDocxText(file);
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return file.text();
  // Images need OCR (Tesseract / Claude Vision) — not wired in yet.
  return null;
}

async function extractPdfText(file: File): Promise<string> {
  const pdf = await loadPdf(file);
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    pages.push((await pageLines(await pdf.getPage(n))).map((l) => l.text).join('\n'));
  }
  return pages.join('\n');
}

const docxHtml = new WeakMap<File, Promise<Document>>();

/** Converts a .docx to HTML once per File (shared by text and figure extraction). */
export function loadDocx(file: File): Promise<Document> {
  let doc = docxHtml.get(file);
  if (!doc) {
    doc = import('mammoth').then(async (mammoth) => {
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      return new DOMParser().parseFromString(value, 'text/html');
    });
    docxHtml.set(file, doc);
  }
  return doc;
}

/**
 * Word: paragraphs become lines and each table row becomes one line ("45 b 92 b 139 d").
 * Auto-numbered lists lose their numbers in conversion, so they are re-added: top-level items
 * are numbered continuously across the document (questions), nested items get letters (options).
 */
async function extractDocxText(file: File): Promise<string> {
  const doc = await loadDocx(file);
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
