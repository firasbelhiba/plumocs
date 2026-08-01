import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

/**
 * e2e smoke — needs a running Postgres + Redis (docker compose up -d)
 * and the env vars from .env.example.
 */
describe('health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('ok');
  });

  it('GET /api/v1/tickets without credentials is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tickets' });
    expect(res.statusCode).toBe(401);
  });
});
