export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3001',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET ?? 'plumo-attachments',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION ?? 'us-east-1',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM ?? 'plumo support <help@plumo.app>',
  },
  inboundEmailWebhookSecret: process.env.INBOUND_EMAIL_WEBHOOK_SECRET,
  webhookSigningDefaultSecret: process.env.WEBHOOK_SIGNING_DEFAULT_SECRET,
  rateLimit: {
    windowSecs: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
