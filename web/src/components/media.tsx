import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Link2, X, ZoomIn } from 'lucide-react';

export interface MediaItem {
  id: string;
  name: string;
  blob: Blob;
}

export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** An image that opens full-screen (with native pinch-zoom) when tapped. */
export function ZoomableImage({ item, className = '' }: { item: MediaItem; className?: string }) {
  const url = useBlobUrl(item.blob);
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 ${className}`}
        aria-label={`הגדלת ${item.name}`}
      >
        <img src={url} alt={item.name} className="mx-auto max-h-[60vh] w-auto object-contain" />
        <span className="absolute bottom-2 start-2 rounded-lg bg-slate-900/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
          <ZoomIn className="h-4 w-4" />
        </span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            >
              <img src={url} alt={item.name} className="max-h-full max-w-full touch-pinch-zoom object-contain" />
              <button className="absolute end-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white" aria-label="סגירה">
                <X className="h-6 w-6" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function Thumb({ item, onRemove }: { item: MediaItem; onRemove: () => void }) {
  const url = useBlobUrl(item.blob);
  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700">
      {url && <img src={url} alt={item.name} title={item.name} className="h-full w-full object-contain" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-red-600"
        aria-label={`הסרת ${item.name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface AttachmentsProps {
  imageIds: string[];
  /** Images that can be attached (e.g. the ones uploaded with the same file). */
  pool: MediaItem[];
  onChange: (ids: string[]) => void;
  /** Stores a new image and returns its id. */
  onUpload?: (file: File) => Promise<string>;
}

export function ImageAttachments({ imageIds, pool, onChange, onUpload }: AttachmentsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const byId = new Map(pool.map((m) => [m.id, m]));
  const attached = imageIds.map((id) => byId.get(id)).filter((m): m is MediaItem => !!m);
  const available = pool.filter((m) => !imageIds.includes(m.id));

  const upload = async (files: FileList | null) => {
    if (!files?.length || !onUpload) return;
    setUploading(true);
    try {
      const ids: string[] = [];
      for (const file of files) ids.push(await onUpload(file));
      onChange([...imageIds, ...ids]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm text-slate-500 dark:text-slate-400">תמונות / תרשימים</span>
      <div className="flex flex-wrap items-center gap-2">
        {attached.map((m) => (
          <Thumb key={m.id} item={m} onRemove={() => onChange(imageIds.filter((id) => id !== m.id))} />
        ))}
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700"
          >
            <Link2 className="h-5 w-5" />
            שיוך תמונה
          </button>
        )}
        {onUpload && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700"
          >
            <ImagePlus className="h-5 w-5" />
            {uploading ? 'מעלה…' : 'העלאת תמונה'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {picking && available.length > 0 && (
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          {available.map((m) => (
            <PickThumb
              key={m.id}
              item={m}
              onPick={() => {
                onChange([...imageIds, m.id]);
                if (available.length === 1) setPicking(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickThumb({ item, onPick }: { item: MediaItem; onPick: () => void }) {
  const url = useBlobUrl(item.blob);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-24 flex-col items-center gap-1 rounded-xl p-1 text-[11px] text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
    >
      <span className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
        {url && <img src={url} alt="" className="h-full w-full object-contain" />}
      </span>
      <span className="w-full truncate" dir="auto">{item.name}</span>
    </button>
  );
}
