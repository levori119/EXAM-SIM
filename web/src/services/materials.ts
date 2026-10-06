import { db, type Material, type MaterialKind } from '../db/db';

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  html: 'דף אינטראקטיבי',
  pdf: 'PDF',
  docx: 'Word',
  image: 'תמונה',
  video: 'וידאו',
  audio: 'שמע',
  text: 'טקסט',
  link: 'קישור',
  file: 'קובץ',
};

export function kindOf(file: File): MaterialKind {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === 'text/html' || /\.html?$/.test(name)) return 'html';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return 'text';
  return 'file';
}

/** "שיעור_3-מבוא.pdf" → "שיעור 3 מבוא" — a readable default title the admin can change. */
export const titleFromFileName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export const formatSize = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

async function nextOrder(courseId: string) {
  const last = await db.materials.where('courseId').equals(courseId).reverse().sortBy('order');
  return (last[0]?.order ?? 0) + 1;
}

export interface NewFileMaterial {
  file: File;
  title: string;
  description: string;
}

export async function addFileMaterials(courseId: string, items: NewFileMaterial[], userId: string): Promise<void> {
  let order = await nextOrder(courseId);
  const now = Date.now();
  await db.materials.bulkAdd(
    items.map(({ file, title, description }) => ({
      id: crypto.randomUUID(),
      courseId,
      title: title.trim() || titleFromFileName(file.name),
      description: description.trim(),
      kind: kindOf(file),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
      url: null,
      order: order++,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      pendingSync: 1 as const,
    })),
  );
}

export async function addLinkMaterial(courseId: string, title: string, url: string, description: string, userId: string): Promise<void> {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) throw new Error('כתובת הקישור צריכה להתחיל ב-http:// או https://');
  const now = Date.now();
  await db.materials.add({
    id: crypto.randomUUID(),
    courseId,
    title: title.trim() || clean,
    description: description.trim(),
    kind: 'link',
    fileName: null,
    mimeType: 'text/uri-list',
    size: 0,
    blob: null,
    url: clean,
    order: await nextOrder(courseId),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    pendingSync: 1,
  });
}

export async function updateMaterial(id: string, changes: { title: string; description: string; url?: string }): Promise<void> {
  if (!changes.title.trim()) throw new Error('יש לתת שם לחומר.');
  await db.materials.update(id, {
    title: changes.title.trim(),
    description: changes.description.trim(),
    ...(changes.url !== undefined && { url: changes.url.trim() }),
    updatedAt: Date.now(),
    pendingSync: 1,
  });
}

/** Replaces the file behind a material, keeping its title, description and place in the list. */
export async function replaceMaterialFile(id: string, file: File): Promise<void> {
  await db.materials.update(id, {
    kind: kindOf(file),
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    updatedAt: Date.now(),
    pendingSync: 1,
  });
}

/** Swaps a material with its neighbour in the course's list. */
export async function moveMaterial(id: string, direction: -1 | 1): Promise<void> {
  const material = await db.materials.get(id);
  if (!material) return;
  const list = await db.materials.where('courseId').equals(material.courseId).sortBy('order');
  const i = list.findIndex((m) => m.id === id);
  const other = list[i + direction];
  if (!other) return;
  await db.transaction('rw', db.materials, async () => {
    await db.materials.update(material.id, { order: other.order });
    await db.materials.update(other.id, { order: material.order });
  });
}

export async function deleteMaterial(id: string): Promise<void> {
  await db.materials.delete(id);
}

export function downloadMaterial(m: Material) {
  if (!m.blob) return;
  const url = URL.createObjectURL(m.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = m.fileName ?? m.title;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
