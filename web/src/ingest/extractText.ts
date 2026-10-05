/** Returns the plain text of an uploaded file, or null if it has no text layer we can read. */
export async function extractText(file: File): Promise<string | null> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file);
  }
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name)) {
    return file.text();
  }
  // Images need OCR (Tesseract / Claude Vision) — not wired in yet.
  return null;
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

    // Group text runs into visual lines by their baseline (y), top to bottom.
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2; // tolerate tiny baseline jitter
      const x = item.transform[4];
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x, str: item.str });
    }

    const pageText = [...lines.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, runs]) => {
        // Hebrew lines read right-to-left; order runs by x accordingly.
        const rtl = runs.some((r) => /[֐-׿]/.test(r.str));
        runs.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
        return runs.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
      })
      .join('\n');
    pages.push(pageText);
  }
  return pages.join('\n');
}
