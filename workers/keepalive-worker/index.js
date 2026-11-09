const MAX_TARGETS = 10;
const TIMEOUT_MS = 8_000;

function parseHostAllowlist(value) {
  return new Set(String(value || '')
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter((host) => host && /^[a-z0-9.-]+$/.test(host)));
}

export function parseKeepaliveTargets(urlsValue, allowedHostsValue) {
  const allowedHosts = parseHostAllowlist(allowedHostsValue);
  if (allowedHosts.size === 0) return [];
  const rawTargets = String(urlsValue || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (rawTargets.length > MAX_TARGETS) return [];
  const targets = [];
  for (const raw of rawTargets) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowedHosts.has(url.hostname.toLowerCase())) continue;
      targets.push(url);
    } catch {
      // Ignore malformed configuration entries without leaking their contents.
    }
  }
  return targets;
}

async function pingTarget(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('keepalive timeout'), TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    return { host: url.hostname, status: response.status, ok: response.ok };
  } catch (error) {
    return { host: url.hostname, status: null, ok: false, error: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async scheduled(_event, env, ctx) {
    const targets = parseKeepaliveTargets(env.KEEPALIVE_URLS, env.KEEPALIVE_ALLOWED_HOSTS);
    if (targets.length === 0) {
      console.warn('[keepalive] no valid allowlisted targets configured');
      return;
    }
    ctx.waitUntil(Promise.all(targets.map(async (url) => {
      const result = await pingTarget(url);
      if (result.ok) console.info(`[keepalive] ${result.host} -> ${result.status}`);
      else console.warn(`[keepalive] ${result.host} -> ${result.error || result.status}`);
    })));
  },

  async fetch() {
    // Do not expose configured service URLs or internal topology publicly.
    return new Response('marketplat keepalive is running.', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  },
};
