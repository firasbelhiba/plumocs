import { cleanSubject, stripQuotedHistory, ticketNumberFromSubject } from './email-parsing.util';

/**
 * Inbound email is lossy by nature — only the stripped body is persisted, so a
 * over-eager cut destroys customer content permanently. These cases pin the
 * "never return empty" rule that bottom-posted replies depend on.
 */
describe('stripQuotedHistory', () => {
  it('keeps a plain reply untouched', () => {
    expect(stripQuotedHistory('the key still will not rotate.')).toBe('the key still will not rotate.');
  });

  it('cuts an "On … wrote:" quote block', () => {
    const raw = ['thanks, that worked.', '', 'On Tue, 28 Jul 2026, plumo support wrote:', '> have you tried the link?'].join('\n');
    expect(stripQuotedHistory(raw)).toBe('thanks, that worked.');
  });

  it('cuts an Outlook-style original message header', () => {
    const raw = 'still broken.\n\n-----Original Message-----\nFrom: support';
    expect(stripQuotedHistory(raw)).toBe('still broken.');
  });

  it('cuts a signature delimiter', () => {
    expect(stripQuotedHistory('all sorted, thank you!\n\n--\nInes\nNorthwind')).toBe('all sorted, thank you!');
  });

  // the regression: a bottom-poster quotes first and answers underneath
  it('keeps a bottom-posted reply instead of returning nothing', () => {
    const raw = ['> have you tried the reset link?', '> it expires after 30 minutes', '', 'yes, three times — still stuck.'].join('\n');
    expect(stripQuotedHistory(raw)).toBe('yes, three times — still stuck.');
  });

  it('never returns empty, even for an all-quote message', () => {
    const raw = '> everything here is quoted\n> and nothing else';
    expect(stripQuotedHistory(raw).length).toBeGreaterThan(0);
  });

  it('does not truncate at an inline > used as punctuation mid-line', () => {
    const raw = 'the arrow shows a > b in the export, which is wrong.';
    expect(stripQuotedHistory(raw)).toBe(raw);
  });

  it('trims surrounding whitespace', () => {
    expect(stripQuotedHistory('\n\n  hello  \n\n')).toBe('hello');
  });
});

describe('ticketNumberFromSubject', () => {
  it('reads the plumo ref out of a reply subject', () => {
    expect(ticketNumberFromSubject('Re: [Plumo #1042] can\'t reset my key')).toBe(1042);
  });

  it('is case-insensitive on the tag', () => {
    expect(ticketNumberFromSubject('[plumo #7] hi')).toBe(7);
  });

  it('returns null when there is no ref', () => {
    expect(ticketNumberFromSubject('just a new question')).toBeNull();
    expect(ticketNumberFromSubject('')).toBeNull();
  });

  it('is not fooled by a bare number in the subject', () => {
    expect(ticketNumberFromSubject('invoice 1042 is wrong')).toBeNull();
  });
});

describe('cleanSubject', () => {
  it('strips Re: and Fwd: prefixes', () => {
    expect(cleanSubject('Re: billing question')).toBe('billing question');
    expect(cleanSubject('Fwd: billing question')).toBe('billing question');
    expect(cleanSubject('FW: billing question')).toBe('billing question');
  });

  it('falls back for an empty subject', () => {
    expect(cleanSubject('')).toBe('(no subject)');
    expect(cleanSubject('   ')).toBe('(no subject)');
  });

  it('leaves an ordinary subject alone', () => {
    expect(cleanSubject('widget is spinning')).toBe('widget is spinning');
  });
});
