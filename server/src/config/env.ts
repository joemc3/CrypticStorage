import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'changeme',
  'secret',
]);

const boolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    TRUST_PROXY: boolean.default(false),

    DATABASE_URL: z.string().min(1),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    CONTENT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
    /** 32-byte key (base64 or hex) used to encrypt TOTP secrets at rest. Derived from JWT_SECRET if absent. */
    SERVER_ENCRYPTION_KEY: z.string().optional(),

    /** Origin of the web app, used for share links and CORS. */
    APP_URL: z.string().url().default('http://localhost:3000'),
    /** Public base URL of this API as seen by browsers. Empty means same-origin "/api". */
    API_PUBLIC_URL: z.string().default(''),
    CORS_ORIGINS: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('./data/storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_PORT: z.coerce.number().int().positive().optional(),
    S3_USE_SSL: boolean.default(false),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_BUCKET: z.string().default('crypticstorage'),
    S3_REGION: z.string().default('us-east-1'),
    /** Endpoint browsers can reach. When set, uploads and downloads go straight to S3 with presigned URLs. */
    S3_PUBLIC_ENDPOINT: z.string().url().optional(),

    /** `log` prints mail to the log instead of sending it. Production defaults to `smtp`. */
    MAIL_DRIVER: z.enum(['log', 'smtp']).default(process.env.NODE_ENV === 'production' ? 'smtp' : 'log'),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().optional(),

    /** Bounds on the size n of an owner's witness set. The threshold k is always between 2 and n. */
    WITNESS_MIN_N: z.coerce.number().int().min(2).default(2),
    WITNESS_MAX_N: z.coerce.number().int().min(2).default(7),
    /** When false, a rule cannot name one of the owner's accepted witnesses as a recipient. */
    WITNESS_MAY_BE_RECIPIENT: boolean.default(true),

    DEFAULT_STORAGE_QUOTA_BYTES: z.coerce.number().int().positive().default(10 * 1024 ** 3),
    MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(5 * 1024 ** 3),
    PENDING_UPLOAD_TTL_HOURS: z.coerce.number().int().positive().default(24),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(env.JWT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Placeholder JWT_SECRET is not allowed in production' });
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
    if (env.WITNESS_MAX_N < env.WITNESS_MIN_N) {
      ctx.addIssue({ code: 'custom', path: ['WITNESS_MAX_N'], message: 'WITNESS_MAX_N must be at least WITNESS_MIN_N' });
    }
    if (env.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_URL', 'MAIL_FROM'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when MAIL_DRIVER=smtp` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  // Env files and compose templates leave unset values as empty strings (`S3_PUBLIC_ENDPOINT=`).
  // Treat those as absent so optional fields fall back to their defaults instead of failing validation.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const env = load();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export function corsOrigins(): string[] {
  const configured = env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return Array.from(new Set([env.APP_URL, ...configured]));
}
