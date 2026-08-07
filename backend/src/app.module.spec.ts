import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * Can Nest resolve every dependency in the application?
 *
 * THIS EXISTS BECAUSE TYPESCRIPT CANNOT ANSWER IT. Dependency injection is
 * wired by decorators and module metadata, not by types, so a controller can
 * inject a service its module never imports and the build stays green. The
 * failure appears only when Nest boots — which, without this, means in
 * production.
 *
 * It has happened twice: a ChatModule missing RealtimeModule, and a
 * PmIdentityController injecting AuthService that AuthModule did not export.
 * The second reached production and returned 502 until it was rolled back. Both
 * were a green build, green unit tests, and an instant crash on start.
 *
 * `.compile()` rather than `.init()` deliberately: compiling resolves the whole
 * provider graph, which is the thing being checked, without opening a database
 * or Redis connection. That keeps this in the fast CI job where it runs on every
 * push, instead of the integration job that needs services.
 */
describe('AppModule', () => {
  // The config schema is validated at module load, so supply the required
  // values. They are never connected to — nothing here opens a socket.
  const REQUIRED_ENV = {
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db?schema=public',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'compile-check-secret-not-a-real-one',
    JWT_REFRESH_SECRET: 'compile-check-secret-not-a-real-one-2',
  };

  let saved: Record<string, string | undefined>;

  beforeAll(() => {
    saved = Object.fromEntries(Object.keys(REQUIRED_ENV).map((k) => [k, process.env[k]]));
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('resolves every provider, controller and guard', async () => {
    // A missing import, an unexported provider, or a circular dependency all
    // throw here with the offending class named.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60_000);
});
