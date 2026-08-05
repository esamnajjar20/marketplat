/**
 * ThemeToggle — light/dark/system switcher.
 *
 * FIX UX-03: the app already shipped a complete dark palette
 * (globals.css's .dark block), Tailwind's darkMode: 'class' config,
 * and next-themes as an installed dependency with its own
 * ThemeProvider wrapper — but nothing ever mounted that provider or
 * exposed a way to actually switch, so the whole dark-mode system was
 * unreachable dead weight. This is the missing switch, wired to the
 * ThemeProvider now mounted in AppProviders.
 *
 * Rendered in the header rather than only inside UserMenu — theme is
 * a device/browser preference, not an account setting, so it needs to
 * work for logged-out visitors too.
 */
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, MonitorSmartphone } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/shared/ui/DropdownMenu';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes only knows the real theme after mounting (it reads
  // localStorage/matchMedia client-side) — rendering the sun/moon icon
  // from `resolvedTheme` before that would show the wrong icon for a
  // split second and mismatch the server-rendered markup. A neutral
  // icon on the very first render sidesteps both.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const Icon = !mounted ? MonitorSmartphone : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full outline-none ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="تبديل المظهر"
        >
          <Icon className="h-[1.15rem] w-[1.15rem]" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" className="gap-2 cursor-pointer">
            <Sun className="h-4 w-4" />
            فاتح
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2 cursor-pointer">
            <Moon className="h-4 w-4" />
            داكن
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2 cursor-pointer">
            <MonitorSmartphone className="h-4 w-4" />
            حسب النظام
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
