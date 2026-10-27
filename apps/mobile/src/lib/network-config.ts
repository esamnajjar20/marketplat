/**
 * إعداد مركزي لـ NetInfo — يعمل قبل أي استدعاء آخر.
 * يُستورد كأول سطر في app/_layout.tsx.
 *
 * السبب: NetInfo افتراضياً يفحص clients3.google.com، وهو محجوب في شبكات غزة.
 * النتيجة: التطبيق يعتقد أنه offline رغم وجود إنترنت.
 * الحل: نفحص خادمنا (Worker) بدلاً من Google.
 */
import NetInfo from '@react-native-community/netinfo';

NetInfo.configure({
  reachabilityUrl: 'https://marketplat-api.esamnajjar6.workers.dev/api/v1/categories',
  reachabilityTest: async (response) => response.status === 200,
  // شبكات غزة قد تكون بطيئة: 10 ثوانٍ للاستجابة الأولى، 60 ثانية للـ retry
  reachabilityShortTimeout: 10 * 1000,
  reachabilityLongTimeout: 60 * 1000,
  reachabilityRequestTimeout: 20 * 1000,
});
