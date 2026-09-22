import { getJevClient, type JevClientFor } from './jev-client';
import {
  TRIAGE_QUESTIONS,
  type InquiryTypeCode,
  type TargetAreaCode,
  type TriageQuestions,
} from './triage-questions';

/** テストで差し替えるためのクライアント型 */
export type TriageClient = JevClientFor<TriageQuestions>;

/** 1件の選択肢とその確率 */
export type ChoiceOption<L extends string = string> = {
  label: L;
  probability: number;
};

/** choice の判定結果。confidence は選ばれたラベルへの確信度 */
export type ChoiceInsight<L extends string = string> = {
  choice: L;
  confidence: number;
  /** 確率の降順 */
  options: ChoiceOption<L>[];
};

/** 段階ごとの確率。`value` が段階の値、`label` はルーブリックの説明文 */
export type ScoreLevel = {
  value: number;
  label: string;
  probability: number;
};

/** score の判定結果 */
export type ScoreInsight = {
  /** 確率加重の期待値。段階の間の小数になりうる (例: 2.4) */
  score: number;
  /** 期待値を0〜1に正規化した値。しきい値と画面のバーに使う */
  normalized: number;
  /** 最も確率が高い段階 */
  likeliest: number;
  /** 期待値に対する確信度。「自信を持って中間」と「判断がつかない」を区別できる */
  confidence: number;
  /** 段階の昇順 */
  levels: ScoreLevel[];
};

export type TriageResult = {
  /** 判定対象の本文(前後の空白を除いたもの) */
  text: string;
  inquiryType: ChoiceInsight<InquiryTypeCode>;
  targetArea: ChoiceInsight<TargetAreaCode>;
  urgency: ScoreInsight;
  impact: ScoreInsight;
  effort: ScoreInsight;
  knowledgeValue: ScoreInsight;
  /** noul: 人手トリアージに回すべきという命題が真である確率。confidence はない */
  wantsHuman: number;
  /** noul: 至急扱いにすべきという命題が真である確率。confidence はない */
  isUrgent: number;
  /** 8問すべてを1リクエストで評価したときの消費トークン */
  usage: { inputTokens: number; outputTokens: number };
  /** サーバーからJevへの往復(ミリ秒)。ブラウザ〜サーバー間は含まない */
  jevLatencyMs: number;
  model: string;
};

/** 画面とAPIで共有する本文の長さ上限 */
export const MAX_TEXT_LENGTH = 8000;

/**
 * 問い合わせ本文をJevで判定する(1リクエスト・8問)。
 *
 * ここでは値を取り出して整形するだけで、「どう扱うか」は決めない。
 * ルーティングやSLAの判断は lib/decide.ts のしきい値ロジックが行う。
 *
 * 注意: リトライ(429/5xx/接続エラー)とタイムアウトはSDKが既定で処理するため、
 * ここでは再試行を実装しない。
 */
export async function triage(
  rawText: string,
  client?: TriageClient,
): Promise<TriageResult> {
  const text = rawText.trim();

  if (!text) {
    throw new Error('問い合わせ本文は空にできません');
  }

  const jev = client ?? getJevClient();
  const startedAt = performance.now();

  const result = await jev.systemOne({
    state: { 問い合わせ本文: text },
    questions: TRIAGE_QUESTIONS,
  });

  const jevLatencyMs = Math.round(performance.now() - startedAt);
  const { answers } = result;

  return {
    text,
    inquiryType: toChoiceInsight<InquiryTypeCode>(answers.inquiryType),
    targetArea: toChoiceInsight<TargetAreaCode>(answers.targetArea),
    urgency: toScoreInsight(answers.urgency),
    impact: toScoreInsight(answers.impact),
    effort: toScoreInsight(answers.effort),
    knowledgeValue: toScoreInsight(answers.knowledgeValue),
    wantsHuman: answers.wantsHuman.noul,
    isUrgent: answers.isUrgent.noul,
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    },
    jevLatencyMs,
    model: result.model,
  };
}

function toScoreInsight(answer: {
  readonly score: number;
  readonly confidence: number;
  readonly legend: Readonly<Record<string, unknown>>;
  readonly probabilities: Readonly<Record<string, number>>;
}): ScoreInsight {
  const levels: ScoreLevel[] = Object.entries(answer.probabilities)
    .map(([key, probability]) => ({
      value: Number(key),
      label: asText(answer.legend[key]),
      probability,
    }))
    .sort((a, b) => a.value - b.value);

  // 段階は0始まりなので、最大値は「段階数 - 1」。1段階しかない場合の0除算を避ける。
  const top = Math.max(levels.length - 1, 1);

  return {
    score: answer.score,
    normalized: clamp01(answer.score / top),
    likeliest: argmax(levels)?.value ?? 0,
    confidence: answer.confidence,
    levels,
  };
}

function toChoiceInsight<L extends string>(answer: {
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}): ChoiceInsight<L> {
  return {
    choice: answer.choice as L,
    confidence: answer.confidence,
    options: Object.entries(answer.probabilities)
      .map(([label, probability]) => ({ label: label as L, probability }))
      .sort((a, b) => b.probability - a.probability),
  };
}

/** 確率が最大の要素。空配列なら undefined */
function argmax<T extends { probability: number }>(items: T[]): T | undefined {
  return items.reduce<T | undefined>(
    (best, item) => (best && best.probability >= item.probability ? best : item),
    undefined,
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** ルーブリックの説明文は文字列以外も取りうるため、表示用に文字列化する */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
