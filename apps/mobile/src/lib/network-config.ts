/**
 * إعداد مركزي لـ NetInfo — يعمل قبل أي استدعاء آخر.
 * يُستورد كأول سطر في app/_layout.tsx.
 *
 * السبب: NetInfo افتراضياً يفحص clients3.google.com، وهو محجوب في شبكات غزة.
 * النتيجة: التطبيق يعتقد أنه offline رغم وجود إنترنت.
 * الحل: نفحص خادمنا (Worker) بدلاً من Google.
 */
import NetInfo from '@react-native-community/netinfo';

// Prefer the same base URL as apiRequest so staging/prod environments only
// need to change EXPO_PUBLIC_API_URL (no hardcoded host duplication).
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const reachabilityUrl = API_BASE_URL
  ? `${API_BASE_URL}/api/v1/categories`
  : 'https://marketplat-api.esamnajjar6.workers.dev/api/v1/categories';

NetInfo.configure({
  reachabilityUrl,
  reachabilityTest: async (response) => response.status === 200,
  reachabilityShortTimeout: 10 * 1000,
  reachabilityLongTimeout: 60 * 1000,
  reachabilityRequestTimeout: 20 * 1000,
});
