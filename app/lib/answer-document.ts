export type AnswerPage = { number: number; image: string };

function imageData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

export async function readAnswerDocument(file: File): Promise<{ text: string | null; pages: AnswerPage[] }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("10MB 이하의 파일을 선택하세요.");
  if (/\.(txt|md)$/i.test(file.name)) {
    const text = await file.text();
    if (text.length > 20000) throw new Error("답안은 20,000자 이하로 나누어 주세요.");
    return { text, pages: [] };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    // Serve the matching worker untransformed; dev HMR imports require window.
    pdfjs.GlobalWorkerOptions.workerSrc = `/vendor/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 5) throw new Error("한 답안은 PDF 5페이지 이하로 나누어 주세요.");
      const pages: AnswerPage[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const initial = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(initial.width, initial.height)) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        pages.push({ number: n, image: canvas.toDataURL("image/jpeg", .86) });
        canvas.width = 0; canvas.height = 0;
      }
      return { text: null, pages };
    } finally { await task.destroy(); }
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("TXT, MD, PDF, JPG, PNG, WEBP 파일을 선택하세요.");
  const image = new Image();
  image.src = await imageData(file);
  await image.decode();
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { text: null, pages: [{ number: 1, image: canvas.toDataURL("image/jpeg", .86) }] };
}
