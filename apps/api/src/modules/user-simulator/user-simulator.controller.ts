import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../shared/types/api-response.types';
import { userSimulatorService } from './user-simulator.service';

function handler(
  message: string,
  action: (req: Request) => Promise<unknown>,
  statusCode = 200,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await action(req);
      res.status(statusCode).json(successResponse(message, data));
    } catch (error) { next(error); }
  };
}

function bodyRecord(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return {};
  return req.body as Record<string, unknown>;
}


async function artifact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await userSimulatorService.getArtifact(req.params.id, req.params.name);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(result.data);
  } catch (error) { next(error); }
}

export const userSimulatorController = {
  status: handler('Simulator status loaded', () => userSimulatorService.getStatus()),
  getConfig: handler('Simulator config loaded', () => userSimulatorService.getConfig()),
  updateConfig: handler('Simulator config updated', req => userSimulatorService.updateConfig(bodyRecord(req))),
  getScenarios: handler('Simulator scenarios loaded', () => userSimulatorService.getScenarios()),
  createScenario: handler('Simulator scenario created', req => userSimulatorService.createScenario(bodyRecord(req)), 201),
  updateScenario: handler('Simulator scenario updated', req => userSimulatorService.updateScenario(req.params.id, bodyRecord(req))),
  deleteScenario: handler('Simulator scenario deleted', req => userSimulatorService.deleteScenario(req.params.id)),
  listRuns: handler('Simulator runs loaded', req => {
    const raw = Number(req.query.limit ?? 30);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 30;
    return userSimulatorService.listRuns(limit);
  }),
  startRun: handler('Browser simulation started', req => userSimulatorService.startRun(bodyRecord(req)), 202),
  getRun: handler('Simulator run loaded', req => userSimulatorService.getRun(req.params.id)),
  stopRun: handler('Simulator stop requested', req => userSimulatorService.stopRun(req.params.id)),
  getReport: handler('Simulator report loaded', req => userSimulatorService.getReport(req.params.id)),
  artifact,
};
