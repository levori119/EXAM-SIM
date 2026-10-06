import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Download,
  ExternalLink,
  File,
  FileText,
  FileType2,
  Globe,
  Image as ImageIcon,
  Link2,
  Music,
  Video,
  X,
} from 'lucide-react';
import type { Material, MaterialKind } from '../../db/db';
import { loadPdf } from '../../ingest/pdf';
import { loadDocx } from '../../ingest/extractText';
import { downloadMaterial, MATERIAL_KIND_LABELS } from '../../services/materials';
import { useBlobUrl } from '../../components/media';
import { Button } from '../../components/fields';

export const MATERIAL_ICONS: Record<MaterialKind, ComponentType<{ className?: string }>> = {
  html: Globe,
  pdf: FileText,
  docx: FileType2,
  image: ImageIcon,
  video: Video,
  audio: Music,
  text: FileText,
  link: Link2,
  file: File,
};

/** Full-screen viewer for any study material. */
export function MaterialViewer({ material, onClose }: { material: Material | null; onClose: () => void }) {
  useEffect(() => {
    if (!material) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [material, onClose]);

  if (!material) return null;
  const Icon = MATERIAL_ICONS[material.kind];

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[55] flex flex-col bg-slate-100 dark:bg-slate-950"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal
      aria-label={material.title}
    >
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onClose}
          aria-label="סגירה"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-6 w-6" />
        </button>
        <Icon className="h-5 w-5 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold" dir="auto">{material.title}</h2>
          <p className="truncate text-xs text-slate-500">{MATERIAL_KIND_LABELS[material.kind]}</p>
        </div>
        {material.kind === 'link' && material.url && (
          <a href={material.url} target="_blank" rel="noreferrer noopener">
            <Button>
              <ExternalLink className="h-5 w-5" /> <span className="hidden sm:inline">פתיחה</span>
            </Button>
          </a>
        )}
        {material.blob && (
          <Button onClick={() => downloadMaterial(material)}>
            <Download className="h-5 w-5" /> <span className="hidden sm:inline">הורדה</span>
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <MaterialBody material={material} />
      </div>
    </motion.div>,
    document.body,
  );
}

function MaterialBody({ material }: { material: Material }) {
  const url = useBlobUrl(material.blob ?? undefined);
  switch (material.kind) {
    case 'html':
      return <HtmlFrame blob={material.blob!} title={material.title} />;
    case 'pdf':
      return <PdfPages blob={material.blob!} name={material.fileName ?? 'file.pdf'} />;
    case 'docx':
      return <DocxPage blob={material.blob!} name={material.fileName ?? 'file.docx'} />;
    case 'image':
      return url ? <img src={url} alt={material.title} className="mx-auto max-h-full max-w-full touch-pinch-zoom object-contain p-4" /> : null;
    case 'video':
      return url ? <video src={url} controls playsInline className="mx-auto max-h-full w-full max-w-5xl p-4" /> : null;
    case 'audio':
      return (
        <div className="flex h-full items-center justify-center p-6">
          {url && <audio src={url} controls className="w-full max-w-xl" />}
        </div>
      );
    case 'text':
      return <TextPage blob={material.blob!} />;
    case 'link':
      return (
        <div className="mx-auto max-w-xl p-8 text-center">
          {material.description && <p className="mb-4 text-slate-600 dark:text-slate-300" dir="auto">{material.description}</p>}
          <a
            href={material.url ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all text-lg font-semibold text-indigo-600 underline dark:text-indigo-400"
            dir="ltr"
          >
            {material.url}
          </a>
        </div>
      );
    default:
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
          <File className="h-12 w-12 text-slate-400" />
          <p className="text-slate-600 dark:text-slate-300">אי אפשר להציג את סוג הקובץ הזה בדפדפן. אפשר להוריד אותו ולפתוח בתוכנה המתאימה.</p>
          <Button variant="primary" onClick={() => downloadMaterial(material)}>
            <Download className="h-5 w-5" /> הורדה
          </Button>
        </div>
      );
  }
}

/**
 * Interactive HTML runs in a sandboxed frame: scripts and forms work, but without
 * same-origin access it can't read this app's data or the user's session.
 */
function HtmlFrame({ blob, title }: { blob: Blob; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    void blob.text().then(setHtml);
  }, [blob]);
  if (html === null) return <Spinner />;
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
      className="h-full w-full border-0 bg-white"
    />
  );
}

/** PDF pages rendered with pdf.js (consistent on iPad/Safari, where embedded PDFs show one page). */
function PdfPages({ blob, name }: { blob: Blob; name: string }) {
  const [pages, setPages] = useState<number | null>(null);
  const [file] = useState(() => new window.File([blob], name, { type: 'application/pdf' }));
  useEffect(() => {
    void loadPdf(file).then((pdf) => setPages(pdf.numPages));
  }, [file]);
  if (pages === null) return <Spinner />;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 sm:p-6">
      {Array.from({ length: pages }, (_, i) => (
        <PdfPage key={i} file={file} pageNumber={i + 1} />
      ))}
    </div>
  );
}

function PdfPage({ file, pageNumber }: { file: globalThis.File; pageNumber: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(1.414);

  // Render a page only when it scrolls near the viewport.
  useEffect(() => {
    if (visible || !holder.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '600px' });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const page = await (await loadPdf(file)).getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const width = holder.current?.clientWidth ?? 800;
      const viewport = page.getViewport({ scale: (width / base.width) * Math.min(2, window.devicePixelRatio || 1) });
      if (cancelled || !canvas.current) return;
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      await page.render({ canvas: canvas.current, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, file, pageNumber]);

  return (
    <div ref={holder} className="w-full overflow-hidden rounded-lg bg-white shadow" style={{ aspectRatio: `1 / ${ratio}` }}>
      {/* pdf.js draws each glyph itself; an inherited RTL direction would shift them. */}
      <canvas ref={canvas} dir="ltr" className="h-full w-full" aria-label={`עמוד ${pageNumber}`} />
    </div>
  );
}

/** Word documents converted to HTML, shown in an isolated frame with document-like styling. */
function DocxPage({ blob, name }: { blob: Blob; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    const file = new window.File([blob], name);
    void loadDocx(file).then((doc) => setHtml(doc.body.innerHTML));
  }, [blob, name]);
  if (html === null) return <Spinner />;
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:"Segoe UI",Arial,sans-serif;line-height:1.7;max-width:820px;margin:0 auto;padding:32px 24px;color:#0f172a;background:#fff}
    img{max-width:100%;height:auto} table{border-collapse:collapse;margin:12px 0} td,th{border:1px solid #cbd5e1;padding:6px 10px}
    h1,h2,h3{line-height:1.3} p,li,td,h1,h2,h3{unicode-bidi:plaintext;text-align:start}
  </style></head><body dir="auto">${html}</body></html>`;
  return <iframe title={name} srcDoc={srcDoc} sandbox="" className="h-full w-full border-0 bg-white" />;
}

function TextPage({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void blob.text().then(setText);
  }, [blob]);
  if (text === null) return <Spinner />;
  return (
    <pre className="mx-auto max-w-4xl whitespace-pre-wrap p-6 font-sans leading-relaxed" dir="auto">
      {text}
    </pre>
  );
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
    </div>
  );
}
