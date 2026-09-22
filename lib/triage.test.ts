import { describe, expect, it, vi } from 'vitest';
import type { SystemOneResult } from '@typesafe-ai/sdk';
import { triage, type TriageClient } from './triage';
import { TRIAGE_QUESTIONS, type TriageQuestions } from './triage-questions';

/** score の回答(5段階)を組み立てる */
function scoreAnswer(probabilities: [number, number, number, number, number]) {
  const expected = probabilities.reduce((sum, p, index) => sum + p * index, 0);

  return {
    type: 'score' as const,
    score: expected,
    confidence: 0.4,
    legend: { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four' },
    probabilities: Object.fromEntries(probabilities.map((p, i) => [i, p])),
  };
}

const ANSWERS = {
  inquiryType: {
    type: 'choice' as const,
    choice: 'INCIDENT',
    confidence: 0.91,
    probabilities: {
      INCIDENT: 0.91,
      SERVICE_REQUEST: 0.04,
      CHANGE_REQUEST: 0.02,
      QUESTION_SPEC: 0.02,
      QUESTION_HOWTO: 0.01,
      NOTIFICATION: 0,
    },
  },
  targetArea: {
    type: 'choice' as const,
    choice: 'INTEGRATION_BATCH',
    confidence: 0.77,
    probabilities: {
      INTEGRATION_BATCH: 0.77,
      APP_FUNCTION: 0.1,
      WORKFLOW_AUTOMATION: 0.05,
      INFRASTRUCTURE: 0.04,
      ACCOUNT_ACCESS: 0.02,
      SECURITY_COMPLIANCE: 0.01,
      DOCUMENTATION: 0.01,
      COST_CONTRACT: 0,
    },
  },
  urgency: scoreAnswer([0, 0, 0, 0, 1]),
  impact: scoreAnswer([0, 0, 0.5, 0.5, 0]),
  effort: scoreAnswer([1, 0, 0, 0, 0]),
  knowledgeValue: scoreAnswer([0, 0, 0, 1, 0]),
  wantsHuman: { type: 'noul' as const, noul: 0.12 },
  isUrgent: { type: 'noul' as const, noul: 0.93 },
};

function stubClient(): { client: TriageClient; systemOne: ReturnType<typeof vi.fn> } {
  const systemOne = vi.fn().mockResolvedValue({
    model: 'jev-1.13.0',
    answers: ANSWERS,
    usage: { input_tokens: 802, output_tokens: 24 },
  } as unknown as SystemOneResult<TriageQuestions>);

  return { client: { systemOne } as unknown as TriageClient, systemOne };
}

describe('triage', () => {
  it('Jevの回答を画面が使える形に整える', async () => {
    const { client } = stubClient();
    const result = await triage('本番バッチが停止しています', client);

    expect(result.inquiryType.choice).toBe('INCIDENT');
    expect(result.inquiryType.confidence).toBeCloseTo(0.91);
    expect(result.targetArea.choice).toBe('INTEGRATION_BATCH');
    expect(result.wantsHuman).toBeCloseTo(0.12);
    expect(result.isUrgent).toBeCloseTo(0.93);
    expect(result.model).toBe('jev-1.13.0');
    expect(result.usage.inputTokens).toBe(802);
  });

  it('choiceの確率は降順に並べる', async () => {
    const { client } = stubClient();
    const result = await triage('本文', client);

    const probabilities = result.inquiryType.options.map((o) => o.probability);

    expect(probabilities).toEqual([...probabilities].sort((a, b) => b - a));
    expect(result.inquiryType.options[0]?.label).toBe('INCIDENT');
  });

  it('scoreは期待値を0〜1に正規化し、段階は昇順で返す', async () => {
    const { client } = stubClient();
    const result = await triage('本文', client);

    // urgency は段階4に確率が集中しているので期待値4.0 → 正規化1.0
    expect(result.urgency.score).toBeCloseTo(4);
    expect(result.urgency.normalized).toBeCloseTo(1);
    expect(result.effort.normalized).toBeCloseTo(0);
    expect(result.urgency.levels.map((l) => l.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it('前後の空白を落とした本文を、定義済みの質問と一緒に送る', async () => {
    const { client, systemOne } = stubClient();
    await triage('  ログインできません  ', client);

    expect(systemOne).toHaveBeenCalledWith({
      state: { 問い合わせ本文: 'ログインできません' },
      questions: TRIAGE_QUESTIONS,
    });
  });

  it('本文が空ならAPIを呼ばずに例外を投げる', async () => {
    const { client, systemOne } = stubClient();

    await expect(triage('   ', client)).rejects.toThrow();
    expect(systemOne).not.toHaveBeenCalled();
  });
});
