/**
 * FIX AUDIT-V4-02: previously the Dockerfile ran a single
 * `node dist/server.js` process. Node.js is single-threaded per process,
 * so any CPU-bound work — specifically bcrypt hashing (SALT_ROUNDS=12)
 * during login/register — blocks the event loop for that process,
 * stalling every other concurrent request (including unrelated ones
 * like GET /ads) until the hash completes. With no clustering, there
 * was also no way to use more than one CPU core inside a single
 * container, regardless of how many cores the host actually has.
 *
 * PM2 cluster mode runs N worker processes (here, N = available CPUs)
 * behind PM2's built-in round-robin load balancer, all listening on the
 * same port. This is a process-manager-level change — server.ts itself
 * already handles its own Prisma/Redis connections and its own
 * viewsBuffer flush timer independently per process, and the underlying
 * Redis operations involved (token rotation, views buffer flush,
 * session writes) already use atomic Lua scripts / GETDEL, so running
 * multiple instances concurrently was already safe before this change —
 * this file is what actually turns that latent cluster-safety into
 * real horizontal scaling within the container.
 */
module.exports = {
  apps: [
    {
      name: 'classifieds-backend',
      script: './dist/server.js',
      // 'max' uses all available CPU cores. Override with a fixed number
      // (e.g. 2) via the instances field if you want to reserve cores
      // for other processes sharing the same host/container.
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',

      // Restart policy — protects against a single worker getting stuck
      // (e.g. a wedged DB connection) without taking down the whole app.
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // PM2 sends SIGINT on reload/restart by default; server.ts already
      // handles SIGINT/SIGTERM with a graceful shutdown (views flush,
      // prisma.$disconnect, redis.quit) that force-exits itself after
      // 10s if cleanup hangs. kill_timeout is set a bit longer (12s) so
      // PM2's own SIGKILL fallback only ever fires as a last resort
      // after the app's own forced-exit timer has already had its
      // chance to run — they shouldn't race each other.
      kill_timeout: 12_000,

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
