'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, History, Plus, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { Spinner } from '@/components/ui/spinner';
import { queryKeys } from '@/lib/queryKeys';
import { formatTimestamp } from '@/lib/formatters';

type FeatureFlag = {
  name: string;
  enabled: boolean;
  rolloutPercent: number;
  updatedAt: number;
};

type FeatureFlagAuditEntry = {
  id: number;
  name: string;
  oldEnabled: boolean | null;
  enabled: boolean;
  oldRolloutPercent: number | null;
  rolloutPercent: number;
  changedBy: string;
  changedAt: number;
};

type FeatureFlagsResponse = {
  ok: boolean;
  flags?: FeatureFlag[];
  flag?: FeatureFlag;
  audit?: FeatureFlagAuditEntry[];
  error?: string;
};

async function requestFlags(method: 'GET' | 'PUT', payload?: { name: string; enabled: boolean; rolloutPercent?: number }, accessToken?: string | null): Promise<FeatureFlagsResponse> {
  const response = await fetch('/api/admin/feature-flags', {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json().catch(() => null) as FeatureFlagsResponse | null;
  if (!response.ok || !result?.ok) {
    const error = result?.error || `HTTP_${response.status}`;
    throw new Error(error);
  }
  return result;
}

function flagErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'SUPER_ADMIN_REQUIRED': return 'إدارة الخصائص متاحة للمدير الأعلى فقط.';
    case 'FEATURE_FLAGS_ADMIN_TOKEN_NOT_CONFIGURED_ON_FRONTEND': return 'سر إدارة الخصائص غير مضبوط في Worker الواجهة.';
    case 'FEATURE_FLAGS_ADMIN_NOT_CONFIGURED': return 'سر إدارة الخصائص غير مضبوط في API Worker.';
    case 'D1_NOT_CONFIGURED': return 'قاعدة D1 غير مربوطة بـ API Worker.';
    case 'FORBIDDEN': return 'رفض API Worker الطلب؛ تحقق من تطابق سر الإدارة بين Worker الواجهة وWorker API.';
    case 'FEATURE_FLAGS_WORKER_UNAVAILABLE': return 'تعذّر الاتصال بخدمة الخصائص في API Worker.';
    case 'FEATURE_FLAGS_STORAGE_ERROR': return 'تعذّر الوصول إلى تخزين الخصائص في D1.';
    case 'FEATURE_FLAG_ACTOR_REQUIRED': return 'تعذّر التحقق من هوية المدير المنفّذ.';
    case 'CSRF_REJECTED': return 'تم رفض الطلب لأسباب أمنية. أعد تحميل الصفحة وحاول مجدداً.';
    default: return 'تعذّر تنفيذ العملية. تحقق من الاتصال والإعدادات ثم أعد المحاولة.';
  }
}

function formatUpdatedAt(value: number): string {
  if (!value) return 'لم يتم التحديث بعد';
  return formatTimestamp(value * 1000);
}

export function AdminFeatureFlags() {
  const role = useAuthStore(selectUser)?.role;
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [audit, setAudit] = useState<FeatureFlagAuditEntry[]>([]);
  const [name, setName] = useState('PUBLIC_');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [rolloutDrafts, setRolloutDrafts] = useState<Record<string, string>>({});

  const publicCount = useMemo(() => flags.filter((flag) => flag.name.startsWith('PUBLIC_')).length, [flags]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestFlags('GET', undefined, accessToken);
      setFlags(result.flags ?? []);
      setAudit(result.audit ?? []);
    } catch (error) {
      toast.error(flagErrorMessage(error));
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (role !== 'SUPER_ADMIN' || !accessToken) return;
    void load();
  }, [accessToken, load, role]);

  if (role !== 'SUPER_ADMIN') return null;

  async function saveFlag(flagName: string, enabled: boolean, rolloutPercent = flags.find((item) => item.name === flagName)?.rolloutPercent ?? 100): Promise<boolean> {
    if (savingName) return false;
    setSavingName(flagName);
    try {
      const result = await requestFlags('PUT', { name: flagName, enabled, rolloutPercent }, accessToken);
      if (!result.flag) throw new Error('INVALID_RESPONSE');
      setFlags((current) => {
        const next = current.filter((item) => item.name !== result.flag!.name);
        next.push(result.flag!);
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.publicFeatureFlags.all() });
      setAudit((current) => result.audit ?? current);
      toast.success(enabled ? 'تم تفعيل الخاصية' : 'تم إيقاف الخاصية');
      return true;
    } catch (error) {
      toast.error(flagErrorMessage(error));
      return false;
    } finally {
      setSavingName(null);
    }
  }

  async function createFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!/^PUBLIC_[A-Z0-9_]{1,58}$/.test(normalized)) {
      toast.error('اسم الخاصية يجب أن يبدأ بـ PUBLIC_ ويتكون من أحرف إنجليزية وأرقام وشرطة سفلية.');
      return;
    }
    if (flags.some((flag) => flag.name === normalized)) {
      toast.error('هذه الخاصية موجودة بالفعل.');
      return;
    }
    if (await saveFlag(normalized, false)) setName('PUBLIC_');
  }

  return (
    <AdminPageShell title="مفاتيح الخصائص" description="إدارة تشغيل وإيقاف الخصائص العامة دون إعادة نشر التطبيق. هذه المفاتيح إعدادات فقط؛ يجب أن يكون للكود مستهلك صريح لها.">
      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm" aria-labelledby="feature-flags-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><Flag className="h-5 w-5" /></span>
            <div>
              <h2 id="feature-flags-heading" className="font-semibold">الخصائص المخزنة في D1</h2>
              <p className="mt-1 text-sm text-muted-foreground">{flags.length} مفتاحاً، منها {publicCount} مفاتيح عامة متاحة للقراءة من التطبيق.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || Boolean(savingName)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
            تحديث
          </button>
        </div>

        <form onSubmit={createFlag} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="new-public-feature-flag">اسم المفتاح العام</label>
          <input
            id="new-public-feature-flag"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            dir="ltr"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="PUBLIC_NEW_FEATURE"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" disabled={Boolean(savingName) || !loaded} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-4 w-4" /> إضافة مفتاح معطّل
          </button>
        </form>

        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>قراءة وإدارة هذه الشاشة محصورتان بـ SUPER_ADMIN. الأسماء التي تبدأ بـ <code dir="ltr">PUBLIC_</code> فقط تُعرض للعميل. نسبة التوزيع تُحسب بثبات حسب معرّف المستخدم الذي يمرّره المستهلك إلى <code dir="ltr">usePublicFeatureFlag()</code>؛ لا تستخدم بيانات سرية كمعرّف.</p>
        </div>

        {!loaded && <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground"><Spinner size="sm" /> <span className="ms-2">جارٍ تحميل المفاتيح…</span></div>}
        {loaded && flags.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مفاتيح محفوظة بعد.</p>}
        {loaded && flags.length > 0 && (
          <div className="divide-y rounded-lg border">
            {flags.map((flag) => {
              const busy = savingName === flag.name;
              return (
                <div key={flag.name} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code dir="ltr" className="break-all text-sm font-semibold">{flag.name}</code>
                      <span className={`rounded-full px-2 py-0.5 text-2xs-tight font-semibold ${flag.name.startsWith('PUBLIC_') ? 'bg-info/10 text-info ' : 'bg-muted text-muted-foreground'}`}>
                        {flag.name.startsWith('PUBLIC_') ? 'عام للعميل' : 'داخلي'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">آخر تحديث: {formatUpdatedAt(flag.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`rollout-${flag.name}`} className="text-xs text-muted-foreground">التوزيع %</label>
                    <input
                      id={`rollout-${flag.name}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={rolloutDrafts[flag.name] ?? String(flag.rolloutPercent)}
                      onChange={(event) => setRolloutDrafts((current) => ({ ...current, [flag.name]: event.target.value }))}
                      disabled={Boolean(savingName)}
                      className="h-10 w-20 rounded-lg border border-input bg-background px-2 text-sm"
                      aria-label={`نسبة توزيع ${flag.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const value = Number(rolloutDrafts[flag.name] ?? flag.rolloutPercent);
                        if ((rolloutDrafts[flag.name] ?? String(flag.rolloutPercent)).trim() === '' || !Number.isInteger(value) || value < 0 || value > 100) {
                          toast.error('نسبة التوزيع يجب أن تكون عددًا صحيحًا بين 0 و100.');
                          return;
                        }
                        void saveFlag(flag.name, flag.enabled, value).then((saved) => {
                          if (saved) setRolloutDrafts((current) => { const next = { ...current }; delete next[flag.name]; return next; });
                        });
                      }}
                      disabled={Boolean(savingName) || !loaded}
                      className="min-h-10 rounded-lg border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    >
                      حفظ النسبة
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveFlag(flag.name, !flag.enabled)}
                    disabled={Boolean(savingName)}
                    aria-pressed={flag.enabled}
                    className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${flag.enabled ? 'bg-success text-white hover:bg-success' : 'border bg-background hover:bg-muted'}`}
                  >
                    {busy ? <Spinner size="sm" /> : flag.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    {busy ? 'جارٍ الحفظ…' : flag.enabled ? 'مفعّلة — إيقاف' : 'معطّلة — تفعيل'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm" aria-labelledby="feature-flags-audit-heading">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-muted p-2 text-muted-foreground"><History className="h-5 w-5" /></span>
          <div>
            <h2 id="feature-flags-audit-heading" className="font-semibold">سجل تغييرات الخصائص</h2>
            <p className="mt-1 text-xs text-muted-foreground">آخر {audit.length} تغييرًا محفوظًا في D1، بما في ذلك القيمة السابقة والجديدة وهوية المدير المنفّذ.</p>
          </div>
        </div>
        {audit.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد تغييرات مسجّلة بعد.</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {audit.map((entry) => (
              <li key={entry.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code dir="ltr" className="break-all text-sm font-semibold">{entry.name}</code>
                  <time className="text-xs text-muted-foreground" dateTime={new Date(entry.changedAt * 1000).toISOString()}>{formatUpdatedAt(entry.changedAt)}</time>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {entry.oldEnabled === null
                    ? `إنشاء المفتاح: ${entry.enabled ? 'مفعّلة' : 'معطّلة'} (${entry.rolloutPercent}%)`
                    : `من ${entry.oldEnabled ? 'مفعّلة' : 'معطّلة'} (${entry.oldRolloutPercent ?? '—'}%) إلى ${entry.enabled ? 'مفعّلة' : 'معطّلة'} (${entry.rolloutPercent}%)`}
                </p>
                <p className="text-2xs-tight text-muted-foreground">المدير المنفّذ: <code dir="ltr">{entry.changedBy}</code></p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AdminPageShell>
  );
}
