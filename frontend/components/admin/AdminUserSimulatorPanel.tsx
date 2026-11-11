'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Download,
  Loader2, Play, Plus, RefreshCw, Save, Settings2, ShieldCheck, Square,
  Terminal, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
  adminApi,
  type UserSimulatorConfig,
  type UserSimulatorRun,
  type UserSimulatorScenario
} from '@/api/admin.api';

const ACTIVE_STATES = new Set(['queued', 'running', 'stopping']);
const asNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const formatMs = (value: unknown) => typeof value === 'number' ? `${Math.round(value).toLocaleString()} ms` : '—';
const formatDate = (value: unknown) => typeof value === 'string' ? new Date(value).toLocaleString('ar-PS') : '—';
const readString = (value: unknown, fallback = '—') => typeof value === 'string' && value ? value : fallback;
const readNumber = (value: unknown) => typeof value === 'number' ? value : 0;

function StatusPill({ status }: { status: string }) {
  const success = status === 'completed';
  const failed = status === 'failed' || status === 'completed_with_errors';
  const active = ACTIVE_STATES.has(status);
  const className = success
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : failed
      ? 'border-red-500/30 bg-red-500/10 text-red-700'
      : active
        ? 'border-blue-500/30 bg-blue-500/10 text-blue-700'
        : 'border-border bg-muted text-muted-foreground';
  const label = success ? 'مكتمل' : failed ? 'يحتاج مراجعة' : status === 'stopped' ? 'متوقف' : status === 'stopping' ? 'جارٍ الإيقاف' : status === 'queued' ? 'بالانتظار' : status === 'running' ? 'قيد التنفيذ' : status;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {detail && <div className="mt-1 truncate text-2xs-tight text-muted-foreground">{detail}</div>}
    </div>
  );
}

function downloadJson(report: UserSimulatorRun) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `marketplat-simulator-${report.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminUserSimulatorPanel() {
  const [config, setConfig] = useState<UserSimulatorConfig | null>(null);
  const [scenarios, setScenarios] = useState<UserSimulatorScenario[]>([]);
  const [runs, setRuns] = useState<UserSimulatorRun[]>([]);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>(['public-browse', 'search-and-discovery']);
  const [selectedRun, setSelectedRun] = useState<UserSimulatorRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [starting, setStarting] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLastError(null);
    const [statusResult, configResult, scenarioResult, runsResult] = await Promise.allSettled([
      adminApi.getUserSimulatorStatus(),
      adminApi.getUserSimulatorConfig(),
      adminApi.getUserSimulatorScenarios(),
      adminApi.getUserSimulatorRuns(30)
    ]);
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    if (configResult.status === 'fulfilled') {
      setConfig(configResult.value);
      setAllowWrites(configResult.value.defaultAllowWrites);
    }
    if (scenarioResult.status === 'fulfilled') setScenarios(scenarioResult.value);
    if (runsResult.status === 'fulfilled') setRuns(runsResult.value);
    const rejected = [statusResult, configResult, scenarioResult, runsResult].find(item => item.status === 'rejected');
    if (rejected?.status === 'rejected') {
      const message = rejected.reason instanceof Error ? rejected.reason.message : 'تعذّر الاتصال بمحرك المحاكاة';
      setLastError(message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedRun || !ACTIVE_STATES.has(selectedRun.status)) return;
    const timer = window.setInterval(() => {
      void adminApi.getUserSimulatorRun(selectedRun.id).then(async next => {
        if (ACTIVE_STATES.has(next.status)) {
          setSelectedRun(next);
          return;
        }
        const fullReport = await adminApi.getUserSimulatorReport(next.id).catch(() => next);
        setSelectedRun(fullReport);
        void adminApi.getUserSimulatorRuns(30).then(setRuns).catch(() => undefined);
      }).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [selectedRun?.id, selectedRun?.status]);

  const activeRun = runs.find(run => ACTIVE_STATES.has(run.status)) ?? (selectedRun && ACTIVE_STATES.has(selectedRun.status) ? selectedRun : null);
  const selectedScenarios = useMemo(() => scenarios.filter(item => selectedScenarioIds.includes(item.id)), [scenarios, selectedScenarioIds]);
  const requiresWrites = selectedScenarios.some(item => item.writes);
  const requiresAccount = selectedScenarios.some(item => item.requiresAccount);
  const requiresBuyer = selectedScenarios.some(item => item.requiresAccount && item.accountRole === 'buyer');
  const requiresSeller = selectedScenarios.some(item => item.requiresAccount && item.accountRole === 'seller');
  const hasMixedAccountRoles = requiresBuyer && requiresSeller;
  const requiresSeedAd = selectedScenarios.some(item => item.requiresSeedAd);
  const requiresSeedSeller = selectedScenarios.some(item => item.requiresSeedSeller);
  const requiresSeedProduct = selectedScenarios.some(item => item.requiresSeedProduct);
  const requiresSeedService = selectedScenarios.some(item => item.requiresSeedService);

  function patchConfig<K extends keyof UserSimulatorConfig>(key: K, value: UserSimulatorConfig[K]) {
    setConfig(current => current ? { ...current, [key]: value } : current);
  }

  async function saveConfig() {
    if (!config) return;
    setSavingConfig(true);
    try {
      const updated = await adminApi.updateUserSimulatorConfig({
        targetUrl: config.targetUrl,
        virtualUsers: config.virtualUsers,
        browserConcurrency: config.browserConcurrency,
        rampUpMs: config.rampUpMs,
        thinkTimeMs: config.thinkTimeMs,
        iterations: config.iterations,
        actionTimeoutMs: config.actionTimeoutMs,
        viewport: config.viewport,
        stopOnFailure: config.stopOnFailure,
        defaultAllowWrites: config.defaultAllowWrites
      });
      setConfig(updated);
      toast.success('تم حفظ إعدادات المحاكي');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر حفظ الإعدادات');
    } finally { setSavingConfig(false); }
  }

  async function startRun() {
    if (!config || selectedScenarioIds.length === 0 || activeRun) return;
    if (hasMixedAccountRoles) {
      toast.error('شغّل سيناريوهات المشتري والبائع في دفعتين منفصلتين.');
      return;
    }
    if (requiresWrites && !allowWrites) {
      toast.error('السيناريو المختار ينشئ بيانات. فعّل السماح بإنشاء بيانات الاختبار أولًا.');
      return;
    }
    if (requiresWrites && !window.confirm(`سيتم تنفيذ ${config.virtualUsers} جلسة متصفح على الموقع المنشور، وقد تُنشأ حسابات وبيانات اختبار. لن يحذف المحاكي بيانات موجودة. هل تؤكد؟`)) return;
    setStarting(true);
    try {
      const run = await adminApi.startUserSimulatorRun({
        scenarioIds: selectedScenarioIds,
        virtualUsers: config.virtualUsers,
        browserConcurrency: config.browserConcurrency,
        rampUpMs: config.rampUpMs,
        thinkTimeMs: config.thinkTimeMs,
        iterations: config.iterations,
        viewport: config.viewport,
        stopOnFailure: config.stopOnFailure,
        allowWrites
      });
      setSelectedRun(run);
      setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
      toast.success('بدأ تشغيل محاكاة المتصفحات');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر بدء المحاكاة');
    } finally { setStarting(false); }
  }

  async function stopRun() {
    if (!activeRun) return;
    try {
      const run = await adminApi.stopUserSimulatorRun(activeRun.id);
      setSelectedRun(run);
      toast.success('تم إرسال طلب إيقاف التشغيل');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر إيقاف التشغيل');
    }
  }

  function openEditor(scenario?: UserSimulatorScenario) {
    const value: UserSimulatorScenario = scenario ?? {
      id: 'custom-user-journey', name: 'سيناريو مخصص', description: 'أضف خطوات Playwright المسموحة هنا.',
      enabled: true, writes: false, requiresAccount: false, tags: ['custom'],
      steps: [{ type: 'goto', value: '/' }, { type: 'expectVisible', selector: 'body' }]
    };
    setEditingId(scenario?.id ?? null);
    setEditorText(JSON.stringify(value, null, 2));
    setEditorOpen(true);
  }

  async function saveScenario() {
    let parsed: UserSimulatorScenario;
    try { parsed = JSON.parse(editorText) as UserSimulatorScenario; }
    catch { toast.error('JSON غير صالح. راجع الفواصل والأقواس.'); return; }
    setEditorSaving(true);
    try {
      const saved = editingId
        ? await adminApi.updateUserSimulatorScenario(editingId, parsed)
        : await adminApi.createUserSimulatorScenario(parsed);
      setScenarios(current => [...current.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
      setSelectedScenarioIds(current => current.includes(saved.id) ? current : [...current, saved.id]);
      setEditorOpen(false);
      toast.success('تم حفظ السيناريو');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر حفظ السيناريو');
    } finally { setEditorSaving(false); }
  }

  async function deleteScenario(id: string) {
    if (!window.confirm('حذف هذا السيناريو من إعدادات المحاكي؟')) return;
    try {
      await adminApi.deleteUserSimulatorScenario(id);
      setScenarios(current => current.filter(item => item.id !== id));
      setSelectedScenarioIds(current => current.filter(item => item !== id));
      toast.success('تم حذف السيناريو');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذّر الحذف'); }
  }

  async function selectRun(run: UserSimulatorRun) {
    setSelectedRun(run);
    try {
      const detail = ACTIVE_STATES.has(run.status)
        ? await adminApi.getUserSimulatorRun(run.id)
        : await adminApi.getUserSimulatorReport(run.id);
      setSelectedRun(detail);
    } catch {
      // Keep the selected summary available if the detail endpoint is temporarily unavailable.
    }
  }

  async function exportReport() {
    if (!selectedRun) return;
    try { downloadJson(await adminApi.getUserSimulatorReport(selectedRun.id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'تعذّر تصدير التقرير'); }
  }

  async function downloadArtifact(name: string) {
    if (!selectedRun) return;
    try {
      const blob = await adminApi.getUserSimulatorArtifact(selectedRun.id, name);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تنزيل لقطة الشاشة');
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الاتصال بمحرك المتصفح وقراءة الإعدادات…</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {lastError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold">محرك المحاكاة غير متاح</p>
            <p className="mt-1 break-words text-muted-foreground">{lastError}</p>
            <p className="mt-2 text-xs text-muted-foreground">يجب تشغيل خدمة Playwright المستقلة وضبط USER_SIMULATOR_RUNNER_URL وUSER_SIMULATOR_RUNNER_TOKEN في خادم API. لا يعمل Chromium داخل Cloudflare Worker.</p>
            <button type="button" onClick={() => void refresh()} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border bg-background px-3 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" /> إعادة الاتصال</button>
          </div>
        </div>
      )}

      {config && status && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="حالة المحرك" value={status.connected === true ? 'متصل' : 'غير متصل'} detail={readString(status.targetUrl, config.targetUrl)} />
          <Metric label="الحسابات الجاهزة" value={config.testAccountCount} detail={config.testAccountsConfigured ? `مشتري: ${config.testAccountRoleCounts?.buyer ?? 0} · بائع: ${config.testAccountRoleCounts?.seller ?? 0} · عام: ${config.testAccountRoleCounts?.any ?? 0}` : 'اضبط حسابات اختبار على خادم المحاكي'} />
          <Metric label="إنشاء الحسابات" value={config.registrationConfigured ? 'مهيأ' : 'غير مهيأ'} detail="قالب بريد + كلمة مرور من بيئة المحرك" />
          <Metric label="الحد الأقصى للمحرك" value={`${config.hardMaxConcurrency} متصفح`} detail={`${config.hardMaxUsers} قراءة فقط · ${config.hardMaxWriteUsers} عند إنشاء بيانات`} />
        </section>
      )}

      {config && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-muted-foreground" /><div><h2 className="font-bold">إعدادات التشغيل</h2><p className="text-xs text-muted-foreground">يمكن حفظ الإعدادات وتغييرها دون تعديل الكود.</p></div></div>
            <button type="button" onClick={() => void saveConfig()} disabled={savingConfig || !status?.connected} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{savingConfig ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-sm sm:col-span-2"><span className="font-medium">رابط الموقع المنشور</span><input value={config.targetUrl} onChange={event => patchConfig('targetUrl', event.target.value)} className="min-h-10 w-full rounded-lg border bg-background px-3 text-left text-sm" dir="ltr" /><span className="block text-2xs-tight text-muted-foreground">لا يقبل المحرك إلا النطاقات الموجودة في SIMULATOR_ALLOWED_HOSTS.</span></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">عدد المستخدمين الافتراضي</span><input type="number" min={1} max={config.hardMaxUsers} value={config.virtualUsers} onChange={event => patchConfig('virtualUsers', asNumber(event.target.value, 1))} className="min-h-10 w-full rounded-lg border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">المتصفحات المتزامنة</span><input type="number" min={1} max={config.hardMaxConcurrency} value={config.browserConcurrency} onChange={event => patchConfig('browserConcurrency', asNumber(event.target.value, 1))} className="min-h-10 w-full rounded-lg border bg-background px-3" /><span className="block text-2xs-tight text-muted-foreground">هذا هو التزامن الحقيقي لجلسات Chromium.</span></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">تدرّج بدء المستخدمين (ms)</span><input type="number" min={0} max={120000} step={500} value={config.rampUpMs} onChange={event => patchConfig('rampUpMs', asNumber(event.target.value, 0))} className="min-h-10 w-full rounded-lg border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">فترة التفكير بين الخطوات (ms)</span><input type="number" min={0} max={15000} step={100} value={config.thinkTimeMs} onChange={event => patchConfig('thinkTimeMs', asNumber(event.target.value, 0))} className="min-h-10 w-full rounded-lg border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">مهلة كل عملية (ms)</span><input type="number" min={3000} max={60000} step={1000} value={config.actionTimeoutMs} onChange={event => patchConfig('actionTimeoutMs', asNumber(event.target.value, 20000))} className="min-h-10 w-full rounded-lg border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">تكرار السيناريو</span><input type="number" min={1} max={20} value={config.iterations} onChange={event => patchConfig('iterations', asNumber(event.target.value, 1))} className="min-h-10 w-full rounded-lg border bg-background px-3" /><span className="block text-2xs-tight text-muted-foreground">عدد مرات تنفيذ السيناريو لكل مستخدم افتراضي.</span></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">شكل الجهاز</span><select value={config.viewport} onChange={event => patchConfig('viewport', event.target.value as 'desktop' | 'mobile')} className="min-h-10 w-full rounded-lg border bg-background px-3"><option value="desktop">حاسوب — 1440×900</option><option value="mobile">هاتف — Pixel 7 viewport</option></select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={config.stopOnFailure} onChange={event => patchConfig('stopOnFailure', event.target.checked)} /> إيقاف التشغيل عند أول فشل لمستخدم</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={config.defaultAllowWrites} onChange={event => patchConfig('defaultAllowWrites', event.target.checked)} /> تذكّر تفضيل السماح ببيانات الاختبار (لا يلغي التأكيد لكل تشغيل)</label>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-muted-foreground" /><div><h2 className="font-bold">سيناريوهات المستخدم</h2><p className="text-xs text-muted-foreground">اختر ما تريد تشغيله أو أضف سيناريو جديدًا من JSON قابل للتوسعة.</p></div></div>
          <button type="button" onClick={() => openEditor()} disabled={!status?.connected} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50"><Plus className="h-4 w-4" /> إضافة سيناريو</button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {scenarios.map(scenario => (
            <div key={scenario.id} className="rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`اختيار ${scenario.name}`} checked={selectedScenarioIds.includes(scenario.id)} disabled={!scenario.enabled} onChange={event => setSelectedScenarioIds(current => event.target.checked ? [...current, scenario.id] : current.filter(id => id !== scenario.id))} className="mt-1 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{scenario.name}</span>{scenario.writes && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-700">ينشئ بيانات</span>}{scenario.requiresAccount && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-2xs font-semibold text-blue-700">حسابات {scenario.accountRole === 'seller' ? 'بائع' : scenario.accountRole === 'buyer' ? 'مشتري' : 'QA'} مطلوبة</span>}{(scenario.requiresSeedAd || scenario.requiresSeedSeller || scenario.requiresSeedProduct || scenario.requiresSeedService) && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-semibold text-violet-700">يحتاج سجلات QA مهيأة</span>}{!scenario.enabled && <span className="text-2xs text-muted-foreground">معطّل</span>}</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{scenario.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{scenario.tags.map(tag => <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{tag}</span>)}<span className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{scenario.steps.length} خطوة</span></div>
                  <div className="mt-2 flex gap-2"><button type="button" onClick={() => openEditor(scenario)} className="text-xs font-semibold text-primary">تعديل الخطوات</button><button type="button" onClick={() => void deleteScenario(scenario.id)} className="text-xs font-semibold text-red-600">حذف</button></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {requiresAccount && !config?.testAccountsConfigured && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> السيناريوهات المحددة تحتاج حسابات اختبار موجودة. أضف عددًا مساويًا لعدد المستخدمين في SIMULATOR_TEST_ACCOUNTS على خادم المحاكي.</p>}
        {(requiresBuyer && (config?.testAccountRoleCounts?.buyer ?? 0) < (config?.virtualUsers ?? 1) || requiresSeller && (config?.testAccountRoleCounts?.seller ?? 0) < (config?.virtualUsers ?? 1)) && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> عدد حسابات الدور المطلوب أقل من عدد المستخدمين الافتراضيين. اضبط SIMULATOR_TEST_ACCOUNTS مع role=buyer أو role=seller وحساب مستقل لكل مستخدم.</p>}
        {requiresBuyer && requiresSeller && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> الاختيارات الحالية تجمع رحلات مشتري وبائع. شغّل رحلات المشترين والبائعين في تشغيلين منفصلين حتى يستخدم كل متصفح حساب الدور الصحيح.</p>}
        {(requiresSeedAd && !config?.seedAdConfigured || requiresSeedSeller && !config?.seedSellerConfigured || requiresSeedProduct && !config?.seedProductConfigured || requiresSeedService && !config?.seedServiceConfigured) && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> بعض السيناريوهات تحتاج معرّفات سجلات QA في إعدادات محرك المتصفح (إعلان/بائع/منتج/خدمة). لا تستخدم سجلات مستخدمين حقيقيين أو محتوى إنتاجي مهم.</p>}
        {selectedScenarios.some(item => item.id === 'register-test-user') && !config?.registrationConfigured && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> التسجيل يحتاج SIMULATOR_EMAIL_TEMPLATE وSIMULATOR_TEST_PASSWORD. استخدم نطاق بريد تملكه حتى يمكن تأكيد الحسابات لاحقًا.</p>}
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-bold">بوابة الأمان قبل التشغيل</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">الوضع الافتراضي للقراءة والتصفح فقط. الكتابة تتطلب موافقة صريحة ومحدودة بحد أقصى {config?.hardMaxWriteUsers ?? 5} مستخدمين افتراضيين في التشغيل الواحد. نشر إعلان QA أو تعديل سجل QA يؤثر على بيانات الموقع المنشور؛ لا توجد سيناريوهات حذف أو دفع حقيقي مفعّلة.</p></div></div>
          <label className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-semibold"><input type="checkbox" checked={allowWrites} onChange={event => setAllowWrites(event.target.checked)} /> السماح بإنشاء بيانات الاختبار</label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void startRun()} disabled={!status?.connected || selectedScenarioIds.length === 0 || Boolean(activeRun) || starting || hasMixedAccountRoles} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-4 w-4" />{starting ? 'جارٍ بدء المتصفحات…' : 'ابدأ المحاكاة'}</button>
          <button type="button" onClick={() => void stopRun()} disabled={!activeRun} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"><Square className="h-3.5 w-3.5" /> إيقاف التشغيل</button>
          <button type="button" onClick={() => void refresh(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> تحديث</button>
          {requiresWrites && !allowWrites && <span className="text-xs text-amber-800">التشغيل متوقف حتى تفعيل خيار إنشاء بيانات QA.</span>}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">سجل التشغيلات</h2><span className="text-xs text-muted-foreground">آخر {runs.length}</span></div>
          <div className="max-h-[520px] space-y-2 overflow-auto">
            {runs.length === 0 && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">لا توجد تقارير محفوظة بعد.</p>}
            {runs.map(run => (
              <button type="button" key={run.id} onClick={() => void selectRun(run)} className={`w-full rounded-lg border p-3 text-right transition ${selectedRun?.id === run.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold">{run.id}</span><StatusPill status={run.status} /></div>
                <div className="mt-2 text-2xs-tight text-muted-foreground">{formatDate(run.startedAt)}</div>
                <div className="mt-1 text-2xs-tight">{readNumber(run.summary.usersCompleted)}/{readNumber(run.summary.usersTotal)} مستخدم مكتمل · {readNumber(run.summary.stepsFailed)} خطوة فاشلة</div>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold">تفاصيل التشغيل والتقرير</h2><p className="mt-1 text-xs text-muted-foreground">زمن DOM وLCP وطلبات API، خطوات كل مستخدم، أخطاء JavaScript ولقطات الفشل.</p></div>
            {selectedRun && <button type="button" onClick={() => void exportReport()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold"><Download className="h-4 w-4" /> تصدير JSON</button>}
          </div>
          {!selectedRun ? <div className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">اختر تشغيلًا من السجل لعرض تفاصيله.</div> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{selectedRun.id}</span><StatusPill status={selectedRun.status} /><span className="text-xs text-muted-foreground">بدأ: {formatDate(selectedRun.startedAt)}</span></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="المستخدمون المكتملون" value={`${selectedRun.summary.usersCompleted}/${selectedRun.summary.usersTotal}`} detail={`${selectedRun.summary.usersFailed} فشل`} />
                <Metric label="الخطوات الناجحة" value={selectedRun.summary.stepsPassed} detail={`${selectedRun.summary.stepsFailed} خطوة فاشلة`} />
                <Metric label="طلبات API" value={selectedRun.summary.httpRequests} detail={`${selectedRun.summary.httpErrors} استجابة 4xx/5xx أو فشل شبكة`} />
                <Metric label="مدة التشغيل" value={`${(selectedRun.summary.durationMs / 1000).toFixed(1)} ث`} detail={`${selectedRun.summary.consoleErrors} console · ${selectedRun.summary.pageErrors} JS`} />
                <Metric label="متوسط DOMContentLoaded" value={formatMs(selectedRun.summary.averagePageLoadMs)} />
                <Metric label="P95 تحميل DOM" value={formatMs(selectedRun.summary.p95PageLoadMs)} />
                <Metric label="متوسط LCP" value={formatMs(selectedRun.summary.averageLcpMs)} />
                <Metric label="P95 LCP" value={formatMs(selectedRun.summary.p95LcpMs)} />
                <Metric label="متوسط زمن API" value={formatMs(selectedRun.summary.averageApiDurationMs)} />
                <Metric label="P95 زمن API" value={formatMs(selectedRun.summary.p95ApiDurationMs)} />
              </div>
              {ACTIVE_STATES.has(selectedRun.status) && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, selectedRun.summary.usersTotal ? (selectedRun.summary.usersStarted / selectedRun.summary.usersTotal) * 100 : 0)}%` }} /></div>}

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="min-w-0 rounded-lg border p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4" /> المستخدمون</h3>
                  <div className="max-h-52 space-y-1 overflow-auto">
                    {selectedRun.users.slice(0, 100).map((user, index) => <div key={`${String(user.user)}-${index}`} className="flex items-center justify-between gap-3 border-b py-1.5 text-xs last:border-0"><span>{readString(user.user)}</span><StatusPill status={readString(user.status, 'queued')} /><span className="text-muted-foreground">{formatDate(user.finishedAt ?? user.startedAt)}</span></div>)}
                    {selectedRun.users.length === 0 && <p className="text-xs text-muted-foreground">لم يبدأ أي متصفح بعد.</p>}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><XCircle className="h-4 w-4 text-red-600" /> الأخطاء</h3>
                  <div className="max-h-52 space-y-2 overflow-auto">
                    {selectedRun.errors.slice(-40).reverse().map((error, index) => <div key={`${String(error.at)}-${index}`} className="rounded bg-red-500/5 p-2 text-xs"><div className="font-semibold text-red-700">{readString(error.kind, readString(error.stage, 'operation'))} · {readString(error.user)}</div><p className="mt-1 break-words text-muted-foreground">{readString(error.message)}</p><p className="mt-1 text-2xs text-muted-foreground">{readString(error.path)} · {formatDate(error.at)}</p></div>)}
                    {selectedRun.errors.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أخطاء مسجلة.</p>}
                  </div>
                </div>
              </div>

              {selectedRun.artifacts.length > 0 && (
                <div className="rounded-lg border p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Download className="h-4 w-4" /> لقطات الشاشة</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedRun.artifacts.filter(item => item.type === 'screenshot' && typeof item.name === 'string').map((item, index) => (
                      <button key={`${String(item.name)}-${index}`} type="button" onClick={() => void downloadArtifact(String(item.name))} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-xs hover:bg-muted">
                        <Download className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{String(item.name)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="min-w-0 rounded-lg border p-3">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Terminal className="h-4 w-4" /> آخر العمليات المنفذة</h3>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[620px] text-right text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2">المستخدم</th><th className="p-2">العملية</th><th className="p-2">المسار</th><th className="p-2">المدة</th><th className="p-2">النتيجة</th></tr></thead>
                    <tbody>{selectedRun.operations.slice(-150).reverse().map((operation, index) => <tr key={`${String(operation.at)}-${index}`} className="border-t"><td className="p-2">{readString(operation.user)}</td><td className="p-2">{readString(operation.type)}</td><td className="max-w-[220px] truncate p-2" dir="ltr">{readString(operation.path)}</td><td className="p-2 tabular-nums">{formatMs(operation.durationMs)}</td><td className="p-2">{operation.status === 'passed' ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> ناجح</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3.5 w-3.5" /> فشل</span>}</td></tr>)}</tbody>
                  </table>
                  {selectedRun.operations.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا توجد خطوات مسجلة حتى الآن.</p>}
                </div>
              </div>

              <div className="min-w-0 rounded-lg border p-3">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4" /> طلبات API المرصودة</h3>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-[600px] text-right text-xs"><thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2">المستخدم</th><th className="p-2">Method</th><th className="p-2">المسار</th><th className="p-2">Status</th><th className="p-2">المدة</th></tr></thead><tbody>{selectedRun.apiRequests.slice(-120).reverse().map((request, index) => <tr key={`${String(request.at)}-${index}`} className="border-t"><td className="p-2">{readString(request.user)}</td><td className="p-2">{readString(request.method)}</td><td className="max-w-[260px] truncate p-2" dir="ltr">{readString(request.url)}</td><td className="p-2">{readNumber(request.status)}</td><td className="p-2">{formatMs(request.durationMs)}</td></tr>)}</tbody></table>
                  {selectedRun.apiRequests.length === 0 && <p className="p-3 text-xs text-muted-foreground">لم يتم رصد طلبات API بعد.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-labelledby="simulator-scenario-editor-title">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b p-4"><div><h2 id="simulator-scenario-editor-title" className="font-bold">{editingId ? 'تعديل السيناريو' : 'إضافة سيناريو'}</h2><p className="text-xs text-muted-foreground">JSON declarative steps — لا يوجد JavaScript أو eval حر.</p></div><button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border px-3 py-2 text-xs">إغلاق</button></div>
            <textarea value={editorText} onChange={event => setEditorText(event.target.value)} spellCheck={false} className="min-h-[360px] flex-1 resize-y bg-muted/30 p-4 font-mono text-xs leading-6 outline-none" dir="ltr" aria-label="Scenario JSON editor" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4"><p className="text-2xs-tight text-muted-foreground">أنواع الخطوات: goto, click, clickText, clickRole, fill, fillRole, select, check, uncheck, hover, press, pressRole, scrollIntoView, upload, expectVisible, expectRoleVisible, expectHidden, expectText, expectUrl, expectNotUrl, wait, screenshot.</p><button type="button" onClick={() => void saveScenario()} disabled={editorSaving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{editorSaving ? 'جارٍ الحفظ…' : 'حفظ السيناريو'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
