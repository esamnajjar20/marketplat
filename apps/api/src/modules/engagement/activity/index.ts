export { activityRouter } from './activity.routes';
// Exported so every other module's service can call
// `activityService.record(...)` directly, and `activityTemplates` to
// build that call's payload — same public-surface shape as
// saved-searches' index.ts exporting `savedSearchEvents` for
// ads.service.ts to call.
export { activityService } from './activity.service';
export { activityTemplates } from './activity.templates';
