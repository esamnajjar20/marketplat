import { prisma } from '../config/prisma';
import { notificationsService } from '../modules/notifications/notifications.service';

async function main() {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate()+1);
  const sellers = await prisma.user.findMany({ where: { isActive: true, sellerProfile: { isNot: null } }, select: { id: true } });
  const existingToday = await prisma.saleRecord.findMany({ where: { soldAt: { gte: start, lt: end } }, distinct: ['sellerId'], select: { sellerId: true } });
  const active = new Set(existingToday.map(x=>x.sellerId));
  for (const seller of sellers) if (!active.has(seller.id)) await notificationsService.createSellerAlertOnce(seller.id,'salesAlerts','SALES_DAILY_REMINDER','لم تسجّل مبيعات اليوم','لم تسجّل مبيعة اليوم. هل تريد تسجيل عملية بيع الآن؟',start);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>prisma.$disconnect());
