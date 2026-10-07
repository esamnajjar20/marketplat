import { prisma } from '../../config/prisma';

const DAY = 24 * 60 * 60 * 1000;
const round = (n: number) => Math.round(n * 100) / 100;

type Insight = { id: string; severity: 'info' | 'warning' | 'critical'; category: string; title: string; body: string; metric?: number; unit?: string };

export const salesInsightsService = {
  get: async (userId: string) => {
    const now = new Date();
    const start30 = new Date(now.getTime() - 30 * DAY);
    const start60 = new Date(now.getTime() - 60 * DAY);
    const start7 = new Date(now.getTime() - 7 * DAY);
    const start14 = new Date(now.getTime() - 14 * DAY);

    const [current, previous, recent7, prior7, items, customers, lowStock, overdue] = await Promise.all([
      prisma.saleRecord.aggregate({ where: { sellerId: userId, soldAt: { gte: start30 } }, _sum: { totalPrice: true, refundedAmount: true, paidAmount: true }, _count: { id: true } }),
      prisma.saleRecord.aggregate({ where: { sellerId: userId, soldAt: { gte: start60, lt: start30 } }, _sum: { totalPrice: true, refundedAmount: true }, _count: { id: true } }),
      prisma.saleRecord.aggregate({ where: { sellerId: userId, soldAt: { gte: start7 } }, _sum: { totalPrice: true, refundedAmount: true }, _count: { id: true } }),
      prisma.saleRecord.aggregate({ where: { sellerId: userId, soldAt: { gte: start14, lt: start7 } }, _sum: { totalPrice: true, refundedAmount: true }, _count: { id: true } }),
      prisma.saleItem.findMany({ where: { sale: { sellerId: userId, soldAt: { gte: start30 } } }, select: { productId: true, title: true, quantity: true, returnedQuantity: true, lineTotal: true, costPrice: true }, take: 5000 }),
      prisma.customer.aggregate({ where: { sellerId: userId }, _count: { id: true }, _avg: { totalSpent: true } }),
      prisma.product.count({ where: { status: { not: 'DELETED' }, stockQuantity: { lte: 5 }, store: { sellerProfile: { userId } } } }),
      prisma.saleRecord.aggregate({ where: { sellerId: userId, dueAmount: { gt: 0 }, dueDate: { lt: now } }, _sum: { dueAmount: true }, _count: { id: true } }),
    ]);

    const revenue = round(Number(current._sum.totalPrice ?? 0) - Number(current._sum.refundedAmount ?? 0));
    const previousRevenue = round(Number(previous._sum.totalPrice ?? 0) - Number(previous._sum.refundedAmount ?? 0));
    const revenueChange = previousRevenue === 0 ? (revenue > 0 ? 100 : 0) : round(((revenue - previousRevenue) / previousRevenue) * 100);
    const recent7Revenue = round(Number(recent7._sum.totalPrice ?? 0) - Number(recent7._sum.refundedAmount ?? 0));
    const prior7Revenue = round(Number(prior7._sum.totalPrice ?? 0) - Number(prior7._sum.refundedAmount ?? 0));
    const weeklyChange = prior7Revenue === 0 ? (recent7Revenue > 0 ? 100 : 0) : round(((recent7Revenue - prior7Revenue) / prior7Revenue) * 100);

    const productMap = new Map<string, { title: string; revenue: number; cost: number; quantity: number }>();
    for (const item of items) {
      const key = item.productId ?? item.title;
      const row = productMap.get(key) ?? { title: item.title, revenue: 0, cost: 0, quantity: 0 };
      row.revenue += Number(item.lineTotal);
      row.cost += item.costPrice == null ? 0 : Number(item.costPrice) * Math.max(item.quantity - item.returnedQuantity, 0);
      row.quantity += Math.max(item.quantity - item.returnedQuantity, 0);
      productMap.set(key, row);
    }
    const products = [...productMap.values()].map(p => ({ ...p, profit: round(p.revenue - p.cost), margin: p.revenue ? round(((p.revenue - p.cost) / p.revenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
    const topProduct = products[0] ?? null;
    const averageTicket = current._count.id ? round(revenue / current._count.id) : 0;
    const dailyForecast = revenue / 30;
    const forecast30 = round(dailyForecast * 30 * (1 + Math.max(-0.5, Math.min(0.5, weeklyChange / 100))));

    const insights: Insight[] = [];
    if (revenueChange <= -20) insights.push({ id: 'revenue-drop', severity: 'critical', category: 'sales', title: 'انخفاض واضح في المبيعات', body: `الإيراد أقل بنسبة ${Math.abs(revenueChange).toFixed(1)}% من الثلاثين يومًا السابقة. راجع المنتجات والعروض وقنوات البيع.`, metric: revenueChange, unit: '%' });
    else if (revenueChange >= 20) insights.push({ id: 'revenue-growth', severity: 'info', category: 'sales', title: 'نمو قوي في المبيعات', body: `الإيراد ارتفع بنسبة ${revenueChange.toFixed(1)}% مقارنة بالفترة السابقة.`, metric: revenueChange, unit: '%' });
    if (weeklyChange <= -15) insights.push({ id: 'weekly-drop', severity: 'warning', category: 'trend', title: 'تباطؤ حديث', body: `آخر 7 أيام أقل بنسبة ${Math.abs(weeklyChange).toFixed(1)}% من الأيام السبعة السابقة.`, metric: weeklyChange, unit: '%' });
    if (topProduct) insights.push({ id: 'top-product', severity: 'info', category: 'products', title: 'المنتج الأقوى', body: `${topProduct.title} هو الأعلى إيرادًا خلال آخر 30 يومًا، بهامش تقديري ${topProduct.margin.toFixed(1)}%.`, metric: topProduct.revenue, unit: 'ILS' });
    if (lowStock > 0) insights.push({ id: 'low-stock', severity: lowStock >= 10 ? 'critical' : 'warning', category: 'inventory', title: 'مخزون يحتاج متابعة', body: `${lowStock} منتجًا عند حد المخزون المنخفض أو تحته.`, metric: lowStock, unit: 'products' });
    if (Number(overdue._sum.dueAmount ?? 0) > 0) insights.push({ id: 'overdue', severity: 'warning', category: 'debts', title: 'ديون متأخرة', body: `هناك ${overdue._count.id} عملية متأخرة بقيمة ${round(Number(overdue._sum.dueAmount ?? 0))} ₪.`, metric: Number(overdue._sum.dueAmount ?? 0), unit: 'ILS' });
    if (customers._count.id > 0) insights.push({ id: 'customers', severity: 'info', category: 'customers', title: 'قيمة العميل', body: `متوسط الإنفاق المسجل للعميل حوالي ${round(Number(customers._avg.totalSpent ?? 0))} ₪. ركّز على إعادة تنشيط العملاء غير النشطين.`, metric: Number(customers._avg.totalSpent ?? 0), unit: 'ILS' });

    return {
      generatedAt: now.toISOString(),
      periodDays: 30,
      kpis: { revenue, previousRevenue, revenueChange, orders: current._count.id, averageTicket, overdueAmount: round(Number(overdue._sum.dueAmount ?? 0)), lowStockProducts: lowStock },
      forecast: { next30DaysRevenue: forecast30, method: '30-day run-rate adjusted by 7-day trend' },
      topProducts: products.slice(0, 10),
      insights,
    };
  },
};
