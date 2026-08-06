/**
 * The cursor arithmetic for `GET /chat/updates`.
 *
 * Deliberately its own module with no imports: this is the part of the chat
 * surface that loses messages when it is wrong, so it needs to stay testable
 * without booting Nest, touching a database, or dragging in the rest of the
 * app — which is exactly what stopped it being tested in the first place.
 */

/**
 * How far behind the present the cursor is held, so a transaction still in
 * flight cannot commit behind it and be skipped. Must comfortably exceed the
 * longest write transaction; Prisma's interactive-transaction budget is
 * measured in seconds.
 */
export const CURSOR_SAFETY_LAG_MS = 30_000;

/**
 * Where the next `since` should point, given the page just returned.
 *
 * Two invariants, both load-bearing:
 *  - the cursor never advances past `now - lagMs`, so a reply whose transaction
 *    is still open cannot commit with an older stamp and be missed forever;
 *  - the cursor never goes backwards past `since`, so a client is never walked
 *    into re-reading an ever-growing window.
 *
 * `hasMore` is suppressed when the cursor did not move: a full page pinned
 * entirely inside the safety window would otherwise tell a client that
 * re-polls on `hasMore` to fetch the identical page immediately, forever.
 */
export function nextUpdatesCursor(args: {
  since: Date;
  lastRowAt: Date | null;
  pageWasFull: boolean;
  now: number;
  lagMs?: number;
}): { cursor: Date; hasMore: boolean } {
  const { since, lastRowAt, pageWasFull, now } = args;
  const watermark = new Date(now - (args.lagMs ?? CURSOR_SAFETY_LAG_MS));
  const target = lastRowAt ?? watermark;
  const cursor = new Date(
    Math.max(since.getTime(), Math.min(target.getTime(), watermark.getTime())),
  );
  return { cursor, hasMore: pageWasFull && cursor.getTime() > since.getTime() };
}
