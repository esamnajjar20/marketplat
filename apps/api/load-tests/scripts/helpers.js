/**
 * load-tests/scripts/helpers.js
 *
 * Shared request helpers so each scenario file stays focused on the
 * load pattern itself, not response-shape boilerplate.
 */
import http from 'k6/http';
import { check } from 'k6';
import { API, JSON_HEADERS } from './config.js';

/**
 * Registers one user and returns { accessToken, refreshToken, userId }.
 * Callers are responsible for staying under authRateLimit (10/15min/IP)
 * across however many times this is called in a single test run — see
 * each scenario file's own comment on how it avoids tripping that.
 */
export function registerUser(email, password, name) {
  const res = http.post(
    `${API}/auth/register`,
    JSON.stringify({ name, email, password }),
    JSON_HEADERS,
  );

  const ok = check(res, {
    'register: status 201': (r) => r.status === 201,
    'register: has accessToken': (r) => !!r.json('data.tokens.accessToken'),
  });

  if (!ok) {
    return null;
  }

  return {
    accessToken: res.json('data.tokens.accessToken'),
    refreshToken: res.json('data.tokens.refreshToken'),
    userId: res.json('data.user.id'),
  };
}

/** Logs in an existing user and returns the same shape as registerUser. */
export function loginUser(email, password) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    JSON_HEADERS,
  );

  if (res.status !== 200) {
    return { status: res.status, ok: false };
  }

  return {
    ok: true,
    status: 200,
    accessToken: res.json('data.tokens.accessToken'),
    refreshToken: res.json('data.tokens.refreshToken'),
    userId: res.json('data.user.id'),
  };
}

/**
 * A deterministic pool of test-user credentials, generated the same
 * way every run so setup() can either register them fresh (first run
 * against a clean DB) or reuse already-registered ones (subsequent
 * runs — register will 409/400 on a duplicate email, which callers
 * should tolerate, not treat as a hard failure).
 */
export function poolUserCredentials(poolSize) {
  const users = [];
  for (let i = 0; i < poolSize; i++) {
    users.push({
      name: `Load Test User ${i}`,
      email: `load-test-pool-user-${i}@example.test`,
      password: 'LoadTestPass123!',
    });
  }
  return users;
}
