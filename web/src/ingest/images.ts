const MAX_DIMENSION = 1600;
const QUALITY = 0.85;

/** Downscales and re-encodes an image so diagrams stay small enough to cache offline. */
export async function compressImage(file: File): Promise<Blob> {
  return compressImageBlob(file);
}

export async function compressImageBlob(file: Blob): Promise<Blob> {
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

// Words that introduce a figure reference, in Hebrew and English ("בתמונה 36", "picture 36", "Fig. 3.1").
const FIGURE_WORDS = String.raw`(?:איור|תרשים|שרטוט|סרטוט|תמונה|תמונות|ציור|צילום|גרף|טבלה|figure|fig\.?|pictures?|pic\.?|photo(?:graph)?s?|images?|img|diagrams?|drawings?|illustrations?|sketch(?:es)?|charts?|graphs?)`;
const NUMBER = String.raw`\d{1,3}(?:\.\d{1,2})?`;
const NUMBER_WORD = String.raw`(?:(?:no\.?|number|מס['׳.]?|מספר)\s*)?`;
// "picture 36", "pictures 36, 37 and 38", "תמונות 4 ו-5", "תרשים א'"
const FIGURE_REF_RE = new RegExp(
  String.raw`${FIGURE_WORDS}[\s_\-.:#]*${NUMBER_WORD}(${NUMBER}(?:\s*(?:,|and|&|or|או|ו-?)\s*${NUMBER})*|[א-ת](?=['׳"]|\s|$|[.,:)]))`,
  'gi',
);
/** A caption line under/over a picture: "תמונה 36", "Figure 3: Port side", "איור 2 - מבט על". */
const CAPTION_LINE_RE = new RegExp(
  String.raw`^\s*${FIGURE_WORDS}[\s_\-.:#]*${NUMBER_WORD}(${NUMBER}|[א-ת](?=['׳"]|\s|$))['׳"]?\s*(?:[:.\-–—]\s*.{0,40})?$`,
  'i',
);
const QUESTION_FILENAME_RE = /^(?:q|question|שאלה|ש)?[\s_\-.]*(\d{1,3})(?:[\s_\-.][a-zא-ת\d]{0,3})?$/i;

const normalizeRef = (ref: string) => ref.replace(/['׳"]/g, '').toLowerCase();

/** "36, 37 and 38" → ["36", "37", "38"]; a single Hebrew letter ref ("א'") stays as is. */
const splitRefs = (group: string) =>
  /^\d/.test(group) ? (group.match(new RegExp(NUMBER, 'g')) ?? []) : [normalizeRef(group)];

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim();

/** "איור 2.png" → "2", "figure_3.1.jpg" → "3.1", "תרשים א.png" → "א". */
export function figureRefFromFilename(name: string): string | null {
  const match = new RegExp(FIGURE_REF_RE.source, 'i').exec(baseName(name));
  return match ? splitRefs(match[1])[0] ?? null : null;
}

/** "q5.png" / "שאלה 5.jpg" / "5.png" → 5. */
export function questionNumberFromFilename(name: string): number | null {
  const match = QUESTION_FILENAME_RE.exec(baseName(name));
  return match ? Number(match[1]) : null;
}

/** Figure references in a question, e.g. "as depicted in picture 36" → ["36"], "תמונות 4 ו-5" → ["4", "5"]. */
export function figureRefsInText(text: string): string[] {
  return [...text.matchAll(FIGURE_REF_RE)].flatMap((m) => splitRefs(m[1]));
}

/** The figure number of a caption line ("תמונה 36" → "36"), or null if the line isn't a caption. */
export function captionRef(line: string): string | null {
  const match = CAPTION_LINE_RE.exec(line.trim());
  return match ? normalizeRef(match[1]) : null;
}

export interface LinkableImage {
  id: string;
  name: string;
}

export interface LinkableQuestion {
  text: string;
  number: number | null;
}

/**
 * Decides which images belong to which question:
 *  - an image named after a figure ("תמונה 36.png") goes to every question mentioning that figure;
 *  - an image named only by a number ("36.png") is treated as a figure number when some question
 *    mentions that figure, otherwise as the question number.
 * Returns, per question, the ids of its images.
 */
export function assignImages(questions: LinkableQuestion[], images: LinkableImage[]): string[][] {
  const refsPerQuestion = questions.map((q) => new Set(figureRefsInText(q.text)));
  const referenced = new Set(refsPerQuestion.flatMap((r) => [...r]));
  return questions.map((q, i) =>
    images
      .filter((img) => {
        const fig = figureRefFromFilename(img.name);
        if (fig !== null) return refsPerQuestion[i].has(fig);
        const num = questionNumberFromFilename(img.name);
        if (num === null) return false;
        return referenced.has(String(num)) ? refsPerQuestion[i].has(String(num)) : num === q.number;
      })
      .map((img) => img.id),
  );
}
