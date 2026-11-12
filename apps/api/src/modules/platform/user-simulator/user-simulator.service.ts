import { env } from '../../../config/env';
import { BadRequestError } from '../../../shared/errors/BadRequestError';
import { ServiceUnavailableError } from '../../../shared/errors/ServiceUnavailableError';

type RunnerEnvelope<T> = { success: boolean; data?: T; message?: string; error?: string };

async function callRunner<T>(method: string, pathname: string, body?: unknown): Promise<T> {
  if (!env.userSimulator.isConfigured) {
    throw new ServiceUnavailableError(
      'Browser simulator runner is not configured',
      'USER_SIMULATOR_NOT_CONFIGURED'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${env.userSimulator.runnerUrl}/api${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.userSimulator.runnerToken}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const text = await response.text();
    let envelope: RunnerEnvelope<T>;
    try { envelope = JSON.parse(text) as RunnerEnvelope<T>; }
    catch { throw new ServiceUnavailableError('Simulator runner returned an invalid response', 'USER_SIMULATOR_BAD_RESPONSE'); }
    if (!response.ok || envelope.success !== true) {
      const message = typeof envelope.message === 'string' ? envelope.message : `Simulator runner returned HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500) throw new BadRequestError(message, envelope.error || 'USER_SIMULATOR_REQUEST_REJECTED');
      throw new ServiceUnavailableError(message, envelope.error || 'USER_SIMULATOR_RUNNER_ERROR', { runnerStatus: response.status });
    }
    return envelope.data as T;
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ServiceUnavailableError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceUnavailableError('Simulator runner timed out', 'USER_SIMULATOR_TIMEOUT');
    }
    throw new ServiceUnavailableError('Simulator runner is unreachable', 'USER_SIMULATOR_UNREACHABLE');
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRunnerArtifact(runId: string, artifactName: string): Promise<{ data: Buffer; contentType: 'image/png' }> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(runId) || !/^[a-zA-Z0-9._-]{1,180}\.png$/i.test(artifactName) || artifactName.includes('..')) {
    throw new BadRequestError('Invalid simulator artifact reference', 'USER_SIMULATOR_INVALID_ARTIFACT');
  }
  if (!env.userSimulator.isConfigured) {
    throw new ServiceUnavailableError('Browser simulator runner is not configured', 'USER_SIMULATOR_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${env.userSimulator.runnerUrl}/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactName)}`,
      { headers: { Authorization: `Bearer ${env.userSimulator.runnerToken}` }, signal: controller.signal },
    );
    if (!response.ok) {
      const text = await response.text();
      let message = `Simulator artifact request returned HTTP ${response.status}`;
      try {
        const envelope = JSON.parse(text) as RunnerEnvelope<unknown>;
        if (typeof envelope.message === 'string') message = envelope.message;
      } catch { /* The runner's error body is optional diagnostic context. */ }
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestError(message, 'USER_SIMULATOR_ARTIFACT_NOT_FOUND');
      }
      throw new ServiceUnavailableError(message, 'USER_SIMULATOR_ARTIFACT_ERROR');
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'image/png') {
      throw new ServiceUnavailableError('Simulator returned an unsupported artifact type', 'USER_SIMULATOR_BAD_ARTIFACT_TYPE');
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 15 * 1024 * 1024) throw new BadRequestError('Simulator artifact exceeds the 15 MB limit');
    return { data, contentType: 'image/png' };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ServiceUnavailableError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceUnavailableError('Simulator artifact request timed out', 'USER_SIMULATOR_TIMEOUT');
    }
    throw new ServiceUnavailableError('Simulator artifact runner is unreachable', 'USER_SIMULATOR_UNREACHABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export const userSimulatorService = {
  getStatus: () => callRunner<Record<string, unknown>>('GET', '/status'),
  getConfig: () => callRunner<Record<string, unknown>>('GET', '/config'),
  updateConfig: (body: Record<string, unknown>) => callRunner<Record<string, unknown>>('PATCH', '/config', body),
  getScenarios: () => callRunner<unknown[]>('GET', '/scenarios'),
  createScenario: (body: Record<string, unknown>) => callRunner<Record<string, unknown>>('POST', '/scenarios', body),
  updateScenario: (id: string, body: Record<string, unknown>) => callRunner<Record<string, unknown>>('PUT', `/scenarios/${encodeURIComponent(id)}`, body),
  deleteScenario: (id: string) => callRunner<{ deleted: boolean }>('DELETE', `/scenarios/${encodeURIComponent(id)}`),
  listRuns: (limit: number) => callRunner<unknown[]>('GET', `/runs?limit=${encodeURIComponent(String(limit))}`),
  startRun: (body: Record<string, unknown>) => callRunner<Record<string, unknown>>('POST', '/runs', body),
  getRun: (id: string) => callRunner<Record<string, unknown>>('GET', `/runs/${encodeURIComponent(id)}`),
  stopRun: (id: string) => callRunner<Record<string, unknown>>('POST', `/runs/${encodeURIComponent(id)}/stop`, {}),
  getReport: (id: string) => callRunner<Record<string, unknown>>('GET', `/runs/${encodeURIComponent(id)}/report`),
  getArtifact: fetchRunnerArtifact,
};
