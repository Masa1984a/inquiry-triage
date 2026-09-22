import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH } from './triage';
import { parseTriageRequest } from './triage-request';

describe('parseTriageRequest', () => {
  it('本文を取り出して前後の空白を落とす', () => {
    expect(parseTriageRequest({ text: '  ログインできません  ' })).toEqual({
      ok: true,
      text: 'ログインできません',
    });
  });

  it('本文がない・空・文字列以外なら弾く', () => {
    expect(parseTriageRequest({}).ok).toBe(false);
    expect(parseTriageRequest({ text: '   ' }).ok).toBe(false);
    expect(parseTriageRequest({ text: 42 }).ok).toBe(false);
    expect(parseTriageRequest(null).ok).toBe(false);
  });

  it('上限を超える本文は弾く', () => {
    const parsed = parseTriageRequest({ text: 'あ'.repeat(MAX_TEXT_LENGTH + 1) });

    expect(parsed.ok).toBe(false);
  });

  it('上限ちょうどは通す', () => {
    expect(parseTriageRequest({ text: 'あ'.repeat(MAX_TEXT_LENGTH) }).ok).toBe(true);
  });
});
