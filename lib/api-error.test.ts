import { describe, expect, it } from 'vitest';
import {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
  TypeSafeError,
} from '@typesafe-ai/sdk';
import { describeError } from './api-error';

describe('describeError', () => {
  it('認証エラーは設定不備としてサーバー側の500で返す', () => {
    const error = new AuthenticationError(401, undefined, new Headers());

    expect(describeError(error).status).toBe(500);
    expect(describeError(error).error).toContain('TYPESAFE_API_KEY');
  });

  it('APIキー未設定(SDK内部のTypeSafeError)も500で返す', () => {
    expect(describeError(new TypeSafeError('missing api key')).status).toBe(500);
  });

  it('レート上限は429で返す', () => {
    const error = new RateLimitError(429, undefined, new Headers());

    expect(describeError(error).status).toBe(429);
  });

  it('接続エラーとサーバーエラーは502で返す', () => {
    expect(describeError(new APIConnectionError()).status).toBe(502);
    expect(
      describeError(new InternalServerError(500, undefined, new Headers())).status,
    ).toBe(502);
  });

  it('想定外の例外も502に落とす', () => {
    expect(describeError(new Error('boom')).status).toBe(502);
  });
});
