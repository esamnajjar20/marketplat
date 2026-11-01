import { runChildJobsIndependently } from './childJobRunner';
import {
  getSalesNotificationJobs,
  getSalesNotificationScheduleTime,
  SALES_NOTIFICATION_TIME_ZONE,
} from '../shared/utils/salesNotificationSchedule';

async function main(): Promise<void> {
  const at = new Date();
  const now = getSalesNotificationScheduleTime(at);
  const jobs = getSalesNotificationJobs(at);
  if (jobs.length > 0) {
    console.log(
      `[sales-notifications] ${now.hour}:${String(now.minute).padStart(2, '0')} ${SALES_NOTIFICATION_TIME_ZONE} -> ${jobs.join(', ')}`
    );
  } else {
    console.log(
      `[sales-notifications] ${now.hour}:${String(now.minute).padStart(2, '0')} ${SALES_NOTIFICATION_TIME_ZONE} -> nothing due`
    );
  }
  await runChildJobsIndependently(jobs, 'sales-notifications');
}

main().catch(error => {
  console.error('[sales-notifications] runner failed:', error);
  process.exitCode = 1;
});
