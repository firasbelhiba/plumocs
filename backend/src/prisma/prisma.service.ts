import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

interface ConnectionPrivileges {
  user: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  ownsTables: bigint;
}

/**
 * Asserts that a connection cannot ignore row-level security.
 *
 * Postgres exempts a superuser from every policy unconditionally, and a table's
 * owner from every policy unless that table also carries FORCE ROW LEVEL
 * SECURITY. Either way the exemption is silent: policies install without error,
 * queries return without warning, and isolation tests pass while enforcing
 * nothing. There is no runtime signal that tenant separation has stopped
 * working — which is exactly why it has to be checked up front rather than
 * relied upon.
 *
 * Exported so the integration harness runs the same check against its own
 * client; a test suite connected as the owner would prove nothing.
 */
export async function assertUnprivilegedConnection(
  client: Pick<PrismaClient, '$queryRaw'>,
  label: string,
): Promise<ConnectionPrivileges> {
  const [row] = await client.$queryRaw<ConnectionPrivileges[]>`
    SELECT current_user::text          AS "user",
           r.rolsuper                  AS "isSuperuser",
           r.rolbypassrls              AS "bypassesRls",
           (SELECT count(*) FROM pg_tables
             WHERE schemaname = 'public' AND tableowner = current_user) AS "ownsTables"
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;

  const faults: string[] = [];
  if (row.isSuperuser) faults.push('is a SUPERUSER');
  if (row.bypassesRls) faults.push('has BYPASSRLS');
  if (row.ownsTables > 0n) faults.push(`owns ${row.ownsTables} table(s) in "public"`);

  if (faults.length) {
    throw new Error(
      `${label} connects as "${row.user}", which ${faults.join(' and ')}. ` +
        'Such a connection is exempt from row-level security, so tenant ' +
        'isolation would not be enforced and nothing would report it. ' +
        'Provision the split roles with prisma/sql/roles.sql and point ' +
        'DATABASE_URL at plumo_app (migrations use MIGRATE_DATABASE_URL).',
    );
  }
  return row;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * The transaction owning the current async call stack, if any.
   *
   * Tenant scoping is about to be bound per request with
   * `set_config('app.workspace_id', …, true)`, whose third argument makes the
   * setting *transaction*-local. It has to be: a session-local setting would
   * outlive the request on a pooled connection and hand the next caller the
   * previous tenant's scope. Transaction-local means every query of a request
   * must run on that one transaction's connection — anything reaching the pool
   * directly gets a connection with no workspace bound.
   */
  private readonly als = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor() {
    super();
    // Routing is done here rather than by exposing a `this.prisma.db.*`
    // accessor, because the accessor version fails open: a call site written
    // as `this.prisma.ticket.findMany()` still compiles, still passes review,
    // and quietly runs outside the request's transaction. With 168 call sites
    // across 23 files that is a matter of time. This makes the correct thing
    // the only thing — including for code not yet written.
    return new Proxy(this, {
      get(target, prop, receiver) {
        const tx = target.als.getStore();
        // `$transaction` is deliberately excluded so the override below runs;
        // everything a transaction client offers — model delegates, $queryRaw,
        // $executeRaw — is taken from the transaction while one is active.
        if (tx && prop !== '$transaction' && Reflect.has(tx, prop)) {
          const value = (tx as Record<string | symbol, unknown>)[prop];
          return typeof value === 'function' ? value.bind(tx) : value;
        }
        // Bound to the target rather than the proxy: Prisma's internals read
        // private state off `this`, and a proxy receiver breaks that.
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  /**
   * Runs `fn` in a transaction, joining the enclosing one if there is any.
   *
   * Prisma cannot nest transactions. A nested call does not fail — it silently
   * checks out a *second* pooled connection, which means its writes sit outside
   * the outer transaction's atomicity, it carries none of the outer
   * transaction's `SET LOCAL` state, and it can block forever on rows the outer
   * transaction is still holding. Joining is both the correct semantics and the
   * only way to keep the workspace binding intact.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction(arg: any, options?: any): any {
    const active = this.als.getStore();
    if (active) {
      // The array form's promises are lazy and were built through the proxy
      // above, so they are already bound to `active` — awaiting them runs them
      // inside the enclosing transaction.
      return Array.isArray(arg) ? Promise.all(arg) : arg(active);
    }
    return super.$transaction(
      typeof arg === 'function'
        ? (tx: Prisma.TransactionClient) => this.als.run(tx, () => arg(tx))
        : arg,
      options,
    );
  }

  async onModuleInit() {
    await this.$connect();
    // Deliberately fatal, and deliberately without an override flag: an escape
    // hatch on this check is the one thing guaranteed to be set once and never
    // unset. roles.sql is idempotent, so the fix is a single command.
    const { user } = await assertUnprivilegedConnection(this, 'The application');
    this.logger.log(`Connected as "${user}" — not a superuser, no BYPASSRLS, owns no tables`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
