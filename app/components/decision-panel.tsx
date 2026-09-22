'use client';

import {
  DEFAULT_THRESHOLDS,
  decideFromResult,
  type Thresholds,
} from '@/lib/decide';
import type { TriageResult } from '@/lib/triage';
import styles from './decision-panel.module.css';

type Props = {
  result: TriageResult | null;
  thresholds: Thresholds;
  onThresholdsChange: (next: Thresholds) => void;
};

const SLIDERS: {
  key: keyof Thresholds;
  label: string;
  description: string;
}[] = [
  {
    key: 'wantsHuman',
    label: 'wants_human ≥',
    description: '人手トリアージに回す',
  },
  {
    key: 'choiceConfidence',
    label: 'confidence <',
    description: '確信度不足も人手へ',
  },
  {
    key: 'isUrgent',
    label: 'is_urgent ≥',
    description: '至急扱いにする',
  },
  {
    key: 'autoAnswerEffort',
    label: 'effort ≤',
    description: '照会を自動一次回答へ',
  },
];

/**
 * しきい値ロジックの結果を見せるパネル。
 *
 * スライダーを動かしてもAPIは呼び直さない。同じJevの値に対して
 * decide() を再実行するだけで表示が変わる ＝「判断はモデル、処理はコード」。
 */
export function DecisionPanel({
  result,
  thresholds,
  onThresholdsChange,
}: Props) {
  const decision = result ? decideFromResult(result, thresholds) : null;

  return (
    <div className={styles.columns}>
      <div className={styles.outcome}>
        {decision ? (
          <>
            <div className={styles.chips}>
              <Chip label="振り分け先" value={decision.queue} tone="primary" />
              <Chip
                label="至急"
                value={decision.urgent ? 'はい' : 'いいえ'}
                tone={decision.urgent ? 'danger' : 'plain'}
              />
              <Chip
                label="優先度"
                value={`P${decision.priority}`}
                tone="plain"
              />
              <Chip label="一次回答" value={decision.sla} tone="plain" />
              <Chip
                label="ナレッジ登録"
                value={decision.knowledgeCandidate ? '候補' : '対象外'}
                tone={decision.knowledgeCandidate ? 'ok' : 'plain'}
              />
            </div>

            <ul className={styles.rules}>
              {decision.firedRules.map((rule) => (
                <li key={rule} className={styles.rule}>
                  {rule}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.placeholder}>
            判定すると、ここに振り分け先・優先度・SLAと、発火したルールが出ます。
          </p>
        )}
      </div>

      <div className={styles.thresholds}>
        <div className={styles.thresholdsHead}>
          <h3 className={styles.thresholdsTitle}>しきい値</h3>
          <button
            type="button"
            className={styles.reset}
            onClick={() => onThresholdsChange(DEFAULT_THRESHOLDS)}
          >
            初期値に戻す
          </button>
        </div>

        <div className={styles.sliders}>
          {SLIDERS.map((slider) => (
            <label key={slider.key} className={styles.slider}>
              <span className={styles.sliderLabel}>
                {slider.label}{' '}
                <strong className={styles.sliderValue}>
                  {thresholds[slider.key].toFixed(2)}
                </strong>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={thresholds[slider.key]}
                onChange={(event) =>
                  onThresholdsChange({
                    ...thresholds,
                    [slider.key]: Number(event.target.value),
                  })
                }
              />
              <span className={styles.sliderDescription}>
                {slider.description}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'danger' | 'ok' | 'plain';
}) {
  return (
    <div className={`${styles.chip} ${styles[tone]}`}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>{value}</span>
    </div>
  );
}
