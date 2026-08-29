'use client';

/**
 * DESKTOP-AUDIT-05: the three creation forms (ad/product/service listing)
 * were all hard-capped at max-w-2xl on every breakpoint, one column, no
 * live preview of the card being built — despite the exact same
 * side-by-side philosophy already existing for messages
 * (ConversationList + ChatWindow). Desktop screen width went unused and
 * a seller had no way to catch a weak title/price/photo before
 * publishing without first submitting.
 *
 * This is the one shared layout piece all three forms wrap themselves
 * in for create mode: a form column plus a sticky preview sidebar at
 * lg+, collapsing to a single column (preview hidden — each form's own
 * mobile preview, if it has one, covers that) below lg. Pulled out into
 * its own component specifically so the grid/sticky values live in one
 * place instead of being copy-pasted three times with the risk of
 * drifting apart.
 *
 * Edit mode intentionally does NOT use this — see the mode check at
 * each form's own call site.
 */
import type { ReactNode } from 'react';

interface Props {
  /** The <form>...</form> element itself. */
  form: ReactNode;
  /** Live preview panel — hidden below lg, a sticky sidebar at lg+. */
  preview: ReactNode;
}

export function CreateFormLayout({ form, preview }: Props) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="min-w-0">{form}</div>
      {/* top-20 matches ProductDetail/ServiceListingDetail's own sticky
          sidebar offset, clearing ProtectedHeader's sticky top-0 bar. */}
      <aside className="hidden lg:sticky lg:top-20 lg:block">{preview}</aside>
    </div>
  );
}
