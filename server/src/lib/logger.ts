import pino from 'pino';
import { env, isProd, isTest } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  ...(isProd || isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
