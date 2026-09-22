import type { InquiryTypeCode } from './triage-questions';
import type { ChoiceInsight, ScoreInsight, TriageResult } from './triage';

/**
 * Jevが返した値をどう扱うかを決めるしきい値ロジック。
 *
 * Jevは値を返すだけで、ルーティングもSLAも決めない。ここが唯一の判断箇所で、
 * 純粋関数なのでサーバー・ブラウザどちらからも呼べる(画面のスライダーは
 * 再判定せずこの関数だけを再実行している)。
 */

export type Thresholds = {
  /** noul wants_human がこの値以上なら人手トリアージに回す */
  wantsHuman: number;
  /** choice inquiry_type の confidence がこの値未満なら人手トリアージに回す */
  choiceConfidence: number;
  /** noul is_urgent がこの値以上なら至急扱いにする */
  isUrgent: number;
  /** 正規化した effort がこの値以下の照会は自動一次回答に回す */
  autoAnswerEffort: number;
};

/**
 * 初期値。実データで確率と実際の正誤を比較しながら調整することを前提とした暫定値。
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  wantsHuman: 0.5,
  choiceConfidence: 0.8,
  isUrgent: 0.7,
  autoAnswerEffort: 0.25,
};

export const QUEUES = {
  HUMAN_TRIAGE: '人手トリアージ',
  INCIDENT_RESPONSE: '障害対応',
  OPERATION_TASK: '運用作業キュー',
  TICKET: 'バグ/要望チケット起票',
  AUTO_ANSWER: 'FAQ自動一次回答',
  SUPPORT_ANSWER: 'サポートで回答',
  ACKNOWLEDGE: '受領のみ',
} as const;

export type Queue = (typeof QUEUES)[keyof typeof QUEUES];

export type Decision = {
  queue: Queue;
  /** 至急扱いにするか */
  urgent: boolean;
  /** 1〜5。ceil((urgency + impact) / 2) */
  priority: number;
  /** 人手トリアージに回すか */
  needsHumanReview: boolean;
  /** 一次回答の目安 */
  sla: string;
  /** FAQ・ナレッジへの登録候補か */
  knowledgeCandidate: boolean;
  /** 実際に発火したルール。画面に根拠として出す */
  firedRules: string[];
};

/** decide が必要とする値だけを取り出した型。テストで組み立てやすくするため */
export type DecisionInput = {
  inquiryType: Pick<ChoiceInsight<InquiryTypeCode>, 'choice' | 'confidence'>;
  urgency: Pick<ScoreInsight, 'score'>;
  impact: Pick<ScoreInsight, 'score'>;
  effort: Pick<ScoreInsight, 'normalized'>;
  knowledgeValue: Pick<ScoreInsight, 'score'>;
  wantsHuman: number;
  isUrgent: number;
};

export function decide(
  result: DecisionInput,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Decision {
  const firedRules: string[] = [];

  const lowConfidence = result.inquiryType.confidence < thresholds.choiceConfidence;
  const askedForHuman = result.wantsHuman >= thresholds.wantsHuman;

  if (askedForHuman) {
    firedRules.push(
      `noul wants_human ${fmt(result.wantsHuman)} ≥ ${fmt(thresholds.wantsHuman)} → 人手トリアージ`,
    );
  }
  if (lowConfidence) {
    firedRules.push(
      `choice confidence ${fmt(result.inquiryType.confidence)} < ${fmt(thresholds.choiceConfidence)} → 人手トリアージ`,
    );
  }

  const needsHumanReview = askedForHuman || lowConfidence;
  const urgent = result.isUrgent >= thresholds.isUrgent;

  if (urgent) {
    firedRules.push(
      `noul is_urgent ${fmt(result.isUrgent)} ≥ ${fmt(thresholds.isUrgent)} → 至急扱い`,
    );
  }

  const queue = pickQueue(result, thresholds, needsHumanReview, firedRules);

  // score は0始まりなので +1 して1〜5の段階に戻す
  const urgencyLevel = toLevel(result.urgency);
  const impactLevel = toLevel(result.impact);
  const priority = clamp(Math.ceil((urgencyLevel + impactLevel) / 2), 1, 5);

  firedRules.push(
    `priority = ceil((urgency ${urgencyLevel.toFixed(1)} + impact ${impactLevel.toFixed(1)}) / 2) = ${priority}`,
  );

  const knowledgeLevel = toLevel(result.knowledgeValue);
  const knowledgeCandidate = knowledgeLevel >= 4;

  if (knowledgeCandidate) {
    firedRules.push(
      `knowledge_value ${knowledgeLevel.toFixed(1)} ≥ 4.0 → ナレッジ登録候補`,
    );
  }

  return {
    queue,
    urgent,
    priority,
    needsHumanReview,
    sla: toSla(urgent, priority),
    knowledgeCandidate,
    firedRules,
  };
}

function pickQueue(
  result: DecisionInput,
  thresholds: Thresholds,
  needsHumanReview: boolean,
  firedRules: string[],
): Queue {
  if (needsHumanReview) {
    return QUEUES.HUMAN_TRIAGE;
  }

  const type = result.inquiryType.choice;

  switch (type) {
    case 'INCIDENT':
      return QUEUES.INCIDENT_RESPONSE;
    case 'SERVICE_REQUEST':
      return QUEUES.OPERATION_TASK;
    case 'CHANGE_REQUEST':
      return QUEUES.TICKET;
    case 'NOTIFICATION':
      return QUEUES.ACKNOWLEDGE;
    case 'QUESTION_SPEC':
    case 'QUESTION_HOWTO': {
      if (result.effort.normalized <= thresholds.autoAnswerEffort) {
        firedRules.push(
          `effort ${fmt(result.effort.normalized)} ≤ ${fmt(thresholds.autoAnswerEffort)} → 自動一次回答`,
        );
        return QUEUES.AUTO_ANSWER;
      }
      return QUEUES.SUPPORT_ANSWER;
    }
    default:
      // choice のラベルは定義済みの6種だが、モデル側に新ラベルが増えた場合も
      // 落とさず人手に回す
      return QUEUES.HUMAN_TRIAGE;
  }
}

/** 0始まりの期待値を、1〜5の段階に直す */
function toLevel(insight: Pick<ScoreInsight, 'score'>): number {
  return insight.score + 1;
}

/** 一次回答の目安。画面では「一次回答」ラベルと組で出すため期限だけを返す */
function toSla(urgent: boolean, priority: number): string {
  if (urgent) return '当日中';
  if (priority >= 4) return '翌営業日';
  if (priority >= 3) return '3営業日以内';
  return '5営業日以内';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fmt(value: number): string {
  return value.toFixed(2);
}

/** TriageResult をそのまま渡せるようにするための薄いラッパー */
export function decideFromResult(
  result: TriageResult,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Decision {
  return decide(result, thresholds);
}
