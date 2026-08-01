import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { assertUnprivilegedConnection } from '../../src/prisma/prisma.service';

/**
 * Refuses to run the integration suite against a privileged connection.
 *
 * This runs before any spec, and it is the reason the isolation tests are worth
 * anything. A suite connected as a superuser or as the table owner is exempt
 * from every row-level security policy, so it would report perfect tenant
 * separation whether or not a single policy existed. Failing here — loudly,
 * once, before the first assertion — is the difference between a test that
 * proves isolation and a test that proves the harness can read rows.
 */
export default async function globalSetup() {
  config();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for integration tests — copy .env.example to .env');
  }
  const client = new PrismaClient();
  try {
    const { user } = await assertUnprivilegedConnection(client, 'The integration suite');
    // eslint-disable-next-line no-console
    console.log(`\n  integration suite connected as "${user}" (no superuser, no BYPASSRLS, owns no tables)`);
  } finally {
    await client.$disconnect();
  }
}
