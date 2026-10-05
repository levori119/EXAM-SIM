import { emptyDraft, type QuestionDraft } from '../services/questionBank';
import { extractText } from './extractText';
import { extractFigures } from './figures';
import { assignImages, compressImage, linkText } from './images';
import { parseAnswerKey, parseQuestions } from './parseQuestions';

export interface ReviewItem {
  /** Number as printed in the source file, used to apply answer keys and image names. */
  number: number | null;
  draft: QuestionDraft;
}

export interface PendingMedia {
  id: string;
  name: string;
  blob: Blob;
}

export type FileRole = 'questions' | 'answers' | 'figures' | 'image' | 'unreadable';

export interface UploadResult {
  /** Non-image files kept as source documents; the first questions file is the primary one. */
  files: { file: File; role: FileRole }[];
  items: ReviewItem[];
  media: PendingMedia[];
  notices: string[];
}

export const EMPTY_UPLOAD: UploadResult = { files: [], items: [], media: [], notices: [] };

const isImage = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(file.name);

/**
 * Adds files to an upload in progress. Files are classified automatically:
 * images → media linked to questions; text/PDF with questions → questions;
 * text/PDF with only "1-ב 2-ג" pairs → answer key applied by question number;
 * PDF/Word pictures with captions ("תמונה 36") → media named after their figure number.
 */
export async function addFilesToUpload(prev: UploadResult, files: File[]): Promise<UploadResult> {
  const next: UploadResult = {
    files: [...prev.files],
    items: [...prev.items],
    media: [...prev.media],
    notices: [],
  };
  const answerKeys: Map<number, number>[] = [];
  const newMedia: PendingMedia[] = [];

  for (const file of files) {
    if (isImage(file)) {
      newMedia.push({ id: crypto.randomUUID(), name: file.name, blob: await compressImage(file) });
      continue;
    }

    const text = await extractText(file);
    const { figures, missed } = await extractFigures(file);
    if (figures.length) {
      newMedia.push(...figures.map((f) => ({ id: crypto.randomUUID(), name: `תמונה ${f.ref}`, blob: f.blob })));
      const refs = figures.map((f) => f.ref);
      next.notices.push(
        `חולצו ${figures.length} תמונות מ-"${file.name}" (${refs.slice(0, 12).join(', ')}${refs.length > 12 ? '…' : ''}).`,
      );
    }
    if (missed.length) {
      next.notices.push(`לא ניתן היה לחלץ את ${missed.map((r) => `תמונה ${r}`).join(', ')} מ-"${file.name}" (פורמט ציור של Word). ניתן להעלות אותן כקבצי תמונה.`);
    }
    if (!text?.trim()) {
      next.files.push({ file, role: figures.length ? 'figures' : 'unreadable' });
      if (figures.length) continue;
      next.notices.push(`לא נמצא טקסט ב-"${file.name}" (ייתכן שזהו PDF סרוק) — הקובץ יישמר, ניתן להוסיף שאלות ידנית.`);
      continue;
    }

    const parsed = parseQuestions(text);
    if (parsed.length) {
      next.files.push({ file, role: 'questions' });
      next.items.push(
        ...parsed.map((p) => ({
          number: p.number,
          draft: { ...emptyDraft(), text: p.text, options: p.options, correctIndex: p.correctIndex },
        })),
      );
      continue;
    }

    const key = parseAnswerKey(text);
    if (key.size) {
      next.files.push({ file, role: 'answers' });
      answerKeys.push(key);
      next.notices.push(`"${file.name}" זוהה כמפתח תשובות (${key.size} תשובות).`);
    } else if (figures.length) {
      next.files.push({ file, role: 'figures' });
    } else {
      next.files.push({ file, role: 'unreadable' });
      next.notices.push(`לא זוהו שאלות או מפתח תשובות ב-"${file.name}". פורמט נתמך: "1. שאלה" / "א. תשובה" / "1-ב" / "19 b 66 c".`);
    }
  }

  // Answer keys from separate files win over marks found inside the questions file.
  for (const key of answerKeys) {
    next.items = next.items.map((item) => {
      const index = item.number !== null ? key.get(item.number) : undefined;
      return index !== undefined && index < item.draft.options.length
        ? { ...item, draft: { ...item.draft, correctIndex: index } }
        : item;
    });
  }

  // Link images to questions by figure number ("picture 36" ↔ "תמונה 36") or question number.
  // Earlier questions only get the new images, so manual unlinks made in review stick.
  next.media.push(...newMedia);
  const newIds = new Set(newMedia.map((m) => m.id));
  const assigned = assignImages(
    next.items.map((i) => ({ text: linkText(i.draft.text, i.draft.options), number: i.number })),
    next.media,
  );
  let linked = 0;
  next.items = next.items.map((item, index) => {
    const matches = assigned[index].filter(
      (id) => (index >= prev.items.length || newIds.has(id)) && !item.draft.imageIds.includes(id),
    );
    if (!matches.length) return item;
    linked += matches.length;
    return { ...item, draft: { ...item.draft, imageIds: [...item.draft.imageIds, ...matches] } };
  });
  if (newMedia.length && next.items.length) {
    next.notices.push(
      `${newMedia.length} תמונות, ${linked} שויכו אוטומטית לשאלות בהעלאה הזו. ניתן לשייך תמונות ידנית בכל שאלה.`,
    );
  }

  return next;
}
