'use client';

import { useState, type FormEvent } from 'react';
import { DecisionPanel } from './components/decision-panel';
import { JevPanel } from './components/jev-panel';
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/lib/decide';
import { SAMPLES } from '@/lib/samples';
import { MAX_TEXT_LENGTH, type TriageResult } from '@/lib/triage';
import styles from './page.module.css';

type ApiError = { error: string };

export default function Page() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<TriageResult | null>(null);
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);

  const tooLong = text.trim().length > MAX_TEXT_LENGTH;
  const canSubmit = text.trim().length > 0 && !tooLong && !isLoading;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setRoundTripMs(null);

    const startedAt = performance.now();

    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      const data: TriageResult | ApiError = await response.json();

      if (!response.ok || 'error' in data) {
        setError('error' in data ? data.error : '判定に失敗しました');
        return;
      }

      setResult(data);
      setRoundTripMs(Math.round(performance.now() - startedAt));
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください。');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <header className={styles.topbar}>
        <h1 className={styles.title}>問い合わせ判定デモ</h1>
        <p className={styles.subtitle}>
          Jev / TypeSafe System One — 判断はモデル、処理はコード
        </p>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.formCard}`}>
            <h2 className={styles.cardTitle}>1. 問い合わせ本文</h2>

            <form className={styles.form} onSubmit={handleSubmit}>
              <textarea
                className={styles.textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="サポート窓口に届いたメール本文を貼り付けてください"
                rows={5}
                aria-label="問い合わせ本文"
              />

              <div className={styles.samples}>
                {SAMPLES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    className={styles.sample}
                    title={sample.hint}
                    onClick={() => setText(sample.body)}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>

              <div className={styles.actions}>
                <button
                  type="submit"
                  className={styles.submit}
                  disabled={!canSubmit}
                >
                  {isLoading ? '判定中…' : '判定する'}
                </button>
                <span className={styles.counter}>
                  {text.trim().length.toLocaleString()} /{' '}
                  {MAX_TEXT_LENGTH.toLocaleString()} 文字
                </span>
              </div>

              {tooLong ? (
                <p className={styles.inlineError}>
                  本文が長すぎます。{MAX_TEXT_LENGTH.toLocaleString()}
                  文字以内にしてください。
                </p>
              ) : null}
            </form>

            <p className={styles.note}>
              本文はこのページから当サーバーへ送られ、サーバーから Jev
              へ渡されます。APIキーはブラウザへ渡しません。
            </p>
          </section>

          <section className={`${styles.card} ${styles.highlight}`}>
            <h2 className={styles.cardTitle}>2. Jev が返した値</h2>

            {error ? <p className={styles.error}>{error}</p> : null}

            {!error && !result ? (
              <p className={styles.placeholder}>
                {isLoading
                  ? 'Jev に問い合わせています…'
                  : '「判定する」を押すと、choice / score / noul の生の値がここに並びます。'}
              </p>
            ) : null}

            {result ? (
              <JevPanel result={result} roundTripMs={roundTripMs} />
            ) : null}
          </section>
        </div>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            3. こちらのコードが決めたこと
            <span className={styles.cardNote}>
              Jev は値を返すだけです。何をするかは、しきい値を使って自分たちのコードが決めます。
            </span>
          </h2>
          <DecisionPanel
            result={result}
            thresholds={thresholds}
            onThresholdsChange={setThresholds}
          />
        </section>

        <footer className={styles.footer}>
          choice / score / noul の定義は lib/triage-questions.ts、しきい値ロジックは
          lib/decide.ts にあります。確率は推定値のため、自動処理に回す前にしきい値を実データで調整してください。
        </footer>
      </main>
    </>
  );
}
