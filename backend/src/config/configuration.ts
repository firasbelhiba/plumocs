/**
 * Where the CONSOLE lives — the origin a browser is sent to, never this api.
 *
 * Resolved once and read from two places: the PM callback redirects the browser
 * back here, and the password-reset email links here. It used to fall back to
 * APP_URL, and in production APP_URL is the api (csapi.plumo.work) — so every
 * emailed reset link pointed at a host that serves no pages and 404'd for every
 * user who ever asked for one.
 *
 * The fallback is the console's development origin instead. There is no way to
 * guess a production one, and a deployment that serves a console sets
 * PM_CONSOLE_URL; guessing wrong loudly beats guessing wrong silently.
 */
const consoleUrl = (process.env.PM_CONSOLE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3001',
  consoleUrl,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  workspace: {
    // Optional pin for the desk a request without an X-Workspace-Slug header is
    // assumed to mean. Left unset, the workspace is discovered from the database
    // as long as exactly one is active; once a second exists there is no default
    // and clients must name theirs. Never a workspace id — see the schema
    // comment on workspaces.slug.
    defaultSlug: process.env.WORKSPACE_DEFAULT_SLUG || undefined,
    // Bounds on the per-request transaction that carries the tenant binding.
    // Prisma's stock 5s is too tight for handlers that talk to S3 or SMTP; much
    // above this and a slow dependency starts holding the connection pool
    // hostage instead of failing.
    txTimeoutMs: parseInt(process.env.WORKSPACE_TX_TIMEOUT_MS ?? '15000', 10),
    txMaxWaitMs: parseInt(process.env.WORKSPACE_TX_MAX_WAIT_MS ?? '5000', 10),
  },
  // Linking CS accounts and desks to Plumo PM ones. Unset on a deployment that
  // does not offer it; the module reports itself unavailable rather than
  // half-working.
  pm: {
    issuer: process.env.PM_ISSUER || undefined,
    // Must be registered with PM and must point at THIS api, not the console:
    // the code-for-token exchange happens server-side.
    redirectUri: process.env.PM_REDIRECT_URI || undefined,
    // Where to send the browser once the callback is done. The same origin as
    // the top-level `consoleUrl`, kept here so PM-facing code reads as one unit.
    consoleUrl,
    // Create a desk on first sign-in for a PM owner/admin whose organisation
    // has none. On by default because it is the point of signing in with Plumo:
    // whoever runs a Plumo workspace runs its support desk, without waiting for
    // an invitation from inside a product they have never used.
    //
    // The kill switch exists because this makes an unauthenticated endpoint a
    // tenant-creating one. If PM ever lets anyone self-serve a workspace and be
    // its P0, one account can mint desks by signing in repeatedly, and each desk
    // adds a sequential pass to every background sweep. Set it to `false` to fall
    // back to refusing, without a deploy.
    autoProvisionDesks: process.env.PM_AUTO_PROVISION_DESKS !== 'false',
  },
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
