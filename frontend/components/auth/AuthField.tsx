import { type ReactNode, type ReactElement, useId, isValidElement, cloneElement } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AuthField — DESIGN-PASS AUTH-01.
 *
 * A field wrapper used only by LoginForm/RegisterForm, giving the
 * reference design's look: a leading icon inside the field and a small
 * pill-style label inset on the field's top border, instead of
 * FormField's stacked label above the input.
 *
 * Deliberately NOT built on top of FormField (shared/forms/FormField.tsx):
 * FormField always renders its own stacked <label>, which cannot be
 * suppressed via its render-prop child form — that form only swaps the
 * *input* slot, not the label — so composing them would have produced
 * two labels for one field. FormField has ~15 other call sites (ad
 * forms, settings, ...) that all want that stacked label, so it isn't
 * changed here; this component instead mirrors its same a11y pattern
 * directly (aria-describedby wired to a generated error/hint id,
 * aria-invalid on error, role="alert" on the error text) so behavior
 * for screen readers matches every other field in the app — only the
 * visual position of the label/icon differs.
 */
interface AuthFieldProps {
  label: string;
  htmlFor: string;
  icon: LucideIcon;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /**
   * PasswordInput's show/hide toggle is fixed at the field's physical
   * right edge (it's dir="ltr" like all password fields in this app —
   * see PasswordInput.tsx's own comment), which would collide with
   * this component's icon there. Pass this for any PasswordInput
   * child so the leading icon renders on the left instead.
   */
  iconOnLeft?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

export function AuthField({ label, htmlFor, icon: Icon, error, hint, required, iconOnLeft, children }: AuthFieldProps) {
  const uid = useId();
  const errorId = error ? `${uid}-error` : undefined;
  const hintId = hint && !error ? `${uid}-hint` : undefined;
  const describedBy = errorId ?? hintId;

  const styledChild = isValidElement(children)
    ? cloneElement(children, {
        className: cn(
          'h-12 rounded-xl border-input bg-transparent shadow-sm',
          // Icon side gets the extra padding to clear it; the other
          // side keeps normal spacing. PasswordInput adds its own pe-9
          // for the eye toggle via its className merge on top of this.
          // Logical padding; avoid conflicting pr/pe so PasswordInput's pe-11 wins for the eye toggle.
          iconOnLeft ? 'ps-11 pe-4' : 'pe-11 ps-4',
          (children.props as { className?: string }).className,
        ),
        'aria-describedby': (children.props as { ['aria-describedby']?: string })['aria-describedby'] ?? describedBy,
        'aria-invalid': (children.props as { ['aria-invalid']?: boolean })['aria-invalid'] ?? (error ? true : undefined),
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <label
          htmlFor={htmlFor}
          className="pointer-events-none absolute -top-2 right-4 z-10 bg-card px-2 text-xs font-medium text-muted-foreground"
        >
          {label}
          {required && <span className="ms-1 text-destructive" aria-hidden="true">*</span>}
          {required && <span className="sr-only">(مطلوب)</span>}
        </label>
        <Icon
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/60',
            iconOnLeft ? 'left-4' : 'right-4',
          )}
        />
        {styledChild}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
}
