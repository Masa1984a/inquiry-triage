# 問い合わせ判定デモ (inquiry-triage)

サポート窓口に届く問い合わせメールを、[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
(TypeSafe AI の System One モデル) で判定する Next.js のデモアプリです。

Jevの3つのプリミティブをそのまま分類の3つの項目タイプとして使っています。

- **choice** … 排他的な分類。選択ラベル + 全ラベルの確率分布 + confidence
- **score** … 順序のある段階。確率加重の期待値(小数) + 分布 + confidence
- **noul** … 二値の命題。真である確率1個のみで、**confidence は返らない**

画面は3段構成です。**Jevは値を返すだけで、何をするかはこちらのコードが決めます。**

| 節 | 内容 |
| -- | ---- |
| 1. 問い合わせ本文 | メール本文の入力。サンプル5件を同梱 |
| 2. Jev が返した値 | choice / score / noul の生の値。加工も判断もしていない |
| 3. こちらのコードが決めたこと | しきい値ロジック(`lib/decide.ts`)による振り分け・優先度・SLA。スライダーを動かすとAPIを呼び直さずに再計算する |

## 構成

```
app/
  page.tsx                  3節構成の画面。状態とfetchはここだけが持つ
  api/triage/route.ts       判定API。APIキーはここから先にしか出ない
  components/
    jev-panel.tsx           Jevが返した値をそのまま並べる(判断しない)
    decision-panel.tsx      しきい値ロジックの結果としきい値スライダー
lib/
  triage-questions.ts       Jevに投げる8問の定義。分類を変えるならここ
  triage.ts                 systemOne呼び出しと結果の整形
  decide.ts                 しきい値ロジック。純粋関数でブラウザからも呼ぶ
  api-error.ts              SDKの例外をHTTPステータスと画面メッセージに変換
  triage-request.ts         リクエストボディの検証
  samples.ts                サンプル本文
```

## Jevに投げている8問

| 名前 | 型 | 内容 |
| ---- | -- | ---- |
| `inquiryType` | choice | 問い合わせ種別6分類。判定順と境界ルールをcriteriaに埋め込んである |
| `targetArea` | choice | 対象領域8分類。優先順位をinstructionsに明示 |
| `urgency` | score | 緊急度5段階 |
| `impact` | score | 影響度5段階 |
| `effort` | score | 対応工数5段階 |
| `knowledgeValue` | score | ナレッジ化価値5段階 |
| `wantsHuman` | noul | 人手トリアージに回すべきか |
| `isUrgent` | noul | 当日扱いにすべきか |

8問はサーバー側で並列評価され、**HTTPの往復は1回だけ**です。ただし instructions /
criteria の全文が入力トークンに乗るため、入力コストは問題数にほぼ比例します
(実測で1件あたり入力約2,000トークン)。

### 分類ラベル

`inquiryType` は「送信者がサポート窓口に何を求めているか」で切っています。

| ラベル | 意味 |
| ------ | ---- |
| `INCIDENT` | 稼働中の環境で発生中の事象について、原因と復旧／回避策を求める |
| `SERVICE_REQUEST` | 権限付与・アカウント発行・資材提供など、定型作業の実施を求める |
| `CHANGE_REQUEST` | 製品・資材・ドキュメントそのものの変更を求める |
| `QUESTION_SPEC` | 仕様・制約・設定値など「事実」を知りたい |
| `QUESTION_HOWTO` | 手順・設定方法・推奨・判断基準を知りたい |
| `NOTIFICATION` | 報告・連絡のみ。判断も作業も求めていない |

`targetArea` は一次切り分け先の領域です: `APP_FUNCTION` / `WORKFLOW_AUTOMATION` /
`INTEGRATION_BATCH` / `INFRASTRUCTURE` / `ACCOUNT_ACCESS` / `SECURITY_COMPLIANCE` /
`DOCUMENTATION` / `COST_CONTRACT`。

いずれも自分の運用に合わせて変える前提です。ラベルを足し引きするときは、criteria に
「どの条件で選ぶか」を必ず書いて、選択肢どうしが重ならないようにしてください。

score の criteria は英語(モデルへの指示文)のままで、画面に出す段階の日本語表記は
`SCORE_LEVEL_LABELS` に分けてあります。表示の言い回しを変えても判定結果は動きません。

## しきい値ロジック

`lib/decide.ts` が唯一の判断箇所です。初期値は暫定なので、実データで調整してください。

| しきい値 | 初期値 | 効果 |
| -------- | ------ | ---- |
| `wantsHuman` | 0.50 | noul がこれ以上なら人手トリアージへ |
| `choiceConfidence` | 0.80 | inquiry_type の confidence がこれ未満なら人手トリアージへ |
| `isUrgent` | 0.70 | noul がこれ以上なら至急扱い |
| `autoAnswerEffort` | 0.25 | 照会のうち、正規化したeffortがこれ以下なら自動一次回答へ |

振り分け先は 人手トリアージ / 障害対応 / 運用作業キュー / バグ・要望チケット起票 /
FAQ自動一次回答 / サポートで回答 / 受領のみ の7つ。優先度は
`ceil((urgency + impact) / 2)` で算出します(この式はLLMに計算させません)。

choice は必ずいずれかのラベルを返すため、「どれにも当てはまらない」は
confidence のしきい値割れとして扱い、人手トリアージに送っています。

## ローカル実行

必要なもの: **Node.js 20以上**(`@typesafe-ai/sdk`の要件)と、TypeSafeのAPIキー。

```bash
npm install
cp .env.example .env   # TYPESAFE_API_KEY に発行済みのキーを貼り付ける
npm run dev
```

`http://localhost:3100` を開き、本文を貼るかサンプルボタンを押して「判定する」。

ポートは3100に固定しています。変える場合は `package.json` の `dev` / `start` の
`-p` を書き換えてください。

APIキーは [console.typesafe.ai/keys](https://console.typesafe.ai/keys) で発行します。
`.env` は `.gitignore` 済みなのでコミットされません。シェルの環境変数として渡しても動きます
(その場合 `.env` の値より優先されます)。

```bash
npm run build   # 本番ビルド。APIキーがなくても通る
npm start
npm test        # APIを呼ばないユニットテスト23件
```

## デプロイ

Next.jsが動く環境ならどこでも構いません。デプロイ先で `TYPESAFE_API_KEY` を
シークレットとして設定してください。Vercelの場合、固有の設定ファイルは不要です。

```bash
vercel env add TYPESAFE_API_KEY production
vercel deploy --prod
```

`TYPESAFE_DEFAULT_MODEL` を設定しない場合は `jev-latest` が使われます。デモの応答を
固定したいときは `jev-1.13.0` のようにバージョンを明示してください。

APIキーはサーバー側(`app/api/triage/route.ts` → `lib/jev-client.ts`)でのみ使用しており、
ブラウザには渡していません。

## 環境変数

| 変数 | 必須 | 既定値 | 説明 |
| ---- | ---- | ------ | ---- |
| `TYPESAFE_API_KEY` | ○ | なし | TypeSafeのAPIキー |
| `TYPESAFE_DEFAULT_MODEL` | | `jev-latest` | 使用モデル |
| `TYPESAFE_BASE_URL` | | `https://api.typesafe.ai` | APIのルート。プロキシ経由にする場合のみ |
| `TYPESAFE_LOG_LEVEL` | | `warn` | `debug`にすると本文までログ出力される |

`TYPESAFE_LOG_LEVEL=debug` は**問い合わせ本文がそのままログに出ます**。本文には送信者や
環境の情報が含まれうるため、一時的な調査に限ってください。

## うまく動かないとき

| 症状 | 原因と対処 |
| ---- | ---------- |
| 「TypeSafe APIの認証に失敗しました」 | `TYPESAFE_API_KEY` が未設定か無効です。設定変更後はサーバーを再起動してください |
| 「リクエストが集中しています」 | レート上限(429)です。SDKが自動でリトライしたうえで失敗しています |
| 「判定中にエラーが発生しました」 | 通信エラー・タイムアウト・TypeSafe側の障害です。元の例外はサーバーのコンソールに出ます |
| 「Port 3100 is in use」と出る | 3100が塞がっています。`package.json` の `-p` を別の番号に変えてください |

リトライ(最大2回、429/5xx/接続エラーを指数バックオフ)とタイムアウト(1試行10秒)は
SDKの既定に任せています。変える場合は `lib/jev-client.ts` の `new TypeSafeClient()` に
`timeout` / `retry` を渡してください。

## 既知の制約

- これは判定の動きを見るためのデモです。そのまま自動処理に載せる前に、正解が分かる
  データでしきい値を検証してください。確率は推定値です。
- `npm audit` が警告を出しますが、いずれも開発時の依存(vitest / vite / esbuild、
  およびnext経由のpostcss)に対するものです。解消には `next@16` / `vitest@5` への
  メジャーアップが必要なため、Next.js 15 のままにしてあります。
- 判定結果は保存していません。ブラウザをリロードすると消えます。
- 問い合わせ本文はTypeSafeのAPIに送信されます。個人情報や機密情報を含む本文を扱う
  場合は、データの保持条件をTypeSafe側の規約で確認してください。
