import fs from 'node:fs';

const backend = fs.readFileSync('backend/src/shared/errors/errorCodes.ts', 'utf8');
const frontendCodes = fs.readFileSync('frontend/lib/errorCodes.ts', 'utf8');
const frontendMessages = fs.readFileSync('frontend/lib/i18n/ar/errors.ts', 'utf8');

const keys = (text) => new Set(
  [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*(?:['"]|\()/gm)].map((m) => m[1])
);

const backendCodes = keys(backend);
const mirroredCodes = keys(frontendCodes);
const translatedCodes = keys(frontendMessages);
const frontendOnly = new Set(['NETWORK_ERROR', 'OFFLINE_QUEUED', 'QUEUE_STORE_FAILED', 'QUEUE_BODY_TOO_LARGE']);

const missingMirror = [...backendCodes].filter((code) => !mirroredCodes.has(code));
const missingTranslation = [...backendCodes].filter((code) => !translatedCodes.has(code));
const missingFrontendOnly = [...frontendOnly].filter((code) => !translatedCodes.has(code));
const unexpectedTranslations = [...translatedCodes].filter((code) => !mirroredCodes.has(code) && !frontendOnly.has(code));

if (missingMirror.length || missingTranslation.length || missingFrontendOnly.length || unexpectedTranslations.length) {
  console.error(JSON.stringify({ missingMirror, missingTranslation, missingFrontendOnly, unexpectedTranslations }, null, 2));
  process.exit(1);
}

console.log(`Error contract OK: ${backendCodes.size} backend codes, ${frontendOnly.size} frontend-only codes, all mirrored and translated.`);
