import {
  TypeSafeClient,
  type EntryType,
  type Questions,
  type SystemOneResult,
} from '@typesafe-ai/sdk';

/**
 * 呼び出し側が必要とする TypeSafeClient の最小インターフェース。
 *
 * 実物の `systemOne` は `APIPromise`(`Promise` のサブクラス)を返すためこの型を満たす。
 * テストではこれを満たすスタブを渡し、APIを呼ばずに検証する。
 */
export type JevClientFor<Q extends Questions> = {
  systemOne(request: {
    state: EntryType;
    questions: Q;
  }): Promise<SystemOneResult<Q>>;
};

let cached: TypeSafeClient | undefined;

/**
 * TypeSafe APIクライアントを遅延生成する。
 *
 * TypeSafeClient はコンストラクタでAPIキー(環境変数 TYPESAFE_API_KEY)を検証し、
 * 未設定なら例外を投げる。import時点で生成するとキー不要なビルドやテストまで
 * 失敗するため、初回呼び出し時に生成してモジュール内でキャッシュする。
 *
 * モデルは既定で `jev-latest`。デモの応答を固定したい場合は環境変数
 * TYPESAFE_DEFAULT_MODEL でバージョンを指定する(例: jev-1.13.0)。
 * リトライ(429/5xx/接続エラー)とタイムアウトはSDKの既定に従う。
 */
export function getJevClient(): TypeSafeClient {
  cached ??= new TypeSafeClient();
  return cached;
}
