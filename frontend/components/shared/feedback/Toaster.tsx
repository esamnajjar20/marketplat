'use client';

/**
 * Toaster — إشعارات عابرة بمظهر متسق وRTL.
 */
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      dir="rtl"
      richColors
      closeButton
      duration={3800}
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl border border-border/80 bg-card text-foreground shadow-lg font-sans',
          title: 'text-sm font-semibold',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-lg',
          cancelButton: 'bg-muted text-muted-foreground rounded-lg',
          closeButton: 'bg-card border-border',
        },
      }}
    />
  );
}
