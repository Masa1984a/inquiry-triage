import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeError,
} from '@typesafe-ai/sdk';

export type ClientError = {
  status: number;
  /** 画面に出すメッセージ。原因の詳細はサーバーログ側に残す */
  error: string;
};

/**
 * HTTPまで到達せずSDK内部で発生したエラー(= ローカルの設定不備)かどうか。
 *
 * TypeSafeClient はAPIキーが未設定のときコンストラクタで素の TypeSafeError を
 * 投げる。通信失敗・タイムアウト・中断は設定不備ではないので除外する。
 */
function isConfigError(error: unknown): boolean {
  return (
    error instanceof TypeSafeError &&
    !(error instanceof APIError) &&
    !(error instanceof APIConnectionError) &&
    !(error instanceof APIUserAbortError)
  );
}

/**
 * TypeSafe APIのエラーを、次に取るべき行動が分かるレスポンスに変換する。
 */
export function describeError(error: unknown): ClientError {
  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError ||
    isConfigError(error)
  ) {
    // 設定ミスは利用者ではなくサーバー側の問題なので5xxで返す
    return {
      status: 500,
      error:
        'TypeSafe APIの認証に失敗しました。環境変数 TYPESAFE_API_KEY を確認してください。',
    };
  }

  if (error instanceof RateLimitError) {
    return {
      status: 429,
      error:
        'リクエストが集中しています。しばらく待ってから再度お試しください。',
    };
  }

  return {
    status: 502,
    error: '判定中にエラーが発生しました。しばらくしてから再度お試しください。',
  };
}
