import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { ensureStorage, readConfig, updateConfig, readScenarios, saveScenario, removeScenario, readReport, listReports, getArtifactFilePath, publicRunnerSettings, MAX_USERS, MAX_CONCURRENCY, MAX_WRITE_USERS } from './store.mjs';
import { runManager } from './runner.mjs';

const app = express();
const PORT = Number(process.env.SIMULATOR_PORT || 8787);
const HOST = process.env.SIMULATOR_HOST || '127.0.0.1';
const TOKEN = process.env.SIMULATOR_ADMIN_TOKEN || '';

if (TOKEN.length < 32) {
  console.error('SIMULATOR_ADMIN_TOKEN is required and must contain at least 32 characters.');
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('SIMULATOR_PORT must be a valid TCP port.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb', strict: true }));

function requireRunnerToken(req, res, next) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const left = Buffer.from(supplied);
  const right = Buffer.from(TOKEN);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Runner authentication failed' });
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sendError(res, error, status = 400) {
  res.status(status).json({
    success: false,
    error: 'SIMULATOR_ERROR',
    message: (error instanceof Error ? error.message : String(error)).slice(0, 1000)
  });
}

app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'marketplat-user-simulator' }));
app.use('/api', requireRunnerToken);

app.get('/api/status', asyncRoute(async (_req, res) => {
  const config = await readConfig();
  res.json({ success: true, data: {
    connected: true,
    activeRunId: runManager.activeId,
    hardMaxUsers: MAX_USERS,
    hardMaxConcurrency: MAX_CONCURRENCY,
    hardMaxWriteUsers: MAX_WRITE_USERS,
    registrationConfigured: publicRunnerSettings().registrationConfigured,
    testAccountsConfigured: publicRunnerSettings().testAccountsConfigured,
    testAccountCount: publicRunnerSettings().testAccountCount,
    targetUrl: config.targetUrl
  } });
}));

app.get('/api/config', asyncRoute(async (_req, res) => {
  const config = await readConfig();
  res.json({ success: true, data: { ...config, ...publicRunnerSettings() } });
}));

app.patch('/api/config', async (req, res) => {
  try {
    const config = await updateConfig(req.body || {});
    res.json({ success: true, data: { ...config, ...publicRunnerSettings() } });
  } catch (error) { sendError(res, error); }
});

app.get('/api/scenarios', asyncRoute(async (_req, res) => {
  res.json({ success: true, data: await readScenarios() });
}));

app.post('/api/scenarios', async (req, res) => {
  try {
    const scenario = await saveScenario(req.body);
    res.status(201).json({ success: true, data: scenario });
  } catch (error) { sendError(res, error); }
});

app.put('/api/scenarios/:id', async (req, res) => {
  try {
    if (req.params.id !== req.body?.id) throw new Error('Scenario id in URL and body must match');
    const scenario = await saveScenario(req.body);
    res.json({ success: true, data: scenario });
  } catch (error) { sendError(res, error); }
});

app.delete('/api/scenarios/:id', async (req, res) => {
  try {
    const deleted = await removeScenario(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Scenario not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { sendError(res, error); }
});

app.get('/api/runs', asyncRoute(async (req, res) => {
  const requested = Number(req.query.limit || 30);
  const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.trunc(requested))) : 30;
  res.json({ success: true, data: await runManager.list(limit) });
}));

app.post('/api/runs', async (req, res) => {
  try {
    const run = await runManager.start(req.body || {});
    res.status(202).json({ success: true, data: run });
  } catch (error) { sendError(res, error, /already running/i.test(String(error)) ? 409 : 400); }
});

app.get('/api/runs/:id', asyncRoute(async (req, res) => {
  const run = runManager.get(req.params.id);
  if (run) return res.json({ success: true, data: runManager.serialize(run, { compact: true }) });
  try { return res.json({ success: true, data: await readReport(req.params.id) }); }
  catch (error) { return sendError(res, error, 404); }
}));

app.post('/api/runs/:id/stop', async (req, res) => {
  const run = runManager.stop(req.params.id);
  if (!run) return res.status(409).json({ success: false, error: 'NOT_RUNNING', message: 'Run is not active' });
  res.json({ success: true, data: run });
});

app.get('/api/runs/:id/artifacts/:name', async (req, res) => {
  try {
    const file = await getArtifactFilePath(req.params.id, req.params.name);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename=\"${req.params.name}\"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(file);
  } catch (error) { return sendError(res, error, 404); }
});

app.get('/api/runs/:id/report', async (req, res) => {
  try {
    const report = runManager.get(req.params.id);
    if (report) return res.json({ success: true, data: runManager.serialize(report) });
    return res.json({ success: true, data: await readReport(req.params.id) });
  } catch (error) { return sendError(res, error, 404); }
});

app.use((error, _req, res, _next) => {
  console.error('[user-simulator] request error:', error instanceof Error ? error.message : String(error));
  sendError(res, error, Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500);
});

await ensureStorage();
const server = app.listen(PORT, HOST, () => {
  console.log(`MarketPlat User Simulator listening on http://${HOST}:${PORT}`);
  console.log(`Allowed target hosts: ${[...publicRunnerSettings().allowedHosts].join(', ')}`);
  console.log(`Maximum browser sessions: ${MAX_CONCURRENCY}; maximum virtual users per run: ${MAX_USERS}; write-enabled users: ${MAX_WRITE_USERS}`);
});

async function shutdown(signal) {
  console.log(`[user-simulator] received ${signal}; stopping server`);
  if (runManager.activeId) runManager.stop(runManager.activeId);
  const deadline = Date.now() + 8000;
  while (runManager.activeId && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
