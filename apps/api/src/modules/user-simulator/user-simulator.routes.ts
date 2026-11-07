import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireMinRole } from '../../middlewares/admin.middleware';
import { adminRateLimit } from '../../middlewares/rateLimit.middleware';
import { ROLES } from '../../shared/constants/roles';
import { userSimulatorController } from './user-simulator.controller';

export const userSimulatorRouter = Router();

// Only ADMIN/SUPER_ADMIN can operate the browser runner. A compromised
// runner token alone is insufficient: this public API boundary still
// requires a valid MarketPlat administrator session.
userSimulatorRouter.use(authenticate, adminRateLimit, requireMinRole(ROLES.ADMIN));

userSimulatorRouter.get('/status', userSimulatorController.status);
userSimulatorRouter.get('/config', userSimulatorController.getConfig);
userSimulatorRouter.patch('/config', userSimulatorController.updateConfig);
userSimulatorRouter.get('/scenarios', userSimulatorController.getScenarios);
userSimulatorRouter.post('/scenarios', userSimulatorController.createScenario);
userSimulatorRouter.put('/scenarios/:id', userSimulatorController.updateScenario);
userSimulatorRouter.delete('/scenarios/:id', userSimulatorController.deleteScenario);
userSimulatorRouter.get('/runs', userSimulatorController.listRuns);
userSimulatorRouter.post('/runs', userSimulatorController.startRun);
userSimulatorRouter.get('/runs/:id/report', userSimulatorController.getReport);
userSimulatorRouter.get('/runs/:id/artifacts/:name', userSimulatorController.artifact);
userSimulatorRouter.get('/runs/:id', userSimulatorController.getRun);
userSimulatorRouter.post('/runs/:id/stop', userSimulatorController.stopRun);
