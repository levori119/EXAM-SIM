const MAX_DIMENSION = 1600;
const QUALITY = 0.85;

/** Downscales and re-encodes an image so diagrams stay small enough to cache offline. */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // diagrams with transparency stay readable in dark mode
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    // Keep the original if re-encoding didn't help (e.g. already-small PNG line art).
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // undecodable formats (HEIC on some browsers) are stored as-is
  }
}

const FIGURE_WORDS = '(?:איור|תרשים|שרטוט|תמונה|גרף|figure|fig\\.?|diagram|image|img)';
const FIGURE_REF_RE = new RegExp(`${FIGURE_WORDS}[\\s_\\-.:]*(?:מס['׳]?\\s*)?(\\d{1,3}(?:\\.\\d{1,2})?|[א-ת](?=['׳"]|\\b|\\s|$))`, 'gi');
const QUESTION_FILENAME_RE = /^(?:q|question|שאלה|ש)?[\s_\-.]*(\d{1,3})(?:[\s_\-.][a-zא-ת\d]{0,3})?$/i;

const normalizeRef = (ref: string) => ref.replace(/['׳"]/g, '').toLowerCase();

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim();

/** "איור 2.png" → "2", "figure_3.1.jpg" → "3.1", "תרשים א.png" → "א". */
export function figureRefFromFilename(name: string): string | null {
  const match = new RegExp(FIGURE_REF_RE.source, 'i').exec(baseName(name));
  return match ? normalizeRef(match[1]) : null;
}

/** "q5.png" / "שאלה 5.jpg" / "5.png" → 5. */
export function questionNumberFromFilename(name: string): number | null {
  const match = QUESTION_FILENAME_RE.exec(baseName(name));
  return match ? Number(match[1]) : null;
}

/** Figure references mentioned in a question's text, e.g. "ראו איור 2" → ["2"]. */
export function figureRefsInText(text: string): string[] {
  return [...text.matchAll(FIGURE_REF_RE)].map((m) => normalizeRef(m[1]));
}

export interface LinkableImage {
  id: string;
  name: string;
}

/**
 * Picks the images that belong to a question: those whose file name matches a figure
 * the question mentions, or whose file name is the question's number.
 */
export function matchImages(questionText: string, questionNumber: number | null, images: LinkableImage[]): string[] {
  const refs = new Set(figureRefsInText(questionText));
  return images
    .filter((img) => {
      const fig = figureRefFromFilename(img.name);
      if (fig !== null) return refs.has(fig);
      const num = questionNumberFromFilename(img.name);
      return num !== null && num === questionNumber;
    })
    .map((img) => img.id);
}
