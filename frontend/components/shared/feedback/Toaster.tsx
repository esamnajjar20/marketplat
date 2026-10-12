'use client';

/** Shared, theme-aware notification surface for lightweight feedback. */
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      dir="rtl"
      richColors
      expand
      closeButton
      duration={4600}
      toastOptions={{
        classNames: {
          toast: 'market-toast group font-sans',
          title: 'market-toast-title',
          description: 'market-toast-description',
          icon: 'market-toast-icon',
          success: 'market-toast-success',
          error: 'market-toast-error',
          warning: 'market-toast-warning',
          info: 'market-toast-info',
          actionButton: 'market-toast-action',
          cancelButton: 'market-toast-cancel',
          closeButton: 'market-toast-close',
        },
      }}
    />
  );
}
