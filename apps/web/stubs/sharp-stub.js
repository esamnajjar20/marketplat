// Stub for sharp — not used at runtime. Prevents wrangler/esbuild from
// trying to bundle native .node binaries on Cloudflare Workers.
module.exports = function sharp() {
  throw new Error('sharp is not available on Cloudflare Workers');
};
module.exports.default = module.exports;
