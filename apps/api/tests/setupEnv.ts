/**
 * setupEnv.ts — runs BEFORE jest test framework (via setupFiles)
 * Ensures NODE_ENV=test and .env.test are loaded before any application
 * code imports env.ts, preventing "DATABASE_URL not found" and
 * "Invalid environment variables" errors during module initialization.
 */
process.env.NODE_ENV = 'test';

// Load .env.test first (dotenv.config won't override already-set process.env values)
// __dirname is the tests/ directory, so .env.test is in the parent directory
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });

// Also load base .env for any defaults not in .env.test
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });