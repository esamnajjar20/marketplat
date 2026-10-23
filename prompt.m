Act as a Principal Frontend Architect. Fix RC-001 from the audit report.

TASK:
1. Read ONLY this file: `frontend/app/(protected)/layout.tsx`. Do NOT run `ls`, do NOT explore other files.
2. If it starts with `'use client'`, identify the interactive parts (hooks, event handlers, client components like BottomNav).
3. Create a new file `frontend/app/(protected)/ProtectedLayoutClient.tsx`:
   - Must start with `'use client';`.
   - Move ALL client logic from the old layout into this file.
   - Export default function that receives `children`.
4. Replace the content of `frontend/app/(protected)/layout.tsx` with a minimal Server Component that imports ProtectedLayoutClient.
5. Run `npm run type-check` ONCE.
   - PASS: Run `git add frontend/app/(protected)/layout.tsx frontend/app/(protected)/ProtectedLayoutClient.tsx && git commit -m "perf(rsc): extract client logic from (protected)/layout.tsx"`
   - FAIL: Run `git restore .` and stop.

Do NOT run `npm run build`. Do NOT touch any other files.
