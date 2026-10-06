import userEvent from '@testing-library/user-event';

/**
 * PERF FIX: shared userEvent.setup() with { delay: null }.
 *
 * Root cause (see vitest.config.ts's testTimeout/hookTimeout comment):
 * plain `userEvent.setup()` uses @testing-library/user-event's default
 * per-keystroke delay. Every `.type()` call dispatches a real
 * keydown/keypress/input/keyup sequence per character, each wrapped in
 * its own act() flush, with a real (non-zero) delay between characters.
 * Forms with long Arabic strings (e.g. ProductForm, RegisterForm,
 * AdForm) multiply this across many fields and many `it()` blocks,
 * which is what pushed individual tests to the observed 5000-5700ms
 * that forced testTimeout/hookTimeout up to 20s in the first place —
 * a timeout increase that masked the slowness rather than it.
 *
 * `{ delay: null }` is user-event's own documented option for this:
 * it keeps the exact same realistic event sequence (keydown → keypress
 * → input → keyup, same act() batching, same DOM events real users
 * trigger) but removes the artificial wait between them. This does
 * NOT change what a test asserts or how a component behaves — it only
 * removes real time your test doesn't actually need to spend waiting.
 *
 * Use this instead of bare `userEvent.setup()` in any test file that
 * calls `.type()`, especially with long strings. Click-only/keyboard-
 * shortcut-only test files can keep using `userEvent.setup()` directly
 * since there's no per-character delay to eliminate there — see the
 * rollout notes in the PR/commit this shipped with for which files
 * were prioritized first.
 */
export function setupUser() {
  return userEvent.setup({ delay: null });
}
