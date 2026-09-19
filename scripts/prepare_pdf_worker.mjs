import { copyFile, mkdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("node_modules/pdfjs-dist/package.json", root), "utf8"));
const target = new URL("public/vendor/pdfjs/", root);
await mkdir(target, { recursive: true });
await copyFile(new URL("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", root), new URL(`pdf.worker-${metadata.version}.min.mjs`, target));
