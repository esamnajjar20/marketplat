import { z } from 'zod';

// this exact preprocessor (undefined passthrough, otherwise
// Number(value)) was independently copy-pasted into 16 different
// *.validation.ts files across the codebase — every module with a
// paginated/filterable list endpoint had its own private copy. Small
// enough that no single copy caused a bug, but any future the
// coercion logic (e.g. rejecting NaN, rejecting negative page numbers)
// would need to be hand-applied to all 16 to actually take effect
// everywhere. Centralized here instead; call sites now import this.
//
// Note: fraud.validation.ts's local optionalQueryNumber is deliberately
// NOT one of the 16 — it validates via a strict `/^\d+$/` regex before
// transforming, which is stricter (rejects "1.5", "-1", "1e3") than this
// helper's plain `Number(value)`. That's a real behavioral difference,
// not a duplicate, so it's left as-is rather than merged in here.
export const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === undefined ? undefined : Number(value)), schema.optional());
