import * as Joi from 'joi';

/** Validated at boot — the app refuses to start if a required var is missing. */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3001),
  APP_URL: Joi.string().uri().default('http://localhost:3001'),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  WORKSPACE_DEFAULT_SLUG: Joi.string().optional().allow(''),
  WORKSPACE_TX_TIMEOUT_MS: Joi.number().default(15000),
  WORKSPACE_TX_MAX_WAIT_MS: Joi.number().default(5000),
  PM_ISSUER: Joi.string().uri().optional().allow(''),
  PM_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  PM_CONSOLE_URL: Joi.string().uri().optional().allow(''),
  // Declared so the kill switch cannot be silently misspelled into being
  // ignored: 'PM_AUTO_PROVISION_DESK=false' would otherwise boot happily and
  // keep provisioning. Only the exact string 'false' disables it.
  PM_AUTO_PROVISION_DESKS: Joi.string().valid('true', 'false').optional(),
  JWT_ACCESS_SECRET: Joi.string().min(8).required(),
  JWT_REFRESH_SECRET: Joi.string().min(8).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_BUCKET: Joi.string().default('plumo-attachments'),
  S3_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_SECRET_KEY: Joi.string().optional().allow(''),
  S3_REGION: Joi.string().default('us-east-1'),
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_FROM: Joi.string().default('plumo support <help@plumo.app>'),
  INBOUND_EMAIL_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  WEBHOOK_SIGNING_DEFAULT_SECRET: Joi.string().optional().allow(''),
  RATE_LIMIT_WINDOW: Joi.number().default(60),
  RATE_LIMIT_MAX: Joi.number().default(120),
  LOG_LEVEL: Joi.string().default('info'),
});
