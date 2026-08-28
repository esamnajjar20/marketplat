'use client';

import { useEffect, useState } from 'react';
import { Wifi, BookmarkPlus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/ui/Dialog';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { CopyField } from '@/components/payment/CopyField';
import { QrScannerCamera } from '@/components/payment/QrScannerCamera';
import type { CardParseResult } from '@/lib/smartScanParse';
import {
  listSavedNetCards,
  saveNetCard,
  removeNetCard,
  type SavedNetCard,
} from '@/lib/paymentStorage';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUsername?: string;
  initialPassword?: string;
  initialLabel?: string;
}

export function InternetCardsQRDialog({
  open,
  onOpenChange,
  initialUsername = '',
  initialPassword = '',
  initialLabel = '',
}: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const [label, setLabel] = useState(initialLabel);
  const [saved, setSaved] = useState<SavedNetCard[]>([]);
  const [mode, setMode] = useState<'scan' | 'result'>('scan');
  const [rawScan, setRawScan] = useState('');

  useEffect(() => {
    if (open) {
      setUsername(initialUsername);
      setPassword(initialPassword);
      setLabel(initialLabel);
      setSaved(listSavedNetCards());
      setRawScan('');
      // إن وُجدت بيانات جاهزة اعرض النتيجة، وإلا ابدأ بالمسح
      setMode(initialUsername && initialPassword ? 'result' : 'scan');
    }
  }, [open, initialUsername, initialPassword, initialLabel]);

  function onScanned(text: string) {
    setRawScan(text);
  }

  function onCardParsed(parsed: CardParseResult) {
    if (parsed.username) setUsername(parsed.username);
    if (parsed.password) setPassword(parsed.password);
    if (parsed.label) setLabel(parsed.label);
    setMode('result');
    const conf = Math.round(parsed.confidence * 100);
    toast.success(
      conf >= 70
        ? `تم كشف البطاقة بثقة ${conf}%`
        : 'تم المسح — راجع البيانات وعدّل إن لزم',
    );
  }

  function handleSave() {
    if (!username.trim() || !password.trim()) {
      toast.error('أدخل اسم المستخدم وكلمة السر');
      return;
    }
    saveNetCard({
      username: username.trim(),
      password: password.trim(),
      label: label.trim() || undefined,
    });
    setSaved(listSavedNetCards());
    toast.success('تم حفظ البطاقة');
  }

  function loadCard(c: SavedNetCard) {
    setUsername(c.username);
    setPassword(c.password);
    setLabel(c.label ?? '');
    setMode('result');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            بطاقات النت — مسح بالكاميرا
          </DialogTitle>
          <DialogDescription>
            امسح الرمز بالكاميرا لكشف اسم المستخدم وكلمة السر
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === 'scan' && (
            <>
              <QrScannerCamera onScan={onScanned} onCardParsed={onCardParsed} prefer="card" />
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMode('result')}>
                إدخال يدوي بدون مسح
              </Button>
            </>
          )}

          {mode === 'result' && (
            <>
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary">البيانات المكتشفة</p>
                <p className="rounded-lg bg-background/80 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">المستخدم: </span>
                  <strong dir="ltr">{username || '—'}</strong>
                </p>
                <p className="rounded-lg bg-background/80 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">كلمة السر: </span>
                  <strong dir="ltr">{password || '—'}</strong>
                </p>
              </div>

              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="تسمية (اختياري)"
              />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اسم المستخدم"
                dir="ltr"
                className="font-mono"
              />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة السر"
                dir="ltr"
                className="font-mono"
              />

              {username.trim() && (
                <CopyField label="نسخ اسم المستخدم" value={username.trim()} mono />
              )}
              {password.trim() && (
                <CopyField label="نسخ كلمة السر" value={password.trim()} mono />
              )}

              <Button type="button" className="w-full gap-2" onClick={handleSave}>
                <BookmarkPlus className="h-4 w-4" />
                حفظ البطاقة
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMode('scan')}>
                مسح رمز آخر بالكاميرا
              </Button>

              {rawScan && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">النص الخام من المسح</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded border bg-muted/40 p-2">{rawScan}</pre>
                </details>
              )}
            </>
          )}

          {saved.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">بطاقات محفوظة</p>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {saved.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-start text-sm font-medium hover:text-primary"
                      onClick={() => loadCard(c)}
                    >
                      {c.label || c.username}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        removeNetCard(c.id);
                        setSaved(listSavedNetCards());
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
