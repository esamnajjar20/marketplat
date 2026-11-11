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
type GoServiceServer = GatewayServer & { serviceKey: string; routePrefix: string; upstreamPrefix: string; manualSharePercent?: number };

type LocalHealth = {
  id: string;
  kind: 'backend' | 'frontend' | 'go';
  failures: number;
  circuit: 'open' | 'closed';
  retryAt: number | null;
  healthy?: boolean | null;
  quarantined?: boolean;
  status?: number | null;
  durationMs?: number | null;
  checkedAt?: string | null;
  healthSource?: 'probe' | 'traffic' | null;
  ewmaDurationMs?: number | null;
  errorRate?: number | null;
  activeRequests?: number | null;
  ewmaActiveRequests?: number | null;
  sampleCount?: number;
  manualSharePercent?: number | null;
  effectiveSharePercent?: number | null;
};

type ProbeResult = {
  id: string;
  kind: 'backend' | 'frontend' | 'go';
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
  coordinatorStatus?: 'available' | 'unavailable' | 'backoff' | 'not-configured' | 'not-checked';
  registryReadOnly?: boolean;
  replicaStatus?: string;
  registry?: {
    version: number;
    updatedAt?: string | null;
    backend: { strategy: string; servers: GatewayServer[] };
    frontend: { strategy: string; servers: FrontendServer[] };
    go?: { strategy: string; servers: GoServiceServer[]; adaptive?: { enabled: boolean; sensitivity: number } };
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
const MAX_GO_TARGETS = 32;

function gatewayRegistryErrorMessage(payload: RegistryResponse | null, status: number): string {
  switch (payload?.error) {
    case 'GATEWAY_ADMIN_TOKEN_NOT_CONFIGURED_ON_FRONTEND':
      return 'إعداد البوابة غير مكتمل: اضبط سر GATEWAY_ADMIN_TOKEN في بيئة Worker الخاصة بالواجهة ثم أعد نشرها.';
    case 'GATEWAY_ADMIN_NOT_CONFIGURED':
      return 'سر إدارة البوابة GATEWAY_ADMIN_TOKEN غير مضبوط في API Worker.';
    case 'GATEWAY_STORAGE_NOT_CONFIGURED':
      return 'تخزين سجل البوابة غير مربوط. يلزم إعداد Durable Object أو REFERENCE_KV في API Worker.';
    case 'GATEWAY_WORKER_UNAVAILABLE':
      return 'تعذّر الوصول إلى API Worker من الواجهة. تحقق من Service Binding باسم API_WORKER.';
    case 'FORBIDDEN':
      return 'انتهت صلاحية جلسة الإدارة أو لا تملك صلاحية إدارة البوابة. حدّث الجلسة ثم أعد المحاولة.';
    default:
      if (status === 503) return 'خدمة سجل البوابة غير متاحة (503). تحقّق من أسرار الإدارة وربط التخزين في Worker ثم أعد المحاولة.';
      if (status === 502) return 'تعذّر الاتصال بخدمة البوابة (502). تحقق من اتصال Worker ثم أعد المحاولة.';
      return payload?.message || payload?.error || `تعذّر تحميل السجل (${status})`;
  }
}

/** Allocate a tier's manual percentages in tenths, preserving an exact total
 * and a non-zero minimum even for large replica groups. */
function distributeGoShares(targets: GoServiceServer[], totalPercent: number): Map<string, number> {
  const shares = new Map<string, number>();
  if (targets.length === 0) return shares;
  const totalUnits = Math.round(totalPercent * 10);
  const minimumUnits = 1;
  const extraUnits = Math.max(0, totalUnits - (targets.length * minimumUnits));
  const weights = targets.map((target) => Math.max(0.1, Number(target.manualSharePercent ?? target.weight) || 0.1));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = targets.map((target, index) => {
    const weight = weights[index] ?? 0.1;
    const rawUnits = weightTotal > 0 ? (weight / weightTotal) * extraUnits : extraUnits / targets.length;
    const floorUnits = Math.floor(rawUnits);
    return { id: target.id, units: minimumUnits + floorUnits, remainder: rawUnits - floorUnits };
  });
  let unitsLeft = totalUnits - allocations.reduce((sum, item) => sum + item.units, 0);
  const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < byRemainder.length && unitsLeft > 0; index += 1, unitsLeft -= 1) {
    const allocation = byRemainder[index];
    if (allocation) allocation.units += 1;
  }
  for (const allocation of allocations) shares.set(allocation.id, allocation.units / 10);
  return shares;
}

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
  const authorizationHeaders = useMemo<Record<string, string>>(
    (): Record<string, string> => accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    [accessToken],
  );
  const [servers, setServers] = useState<GatewayServer[]>([]);
  const [frontendServers, setFrontendServers] = useState<FrontendServer[]>([]);
  const [goServices, setGoServices] = useState<GoServiceServer[]>([]);
  const [goAdaptiveEnabled, setGoAdaptiveEnabled] = useState(true);
  const [goAdaptiveSensitivity, setGoAdaptiveSensitivity] = useState(65);
  const [savedSnapshot, setSavedSnapshot] = useState('{"backend":[],"frontend":[],"go":[]}');
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState('');
  const [coordinatorStatus, setCoordinatorStatus] = useState<RegistryResponse['coordinatorStatus']>('not-checked');
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
  const [goTargetIdInput, setGoTargetIdInput] = useState('');
  const [goServiceKeyInput, setGoServiceKeyInput] = useState('');
  const [goRoutePrefixInput, setGoRoutePrefixInput] = useState('/internal/analytics');
  const [goUpstreamPrefixInput, setGoUpstreamPrefixInput] = useState('/internal/analytics');
  const [goUrlInput, setGoUrlInput] = useState('');
  const [goWeightInput, setGoWeightInput] = useState('100');
  const [goPriorityInput, setGoPriorityInput] = useState('100');
  const [goTimeoutInput, setGoTimeoutInput] = useState('540000');
  const [goProviderInput, setGoProviderInput] = useState('');
  const [goRegionInput, setGoRegionInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentSnapshot = useMemo(() => JSON.stringify({ backend: servers, frontend: frontendServers, go: goServices, goAdaptive: { enabled: goAdaptiveEnabled, sensitivity: goAdaptiveSensitivity } }), [servers, frontendServers, goServices, goAdaptiveEnabled, goAdaptiveSensitivity]);
  const isDirty = currentSnapshot !== savedSnapshot;
  const canSaveRegistry = source === 'durable-object' || (source === 'env-fallback' && coordinatorStatus === 'available');
  const registryReadOnly = Boolean(source) && !canSaveRegistry;
  const registryBootstrap = source === 'env-fallback' && coordinatorStatus === 'available';
  const enabledCount = useMemo(() => servers.filter((server) => server.enabled).length, [servers]);
  const totalWeight = useMemo(() => servers.filter((server) => server.enabled).reduce((sum, server) => sum + server.weight, 0), [servers]);
  const frontendEnabledCount = useMemo(() => frontendServers.filter((server) => server.enabled).length, [frontendServers]);
  const frontendTotalWeight = useMemo(() => frontendServers.filter((server) => server.enabled).reduce((sum, server) => sum + server.weight, 0), [frontendServers]);
  const goEnabledCount = useMemo(() => goServices.filter((server) => server.enabled).length, [goServices]);
  const goServiceCount = useMemo(() => new Set(goServices.map((server) => server.serviceKey)).size, [goServices]);
  const healthById = useMemo(() => new Map(localHealth.map((item) => [`${item.kind}:${item.id}`, item])), [localHealth]);
  const probeById = useMemo(() => new Map(probeResults.map((item) => [`${item.kind}:${item.id}`, item])), [probeResults]);

  const loadRegistry = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(forceRefresh ? `${API_PATH}?refresh=1` : API_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: authorizationHeaders,
      });
      const payload = await response.json().catch(() => null) as RegistryResponse | null;
      if (!response.ok || !payload?.registry) {
        throw new Error(gatewayRegistryErrorMessage(payload, response.status));
      }
      const nextServers = payload.registry.backend.servers.map((server) => ({ ...server }));
      const nextFrontendServers = (payload.registry.frontend?.servers || []).map((server) => ({ ...server }));
      const nextGoServices = (payload.registry.go?.servers || []).map((server) => ({ ...server }));
      const nextAdaptive = payload.registry.go?.adaptive || { enabled: true, sensitivity: 65 };
      setServers(nextServers);
      setFrontendServers(nextFrontendServers);
      setGoServices(nextGoServices);
      setGoAdaptiveEnabled(nextAdaptive.enabled !== false);
      setGoAdaptiveSensitivity(Number.isInteger(nextAdaptive.sensitivity) ? nextAdaptive.sensitivity : 65);
      setSavedSnapshot(JSON.stringify({ backend: nextServers, frontend: nextFrontendServers, go: nextGoServices, goAdaptive: { enabled: nextAdaptive.enabled !== false, sensitivity: Number.isInteger(nextAdaptive.sensitivity) ? nextAdaptive.sensitivity : 65 } }));
      setVersion(payload.registry.version || 0);
      setSource(payload.source || 'unknown');
      setCoordinatorStatus(payload.coordinatorStatus || 'not-checked');
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

  useEffect(() => { void loadRegistry(true); }, [loadRegistry]);

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

  const addGoServiceTarget = () => {
    setError(null);
    setNotice(null);
    const id = goTargetIdInput.trim();
    const serviceKey = goServiceKeyInput.trim().toLowerCase();
    const url = goUrlInput.trim();
    const routePrefix = goRoutePrefixInput.trim().replace(/\/$/, '');
    const upstreamPrefix = goUpstreamPrefixInput.trim().replace(/\/$/, '');
    const weight = Number(goWeightInput);
    const priority = Number(goPriorityInput);
    const timeoutMs = Number(goTimeoutInput);

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
      setError('معرّف نسخة Go يجب أن يتكون من 1 إلى 64 حرفًا أو رقمًا أو . _ -');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(serviceKey)) {
      setError('مفتاح خدمة Go يجب أن يكون lowercase مثل analytics أو notifications');
      return;
    }
    if (goServices.some((server) => server.id === id)) {
      setError('يوجد هدف Go بهذا المعرّف بالفعل');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    } catch {
      setError('أدخل رابط HTTPS أساسيًا لخدمة Go دون مسار أو بيانات دخول أو Query');
      return;
    }
    const safePath = (value: string) => value.length <= 512 && value.startsWith('/internal/') && !value.includes('\\') && !/[?#\\\u0000-\u001f]/.test(value) && !value.split('/').some((part) => part === '.' || part === '..');
    if (!safePath(routePrefix) || !safePath(upstreamPrefix)) {
      setError('مسارات Go يجب أن تكون آمنة وتبدأ بـ /internal/ دون Query أو Fragment أو مقاطع ..');
      return;
    }
    if (!Number.isFinite(weight) || weight < 0.1 || weight > 100) {
      setError('الحصة الابتدائية لنسخة Go يجب أن تكون بين 0.1 و100%.');
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
      setError('أولوية Go يجب أن تكون بين 1 و1000؛ الرقم الأقل يُجرّب أولًا');
      return;
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) {
      setError('مهلة Go يجب أن تكون بين 1000 و600000 ملي ثانية');
      return;
    }
    if (goServices.length >= MAX_GO_TARGETS) {
      setError(`الحد الأقصى ${MAX_GO_TARGETS} هدفًا في مجموعة Go`);
      return;
    }
    const sameService = goServices.filter((server) => server.serviceKey === serviceKey);
    if (sameService.some((server) => server.routePrefix !== routePrefix || server.upstreamPrefix !== upstreamPrefix)) {
      setError('كل نسخ الخدمة الواحدة يجب أن تستخدم Route Prefix وUpstream Prefix نفسيهما');
      return;
    }
    const routeOwner = goServices.find((server) => server.routePrefix === routePrefix && server.serviceKey !== serviceKey);
    if (routeOwner) {
      setError(`مسار الخدمة مستخدم بالفعل بواسطة ${routeOwner.serviceKey}`);
      return;
    }
    const sameTier = goServices.filter((server) => server.serviceKey === serviceKey && (server.priority ?? 100) === priority);
    if (sameTier.length > 0 && weight > 100 - (sameTier.length * 0.1)) {
      setError(`اترك 0.1% على الأقل لكل نسخة موجودة؛ الحد الأقصى للحصة الجديدة ${Math.round((100 - (sameTier.length * 0.1)) * 10) / 10}%.`);
      return;
    }
    setGoServices((current) => {
      const currentTier = current.filter((server) => server.serviceKey === serviceKey && (server.priority ?? 100) === priority);
      const newShare = currentTier.length ? weight : 100;
      const remainingShare = 100 - newShare;
      const redistributed = distributeGoShares(currentTier, remainingShare);
      const adjusted = current.map((server) => redistributed.has(server.id)
        ? { ...server, manualSharePercent: redistributed.get(server.id)! }
        : server);
      return [...adjusted, {
        id, serviceKey, routePrefix, upstreamPrefix, url: new URL(url).origin,
        weight, manualSharePercent: newShare, priority, timeoutMs, enabled: true, provider: goProviderInput.trim(),
        region: goRegionInput.trim(), healthPath: '/healthz',
      }];
    });
    setGoTargetIdInput('');
    setGoUrlInput('');
    setGoWeightInput('100');
    setGoPriorityInput('100');
    setGoTimeoutInput('540000');
    setGoProviderInput('');
    setGoRegionInput('');
  };

  const updateGoServiceTarget = (id: string, patch: Partial<GoServiceServer>) => {
    setGoServices((current) => {
      const target = current.find((server) => server.id === id);
      if (!target) return current;
      const movedPriority = patch.priority !== undefined && (patch.priority ?? 100) !== (target.priority ?? 100);
      const updated = current.map((server) => server.id === id ? { ...server, ...patch } : server);
      if (!movedPriority) return updated;

      const oldTier = current.filter((server) => server.id !== id && server.serviceKey === target.serviceKey && (server.priority ?? 100) === (target.priority ?? 100));
      const movedTarget = updated.find((server) => server.id === id);
      const newTier = movedTarget
        ? updated.filter((server) => server.serviceKey === target.serviceKey && (server.priority ?? 100) === (movedTarget.priority ?? 100))
        : [];
      const oldShares = distributeGoShares(oldTier, 100);
      const newShares = distributeGoShares(newTier, 100);
      return updated.map((server) => {
        if (newShares.has(server.id)) return { ...server, manualSharePercent: newShares.get(server.id)! };
        if (oldShares.has(server.id)) return { ...server, manualSharePercent: oldShares.get(server.id)! };
        return server;
      });
    });
  };

  const updateGoManualShare = (id: string, requested: number) => {
    setGoServices((current) => {
      const target = current.find((server) => server.id === id);
      if (!target) return current;
      const tier = current.filter((server) => server.serviceKey === target.serviceKey && (server.priority ?? 100) === (target.priority ?? 100));
      if (tier.length <= 1) return current.map((server) => server.id === id ? { ...server, manualSharePercent: 100 } : server);
      const others = tier.filter((server) => server.id !== id);
      const requestedShare = Number.isFinite(requested) ? requested : 50;
      const maxShare = 100 - (others.length * 0.1);
      const share = Math.max(0.1, Math.min(maxShare, Math.round(requestedShare * 10) / 10));
      const redistributed = distributeGoShares(others, 100 - share);
      return current.map((server) => {
        if (server.id === id) return { ...server, manualSharePercent: share };
        return redistributed.has(server.id)
          ? { ...server, manualSharePercent: redistributed.get(server.id)! }
          : server;
      });
    });
  };

  const toggleGoServiceTarget = (server: GoServiceServer) => {
    updateGoServiceTarget(server.id, { enabled: !server.enabled });
    setError(null);
  };

  const removeGoServiceTarget = (server: GoServiceServer) => {
    setGoServices((current) => {
      const remaining = current.filter((item) => item.id !== server.id);
      const tier = remaining.filter((item) => item.serviceKey === server.serviceKey && (item.priority ?? 100) === (server.priority ?? 100));
      const redistributed = distributeGoShares(tier, 100);
      return remaining.map((item) => redistributed.has(item.id)
        ? { ...item, manualSharePercent: redistributed.get(item.id)! }
        : item);
    });
    setError(null);
  };

  const saveRegistry = async () => {
    if (!canSaveRegistry) {
      setError('السجل الحالي نسخة احتياطية للقراءة فقط. استعد اتصال Durable Object ثم حدّث السجل قبل الحفظ.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const activeFrontendBuilds = new Set(frontendServers.filter((server) => server.enabled).map((server) => server.buildId));
      if (activeFrontendBuilds.size > 1) throw new Error('يجب أن تحمل جميع أصول Frontend المفعّلة Build ID واحدًا؛ انشر الملف نفسه على جميعها أولًا.');
      if (frontendServers.some((server) => !Number.isInteger(server.weight) || server.weight < 1 || server.weight > 1000)) throw new Error('أوزان Frontend يجب أن تكون أعدادًا صحيحة بين 1 و1000.');
      if (servers.some((server) => !Number.isInteger(server.weight) || server.weight < 1 || server.weight > 1000)) throw new Error('أوزان Backend يجب أن تكون أعدادًا صحيحة بين 1 و1000.');
      if ([...servers, ...frontendServers, ...goServices].some((server) => !Number.isInteger(server.priority ?? 100) || (server.priority ?? 100) < 1 || (server.priority ?? 100) > 1000)) throw new Error('الأولوية يجب أن تكون بين 1 و1000.');
      if ([...servers, ...frontendServers].some((server) => !Number.isInteger(server.timeoutMs ?? 20000) || (server.timeoutMs ?? 20000) < 1000 || (server.timeoutMs ?? 20000) > 30000)) throw new Error('مهلة Backend وFrontend يجب أن تكون بين 1000 و30000 ملي ثانية.');
      if (goServices.some((server) => !Number.isInteger(server.timeoutMs ?? 540000) || (server.timeoutMs ?? 540000) < 1000 || (server.timeoutMs ?? 540000) > 600000)) throw new Error('مهلة Go يجب أن تكون بين 1000 و600000 ملي ثانية.');
      if (goServices.some((server) => !Number.isFinite(server.manualSharePercent) || Number(server.manualSharePercent) <= 0 || Number(server.manualSharePercent) > 100)) throw new Error('الحصة اليدوية لكل نسخة Go يجب أن تكون أكبر من 0 وحتى 100%.');
      if (!Number.isInteger(goAdaptiveSensitivity) || goAdaptiveSensitivity < 0 || goAdaptiveSensitivity > 100) throw new Error('حساسية التوزيع التكيفي يجب أن تكون بين 0 و100.');
      const goShareTotals = new Map<string, number>();
      for (const server of goServices) { const key = `${server.serviceKey}|${server.priority ?? 100}`; goShareTotals.set(key, (goShareTotals.get(key) || 0) + Number(server.manualSharePercent || 0)); }
      if ([...goShareTotals.values()].some((total) => Math.abs(total - 100) > 1.1)) throw new Error('يجب أن يكون مجموع الحصص اليدوية لنسخ الخدمة في مستوى الأولوية الواحد 100%.');
      const goServiceRoutes = new Map<string, { routePrefix: string; upstreamPrefix: string }>();
      const goRouteOwners = new Map<string, string>();
      for (const server of goServices) {
        const mapping = goServiceRoutes.get(server.serviceKey);
        if (mapping && (mapping.routePrefix !== server.routePrefix || mapping.upstreamPrefix !== server.upstreamPrefix)) throw new Error(`نسخ خدمة Go ${server.serviceKey} يجب أن تتطابق في مسارات التوجيه.`);
        const owner = goRouteOwners.get(server.routePrefix);
        if (owner && owner !== server.serviceKey) throw new Error(`مسار Go ${server.routePrefix} مستخدم بواسطة خدمة أخرى.`);
        goServiceRoutes.set(server.serviceKey, { routePrefix: server.routePrefix, upstreamPrefix: server.upstreamPrefix });
        goRouteOwners.set(server.routePrefix, server.serviceKey);
      }
      const response = await fetch(API_PATH, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', ...authorizationHeaders },
        body: JSON.stringify({ version, backend: { strategy: 'weighted-random', servers }, frontend: { strategy: 'weighted-random', servers: frontendServers }, go: { strategy: 'weighted-random', adaptive: { enabled: goAdaptiveEnabled, sensitivity: goAdaptiveSensitivity }, servers: goServices } }),
      });
      const payload = await response.json() as RegistryResponse;
      if (response.status === 409 && payload.error === 'REGISTRY_VERSION_CONFLICT') {
        throw new Error('تغيّر سجل السيرفرات من جلسة أخرى بعد تحميله. حدّث السجل وراجع التعديلات قبل الحفظ.');
      }
      if (!response.ok || !payload.registry) throw new Error(payload.message || payload.error || `فشل حفظ الإعدادات (${response.status})`);
      const saved = payload.registry.backend.servers.map((server) => ({ ...server }));
      const savedFrontend = (payload.registry.frontend?.servers || []).map((server) => ({ ...server }));
      const savedGo = (payload.registry.go?.servers || []).map((server) => ({ ...server }));
      setServers(saved);
      setFrontendServers(savedFrontend);
      setGoServices(savedGo);
      const savedAdaptive = payload.registry.go?.adaptive || { enabled: true, sensitivity: 65 };
      setGoAdaptiveEnabled(savedAdaptive.enabled !== false);
      setGoAdaptiveSensitivity(Number.isInteger(savedAdaptive.sensitivity) ? savedAdaptive.sensitivity : 65);
      setSavedSnapshot(JSON.stringify({ backend: saved, frontend: savedFrontend, go: savedGo, goAdaptive: { enabled: savedAdaptive.enabled !== false, sensitivity: Number.isInteger(savedAdaptive.sensitivity) ? savedAdaptive.sensitivity : 65 } }));
      setVersion(payload.registry.version || version + 1);
      setSource(payload.source || 'durable-object');
      setCoordinatorStatus('available');
      setUpdatedAt(payload.registry.updatedAt || null);
      setLocalHealth([]);
      setProbeResults([]);
      setProbeCheckedAt(null);
      setPropagation(payload.propagation || 'تم تحديث سجل البوابة.');
      const replicaStatus = payload.replicaStatus || 'not-configured';
      setNotice(replicaStatus.startsWith('partial:') || replicaStatus === 'write-failed' || replicaStatus === 'not-configured'
        ? `حُفظ السجل المركزي بإصدار ${payload.registry.version}، لكن مزامنة النسخ الاحتياطية غير مكتملة (${replicaStatus}). لا تفقد هذه النسخة؛ افحص D1 وWorkers KV.`
        : `تم حفظ سجل السيرفرات ومزامنة النسخ الاحتياطية (${replicaStatus}).`);
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
      const targets: Array<{ kind: ProbeResult['kind']; id: string }> = [
        ...servers.map(({ id }) => ({ kind: 'backend' as const, id })),
        ...frontendServers.map(({ id }) => ({ kind: 'frontend' as const, id })),
        ...goServices.map(({ id }) => ({ kind: 'go' as const, id })),
      ];
      const collected: ProbeResult[] = [];
      let checkedAt = new Date().toISOString();
      // Keep each Worker invocation bounded; a probe may perform an origin fetch
      // plus a Durable Object health-state write (and Frontend also checks Build ID).
      for (let offset = 0; offset < targets.length; offset += 8) {
        const response = await fetch(API_PATH, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json', ...authorizationHeaders },
          body: JSON.stringify({ action: 'probe', targetIds: targets.slice(offset, offset + 8) }),
        });
        const payload = await response.json() as ProbeResponse;
        if (!response.ok || !Array.isArray(payload.results)) throw new Error(payload.error || `تعذّر فحص مجموعة السيرفرات (${response.status})`);
        collected.push(...payload.results);
        checkedAt = payload.checkedAt || checkedAt;
      }
      setProbeResults(collected);
      setProbeCheckedAt(checkedAt);
      await loadRegistry(true);
      setNotice(collected.every((result) => result.healthy !== false)
        ? 'اكتمل فحص جميع مجموعات السيرفرات دون أخطاء.'
        : 'اكتمل الفحص، وهناك سيرفر واحد أو أكثر يحتاج إلى مراجعة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ فحص الصحة');
    } finally {
      setProbing(false);
    }
  };

  return (
    <AdminPageShell
      title="إدارة البنية التحتية"
      description="إدارة مجموعات Backend وFrontend وخدمات Go بشكل مستقل، مع قبول أي أصل HTTPS متوافق وفحص الصحة وتوزيع المرور."
      actions={(
        <>
          <button type="button" onClick={() => void loadRegistry(true)} disabled={loading || saving || probing || isDirty} title={isDirty ? 'تراجع عن التغييرات المحلية أولًا' : undefined} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button type="button" onClick={() => void runHealthCheck()} disabled={loading || probing || (servers.length + frontendServers.length + goServices.length) === 0 || isDirty} title={isDirty ? 'احفظ التغييرات قبل فحصها' : undefined} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
            <Activity className={`h-4 w-4 ${probing ? 'animate-pulse' : ''}`} /> {probing ? 'جارٍ الفحص…' : 'فحص الصحة الآن'}
          </button>
          {isDirty && <button type="button" onClick={() => { const snapshot = JSON.parse(savedSnapshot) as { backend: GatewayServer[]; frontend: FrontendServer[]; go: GoServiceServer[]; goAdaptive?: { enabled: boolean; sensitivity: number } }; setServers(snapshot.backend); setFrontendServers(snapshot.frontend); setGoServices(snapshot.go || []); setGoAdaptiveEnabled(snapshot.goAdaptive?.enabled !== false); setGoAdaptiveSensitivity(snapshot.goAdaptive?.sensitivity ?? 65); setError(null); setNotice('تم التراجع عن التغييرات المحلية.'); }} disabled={saving || loading} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">تراجع</button>}
          <button type="button" onClick={() => void saveRegistry()} disabled={!isDirty || saving || loading || enabledCount === 0 || !canSaveRegistry} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        </>
      )}
    >
      <div className="space-y-5" dir="rtl">
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
        {registryBootstrap && <div role="status" className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-900 dark:text-sky-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">السجل المركزي فارغ وجاهز للتهيئة</p><p className="mt-1 leading-6">أكد المنسّق المركزي عدم وجود سجل محفوظ؛ يمكنك إعداد المجموعة وحفظها كإصدار أول. لا يظهر هذا الخيار عند تعذر الاتصال بالمنسّق.</p></div></div>}
        {registryReadOnly && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">السجل في وضع الاستعادة — القراءة فقط</p><p className="mt-1 leading-6">المصدر الحالي {source === 'kv' ? 'نسخة Workers KV الاحتياطية' : source === 'd1' ? 'نسخة D1 الاحتياطية' : 'إعداد fallback الافتراضي'}، وليس Durable Object المركزي. تم تعطيل تعديل إعدادات الخوادم والحفظ لمنع استبدال سجل أحدث بنسخة احتياطية قديمة. أعد التحديث بعد استعادة المنسّق المركزي.</p></div></div>}

        <fieldset disabled={!canSaveRegistry || loading || saving} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="ملخص البوابة">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مصدر الإعدادات</p><p className="mt-2 text-lg font-bold">{source === 'durable-object' ? 'Central Registry' : source === 'kv' ? 'KV Replica' : source === 'd1' ? 'D1 Replica' : source === 'kv-compatibility-fallback' ? 'KV Compatibility' : source === 'env-fallback' ? 'Fallback Origin' : loading ? '…' : 'غير معروف'}</p><p className="mt-1 text-xs text-muted-foreground">النسخة {version || 0} · المنسّق: {coordinatorStatus === 'available' ? 'متصل' : coordinatorStatus === 'unavailable' ? 'غير متاح' : coordinatorStatus === 'backoff' ? 'في مهلة إعادة المحاولة' : coordinatorStatus === 'not-configured' ? 'غير مربوط' : 'لم يُفحص'}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">السيرفرات المفعّلة</p><p className="mt-2 text-lg font-bold tabular-nums">{loading ? '…' : `${enabledCount} / ${servers.length}`}</p><p className="mt-1 text-xs text-muted-foreground">حد المجموعة {MAX_SERVERS}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مجموع الأوزان</p><p className="mt-2 text-lg font-bold tabular-nums">{totalWeight}</p><p className="mt-1 text-xs text-muted-foreground">الحصة داخل مستوى الأولوية نفسه، وبين الأصول المفعّلة فقط</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">أصول Frontend المفعّلة</p><p className="mt-2 text-lg font-bold tabular-nums">{loading ? '…' : `${frontendEnabledCount} / ${frontendServers.length}`}</p><p className="mt-1 text-xs text-muted-foreground">الوزن النشط {frontendTotalWeight}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">خدمات Go / الأهداف المفعّلة</p><p className="mt-2 text-lg font-bold tabular-nums">{loading ? '…' : `${goServiceCount} / ${goEnabledCount}`}</p><p className="mt-1 text-xs text-muted-foreground">حد المجموعة {MAX_GO_TARGETS} هدفًا</p></div>
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
                        {(server.provider || server.region) && <p className="text-2xs-tight text-muted-foreground">Provider: {server.provider || 'غير محدد'} · Region: {server.region || 'غير محدد'}</p>}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${server.enabled ? normalizedWeight : 0}%` }} /></div>
                        <p className="text-2xs-tight text-muted-foreground">حصة تقريبية داخل الأولوية {server.priority ?? 100}: {server.enabled ? `${normalizedWeight.toFixed(1)}%` : '0%'} · الوزن {server.weight}</p>
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
                        <p className="text-2xs-tight text-muted-foreground">حصة داخل الأولوية {server.priority ?? 100}: {server.enabled ? `${normalizedWeight.toFixed(1)}%` : '0%'} · الوزن {server.weight} · الأولوية {server.priority ?? 100} · المهلة {server.timeoutMs ?? 20000}ms · {server.healthPath || '/build-id.json'} · {server.releasePath || '/build-id.json'}</p>
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

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Server className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">مجموعة خدمات Go Worker</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">أضف خدمات Go مستقلة بمسارات داخلية مختلفة، أو أضف أكثر من نسخة تشغيل للخدمة نفسها باستخدام serviceKey وRoute Prefix متطابقين. تُوجّه الطلبات عبر <code dir="ltr">/__go</code> إلى أكثر مسار مطابق تحديدًا.</p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={goAdaptiveEnabled} onChange={(event) => setGoAdaptiveEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />
                تفعيل التوزيع التكيفي حسب أداء نسخ Go
              </label>
              <label className="flex min-w-52 flex-col gap-1 text-xs text-muted-foreground">قوة تأثير الأداء: {goAdaptiveSensitivity}%
                <input type="range" min={0} max={100} step={5} value={goAdaptiveSensitivity} onChange={(event) => setGoAdaptiveSensitivity(Number(event.target.value))} disabled={!goAdaptiveEnabled} className="w-full accent-primary" />
              </label>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">النسبة اليدوية هي نقطة البداية، ثم تُعدّل الحصة وفق زمن الاستجابة، ومعدل الإخفاقات، ومتوسط عدد الطلبات الداخلية النشطة الذي يبلّغه كل Go Worker. يبدأ تأثير القياس بعد 5 عينات على الأقل. لا نقيس CPU أو RAM مباشرةً. قوة التأثير 0 تعني الالتزام بالحصة اليدوية فقط.</p>
          </div>

          {loading ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">جارٍ تحميل خدمات Go…</div> : goServices.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد خدمات Go مسجلة بعد. يمكنك إضافة أول خدمة من النموذج أدناه.</div> : (
            <div className="space-y-3">
              {goServices.map((server) => {
                const local = healthById.get(`go:${server.id}`);
                const probe = probeById.get(`go:${server.id}`);
                const isHealthy = local?.healthy ?? (probe ? probe.healthy : null);
                const tierLength = goServices.filter((item) => item.serviceKey === server.serviceKey && (item.priority ?? 100) === (server.priority ?? 100)).length;
                const siblings = goServices.filter((item) => item.serviceKey === server.serviceKey && item.enabled && (item.priority ?? 100) === (server.priority ?? 100));
                const priorityWeight = siblings.reduce((sum, item) => sum + (item.manualSharePercent ?? item.weight), 0);
                const normalizedWeight = priorityWeight > 0 && server.enabled ? ((server.manualSharePercent ?? server.weight) / priorityWeight) * 100 : 0;
                return (
                  <article key={server.id} className={`rounded-xl border p-3 sm:p-4 ${server.enabled ? 'bg-background' : 'bg-muted/30 opacity-80'}`}>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold" dir="ltr">{server.id}</h3>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" dir="ltr">{server.serviceKey}</span>
                          <StatusPill healthy={server.enabled ? isHealthy : null} label={!server.enabled ? 'معطّل' : undefined} />
                          {local?.circuit === 'open' && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Circuit Open · {formatRetryAt(local.retryAt)}</span>}
                        </div>
                        <p className="break-all text-xs text-muted-foreground" dir="ltr">{server.url}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{server.routePrefix} → {server.upstreamPrefix}</p>
                        {(server.provider || server.region) && <p className="text-2xs-tight text-muted-foreground">Provider: {server.provider || 'غير محدد'} · Region: {server.region || 'غير محدد'}</p>}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${normalizedWeight}%` }} /></div>
                        <p className="text-2xs-tight text-muted-foreground">الحصة اليدوية: {Number(server.manualSharePercent ?? normalizedWeight).toFixed(1)}% · الحصة المعدّلة حاليًا: {local?.effectiveSharePercent != null ? `${local.effectiveSharePercent.toFixed(1)}%` : 'بانتظار بيانات كافية'} · {server.enabled ? `الحصة اليدوية المطبّعة للنسخ المفعّلة: ${normalizedWeight.toFixed(1)}%` : 'النسخة معطّلة'}</p>
                        {local && (local.sampleCount || 0) > 0 && <p className="text-2xs-tight text-muted-foreground">متوسط الاستجابة المتحرك: {local.ewmaDurationMs != null ? `${Math.round(local.ewmaDurationMs)} ms` : 'غير متاح'} · آخر أعمال نشطة مرصودة: {local.activeRequests ?? 'غير متاح'} · متوسط الأعمال النشطة: {local.ewmaActiveRequests != null ? local.ewmaActiveRequests.toFixed(1) : 'غير متاح'} · معدل الإخفاقات: {local.errorRate != null ? `${(local.errorRate * 100).toFixed(1)}%` : 'غير متاح'} · العينات: {local.sampleCount}</p>}
                        {local && <p className="text-xs text-muted-foreground">قاطع الدائرة: {local.circuit === 'open' ? 'مفتوح' : 'مغلق'} · الإخفاقات: {local.failures}</p>}
                        {(local?.checkedAt || probe) && <p className="text-xs text-muted-foreground">آخر فحص: {local?.status ? `HTTP ${local.status}` : probe?.status ? `HTTP ${probe.status}` : probe?.detail || 'غير معروف'} · {local?.durationMs ?? probe?.durationMs ?? 0} ms</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                        <label className="col-span-2 flex min-w-32 flex-col gap-1 text-xs text-muted-foreground">مسار الصحة
                          <input value={server.healthPath || '/healthz'} onChange={(event) => updateGoServiceTarget(server.id, { healthPath: event.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-left text-sm text-foreground" dir="ltr" aria-label={`Health Path ${server.id}`} />
                        </label>
                        <label className="flex min-w-28 flex-col gap-1 text-xs text-muted-foreground">الحصة اليدوية (%)
                          <input type="number" min={tierLength > 1 ? 0.1 : 100} max={tierLength > 1 ? 100 - ((tierLength - 1) * 0.1) : 100} step={0.1} disabled={tierLength <= 1} value={Number(server.manualSharePercent ?? normalizedWeight).toFixed(1)} onChange={(event) => updateGoManualShare(server.id, Number(event.target.value))} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground disabled:opacity-60" aria-label={`الحصة اليدوية لنسخة Go ${server.id}`} />
                        </label>
                        <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">الأولوية
                          <input type="number" min={1} max={1000} value={server.priority ?? 100} onChange={(event) => updateGoServiceTarget(server.id, { priority: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`أولوية Go ${server.id}`} />
                        </label>
                        <label className="flex min-w-32 flex-col gap-1 text-xs text-muted-foreground">المهلة (ms)
                          <input type="number" min={1000} max={600000} step={1000} value={server.timeoutMs ?? 540000} onChange={(event) => updateGoServiceTarget(server.id, { timeoutMs: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" aria-label={`مهلة Go ${server.id}`} />
                        </label>
                        <button type="button" onClick={() => toggleGoServiceTarget(server)} className={`h-10 rounded-lg border px-3 text-sm font-medium ${server.enabled ? 'hover:bg-muted' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{server.enabled ? 'تعطيل' : 'تفعيل'}</button>
                        <button type="button" onClick={() => removeGoServiceTarget(server)} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-destructive/25 px-3 text-sm text-destructive hover:bg-destructive/5" aria-label={`إزالة Go target ${server.id}`}><Trash2 className="h-4 w-4" /> إزالة</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-dashed p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h3 className="font-semibold">إضافة خدمة Go أو نسخة تشغيل لها</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">معرّف هدف التشغيل
                <input value={goTargetIdInput} onChange={(event) => setGoTargetIdInput(event.target.value)} placeholder="analytics-render-1" maxLength={64} dir="ltr" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مفتاح الخدمة
                <input value={goServiceKeyInput} onChange={(event) => setGoServiceKeyInput(event.target.value)} placeholder="analytics" maxLength={64} dir="ltr" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">رابط Go HTTPS
                <input value={goUrlInput} onChange={(event) => setGoUrlInput(event.target.value)} placeholder="https://go-analytics.onrender.com" dir="ltr" type="url" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مسار الاستقبال عبر البوابة
                <input value={goRoutePrefixInput} onChange={(event) => setGoRoutePrefixInput(event.target.value)} placeholder="/internal/analytics" dir="ltr" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">المسار داخل خدمة Go
                <input value={goUpstreamPrefixInput} onChange={(event) => setGoUpstreamPrefixInput(event.target.value)} placeholder="/internal/analytics" dir="ltr" className="h-11 rounded-lg border bg-background px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مسار فحص الصحة
                <input value="/healthz" readOnly dir="ltr" className="h-11 rounded-lg border bg-muted px-3 text-left text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الحصة الابتدائية للنسخة (%)
                <input value={goWeightInput} onChange={(event) => setGoWeightInput(event.target.value)} type="number" min={0.1} max={goServices.filter((item) => item.serviceKey === goServiceKeyInput.trim().toLowerCase() && (item.priority ?? 100) === Number(goPriorityInput)).length > 0 ? 100 - (goServices.filter((item) => item.serviceKey === goServiceKeyInput.trim().toLowerCase() && (item.priority ?? 100) === Number(goPriorityInput)).length * 0.1) : 100} step={0.1} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">الأولوية
                <input value={goPriorityInput} onChange={(event) => setGoPriorityInput(event.target.value)} type="number" min={1} max={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مهلة Go (ms)
                <input value={goTimeoutInput} onChange={(event) => setGoTimeoutInput(event.target.value)} type="number" min={1000} max={600000} step={1000} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">مزوّد الخدمة (اختياري)
                <input value={goProviderInput} onChange={(event) => setGoProviderInput(event.target.value)} placeholder="Render / AWS / VPS" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">المنطقة (اختياري)
                <input value={goRegionInput} onChange={(event) => setGoRegionInput(event.target.value)} placeholder="eu-west / me-central" maxLength={64} className="h-11 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={addGoServiceTarget} disabled={loading || goServices.length >= MAX_GO_TARGETS} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Plus className="h-4 w-4" /> إضافة هدف Go</button>
              <p className="text-xs leading-5 text-muted-foreground">لإضافة نسخة ثانية للخدمة نفسها استخدم serviceKey وRoute Prefix نفسيهما ومعرّفًا ورابطًا مختلفين. تشارك نسخ الخدمة رمزها؛ افتراضيًا GO_WORKER_TOKEN أو رمز مستقل لها عبر سر GO_WORKER_TOKENS_JSON.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">سياسة التوجيه والحماية</h2></div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <p>• خدمات Go تستخدم حصة يدوية قابلة للتعديل مع تصحيح تكيفي مبني على EWMA لزمن الاستجابة والإخفاقات. الخدمات الأخرى تبقى على Weighted Random؛ الرقم الأقل في Priority يُجرّب أولًا.</p>
              <p>• Backend وFrontend: مهلة مستقلة من ثانية إلى 30 ثانية. Go: مهلة مستقلة من ثانية إلى 10 دقائق، والافتراضي 9 دقائق ليتوافق مع أطول مهام API الحالية؛ عدّلها لكل خدمة عند الحاجة.</p>
              <p>• GET وHEAD فقط يمكن تحويلهما تلقائيًا عند أخطاء الاتصال و502/503/504؛ محاولات Go محدودة بثلاث نسخ كحد أقصى لكل طلب.</p>
              <p>• POST لا يعاد إرساله أو تحويله تلقائيًا بين نسخ Go؛ تُترك سلامة إعادة التنفيذ إلى fallback وعقود advisory-lock/idempotency في API.</p>
              <p>• حالة الصحة مشتركة عبر Durable Object، وسجل الإعدادات مركزي مع D1 وWorkers KV كنسختين احتياطيتين. تُخزّن كل نسخة Worker لقطة للصحة لمدة دقيقتين، وتُعزل الواجهة تلقائيًا عند اكتشاف Build ID مختلف حتى ينجح فحص إصدار مطابق.</p>
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
          <p className="mt-2 text-xs leading-5 text-muted-foreground">إضافة أصل هنا لا تنشئ خدمة أو قاعدة بيانات جديدة. كل Backend يجب أن يطابق عقد API ويتشارك PostgreSQL وRedis ومخطط Prisma المتوافق. وكل Frontend يجب أن يخدم بناء Next.js نفسه مع مفاتيح الجلسات وServer Actions المتوافقة. خدمات Go تُسجّل بمفتاح خدمة ومسار داخلي؛ افتراضيًا تستخدم GO_WORKER_TOKEN، ويمكن عزل رمز كل serviceKey عبر سر GO_WORKER_TOKENS_JSON، وتشارك النسخ التابعة للخدمة رمزها. كما يلزم ربط اسم النطاق العام بالـ Worker مرة واحدة من إعدادات Cloudflare؛ إضافة الأصل وحدها لا تنشئ DNS أو Route.</p>
          {isDirty && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300" aria-live="polite">لديك تغييرات محلية غير محفوظة. اضغط «حفظ التغييرات» لتطبيقها.</p>}
        </section>
        </fieldset>
      </div>
    </AdminPageShell>
  );
}
