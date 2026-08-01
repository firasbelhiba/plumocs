import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

// Postgres bigint columns (ticket numbers, audit ids) reach the serializer as
// BigInt, which JSON.stringify throws on. Teach it a representation once here
// rather than remembering to convert at every response site.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function (this: bigint) {
  return Number(this);
};

/** API bootstrap (HTTP + WS). The worker has its own entrypoint (worker.ts). */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  // `origin: true` reflects whatever Origin the caller sent, which combined with
  // credentials means any website can make credentialed requests to this API on
  // a visitor's behalf. Acceptable on localhost, not on a public host — so the
  // allowed origins are listed explicitly in production.
  //
  // CORS_ORIGINS is a comma-separated list (the Vercel URL, any custom domain).
  // Left unset it falls back to reflecting any origin, which keeps local
  // development working unchanged.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });
  if (!corsOrigins.length && process.env.NODE_ENV === 'production') {
    // Loud, because a permissive CORS policy in production is the kind of thing
    // that is only ever noticed after it matters.
    // eslint-disable-next-line no-console
    console.warn('[cors] CORS_ORIGINS is unset — every origin will be reflected.');
  }

  // DTO validation at the edge: whitelist on, unknown fields rejected (§13)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Plumo CS API')
    .setDescription('Customer-support console backend — tickets, SLA, messaging, webhooks.')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3001;
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`API up on :${port} — docs at /api/docs`, 'Bootstrap');
}

bootstrap();
