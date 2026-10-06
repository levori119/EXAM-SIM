import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Download, Eye, FilePlus2, Library, Link2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import { db, type Material } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { useCourse } from '../../courses/CourseContext';
import {
  addFileMaterials,
  addLinkMaterial,
  deleteMaterial,
  downloadMaterial,
  formatSize,
  kindOf,
  MATERIAL_KIND_LABELS,
  moveMaterial,
  replaceMaterialFile,
  titleFromFileName,
  updateMaterial,
  type NewFileMaterial,
} from '../../services/materials';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { EmptyState, PageHeader } from '../../components/PageHeader';
import { IconButton } from '../../components/IconButton';
import { Button, ErrorText, TextAreaField, TextField } from '../../components/fields';
import { MATERIAL_ICONS, MaterialViewer } from './MaterialViewer';

/** Study materials of the current course. `editable` = admin management; otherwise a read-only library. */
export function MaterialsPage({ editable }: { editable: boolean }) {
  const { courseId, course } = useCourse();
  const materials = useLiveQuery(() => db.materials.where('courseId').equals(courseId ?? '').sortBy('order'), [courseId]);
  const [viewing, setViewing] = useState<Material | null>(null);
  const [pending, setPending] = useState<File[] | null>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!course) return null;

  const pick = (files: FileList | File[] | null) => {
    const list = [...(files ?? [])];
    if (list.length) setPending(list);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (editable) pick(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={dragging ? 'rounded-3xl outline-2 outline-dashed outline-indigo-400' : ''}
    >
      <PageHeader
        title={editable ? `חומרי לימוד — ${course.name}` : 'חומרי לימוד'}
        subtitle={editable ? 'דפי HTML אינטראקטיביים, PDF, Word, תמונות, וידאו, קישורים — כל חומר שאינו מבחן' : undefined}
        actions={
          editable && (
            <>
              <Button onClick={() => setAddingLink(true)}>
                <Link2 className="h-5 w-5" /> קישור
              </Button>
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload className="h-5 w-5" /> העלאת קבצים
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )
        }
      />

      {materials?.length === 0 ? (
        <EmptyState icon={<Library className="h-10 w-10" />} title="אין עדיין חומרי לימוד">
          {editable ? 'גררו לכאן קבצים, או לחצו "העלאת קבצים". אפשר לתת לכל קובץ שם משלו.' : 'חומרי הלימוד של הקורס יופיעו כאן.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {materials?.map((m, i) => {
            const Icon = MATERIAL_ICONS[m.kind];
            return (
              <li key={m.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:p-3 dark:border-slate-800 dark:bg-slate-900">
                <button onClick={() => setViewing(m)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-start">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" dir="auto">{m.title}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400" dir="auto">
                      {MATERIAL_KIND_LABELS[m.kind]}
                      {m.size ? ` · ${formatSize(m.size)}` : ''}
                      {m.description ? ` · ${m.description}` : ''}
                    </span>
                  </span>
                </button>
                {editable ? (
                  <div className="flex shrink-0 flex-wrap justify-end">
                    <IconButton label="הזזה למעלה" disabled={i === 0} onClick={() => moveMaterial(m.id, -1)}>
                      <ArrowUp className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="הזזה למטה" disabled={i === (materials?.length ?? 0) - 1} onClick={() => moveMaterial(m.id, 1)}>
                      <ArrowDown className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="עריכה" onClick={() => setEditing(m)}>
                      <Pencil className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="מחיקה" danger onClick={() => setDeleting(m)}>
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                ) : (
                  <IconButton label="פתיחה" onClick={() => setViewing(m)}>
                    <Eye className="h-5 w-5" />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <MaterialViewer material={viewing} onClose={() => setViewing(null)} />
      {editable && (
        <>
          <UploadDialog files={pending} onClose={() => setPending(null)} />
          <EditDialog material={editing} onClose={() => setEditing(null)} />
          <LinkDialog open={addingLink} onClose={() => setAddingLink(false)} />
          <ConfirmDialog
            open={!!deleting}
            title="מחיקת חומר לימוד"
            message={`למחוק את "${deleting?.title ?? ''}"?`}
            onConfirm={() => (deleting ? deleteMaterial(deleting.id) : undefined)}
            onClose={() => setDeleting(null)}
          />
        </>
      )}
    </div>
  );
}

/** Lets the admin name every file (and describe it) before it's added. */
function UploadDialog({ files, onClose }: { files: File[] | null; onClose: () => void }) {
  const { user } = useAuth();
  const { courseId } = useCourse();
  const [items, setItems] = useState<NewFileMaterial[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!files) return;
    setItems(files.map((file) => ({ file, title: titleFromFileName(file.name), description: '' })));
    setError(null);
  }, [files]);

  const save = async () => {
    if (!user || !courseId) return;
    if (items.some((i) => !i.title.trim())) {
      setError('לכל קובץ צריך שם.');
      return;
    }
    setBusy(true);
    try {
      await addFileMaterials(courseId, items, user.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const set = (i: number, changes: Partial<NewFileMaterial>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...changes } : x)));

  return (
    <Modal
      open={!!files}
      size="lg"
      title={`הוספת ${items.length} חומרי לימוד`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            <FilePlus2 className="h-5 w-5" /> הוספה
          </Button>
        </>
      }
    >
      <ul className="space-y-4">
        {items.map((item, i) => {
          const kind = kindOf(item.file);
          const Icon = MATERIAL_ICONS[kind];
          return (
            <li key={i} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                <Icon className="h-4 w-4 text-indigo-500" />
                <span className="truncate" dir="auto">{item.file.name}</span>
                <span className="shrink-0">
                  · {MATERIAL_KIND_LABELS[kind]} · {formatSize(item.file.size)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField id={`mat-title-${i}`} label="שם" value={item.title} onChange={(e) => set(i, { title: e.target.value })} />
                <TextField id={`mat-desc-${i}`} label="תיאור (לא חובה)" value={item.description} onChange={(e) => set(i, { description: e.target.value })} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}

function EditDialog({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [replacement, setReplacement] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!material) return;
    setTitle(material.title);
    setDescription(material.description);
    setUrl(material.url ?? '');
    setReplacement(null);
    setError(null);
  }, [material]);

  const save = async () => {
    if (!material) return;
    setBusy(true);
    try {
      if (material.kind === 'link' && !/^https?:\/\//i.test(url.trim())) throw new Error('כתובת הקישור צריכה להתחיל ב-http:// או https://');
      await updateMaterial(material.id, { title, description, ...(material.kind === 'link' && { url }) });
      if (replacement) await replaceMaterialFile(material.id, replacement);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!material}
      title="עריכת חומר לימוד"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField id="edit-mat-title" label="שם" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField id="edit-mat-desc" label="תיאור" value={description} onChange={(e) => setDescription(e.target.value)} />
        {material?.kind === 'link' ? (
          <TextField id="edit-mat-url" label="כתובת" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
        ) : (
          <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <div className="mb-2 text-slate-600 dark:text-slate-300" dir="auto">
              קובץ: {replacement ? replacement.name : material?.fileName}
              {replacement && <span className="text-indigo-600"> (יוחלף בשמירה)</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()}>
                <RefreshCw className="h-4 w-4" /> החלפת קובץ
              </Button>
              {material?.blob && (
                <Button variant="ghost" onClick={() => downloadMaterial(material)}>
                  <Download className="h-4 w-4" /> הורדה
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                setReplacement(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </div>
        )}
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}

function LinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { courseId } = useCourse();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setUrl('');
    setDescription('');
    setError(null);
  }, [open]);

  const save = async () => {
    if (!user || !courseId) return;
    setBusy(true);
    try {
      await addLinkMaterial(courseId, title, url, description, user.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="הוספת קישור"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            הוספה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField id="link-url" label="כתובת" dir="ltr" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <TextField id="link-title" label="שם" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField id="link-desc" label="תיאור (לא חובה)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
