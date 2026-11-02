'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { useAuthStore } from '@/store/auth.store';

type GatewayServer = {
  id: string;
  url: string;
  weight: number;
  priority?: number;
  timeoutMs?: number;
  enabled: boolean;
  provider?: string;
  region?: string;
  healthPath?: string;
};

type FrontendServer = GatewayServer & { buildId: string; releasePath: string };

type LocalHealth = {
  id: string;
  kind: 'backend' | 'frontend';
  failures: number;
  circuit: 'open' | 'closed';
  retryAt: number | null;
  healthy?: boolean | null;
  quarantined?: boolean;
  status?: number | null;
  durationMs?: number | null;
  checkedAt?: string | null;
  healthSource?: 'probe' | 'traffic' | null;
};

type ProbeResult = {
  id: string;
  kind: 'backend' | 'frontend';
  buildId?: string;
  enabled: boolean;
  healthy: boolean | null;
  status: number | null;
  durationMs: number;
  detail: string;
};

type RegistryResponse = {
  ok: boolean;
  source?: string;
  registry?: {
    version: number;
    updatedAt?: string | null;
    backend: { strategy: string; servers: GatewayServer[] };
    frontend: { strategy: string; servers: FrontendServer[] };
  };
  localHealth?: LocalHealth[];
  localHealthScope?: string;
  healthScope?: string;
  healthUpdatedAt?: string | null;
  propagation?: string;
  error?: string;
  message?: string;
};

type ProbeResponse = {
  ok: boolean;
  checkedAt: string;
  scope: string;
  results: ProbeResult[];
  error?: string;
};

const API_PATH = '/api/admin/gateway/registry';
const MAX_SERVERS = 16;

function formatDate(value?: string | null): string {
  if (!value) return 'لم يتم الحفظ بعد';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'وقت غير معروف' : date.toLocaleString('ar-PS');
}

function formatRetryAt(value: number | null): string {
  if (!value) return 'غير مفتوح';
  const seconds = Math.max(0, Math.ceil((value - Date.now()) / 1000));
  return seconds > 0 ? `إعادة المحاولة بعد ${seconds} ث` : 'جاهز للمحاولة';
}

function StatusPill({ healthy, label }: { healthy: boolean | null; label?: string }) {
  if (healthy === null) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"><CircleHelp className="h-3.5 w-3.5" />{label || 'لم يُفحص'}</span>;
  return healthy
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{label || 'سليم'}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"><AlertCircle className="h-3.5 w-3.5" />{label || 'غير سليم'}</span>;
}

export function AdminInfrastructureGateway() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const authorizationHeaders = useMemo(
    () => accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    [accessToken],
  );
  const [servers, setServers] = useState<GatewayServer[]>([]);
  const [frontendServers, setFrontendServers] = useState<FrontendServer[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('{"backend":[],"frontend":[]}');
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [localHealth, setLocalHealth] = useState<LocalHealth[]>([]);
  const [healthScope, setHealthScope] = useState('single-worker-isolate');
  const [probeResults, setProbeResults] = useState<ProbeResult[]>([]);
  const [probeCheckedAt, setProbeCheckedAt] = useState<string | null>(null);
  const [propagation, setPropagation] = useState<string | null>(null);
  const [idInput, setIdInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [weightInput, setWeightInput] = useState('100');
  const [priorityInput, setPriorityInput] = useState('100');
  const [timeoutInput, setTimeoutInput] = useState('20000');
  const [providerInput, setProviderInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [frontendIdInput, setFrontendIdInput] = useState('');
  const [frontendUrlInput, setFrontendUrlInput] = useState('');
  const [frontendBuildIdInput, setFrontendBuildIdInput] = useState('');
  const [frontendWeightInput, setFrontendWeightInput] = useState('100');
  const [frontendPriorityInput, setFrontendPriorityInput] = useState('100');
  const [frontendTimeoutInput, setFrontendTimeoutInput] = useState('20000');
  const [frontendProviderInput, setFrontendProviderInput] = useState('');
  const [frontendRegionInput, setFrontendRegionInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentSnapshot = useMemo(() => JSON.stringify({ backend: servers, frontend: frontendServers }), [servers, frontendServers]);
  const isDirty = currentSnapshot !== savedSnapshot;
  const enabledCount = useMemo(() => servers.filter((server) => server.enabled).length, [servers]);
  const totalWeight = useMemo(() => servers.filter((server) => server.enabled).reduce((sum, server) => sum + server.weight, 0), [servers]);
  const frontendEnabledCount = useMemo(() => frontendServers.filter((server) => server.enabled).length, [frontendServers]);
  const frontendTotalWeight = useMemo(() => frontendServers.filter((server) => server.enabled).reduce((sum, server) => sum + server.weight, 0), [frontendServers]);
  const healthById = useMemo(() => new Map(localHealth.map((item) => [`${item.kind}:${item.id}`, item])), [localHealth]);
  const probeById = useMemo(() => new Map(probeResults.map((item) => [`${item.kind}:${item.id}`, item])), [probeResults]);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: authorizationHeaders,
      });
      const payload = await response.json() as RegistryResponse;
      if (!response.ok || !payload.registry) throw new Error(payload.message || payload.error || `تعذّر تحميل السجل (${response.status})`);
      const nextServers = payload.registry.backend.servers.map((server) => ({ ...server }));
      const nextFrontendServers = (payload.registry.frontend?.servers || []).map((server) => ({ ...server }));
      setServers(nextServers);
      setFrontendServers(nextFrontendServers);
      setSavedSnapshot(JSON.stringify({ backend: nextServers, frontend: nextFrontendServers }));
      setVersion(payload.registry.version || 0);
      setSource(payload.source || 'unknown');
      setUpdatedAt(payload.registry.updatedAt || null);
      setLocalHealth(payload.localHealth || []);
      setHealthScope(payload.healthScope || payload.localHealthScope || 'single-worker-isolate');
      setNotice(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تحميل إعدادات البوابة');
    } finally {
      setLoading(false);
    }
  }, [authorizationHeaders]);

  useEffect(() => { void loadRegistry(); }, [loadRegistry]);

  const addServer = () => {
    setError(null);
    setNotice(null);
    const id = idInput.trim();
    const url = urlInput.trim();
    const weight = Number(weightInput);
    const priority = Number(priorityInput);
    const timeoutMs = Number(timeoutInput);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
      setError('معرّف السيرفر يجب أن يتكون من 1 إلى 64 حرفًا أو رقمًا أو . _ -');
      return;
    }
    if (servers.some((server) => server.id === id)) {
      setError('يوجد سيرفر بهذا المعرّف بالفعل');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error();
      }
    } catch {
      setError('أدخل رابط HTTPS أساسيًا فقط، دون مسار أو بيانات دخول أو Query');
      return;
    }
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      setError('الوزن يجب أن يكون عددًا صحيحًا بين 1 و1000');
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
      setError('الأولوية يجب أن تكون عددًا صحيحًا بين 1 و1000؛ الرقم الأقل يُجرّب أولًا');
      return;
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
      setError('مهلة الطلب يجب أن تكون بين 1000 و30000 ملي ثانية');
      return;
    }
    if (servers.length >= MAX_SERVERS) {
      setError(`الحد الأقصى ${MAX_SERVERS} سيرفرًا في مجموعة Backend`);
      return;
    }
    setServers((current) => [...current, {
      id, url: new URL(url).origin, weight, priority, timeoutMs, enabled: true,
      provider: providerInput.trim(), region: regionInput.trim(),
    }]);
    setIdInput('');
    setUrlInput('');
    setWeightInput('100');
    setPriorityInput('100');
    setTimeoutInput('20000');
    setProviderInput('');
    setRegionInput('');
  };

  const updateServer = (id: string, patch: Partial<GatewayServer>) => {
    setServers((current) => current.map((server) => server.id === id ? { ...server, ...patch } : server));
  };

  const toggleServer = (server: GatewayServer) => {
    if (server.enabled && enabledCount <= 1) {
      setError('يجب إبقاء سيرفر Backend واحد مفعّلًا على الأقل');
      return;
    }
    updateServer(server.id, { enabled: !server.enabled });
    setError(null);
  };

  const removeServer = (server: GatewayServer) => {
    if (server.enabled && enabledCount <= 1) {
      setError('لا يمكن إزالة آخر سيرفر مفعّل');
      return;
    }
    setServers((current) => current.filter((item) => item.id !== server.id));
    setError(null);
  };

  const addFrontendServer = () => {
    setError(null);
    setNotice(null);
    const id = frontendIdInput.trim();
    const url = frontendUrlInput.trim();
    const buildId = frontendBuildIdInput.trim();
    const weight = Number(frontendWeightInput);
    const priority = Number(frontendPriorityInput);
    const timeoutMs = Number(frontendTimeoutInput);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
      setError('معرّف Frontend يجب أن يتكون من 1 إلى 64 حرفًا أو رقمًا أو . _ -');
      return;
    }
    if (frontendServers.some((server) => server.id === id)) {
      setError('يوجد أصل Frontend بهذا المعرّف بالفعل');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    } catch {
      setError('أدخل رابط HTTPS أساسيًا للواجهة دون مسار أو بيانات دخول أو Query');
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(buildId)) {
      setError('أدخل Build ID مطابقًا للقيمة الموجودة في /build-id.json لدى نسخة الواجهة');
      return;
    }
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      setError('وزن Frontend يجب أن يكون عددًا صحيحًا بين 1 و1000');
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
      setError('أولوية Frontend يجب أن تكون بين 1 و1000؛ الرقم الأقل يُجرّب أولًا');
      return;
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
      setError('مهلة Frontend يجب أن تكون بين 1000 و30000 ملي ثانية');
      return;
    }
    if (frontendServers.length >= MAX_SERVERS) {
      setError(`الحد الأقصى ${MAX_SERVERS} أصلًا في مجموعة Frontend`);
      return;
    }
    const otherBuild = frontendServers.find((server) => server.enabled)?.buildId;
    if (otherBuild && otherBuild !== buildId) {
      setError('يجب أن تتطابق Build ID لكل أصول Frontend المفعّلة لحماية RSC وServer Actions. انشر الإصدار نفسه على جميعها أولًا.');
      return;
    }
    setFrontendServers((current) => [...current, {
      id, url: new URL(url).origin, weight, priority, timeoutMs, enabled: true, buildId,
      releasePath: '/build-id.json', healthPath: '/build-id.json',
      provider: frontendProviderInput.trim(), region: frontendRegionInput.trim(),
    }]);
    setFrontendIdInput('');
    setFrontendUrlInput('');
    setFrontendBuildIdInput('');
    setFrontendWeightInput('100');
    setFrontendPriorityInput('100');
    setFrontendTimeoutInput('20000');
    setFrontendProviderInput('');
    setFrontendRegionInput('');
  };

  const updateFrontendServer = (id: string, patch: Partial<FrontendServer>) => {
    setFrontendServers((current) => current.map((server) => server.id === id ? { ...server, ...patch } : server));
  };

  const toggleFrontendServer = (server: FrontendServer) => {
    if (!server.enabled) {
      const activeBuild = frontendServers.find((candidate) => candidate.enabled)?.buildId;
      if (activeBuild && activeBuild !== server.buildId) {
        setError('لا يمكن تفعيل إصدار مختلف داخل مجموعة Frontend نفسها؛ وحّد Build ID أولًا.');
        return;
      }
    }
    updateFrontendServer(server.id, { enabled: !server.enabled });
    setError(null);
  };

  const removeFrontendServer = (server: FrontendServer) => {
    setFrontendServers((current) => current.filter((item) => item.id !== server.id));
    setError(null);
  };

  const saveRegistry = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const activeFrontendBuilds = new Set(frontendServers.filter((server) => server.enabled).map((server) => server.buildId));
      if (activeFrontendBuilds.size > 1) throw new Error('يجب أن تحمل جميع أصول Frontend المفعّلة Build ID واحدًا؛ انشر الملف نفسه على جميعها أولًا.');
      if (frontendServers.some((server) => !Number.isInteger(server.weight) || server.weight < 1 || server.weight > 1000)) throw new Error('أوزان Frontend يجب أن تكون أعدادًا صحيحة بين 1 و1000.');
      if (servers.some((server) => !Number.isInteger(server.weight) || server.weight < 1 || server.weight > 1000)) throw new Error('أوزان Backend يجب أن تكون أعدادًا صحيحة بين 1 و1000.');
      if ([...servers, ...frontendServers].some((server) => !Number.isInteger(server.priority ?? 100) || (server.priority ?? 100) < 1 || (server.priority ?? 100) > 1000)) throw new Error('الأولوية يجب أن تكون بين 1 و1000.');
      if ([...servers, ...frontendServers].some((server) => !Number.isInteger(server.timeoutMs ?? 20000) || (server.timeoutMs ?? 20000) < 1000 || (server.timeoutMs ?? 20000) > 30000)) throw new Error('مهلة الطلب يجب أن تكون بين 1000 و30000 ملي ثانية.');
      const response = await fetch(API_PATH, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', ...authorizationHeaders },
        body: JSON.stringify({ version, backend: { strategy: 'weighted-random', servers }, frontend: { strategy: 'weighted-random', servers: frontendServers } }),
      });
      const payload = await response.json() as RegistryResponse;
      if (response.status === 409 && payload.error === 'REGISTRY_VERSION_CONFLICT') {
        throw new Error('تغيّر سجل السيرفرات من جلسة أخرى بعد تحميله. حدّث السجل وراجع التعديلات قبل الحفظ.');
      }
      if (!response.ok || !payload.registry) throw new Error(payload.message || payload.error || `فشل حفظ الإعدادات (${response.status})`);
      const saved = payload.registry.backend.servers.map((server) => ({ ...server }));
      const savedFrontend = (payload.registry.frontend?.servers || []).map((server) => ({ ...server }));
      setServers(saved);
      setFrontendServers(savedFrontend);
      setSavedSnapshot(JSON.stringify({ backend: saved, frontend: savedFrontend }));
      setVersion(payload.registry.version || version + 1);
      setSource(payload.source || 'durable-object');
      setUpdatedAt(payload.registry.updatedAt || null);
      setLocalHealth([]);
      setProbeResults([]);
      setProbeCheckedAt(null);
      setPropagation(payload.propagation || 'تم تحديث سجل البوابة.');
      setNotice('تم حفظ سجل السيرفرات بنجاح.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const runHealthCheck = async () => {
    setProbing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(API_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', ...authorizationHeaders },
        body: JSON.stringify({ action: 'probe' }),
      });
      const payload = await response.json() as ProbeResponse;
      if (!response.ok || !Array.isArray(payload.results)) throw new Error(payload.error || `تعذّر فحص السيرفرات (${response.status})`);
      setProbeResults(payload.results);
      setProbeCheckedAt(payload.checkedAt);
      await loadRegistry();
      setNotice(payload.ok ? 'اكتمل فحص السيرفرات دون أخطاء.' : 'اكتمل الفحص، وهناك سيرفر واحد أو أكثر يحتاج إلى مراجعة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ فحص الصحة');
    } finally {
      setProbing(false);
    }
  };

  return (
    <AdminPageShell
      title="إدارة البنية التحتية"
      description="إدارة مجموعتي Backend وFrontend بشكل مستقل، مع قبول أي أصل HTTPS متوافق، وفحص الصحة وتوزيع المرور."
      actions={(
        <>
          <button type="button" onClick={() => void loadRegistry()} disabled={loading || saving || probing || isDirty} title={isDirty ? 'تراجع عن التغييرات المحلية أولًا' : undefined} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button type="button" onClick={() => void runHealthCheck()} disabled={loading || probing || (servers.length + frontendServers.length) === 0 || isDirty} title={isDirty ? 'احفظ التغييرات قبل فحصها' : undefined} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
            <Activity className={`h-4 w-4 ${probing ? 'animate-pulse' : ''}`} /> {probing ? 'جارٍ الفحص…' : 'فحص الصحة الآن'}
          </button>
          {isDirty && <button type="button" onClick={() => { const snapshot = JSON.parse(savedSnapshot) as { backend: GatewayServer[]; frontend: FrontendServer[] }; setServers(snapshot.backend); setFrontendServers(snapshot.frontend); setError(null); setNotice('تم التراجع عن التغييرات المحلية.'); }} disabled={saving || loading} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">تراجع</button>}
          <button type="button" onClick={() => void saveRegistry()} disabled={!isDirty || saving || loading || enabledCount === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        </>
      )}
    >
      <div className="space-y-5" dir="rtl">
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="ملخص البوابة">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مصدر الإعدادات</p><p className="mt-2 text-lg font-bold">{source === 'durable-object' ? 'Central Registry' : source === 'kv' || source === 'kv-compatibility-fallback' ? 'KV Replica' : source === 'env-fallback' ? 'Fallback Origin' : loading ? '…' : 'غير معروف'}</p><p className="mt-1 text-xs text-muted-foreground">النسخة {version || 0}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">السيرفرات المفعّلة</p><p className="mt-2 text-lg font-bold tabular-nums">{loading ? '…' : `${enabledCount} / ${servers.length}`}</p><p className="mt-1 text-xs text-muted-foreground">حد المجموعة {MAX_SERVERS}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مجموع الأوزان</p><p className="mt-2 text-lg font-bold tabular-nums">{totalWeight}</p><p className="mt-1 text-xs text-muted-foreground">الحصة داخل مستوى الأولوية نفسه، وبين الأصول المفعّلة فقط</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">أصول Frontend المفعّلة</p><p className="mt-2 text-lg font-bold tabular-nums">{loading ? '…' : `${frontendEnabledCount} / ${frontendServers.length}`}</p><p className="mt-1 text-xs text-muted-foreground">الوزن النشط {frontendTotalWeight}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">آخر تعديل محفوظ</p><p className="mt-2 text-sm font-semibold">{formatDate(updatedAt)}</p><p className="mt-1 text-xs text-muted-foreground">{isDirty ? 'لديك تغييرات غير محفوظة' : 'الإعدادات متزامنة مع النسخة المحمّلة'}</p></div>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Server className="h-5 w-5" /></span>
            <div><h2 className="text-lg font-bold">مجموعة خوادم Backend</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">تُستخدم هذه المجموعة لطلبات API التي لا تُخدم من الكاش. يجب أن تقدم كل النسخ API متوافقًا وأن تتصل بقاعدة البيانات المشتركة نفسها.</p></div>
          </div>

          {loading ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">جارٍ تحميل سجل السيرفرات…</div> : servers.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد سيرفرات في المجموعة.</div> : (
            <div className="space-y-3">
              {servers.map((server) => {
                const local = healthById.get(`backend:${server.id}`);
                const probe = probeById.get(`backend:${server.id}`);
                // A closed circuit is not proof of health: no request may have
                // reached that server yet. Only an explicit probe earns a health badge.
                const isHealthy = local?.healthy ?? (probe ? probe.healthy : null);
                const priorityWeight = servers.filter((item) => item.enabled && (item.priority ?? 100) === (server.priority ?? 100)).reduce((sum, item) => sum + item.weight, 0);
                const normalizedWeight = priorityWeight > 0 ? (server.weight / priorityWeight) * 100 : 0;
                return (
                  <article key={server.id} className={`rounded-xl border p-3 sm:p-4 ${server.enabled ? 'bg-background' : 'bg-muted/30 opacity-80'}`}>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{server.id}</h3><StatusPill healthy={server.enabled ? isHealthy : null} label={!server.enabled ? 'معطّل' : undefined} />{local?.quarantined && <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">Build Mismatch · معزول</span>}{!local?.quarantined && local?.circuit === 'open' && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Circuit Open · {formatRetryAt(local.retryAt)}</span>}</div>
                        <p className="break-all text-xs text-muted-foreground" dir="ltr">{server.url}</p>
                        {(server.provider || server.region) && <p className="text-[11px] text-muted-foreground">Provider: {server.provider || 'غير محدد'} · Region: {server.region || 'غير محدد'}</p>}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${server.enabled ? normalizedWeight : 0}%` }} /></div>
                        <p className="text-[11px] text-muted-foreground">حصة تقريبية داخل الأولوية {server.priority ?? 100}: {server.enabled ? `${normalizedWeight.toFixed(1)}%` : '0%'} · الوزن {server.weight}</p>
                        {local && <p className="text-xs text-muted-foreground">قاطع الدائرة: {local.circuit === 'open' ? 'مفتوح' : 'مغلق'} · الإخفاقات المسجلة: {local.failures}</p>}
                        {(local?.checkedAt || probe) && <p className="text-xs text-muted-foreground">آخر حالة مسجلة: {local?.status ? `HTTP ${local.status}` : probe?.status ? `HTTP ${probe.status}` : probe?.detail || 'غير معروف'} · {local?.durationMs ?? probe?.durationMs ?? 0} ms · {local?.healthSource === 'traffic' ? 'طلب فعلي' : 'فحص يدوي'}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                        <label className="col-span-2 flex min-w-32 flex-col gap-1 text-xs text-muted-foreground">مسار فحص الصحة
                          <input value={server.healthPath || '/health'} onChange={(event) => updateServer(server.id, { healthPath: event.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-left text-sm text-foreground" dir="ltr" aria-label={`مسار فحص ${server.id}`} />
                        </label>
                        <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">الوزن
                          <input type="number" min={1} max={1000} step={1} value={server.weight} onChange={(event) => updateServer(server.id, { weight: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`وزن ${server.id}`} />
                        </label>
                        <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">الأولوية
                          <input type="number" min={1} max={1000} step={1} value={server.priority ?? 100} onChange={(event) => updateServer(server.id, { priority: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`أولوية ${server.id}`} />
                        </label>
                        <label className="flex min-w-28 flex-col gap-1 text-xs text-muted-foreground">مهلة الطلب (ms)
                          <input type="number" min={1000} max={30000} step={500} value={server.timeoutMs ?? 20000} onChange={(event) => updateServer(server.id, { timeoutMs: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`مهلة ${server.id}`} />
                        </label>
                        <button type="button" onClick={() => toggleServer(server)} className={`h-10 rounded-lg border px-3 text-sm font-medium ${server.enabled ? 'hover:bg-muted' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{server.enabled ? 'تعطيل' : 'تفعيل'}</button>
                        <button type="button" onClick={() => removeServer(server)} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-destructive/25 px-3 text-sm text-destructive hover:bg-destructive/5" aria-label={`إزالة ${server.id}`}><Trash2 className="h-4 w-4" /> إزالة</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-dashed p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h3 className="font-semibold">إضافة سيرفر Backend</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_2fr_110px_110px_140px_1fr_1fr_auto] xl:items-end">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">معرّف السيرفر
                <input value={idInput} onChange={(event) => setIdInput(event.target.value)} placeholder="backend-2" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">رابط الأصل HTTPS
                <input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://api-secondary.example.com" dir="ltr" type="url" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الوزن
                <input value={weightInput} onChange={(event) => setWeightInput(event.target.value)} type="number" min={1} max={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الأولوية
                <input value={priorityInput} onChange={(event) => setPriorityInput(event.target.value)} type="number" min={1} max={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مهلة الطلب (ms)
                <input value={timeoutInput} onChange={(event) => setTimeoutInput(event.target.value)} type="number" min={1000} max={30000} step={500} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">المزوّد
                <input value={providerInput} onChange={(event) => setProviderInput(event.target.value)} maxLength={64} placeholder="AWS / Render / VPS" className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">المنطقة
                <input value={regionInput} onChange={(event) => setRegionInput(event.target.value)} maxLength={64} placeholder="eu-west / me-central" className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <button type="button" onClick={addServer} disabled={loading || servers.length >= MAX_SERVERS} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Plus className="h-4 w-4" /> إضافة</button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">يجب أن يكون الرابط أصل HTTPS عامًا دون مسار، وألا يحتوي اسم مستخدم أو كلمة مرور. يمكن تقييد النطاقات المسموحة أيضًا من إعداد GATEWAY_ALLOWED_HOSTS.</p>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Server className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">مجموعة خوادم Frontend</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">توجّه طلبات الموقع العام إلى أي أصول HTTPS متوافقة، بغض النظر عن مزوّد الاستضافة. تثبيت الجلسة على أصل واحد يحافظ على توافق HTML وRSC وServer Actions وملفات الإصدار.</p>
              <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">جميع الأصول المفعّلة في المجموعة يجب أن تطابق Build ID نفسه. التوجيه لا يعمل على نطاق الموقع حتى تضيف نطاقه إلى FRONTEND_GATEWAY_HOSTS وتوجّه Route ذلك النطاق إلى هذا Worker.</p>
            </div>
          </div>

          {loading ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">جارٍ تحميل أصول Frontend…</div> : frontendServers.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد أصول Frontend مسجلة بعد. يمكن ترك المجموعة فارغة ما دام توجيه الواجهة غير مفعّل.</div> : (
            <div className="space-y-3">
              {frontendServers.map((server) => {
                const local = healthById.get(`frontend:${server.id}`);
                const probe = probeById.get(`frontend:${server.id}`);
                const isHealthy = local?.healthy ?? (probe ? probe.healthy : null);
                const priorityWeight = frontendServers.filter((item) => item.enabled && (item.priority ?? 100) === (server.priority ?? 100)).reduce((sum, item) => sum + item.weight, 0);
                const normalizedWeight = priorityWeight > 0 ? (server.weight / priorityWeight) * 100 : 0;
                return (
                  <article key={server.id} className={`rounded-xl border p-3 sm:p-4 ${server.enabled ? 'bg-background' : 'bg-muted/30 opacity-80'}`}>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{server.id}</h3><StatusPill healthy={server.enabled ? isHealthy : null} label={!server.enabled ? 'معطّل' : undefined} />{local?.quarantined && <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">Build Mismatch · معزول</span>}{!local?.quarantined && local?.circuit === 'open' && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Circuit Open · {formatRetryAt(local.retryAt)}</span>}</div>
                        <p className="break-all text-xs text-muted-foreground" dir="ltr">{server.url}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">Build ID: {server.buildId} · Provider: {server.provider || 'غير محدد'} · Region: {server.region || 'غير محدد'}</p>
                        <p className="text-[11px] text-muted-foreground">حصة داخل الأولوية {server.priority ?? 100}: {server.enabled ? `${normalizedWeight.toFixed(1)}%` : '0%'} · الوزن {server.weight} · الأولوية {server.priority ?? 100} · المهلة {server.timeoutMs ?? 20000}ms · {server.healthPath || '/build-id.json'} · {server.releasePath || '/build-id.json'}</p>
                        {(local?.checkedAt || probe) && <p className="text-xs text-muted-foreground">آخر فحص: {local?.status ? `HTTP ${local.status}` : probe?.status ? `HTTP ${probe.status}` : probe?.detail || 'غير معروف'} · {local?.durationMs ?? probe?.durationMs ?? 0} ms · {local?.quarantined || probe?.detail === 'build_mismatch' ? 'Build ID لا يطابق الإصدار المنشور؛ تم عزل الأصل حتى نجاح فحص مطابق' : local?.healthSource === 'traffic' ? 'طلب فعلي' : 'فحص يدوي'}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                        <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">الوزن
                          <input type="number" min={1} max={1000} step={1} value={server.weight} onChange={(event) => updateFrontendServer(server.id, { weight: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`وزن Frontend ${server.id}`} />
                        </label>
                        <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">الأولوية
                          <input type="number" min={1} max={1000} value={server.priority ?? 100} onChange={(event) => updateFrontendServer(server.id, { priority: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`أولوية Frontend ${server.id}`} />
                        </label>
                        <label className="flex min-w-28 flex-col gap-1 text-xs text-muted-foreground">مهلة الطلب (ms)
                          <input type="number" min={1000} max={30000} step={500} value={server.timeoutMs ?? 20000} onChange={(event) => updateFrontendServer(server.id, { timeoutMs: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`مهلة Frontend ${server.id}`} />
                        </label>
                        <label className="flex min-w-28 flex-col gap-1 text-xs text-muted-foreground">Build ID
                          <input value={server.buildId} onChange={(event) => updateFrontendServer(server.id, { buildId: event.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-left text-xs text-foreground" dir="ltr" aria-label={`Build ID ${server.id}`} />
                        </label>
                        <label className="flex min-w-32 flex-col gap-1 text-xs text-muted-foreground">Health Path
                          <input value={server.healthPath || '/build-id.json'} onChange={(event) => updateFrontendServer(server.id, { healthPath: event.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-left text-xs text-foreground" dir="ltr" aria-label={`Health Path ${server.id}`} />
                        </label>
                        <label className="flex min-w-32 flex-col gap-1 text-xs text-muted-foreground">Release Path
                          <input value={server.releasePath || '/build-id.json'} onChange={(event) => updateFrontendServer(server.id, { releasePath: event.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-left text-xs text-foreground" dir="ltr" aria-label={`Release Path ${server.id}`} />
                        </label>
                        <button type="button" onClick={() => toggleFrontendServer(server)} className={`h-10 rounded-lg border px-3 text-sm font-medium ${server.enabled ? 'hover:bg-muted' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{server.enabled ? 'تعطيل' : 'تفعيل'}</button>
                        <button type="button" onClick={() => removeFrontendServer(server)} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-destructive/25 px-3 text-sm text-destructive hover:bg-destructive/5" aria-label={`إزالة Frontend ${server.id}`}><Trash2 className="h-4 w-4" /> إزالة</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-dashed p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h3 className="font-semibold">إضافة أصل Frontend</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">معرّف الأصل
                <input value={frontendIdInput} onChange={(event) => setFrontendIdInput(event.target.value)} placeholder="frontend-2" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">رابط أصل HTTPS
                <input value={frontendUrlInput} onChange={(event) => setFrontendUrlInput(event.target.value)} placeholder="https://app-secondary.example.com" dir="ltr" type="url" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Build ID
                <input value={frontendBuildIdInput} onChange={(event) => setFrontendBuildIdInput(event.target.value)} placeholder="a1b2c3d4-179..." dir="ltr" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الوزن
                <input value={frontendWeightInput} onChange={(event) => setFrontendWeightInput(event.target.value)} type="number" min={1} max={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الأولوية
                <input value={frontendPriorityInput} onChange={(event) => setFrontendPriorityInput(event.target.value)} type="number" min={1} max={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مهلة الطلب (ms)
                <input value={frontendTimeoutInput} onChange={(event) => setFrontendTimeoutInput(event.target.value)} type="number" min={1000} max={30000} step={500} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مزوّد الخدمة (اختياري)
                <input value={frontendProviderInput} onChange={(event) => setFrontendProviderInput(event.target.value)} placeholder="Render / AWS / VPS / Cloudflare" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">المنطقة (اختياري)
                <input value={frontendRegionInput} onChange={(event) => setFrontendRegionInput(event.target.value)} placeholder="eu-west / me-central" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={addFrontendServer} disabled={loading || frontendServers.length >= MAX_SERVERS} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Plus className="h-4 w-4" /> إضافة Frontend</button>
              <p className="text-xs leading-5 text-muted-foreground">يتحقق الفحص اليدوي من مسار الصحة ثم يقارن Build ID المقروء من Release Path بالقيمة المسجلة. جميع النسخ النشطة يجب أن تحمل الإصدار نفسه.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">سياسة التوجيه والحماية</h2></div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <p>• التوزيع الحالي Weighted Random داخل مستوى الأولوية نفسه؛ الرقم الأقل في Priority يُجرّب أولًا، والوزن يحدد الحصة النسبية داخل المستوى.</p>
              <p>• لكل أصل مهلة اتصال/استجابة مستقلة قابلة للضبط بين ثانية و30 ثانية، والقيمة الافتراضية 20 ثانية.</p>
              <p>• GET وHEAD فقط يمكن تحويلهما تلقائيًا عند أخطاء الاتصال و502/503/504.</p>
              <p>• POST وPUT وPATCH وDELETE لا يعاد إرسالها تلقائيًا لتجنب تكرار العمليات.</p>
              <p>• حالة الصحة مشتركة عبر Durable Object، وسجل الإعدادات مركزي مع KV كنسخة احتياطية. تُخزّن كل نسخة Worker لقطة محلية للصحة لمدة 5 ثوانٍ، وتُعزل الواجهة تلقائيًا عند اكتشاف Build ID مختلف حتى ينجح فحص إصدار مطابق.</p>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" /><h2 className="font-bold">فحص الصحة</h2></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">الفحص يدوي فقط، ويستخدم مسار الصحة المحدد لكل أصل بمهلة 4 ثوانٍ. أصول Frontend تخضع أيضًا للتحقق من مطابقة buildId عبر releasePath. لا يوجد Cron أو Warmup أو فحص دوري بالخلفية.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />{probeCheckedAt ? `آخر فحص: ${formatDate(probeCheckedAt)}` : 'لم يُنفّذ فحص يدوي بعد'}</div>
            <p className="mt-2 text-xs text-muted-foreground">نطاق سجل الصحة: {healthScope === 'central-durable-object' ? 'مركزي ومشترك بين نسخ Worker' : 'محلي لنسخة Worker الحالية'}.</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">الفحص اليدوي ينطلق من موقع Cloudflare الذي نفذ طلب الإدارة؛ لكن النتيجة والحالة المسجلة تُحفظان مركزيًا وتظهران لنسخ Worker الأخرى. لا تُنفّذ أي فحوص دورية تلقائية.</p>
            {propagation && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">{propagation}</p>}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2"><WifiOff className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">معلومات مهمة</h2></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">إضافة أصل هنا لا تنشئ خدمة أو قاعدة بيانات جديدة. كل Backend يجب أن يطابق عقد API ويتشارك PostgreSQL وRedis والجلسات ومخطط Prisma المتوافق. وكل Frontend يجب أن يخدم بناء Next.js نفسه، مع مفاتيح Server Actions والأسرار وإعدادات الجلسات نفسها. كما يلزم ربط اسم النطاق العام بالـ Worker مرة واحدة من إعدادات Cloudflare؛ إضافة الأصل وحدها لا تنشئ DNS أو Route.</p>
          {isDirty && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300" aria-live="polite">لديك تغييرات محلية غير محفوظة. اضغط «حفظ التغييرات» لتطبيقها.</p>}
        </section>
      </div>
    </AdminPageShell>
  );
}
