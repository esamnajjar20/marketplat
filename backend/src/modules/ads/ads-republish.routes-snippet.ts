/**
 * أضف في ads.routes.ts بعد المسارات المحمية الأخرى:
 *
 * import { adsRepublishController } from './ads-republish.controller';
 *
 * adsRouter.post(
 *   '/:id/republish',
 *   authenticate,
 *   createAdRateLimit, // reuse create throttle
 *   adsRepublishController.republish
 * );
 *
 * يجب أن يُسجَّل قبل أي مسار عام يبتلع :id إن لزم،
 * لكنه POST محمي فلا يتعارض مع GET /:id.
 */
