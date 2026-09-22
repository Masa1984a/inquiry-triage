import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  decide,
  QUEUES,
  type DecisionInput,
  type Thresholds,
} from './decide';
import type { InquiryTypeCode } from './triage-questions';

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    inquiryType: { choice: 'QUESTION_SPEC' as InquiryTypeCode, confidence: 0.95 },
    urgency: { score: 1 },
    impact: { score: 1 },
    effort: { normalized: 0.1 },
    knowledgeValue: { score: 1 },
    wantsHuman: 0.05,
    isUrgent: 0.05,
    ...overrides,
  };
}

describe('decide', () => {
  it('confidenceが高く人手要求も低ければ、種別どおりのキューに振り分ける', () => {
    const decision = decide(input({ inquiryType: { choice: 'INCIDENT', confidence: 0.93 } }));

    expect(decision.needsHumanReview).toBe(false);
    expect(decision.queue).toBe(QUEUES.INCIDENT_RESPONSE);
  });

  it('wants_humanがしきい値以上なら、種別に関係なく人手トリアージへ回す', () => {
    const decision = decide(
      input({ inquiryType: { choice: 'SERVICE_REQUEST', confidence: 0.99 }, wantsHuman: 0.8 }),
    );

    expect(decision.needsHumanReview).toBe(true);
    expect(decision.queue).toBe(QUEUES.HUMAN_TRIAGE);
    expect(decision.firedRules.some((rule) => rule.includes('wants_human'))).toBe(true);
  });

  it('choiceのconfidenceがしきい値未満なら人手トリアージへ回す', () => {
    const decision = decide(
      input({ inquiryType: { choice: 'INCIDENT', confidence: 0.62 } }),
    );

    expect(decision.needsHumanReview).toBe(true);
    expect(decision.queue).toBe(QUEUES.HUMAN_TRIAGE);
    expect(decision.firedRules.some((rule) => rule.includes('confidence'))).toBe(true);
  });

  it('照会はeffortが低いときだけ自動一次回答に回す', () => {
    const cheap = decide(input({ effort: { normalized: 0.2 } }));
    const costly = decide(input({ effort: { normalized: 0.6 } }));

    expect(cheap.queue).toBe(QUEUES.AUTO_ANSWER);
    expect(costly.queue).toBe(QUEUES.SUPPORT_ANSWER);
  });

  it('priorityは ceil((urgency + impact) / 2) で、1〜5に収まる', () => {
    // score は0始まりなので、段階としては urgency=5.0 / impact=4.0
    const decision = decide(input({ urgency: { score: 4 }, impact: { score: 3 } }));

    expect(decision.priority).toBe(5);

    const lowest = decide(input({ urgency: { score: 0 }, impact: { score: 0 } }));

    expect(lowest.priority).toBe(1);
  });

  it('is_urgentがしきい値以上なら至急扱いになり、SLAが当日になる', () => {
    const decision = decide(input({ isUrgent: 0.9 }));

    expect(decision.urgent).toBe(true);
    expect(decision.sla).toContain('当日');
  });

  it('しきい値を変えると同じ入力でも判断が変わる', () => {
    const strict: Thresholds = { ...DEFAULT_THRESHOLDS, wantsHuman: 0.05 };
    const base = input({ wantsHuman: 0.3 });

    expect(decide(base).needsHumanReview).toBe(false);
    expect(decide(base, strict).needsHumanReview).toBe(true);
  });

  it('knowledge_valueが4段階以上ならナレッジ登録候補にする', () => {
    expect(decide(input({ knowledgeValue: { score: 3 } })).knowledgeCandidate).toBe(true);
    expect(decide(input({ knowledgeValue: { score: 2 } })).knowledgeCandidate).toBe(false);
  });

  it('情報共有は受領のみに振り分ける', () => {
    const decision = decide(
      input({ inquiryType: { choice: 'NOTIFICATION', confidence: 0.9 } }),
    );

    expect(decision.queue).toBe(QUEUES.ACKNOWLEDGE);
  });
});
