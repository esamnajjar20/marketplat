/**
 * Toaster — renders toast notifications.
 *
 * FIX UI-01: '@/components/ui/toaster' (shadcn's legacy Radix-based toast
 * wrapper) does not exist in this project and was never generated — it
 * also requires '@radix-ui/react-toast', which is not installed.
 * 'sonner' IS an installed dependency (package.json) and ships its own
 * <Toaster /> component — re-export that directly instead.
 */
export { Toaster } from 'sonner';
