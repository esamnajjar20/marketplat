import Redis from 'ioredis';
import { logger } from '../shared/utils/logger';
import { env } from './env';

export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password || undefined,
  lazyConnect: true,
  retryStrategy: times => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', err => logger.error('Redis error', { err: err.message }));
