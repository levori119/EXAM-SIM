import { emptyDraft, type QuestionDraft } from '../services/questionBank';
import { extractText } from './extractText';
import { compressImage, matchImages } from './images';
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

export type FileRole = 'questions' | 'answers' | 'image' | 'unreadable';

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
 * text/PDF with only "1-ב 2-ג" pairs → answer key applied by question number.
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
    if (!text?.trim()) {
      next.files.push({ file, role: 'unreadable' });
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
    } else {
      next.files.push({ file, role: 'unreadable' });
      next.notices.push(`לא זוהו שאלות או מפתח תשובות ב-"${file.name}". פורמט נתמך: "1. שאלה" / "א. תשובה" / "1-ב".`);
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

  // Link new images to all questions, and all images to newly added questions.
  next.media.push(...newMedia);
  // (Earlier questions only get the new images, so manual unlinks in review stick.)
  let linked = 0;
  next.items = next.items.map((item, index) => {
    const pool = index < prev.items.length ? newMedia : next.media;
    const matches = matchImages(item.draft.text, item.number, pool).filter((id) => !item.draft.imageIds.includes(id));
    if (!matches.length) return item;
    linked += matches.length;
    return { ...item, draft: { ...item.draft, imageIds: [...item.draft.imageIds, ...matches] } };
  });
  if (newMedia.length) {
    next.notices.push(
      `נוספו ${newMedia.length} תמונות, ${linked} קישורים לשאלות זוהו אוטומטית. ניתן לשייך תמונות ידנית בכל שאלה.`,
    );
  }

  return next;
}
