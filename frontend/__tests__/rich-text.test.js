/**
 * Inline formatting in a message body.
 *
 * AI assistants emit markdown whether or not you asked for one, so a chatbot
 * reply arrives full of `**bold**` and backticks. Rendered literally it reads as
 * punctuation soup, which is what the console showed until this existed.
 *
 * The parser is deliberately tiny — two tokens — and returns data rather than
 * markup, so the renderer builds React elements and a hostile message body can
 * never inject HTML into the one screen agents read all day.
 */
import { parseInline } from '@/components/screens/Ticket';

const kinds = (t) => parseInline(t).map((p) => p.type);
const values = (t, type) => parseInline(t).filter((p) => p.type === type).map((p) => p.value);

describe('parseInline', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('just a sentence')).toEqual([{ type: 'text', value: 'just a sentence' }]);
  });

  it('pulls out bold runs', () => {
    expect(values('the **important** bit', 'bold')).toEqual(['important']);
    expect(kinds('the **important** bit')).toEqual(['text', 'bold', 'text']);
  });

  it('pulls out code spans', () => {
    expect(values('call `transfer` on it', 'code')).toEqual(['transfer']);
  });

  it('handles a real chatbot answer with both, and several of each', () => {
    const body = [
      "HBAR is Hedera's native cryptocurrency used for:",
      '1. **Paying network fees** — all transactions require HBAR.',
      '2. **Smart contract interactions** — via `transfer`, `send`, and `call`.',
    ].join('\n');

    expect(values(body, 'bold')).toEqual(['Paying network fees', 'Smart contract interactions']);
    expect(values(body, 'code')).toEqual(['transfer', 'send', 'call']);
  });

  it('keeps the newlines between list items', () => {
    // The renderer relies on whitespace-pre-wrap to show these. Paragraphs are
    // split on BLANK lines only, so if the parser swallowed single newlines a
    // numbered list would arrive as one unbroken wall of text — which is
    // exactly how it looked before.
    const joined = parseInline('1. one\n2. two\n3. three').map((p) => p.value).join('');
    expect(joined).toBe('1. one\n2. two\n3. three');
  });

  it('round-trips: concatenating the values rebuilds the text without the markers', () => {
    const body = 'a **b** c `d` e';
    expect(parseInline(body).map((p) => p.value).join('')).toBe('a b c d e');
  });

  it('leaves unmatched markers as literal text rather than eating them', () => {
    expect(kinds('2 * 3 * 4')).toEqual(['text']);
    expect(kinds('an unclosed **bold')).toEqual(['text']);
    expect(kinds('a lone ` backtick')).toEqual(['text']);
  });

  it('does not treat html as markup — it is just text', () => {
    // The whole reason this returns data instead of an HTML string.
    const body = '<img src=x onerror=alert(1)>';
    expect(parseInline(body)).toEqual([{ type: 'text', value: body }]);
  });

  it('survives an empty body', () => {
    expect(parseInline('')).toEqual([]);
  });
});
