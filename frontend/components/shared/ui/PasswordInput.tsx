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
          className={cn('pe-9', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Password fields in this app are all dir="ltr" (see
          // LoginForm/RegisterForm/SecuritySettingsForm), so the toggle
          // sits on the field's trailing edge in LTR terms — the right
          // side — regardless of the surrounding RTL page direction.
          className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
