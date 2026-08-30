/**
 * ينسخ ملفات تشغيل tesseract من node_modules إلى public/
 * حتى يعمل OCR أوفلاين (بدون CDN).
 *
 * الاستخدام: npm run tessdata:sync
 * (يُستدعى أيضًا من postinstall)
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pubTess = join(root, 'public', 'tesseract');
const pubData = join(root, 'public', 'tessdata');

mkdirSync(pubTess, { recursive: true });
mkdirSync(pubData, { recursive: true });

function tryCopy(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[tessdata:sync] تخطي ${label}: غير موجود (${src})`);
    return false;
  }
  copyFileSync(src, dest);
  console.log(`[tessdata:sync] ✓ ${label}`);
  return true;
}

const nm = join(root, 'node_modules');
const tj = join(nm, 'tesseract.js');
const core = join(nm, 'tesseract.js-core');

tryCopy(join(tj, 'dist', 'worker.min.js'), join(pubTess, 'worker.min.js'), 'worker.min.js');
// core: اسم الملف قد يختلف بين إصدارات — نجرب الشائع
const coreCandidates = [
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core.wasm.js',
];
let coreJs = null;
for (const name of coreCandidates) {
  const p = join(core, name);
  if (existsSync(p)) {
    coreJs = name;
    tryCopy(p, join(pubTess, 'tesseract-core-simd-lstm.wasm.js'), name);
    // wasm binary إن وُجد بنفس الاسم بدون .js
    const wasmName = name.replace(/\.js$/, '');
    tryCopy(join(core, wasmName), join(pubTess, 'tesseract-core-simd-lstm.wasm'), wasmName);
    break;
  }
}
if (!coreJs) {
  console.warn('[tessdata:sync] لم يُعثر على tesseract.js-core — أبقِ الملفات الحالية في public/tesseract');
}

// بيانات اللغة لا تُنسخ من npm افتراضيًا (حجم كبير) — تُوضع يدويًا في public/tessdata
for (const lang of ['eng', 'ara']) {
  const f = join(pubData, `${lang}.traineddata.gz`);
  if (existsSync(f)) console.log(`[tessdata:sync] ✓ ${lang}.traineddata.gz موجود`);
  else
    console.warn(
      `[tessdata:sync] ناقص: public/tessdata/${lang}.traineddata.gz — حمّله للأوفلاين`,
    );
}

console.log('[tessdata:sync] انتهى');
