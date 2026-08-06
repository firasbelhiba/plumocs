import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Principal } from '../decorators';
import { WorkspaceContextService } from './workspace-context.service';

/**
 * Opens the request's transaction and binds its tenant to it.
 *
 * WHY THIS EXISTS AT ALL. Every tenant table carries
 * `workspace_id NOT NULL DEFAULT app_current_workspace()`, and that function
 * reads a transaction-local GUC. Nothing else sets it. Without this interceptor
 * the schema is not merely unscoped — it is unwritable: the first
 * `prisma.ticket.create()` of the day fails with a not-null violation, because
 * the default evaluates to NULL. The migration chose that shape deliberately, so
 * that forgotten code writes NOTHING rather than writing into the wrong tenant.
 * This is the other half of that bargain.
 *
 * WHY AN INTERCEPTOR AND NOT A GUARD. Nest runs middleware → guards →
 * interceptors → handler. AuthGuard must resolve the principal first (it is the
 * thing that knows which workspace this is), and a guard cannot keep a
 * transaction open across the handler. Interceptors can, and this is the first
 * point in the chain where both are true.
 *
 * WHY THE WHOLE REQUEST IS INSIDE ONE TRANSACTION. `set_config(..., true)` is
 * transaction-local, which it has to be — a session-local setting outlives the
 * request on a pooled connection and hands the next caller this tenant's scope.
 * Transaction-local means every query of the request must run on that one
 * connection, which is exactly what PrismaService's AsyncLocalStorage proxy
 * arranges. The cost is a database connection held for the duration of the
 * request; WORKSPACE_TX_TIMEOUT_MS bounds it, and a request that legitimately
 * exceeds it (a slow third-party call) belongs on a queue rather than in a
 * transaction.
 */
@Injectable()
export class WorkspaceBindingInterceptor implements NestInterceptor {
  private readonly timeout: number;
  private readonly maxWait: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceContextService,
    config: ConfigService,
  ) {
    this.timeout = config.get<number>('workspace.txTimeoutMs') ?? 15_000;
    this.maxWait = config.get<number>('workspace.txMaxWaitMs') ?? 5_000;
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // WebSocket and queue contexts have no req.principal and must not be wrapped
    // — a socket lifetime is not a transaction lifetime.
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const principal: Principal | undefined = req?.principal;

    // No principal means @Public: login, health, the inbound-email webhook.
    // These deliberately run unbound, and every tenant write they attempt fails
    // closed on the NOT NULL rather than landing in an arbitrary workspace.
    if (!principal) return next.handle();

    return from(
      this.prisma.$transaction(
        async () => {
          await this.workspaces.bind(principal.workspaceId);
          // AWAITED, not returned. Subscribing here — inside the transaction
          // callback — is what puts the handler in the AsyncLocalStorage scope
          // PrismaService reads, so every `this.prisma.*` beneath it routes to
          // this transaction. Returning the Observable unawaited would commit
          // the transaction before the handler had run a single query, and the
          // binding would be gone by the time it did.
          //
          // defaultValue covers a handler that completes without emitting (a
          // 204); without it lastValueFrom raises EmptyError and the request
          // 500s on success.
          return lastValueFrom(next.handle(), { defaultValue: undefined });
        },
        { timeout: this.timeout, maxWait: this.maxWait },
      ),
    );
  }
}
