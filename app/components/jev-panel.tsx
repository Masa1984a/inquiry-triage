import type { ChoiceInsight, ScoreInsight, TriageResult } from '@/lib/triage';
import {
  INQUIRY_TYPE_LABELS,
  SCORE_LEVEL_LABELS,
  TARGET_AREA_LABELS,
} from '@/lib/triage-questions';
import styles from './jev-panel.module.css';

type Props = {
  result: TriageResult;
  /** ブラウザ側で測った往復時間。サーバーとの通信を含む */
  roundTripMs: number | null;
};

/**
 * Jevが返した値をそのまま並べるパネル。
 * ここでは一切の判断をしない(しきい値の適用は DecisionPanel 側)。
 */
export function JevPanel({ result, roundTripMs }: Props) {
  const typeLabel = INQUIRY_TYPE_LABELS[result.inquiryType.choice];

  return (
    <div className={styles.panel}>
      <Row label="inquiry_type">
        <span className={styles.headline}>{typeLabel}</span>
        <code className={styles.code}>{result.inquiryType.choice}</code>
      </Row>

      <Row label="confidence">
        <Bar value={result.inquiryType.confidence} />
        <span className={styles.big}>
          {result.inquiryType.confidence.toFixed(2)}
        </span>
      </Row>

      <Row label="probabilities">
        <Probabilities
          insight={result.inquiryType}
          labels={INQUIRY_TYPE_LABELS}
        />
      </Row>

      <hr className={styles.rule} />

      <Row label="target_area">
        <span className={styles.mid}>
          {TARGET_AREA_LABELS[result.targetArea.choice]}
        </span>
        <span className={styles.muted}>
          確信度 {result.targetArea.confidence.toFixed(2)}
        </span>
      </Row>

      <Row label="probabilities">
        <Probabilities
          insight={result.targetArea}
          labels={TARGET_AREA_LABELS}
          limit={2}
        />
      </Row>

      <hr className={styles.rule} />

      <ScoreRow
        name="urgency"
        insight={result.urgency}
        levelLabels={SCORE_LEVEL_LABELS.urgency}
      />
      <ScoreRow
        name="impact"
        insight={result.impact}
        levelLabels={SCORE_LEVEL_LABELS.impact}
      />
      <ScoreRow
        name="effort"
        insight={result.effort}
        levelLabels={SCORE_LEVEL_LABELS.effort}
      />
      <ScoreRow
        name="knowledge_value"
        insight={result.knowledgeValue}
        levelLabels={SCORE_LEVEL_LABELS.knowledgeValue}
      />

      <hr className={styles.rule} />

      <Row label="noul">
        <span className={styles.noulName}>wants_human</span>
        <span className={styles.big}>{result.wantsHuman.toFixed(2)}</span>
        <span className={styles.noulName}>is_urgent</span>
        <span className={styles.big}>{result.isUrgent.toFixed(2)}</span>
        <span className={styles.note}>← Noul に confidence はありません</span>
      </Row>

      <p className={styles.meta}>
        model {result.model} ／ 入力 {result.usage.inputTokens.toLocaleString()}{' '}
        トークン ／ 往復{' '}
        {roundTripMs === null ? '—' : `${roundTripMs.toLocaleString()}ms`}
        （通信込み） ／ 検査 {result.jevLatencyMs.toLocaleString()}ms
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{children}</span>
    </div>
  );
}

function ScoreRow({
  name,
  insight,
  levelLabels,
}: {
  name: string;
  insight: ScoreInsight;
  /** 段階の日本語表記。添字が段階の値。無ければモデルに渡したルーブリック原文を出す */
  levelLabels?: readonly string[];
}) {
  const top = insight.levels.length - 1;
  const level = insight.levels.find((l) => l.value === insight.likeliest);
  const levelText = levelLabels?.[insight.likeliest] ?? level?.label;

  return (
    <Row label={`${name} (score)`}>
      <span className={styles.big}>{insight.normalized.toFixed(2)}</span>
      <span className={styles.muted}>
        ／ 確信度 {insight.confidence.toFixed(2)}
      </span>
      <span className={styles.levelNote} title={levelText}>
        段階 {insight.score.toFixed(2)} / {top}
        {levelText ? `・${levelText}` : ''}
      </span>
    </Row>
  );
}

function Probabilities<L extends string>({
  insight,
  labels,
  limit,
}: {
  insight: ChoiceInsight<L>;
  labels: Record<L, string>;
  limit?: number;
}) {
  const shown = limit ? insight.options.slice(0, limit) : insight.options;
  const hidden = insight.options.length - shown.length;

  return (
    <span className={styles.probabilities}>
      {shown.map((option) => (
        <span key={option.label} className={styles.probability}>
          <span className={styles.probabilityLabel}>{labels[option.label]}</span>
          <span className={styles.probabilityValue}>
            {(option.probability * 100).toFixed(1)}%
          </span>
        </span>
      ))}
      {hidden > 0 ? (
        <span className={styles.muted}>ほか {hidden} 件</span>
      ) : null}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value * 100));

  return (
    <span className={styles.bar} aria-hidden="true">
      <span className={styles.barFill} style={{ width: `${width}%` }} />
    </span>
  );
}
