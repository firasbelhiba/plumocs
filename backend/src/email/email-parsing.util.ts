/**
 * Pure helpers for the inbound-email pipeline — kept out of the service so the
 * threading and body-cleaning rules can be tested without SMTP or a database.
 */

/**
 * Cut quoted history and signatures from a reply body.
 *
 * Never returns empty: bottom-posters answer *below* the quote, and an
 * over-eager cut would silently destroy the only content the customer sent.
 * If trimming would leave nothing, fall back to the unquoted lines, then to
 * the original text.
 */
export function stripQuotedHistory(text: string): string {
  const markers = [/^On .+ wrote:$/m, /^-{2,}\s*Original Message\s*-{2,}/im, /^--\s*$/m];
  let cut = text.length;
  for (const rx of markers) {
    const m = rx.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  // A marker at position 0 would leave nothing — keep the text and let the
  // quote-line pass below decide.
  const body = text.slice(0, cut).trim() || text.trim();

  // Drop wholly-quoted lines (bottom-posted replies quote first, answer after).
  // Only when real content survives — an all-quote message keeps its body
  // rather than being stored as "(empty message)".
  const unquoted = body
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .trim();
  return unquoted || body;
}

/** Pull a ticket number out of a subject line like "Re: [Plumo #1042] …". */
export function ticketNumberFromSubject(subject: string): number | null {
  const m = /\[Plumo #(\d+)\]/i.exec(subject ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/** Strip Re:/Fwd: prefixes for a new ticket's subject. */
export function cleanSubject(subject: string): string {
  return (subject ?? '').replace(/^(re|fwd?):\s*/i, '').trim() || '(no subject)';
}
