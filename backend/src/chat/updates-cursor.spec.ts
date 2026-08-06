import { nextUpdatesCursor } from './updates-cursor';

/**
 * The cursor for GET /chat/updates.
 *
 * These are not shape tests. Each one stands for a way an agent's reply reaches
 * the desk and never reaches the visitor — the failure this endpoint had, which
 * produces no error on either side and cannot be recovered after the fact.
 */
describe('nextUpdatesCursor', () => {
  const T = (iso: string) => new Date(iso).getTime();
  const NOW = T('2026-08-06T12:00:00.000Z');
  const LAG = 30_000;

  const at = (iso: string) => new Date(iso);

  it('does not skip a reply that commits late with an older timestamp', () => {
    // The bug, in one test.
    //
    // Agent A's transaction opens at 11:59:59.900 and is slow. Agent B's opens
    // at 11:59:59.980 and commits at once. A poll in between sees only B. If
    // the cursor took B's stamp, A — committing a moment later, still stamped
    // 11:59:59.900 — would fail `created_at > cursor` on every future poll and
    // be lost permanently.
    const { cursor } = nextUpdatesCursor({
      since: at('2026-08-06T11:59:00.000Z'),
      lastRowAt: at('2026-08-06T11:59:59.980Z'), // B, the only visible row
      pageWasFull: false,
      now: NOW,
      lagMs: LAG,
    });

    // The cursor stays behind A's stamp, so the next poll still asks for it.
    expect(cursor.getTime()).toBeLessThan(T('2026-08-06T11:59:59.900Z'));
    expect(cursor.getTime()).toBe(NOW - LAG);
  });

  it('never advances past the safety watermark', () => {
    const { cursor } = nextUpdatesCursor({
      since: at('2026-08-06T11:00:00.000Z'),
      lastRowAt: at('2026-08-06T11:59:59.999Z'),
      pageWasFull: false,
      now: NOW,
      lagMs: LAG,
    });
    expect(cursor.getTime()).toBeLessThanOrEqual(NOW - LAG);
  });

  it('advances normally when the page is comfortably in the past', () => {
    // The safety margin must not stall a backlog: rows older than the watermark
    // are settled, so the cursor follows them exactly.
    const last = at('2026-08-06T11:30:00.000Z');
    const { cursor } = nextUpdatesCursor({
      since: at('2026-08-06T11:00:00.000Z'),
      lastRowAt: last,
      pageWasFull: false,
      now: NOW,
      lagMs: LAG,
    });
    expect(cursor.getTime()).toBe(last.getTime());
  });

  it('never moves backwards, so a quiet poller does not re-read a growing window', () => {
    // `since` is already ahead of the watermark — a client polling faster than
    // the lag. Rewinding would make every poll re-read more than the last.
    const since = at('2026-08-06T11:59:50.000Z');
    const { cursor } = nextUpdatesCursor({
      since,
      lastRowAt: null,
      pageWasFull: false,
      now: NOW,
      lagMs: LAG,
    });
    expect(cursor.getTime()).toBe(since.getTime());
  });

  it('advances on an empty page so the window stays bounded', () => {
    const { cursor } = nextUpdatesCursor({
      since: at('2026-08-06T10:00:00.000Z'),
      lastRowAt: null,
      pageWasFull: false,
      now: NOW,
      lagMs: LAG,
    });
    expect(cursor.getTime()).toBe(NOW - LAG);
  });

  it('does not report hasMore when the cursor could not move', () => {
    // The loop I could have introduced. A full page whose rows are all newer
    // than the watermark clamps the cursor back to `since`. Our own poller
    // re-polls immediately on hasMore, so answering true here would spin on the
    // identical page forever and never yield to the tick.
    const since = at('2026-08-06T11:59:55.000Z');
    const { cursor, hasMore } = nextUpdatesCursor({
      since,
      lastRowAt: at('2026-08-06T11:59:59.000Z'),
      pageWasFull: true,
      now: NOW,
      lagMs: LAG,
    });
    expect(cursor.getTime()).toBe(since.getTime()); // pinned
    expect(hasMore).toBe(false); // and therefore no immediate re-poll
  });

  it('still reports hasMore when a full page did advance the cursor', () => {
    const { hasMore } = nextUpdatesCursor({
      since: at('2026-08-06T11:00:00.000Z'),
      lastRowAt: at('2026-08-06T11:30:00.000Z'),
      pageWasFull: true,
      now: NOW,
      lagMs: LAG,
    });
    expect(hasMore).toBe(true);
  });

  it('converges: repeated polling of a settled backlog reaches the watermark', () => {
    // Guards against a clamp that quietly stops making progress.
    let since = at('2026-08-06T09:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      const { cursor } = nextUpdatesCursor({
        since,
        lastRowAt: null,
        pageWasFull: false,
        now: NOW,
        lagMs: LAG,
      });
      expect(cursor.getTime()).toBeGreaterThanOrEqual(since.getTime());
      since = cursor;
    }
    expect(since.getTime()).toBe(NOW - LAG);
  });
});
