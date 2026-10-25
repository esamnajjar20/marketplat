'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Terminal, ToggleLeft, ToggleRight } from 'lucide-react';
import { adminApi } from '@/api/admin.api';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { toast } from 'sonner';

import { Spinner } from '@/components/ui/spinner';
export function AdminDeveloperToolsControl() {
  const role = useAuthStore(selectUser)?.role;
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return;
    let active = true;
    void adminApi.getDeveloperToolsSetting().then((response) => {
      if (!active) return;
      setEnabled(response.data.data?.enabled === true);
      setUpdatedAt(response.data.data?.updatedAt ?? null);
    }).catch(() => {
      if (active) toast.error('تعذّر قراءة إعدادات أدوات المطوّر');
    }).finally(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [role]);

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null;

  async function toggle() {
    if (saving || !loaded) return;
    const next = !enabled;
    setSaving(true);
    try {
      const response = await adminApi.setDeveloperToolsSetting(next);
      const actual = response.data.data?.enabled === true;
      setEnabled(actual);
      setUpdatedAt(response.data.data?.updatedAt ?? new Date().toISOString());
      window.dispatchEvent(new CustomEvent('developer-tools-setting-changed', { detail: { enabled: actual } }));
      toast.success(actual ? 'تم تفعيل أدوات المطوّر لجميع حسابات الإدارة' : 'تم تعليق أدوات المطوّر');
    } catch {
      toast.error('تعذّر حفظ إعداد أدوات المطوّر');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/30 bg-card p-4 shadow-sm" aria-labelledby="admin-devtools-heading">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><Terminal className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 id="admin-devtools-heading" className="font-semibold">أدوات المطوّر على مستوى الموقع</h2>
            <p className="mt-1 text-sm text-muted-foreground">كونسول، طلبات الشبكة، فحص DOM، التخزين، الأداء، وأخطاء JavaScript. تظهر فقط لحسابات ADMIN وSUPER_ADMIN.</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 shrink-0" /> تنفيذ السكربتات الحرة متاح في بيئة التطوير فقط؛ الإنتاج لا يضعف CSP.</p>
            {updatedAt && <p className="mt-1 text-[11px] text-muted-foreground">آخر تعديل: {new Date(updatedAt).toLocaleString()}</p>}
          </div>
        </div>
        <button type="button" onClick={() => void toggle()} disabled={!loaded || saving} aria-pressed={enabled} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border bg-background hover:bg-muted'}`}>
          {saving || !loaded ? <Spinner size="sm" /> : enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
          {saving ? 'جارٍ الحفظ…' : !loaded ? 'جارٍ التحميل…' : enabled ? 'مفعّلة — اضغط للتعليق' : 'معلّقة — اضغط للتفعيل'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">التفعيل عام ومحفوظ في قاعدة البيانات. عند التعليق يختفي الزر العائم من صفحات الموقع لدى جميع الإداريين بعد تحديث حالة الإعداد. لا يتم تسجيل أجسام الطلبات أو ترويساتها، وتُخفى مفاتيح التخزين الحساسة.</p>
    </section>
  );
}
