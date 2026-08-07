import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { resolveTrustedProxies } from './common/guards/principal-throttler.guard';

// Postgres bigint columns (ticket numbers, audit ids) reach the serializer as
// BigInt, which JSON.stringify throws on. Teach it a representation once here
// rather than remembering to convert at every response site.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function (this: bigint) {
  return Number(this);
};

/** API bootstrap (HTTP + WS). The worker has its own entrypoint (worker.ts). */
async function bootstrap() {
  // Client addresses reach us through nginx, which sets X-Forwarded-For from
  // $proxy_add_x_forwarded_for — that APPENDS the real peer to whatever the
  // caller sent, so only the RIGHTMOST entry is ours and everything left of it
  // is attacker input. Without trustProxy, Fastify ignored the header entirely
  // and req.ip was always the proxy, which is why the throttler had grown its
  // own header parsing and read the one entry an attacker fully controls.
  //
  // A trusted-address list rather than a hop COUNT: `trustProxy: 1` would trust
  // whatever sits one hop away no matter who that is, so the same build exposed
  // without nginx in front — no sanitiser anywhere — would take a client's own
  // X-Forwarded-For at face value and every rate limit would be forgeable again.
  // Given addresses, Fastify walks the chain from the right and stops at the
  // first hop that is not a trusted proxy, so a direct connection resolves to
  // the socket address and the headers are ignored. Safe either way.
  const trustedProxies = resolveTrustedProxies();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: trustedProxies }),
    { bufferLogs: true },
  );

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
  // Behind a reverse proxy the API should only be reachable from the proxy on
  // the same host. Binding every interface means the app is one firewall
  // mistake away from being addressable directly on its port — which would skip
  // nginx entirely, and with it TLS termination and the request limits.
  // Docker and any setup where the proxy lives elsewhere set BIND_ADDRESS.
  const bindAddress = process.env.BIND_ADDRESS ?? '0.0.0.0';
  await app.listen(port, bindAddress);
  app.get(Logger).log(`API up on :${port} — docs at /api/docs`, 'Bootstrap');
  // Worth a line at boot: if the proxy is not in this list its own address
  // becomes every anonymous caller's rate-limit bucket, and the first symptom
  // is agents getting 429s for traffic that was never theirs.
  app.get(Logger).log(`Client IPs resolved behind: ${trustedProxies.join(', ')}`, 'Bootstrap');
}

bootstrap();
