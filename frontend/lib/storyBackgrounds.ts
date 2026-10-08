/**
 * FIX STORY-BG-01: the composer used to send the full Tailwind gradient string
 * (41-43 chars) as `background`, but the backend validates max(40) and the DB
 * column is VarChar(40) -> every story with a background failed with
 * 400 VALIDATION_ERROR ("البيانات المرسلة غير صحيحة"). We now send a short key
 * and resolve it to the gradient classes on the client. Class strings stay
 * literal here so Tailwind can see them.
 */
export const STORY_BACKGROUNDS = [
  { key: 'night',  label: 'ليلي',  gradient: 'from-slate-900 via-indigo-900 to-slate-800' },
  { key: 'nature', label: 'طبيعة', gradient: 'from-emerald-700 via-teal-600 to-cyan-700' },
  { key: 'warm',   label: 'دافئ',  gradient: 'from-rose-700 via-pink-600 to-orange-500' },
  { key: 'vivid',  label: 'حيوي',  gradient: 'from-violet-700 via-fuchsia-600 to-rose-500' },
] as const;

export const DEFAULT_STORY_BACKGROUND = 'from-slate-900 to-slate-700';

/** Accepts a key, or a legacy raw gradient string already stored in the DB. */
export function resolveStoryBackground(value: string | null | undefined): string {
  if (!value) return DEFAULT_STORY_BACKGROUND;
  const hit = STORY_BACKGROUNDS.find((b) => b.key === value);
  if (hit) return hit.gradient;
  return LEGACY_OK.test(value) ? value : DEFAULT_STORY_BACKGROUND;
}

// Legacy rows stored the raw string; only accept our own gradient shape.
const LEGACY_OK = /^from-[a-z]+-\d{3}( via-[a-z]+-\d{3})? to-[a-z]+-\d{3}$/;
