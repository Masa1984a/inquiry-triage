import { MAX_TEXT_LENGTH } from './triage';

export type ParsedTriageRequest =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * リクエストボディから問い合わせ本文を取り出す。
 *
 * 長さの上限を設けているのは、入力トークンがそのままAPI利用料になるため。
 * 上限は lib/triage.ts の MAX_TEXT_LENGTH が唯一の定義箇所で、画面の文字数表示も同じ値を見る。
 */
export function parseTriageRequest(body: unknown): ParsedTriageRequest {
  const { text } = (body ?? {}) as Record<string, unknown>;

  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '問い合わせ本文を入力してください' };
  }

  const trimmed = text.trim();

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `問い合わせ本文が長すぎます (${MAX_TEXT_LENGTH}文字まで)`,
    };
  }

  return { ok: true, text: trimmed };
}
