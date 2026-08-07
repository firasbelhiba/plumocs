/**
 * Environment defaults for the unit suite, set BEFORE any module is imported.
 *
 * THIS FILE EXISTS BECAUSE A `beforeAll` IS TOO LATE. `ConfigModule.forRoot()`
 * runs inside the `@Module({ imports: [...] })` decorator, so it validates
 * process.env the moment `app.module.ts` is imported — and ES imports are
 * hoisted above every statement in the importing file, including a
 * `beforeAll` that sets exactly these variables. app.module.spec.ts had that
 * beforeAll and looked correct; it never ran in time.
 *
 * The failure was invisible on a developer machine because a real backend/.env
 * is present and ConfigModule loads it, so validation passed for the wrong
 * reason. CI has no .env, so `npm test` failed there and only there — green
 * locally, red on every push, for days. jest `setupFiles` is the only hook that
 * runs before the test file itself is loaded.
 *
 * Values are deliberately fake and nothing here opens a socket: the unit suite
 * resolves the Nest graph and exercises pure logic. Anything that needs a real
 * database belongs in test/integration, which has its own env.
 *
 * `??=` so a caller who exports real values — someone reproducing a CI failure,
 * or a future suite that wants a live URL — keeps them.
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@127.0.0.1:5432/db?schema=public';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= 'unit-test-secret-not-a-real-one';
process.env.JWT_REFRESH_SECRET ??= 'unit-test-secret-not-a-real-one-2';

// NODE_ENV=test keeps anything that branches on it out of production paths.
process.env.NODE_ENV ??= 'test';
