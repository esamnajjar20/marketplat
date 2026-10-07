'use client';

/**
 * PasswordInput — wraps the base Input with a show/hide toggle.
 *
 * Every password field in the app previously rendered a plain
 * `<Input type="password">`, which forces users to type complex
 * passwords blind on mobile with no way to verify what they typed.
 * This is a drop-in replacement: same props as Input, just adds the
 * eye icon inside the field.
 */
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pe-11', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Password fields in this app are all dir="ltr" (see
          // LoginForm/RegisterForm/SecuritySettingsForm), so the toggle
          // sits on the field's trailing edge in LTR terms — the right
          // side — regardless of the surrounding RTL page direction.
          className="absolute inset-y-0 right-0 flex h-full min-w-11 items-center justify-center px-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          // was tabIndex={-1}, which removed the
          // toggle from the keyboard tab order entirely — WCAG 2.1.1
          // (Keyboard) requires every operable control be reachable by
          // keyboard, and a keyboard-only user has no other way to
          // reveal/collapse the value they're typing. The extra tab stop
          // between the field and the next control is the correct
          // tradeoff for the accessibility it restores.
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
