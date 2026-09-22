import { choice, noul, score } from '@typesafe-ai/sdk';

/**
 * サポート窓口に届く問い合わせメールをJevで判定するための質問定義。
 *
 * Jevの3プリミティブを、分類の3つの項目タイプに対応させている。
 *
 * - `choice` … 排他的な分類。選択ラベル + 全ラベルの確率分布 + confidence
 * - `score`  … 順序のある段階。確率加重の期待値(小数) + 分布 + confidence
 * - `noul`   … 二値の命題。真である確率1個のみ。**confidence は返らない**
 *
 * 質問を何問並べてもサーバー側で並列評価され、HTTPの往復は1回だけ。
 * ただし instructions / criteria の全文が入力トークンに乗るため、
 * 入力コストは問題数にほぼ比例する。
 *
 * 分類の粒度は運用に合わせて変えることを前提にしている。ラベルを足し引きする場合は
 * criteria に「どの条件で選ぶか」を必ず書き、重なりが出ないようにすること。
 */

/** choice-1 inquiry_type の表示名 */
export const INQUIRY_TYPE_LABELS = {
  INCIDENT: '障害・不具合報告',
  SERVICE_REQUEST: '作業依頼',
  CHANGE_REQUEST: '製品改善・修正要求',
  QUESTION_SPEC: '仕様照会',
  QUESTION_HOWTO: '手順・運用方法照会',
  NOTIFICATION: '情報共有・連絡',
} as const;

/** choice-2 target_area の表示名 */
export const TARGET_AREA_LABELS = {
  APP_FUNCTION: 'アプリ機能',
  WORKFLOW_AUTOMATION: 'ワークフロー・自動化',
  INTEGRATION_BATCH: '外部連携・バッチ',
  INFRASTRUCTURE: 'インフラ・環境構築',
  ACCOUNT_ACCESS: 'アカウント・権限・ライセンス',
  SECURITY_COMPLIANCE: 'セキュリティ・コンプライアンス',
  DOCUMENTATION: 'ドキュメント・資材提供',
  COST_CONTRACT: 'コスト・契約・体制',
} as const;

export type InquiryTypeCode = keyof typeof INQUIRY_TYPE_LABELS;
export type TargetAreaCode = keyof typeof TARGET_AREA_LABELS;

/**
 * score の段階を画面に出すための日本語表記。添字が段階の値に対応する。
 *
 * criteria(モデルに渡すルーブリック)は英語のままにしてある。Jevへの指示文と
 * 画面表示を分けておくと、表示の言い回しを変えても判定結果が動かない。
 * 並び・件数は下の score(...) の criteria と必ず一致させること。
 */
export const SCORE_LEVEL_LABELS = {
  urgency: [
    '回答不要（情報共有）',
    '期日なし。次の判断のために回答が要る',
    '作業がブロックされている',
    '数日内の期日が明示されている',
    '本番影響あり、または当日〜翌日の回答要請',
  ],
  impact: [
    '影響なし',
    '送信者本人の作業のみ',
    '一部ユーザー・一部機能（回避策あり）',
    '1機能がチーム全体で使用不可',
    '全ユーザー／本番全体',
  ],
  effort: [
    '即答（既存ドキュメントの提示で足りる）',
    '1時間程度（チーム内で確認）',
    '半日（環境・ログ調査が必要）',
    '数日（開発チームの確認・再現が必要）',
    '週単位（製品改修とリリースが必要）',
  ],
  knowledgeValue: [
    '再利用不可（完全に個別事情）',
    'ほぼ再利用不可（この環境・この時点限り）',
    '類似案件で再利用できる',
    '他案件でも聞かれる可能性が高い',
    '必ず再発する。今すぐ文書化する価値がある',
  ],
} as const;

export const TRIAGE_QUESTIONS = {
  /**
   * 主軸。判定フロー(何が起きているか → 何を求めているか)と、
   * 迷いやすい境界のルールを criteria に埋め込み、
   * 「複数該当して選べない」状態を作らないようにしている。
   */
  inquiryType: choice(
    'Classify what the sender is asking the support desk to do. Evaluate the rules in order and stop at the first one that matches: (1) something is actually broken right now in their environment, (2) they want the support team to perform an operational task, (3) they want the product itself changed, (4) they only want to know something, (5) none of the above.',
    {
      INCIDENT:
        "Something in the sender's already-running environment is not working as expected right now, and they want the cause found, service restored, or a workaround. Error messages, failing steps, or logs are usually quoted. If an error is mentioned only as background for asking someone else to do a task, this is not the right label.",
      SERVICE_REQUEST:
        'They want the support team to carry out a routine operational task that only the support team can do: granting access or permissions, issuing accounts or license keys, approving a request, allow-listing IP addresses, or delivering build artefacts, documents, or figures. No change to the product itself is involved.',
      CHANGE_REQUEST:
        'They want the product, its build artefacts, or its documentation permanently changed: a new feature, a fix released for a defect, or a correction to a written procedure. Includes the case where their own environment is already worked around and only the permanent fix is still wanted.',
      QUESTION_SPEC:
        'Nothing is broken and no task is being requested. They want to know a fact about the current product: a specification, a limit, a setting value, a definition, or whether something is possible. The answer is complete once that value or yes/no is given.',
      QUESTION_HOWTO:
        'Nothing is broken and no task is being requested. They want to know how to do something: a procedure, a configuration method, a recommended setting, or a criterion for deciding. The answer needs steps or judgement, not just a value. Prefer this over QUESTION_SPEC when the message asks for both.',
      NOTIFICATION:
        'A report or announcement only. The sender is not asking the support team to judge, decide, fix, or perform anything; an acknowledgement is all that is needed. If any correction, confirmation, or decision is being requested, use the matching label instead, even when the subject line says it is only for information.',
    },
  ),

  /**
   * 対象領域。一次切り分け先を決めるための軸。
   * 複数領域にまたがる場合の優先順位を instructions に明示している。
   */
  targetArea: choice(
    'Which knowledge domain does the support team need in order to answer this? If several apply, pick the one that needs the most specialist knowledge, in this order of precedence: SECURITY_COMPLIANCE > INTEGRATION_BATCH > WORKFLOW_AUTOMATION > APP_FUNCTION > INFRASTRUCTURE > ACCOUNT_ACCESS > DOCUMENTATION > COST_CONTRACT.',
    {
      APP_FUNCTION:
        "The product's own screens and features: sign-in, navigation, notifications, search, file upload and ingestion, data management, chat or messaging.",
      WORKFLOW_AUTOMATION:
        'Building automations inside the product: workflow or pipeline definitions, custom scripts, templates, importing and exporting definitions, rule or model configuration.',
      INTEGRATION_BATCH:
        'Scheduled jobs and integration with external systems: batch runs and their failures, API or webhook integration, synchronisation with a third-party system.',
      INFRASTRUCTURE:
        'The hosting environment: provisioning templates, networking, certificates, databases and migrations, installation and upgrade procedures.',
      ACCOUNT_ACCESS:
        'Accounts, group membership, role assignments, IP allow lists, license keys and their issuance.',
      SECURITY_COMPLIANCE:
        'Security requirements and assessments: vulnerability scans, password policy, multi-factor authentication, data classification, secret handling.',
      DOCUMENTATION:
        'Delivery of documents or build artefacts: version-specific packages, installation guides, user manuals, reference material.',
      COST_CONTRACT:
        'Cost, licensing fees, staffing, division of responsibility between teams, release planning and schedules.',
    },
  ),

  /** 緊急度。段階0〜4が1〜5に対応する */
  urgency: score(
    'How quickly does this inquiry need a reply, judging only from what the sender says about timing and blockage?',
    [
      'No reply is needed for the sender to keep working; it is shared for information',
      'No deadline is stated, but the sender needs an answer before their next decision',
      'The sender is blocked: their build, development, or test work cannot continue',
      'A concrete deadline within a few days is stated, such as a release or assessment due date',
      'Production is affected right now, or a reply is explicitly wanted today or tomorrow',
    ],
  ),

  /** 影響度 */
  impact: score('How wide is the impact of the situation described?', [
    'No impact; the message is informational',
    "Only the sender's own work is affected",
    'Some users or one function are affected, and a workaround exists',
    'One function is entirely unusable for the team',
    'All users or the whole production environment are affected',
  ]),

  /** 対応工数の見込み */
  effort: score('How much work will answering this take for the support team?', [
    'Immediate: pointing at an existing document or a known value is enough',
    'Short: the support team can confirm internally and answer within about an hour',
    'Medium: the environment or logs have to be investigated, roughly half a day',
    'Large: the development team has to confirm or reproduce it, several days',
    'Very large: the product has to be changed and released',
  ]),

  /** ナレッジ化価値。FAQ/ナレッジへの投入優先度に使う */
  knowledgeValue: score(
    'How valuable would it be to turn the answer to this inquiry into a reusable FAQ or knowledge-base entry?',
    [
      'Not reusable: entirely specific to one person or one request',
      'Barely reusable: specific to this environment at this moment',
      'Reusable within similar projects',
      'Likely to be asked again by other projects',
      'Certain to recur: a general limit, procedure, or investigation method worth documenting now',
    ],
  ),

  /**
   * noul。人手レビューに回すかどうかの二値判定。
   * confidence は返らないので、しきい値はこの確率そのものに掛ける。
   */
  wantsHuman: noul(
    'Should this inquiry be put in front of a human triager before any automated reply or routing is applied?',
    {
      true: 'The message is ambiguous, unreadable, or mixes several independent requests; or it carries contractual, security, or customer-relationship weight that a person should judge.',
      false:
        'The intent is stated plainly enough that a rule-based routing decision can be trusted.',
    },
  ),

  /** noul。至急扱いにするかどうかの二値判定 */
  isUrgent: noul(
    'Does this inquiry need to be handled today, ahead of the normal queue?',
    {
      true: 'Production or a hard deadline is at stake, or the sender explicitly asks for a same-day response.',
      false: 'It can wait for the normal support queue without harming the sender.',
    },
  ),
} as const;

export type TriageQuestions = typeof TRIAGE_QUESTIONS;
