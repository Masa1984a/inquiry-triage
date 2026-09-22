import { NextResponse } from 'next/server';
import { describeError } from '@/lib/api-error';
import { triage } from '@/lib/triage';
import { parseTriageRequest } from '@/lib/triage-request';

/**
 * 判定API。APIキーはこのサーバー側だけで使い、ブラウザには渡さない。
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が正しくありません' },
      { status: 400 },
    );
  }

  const parsed = parseTriageRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await triage(parsed.text);
    return NextResponse.json(result);
  } catch (error) {
    // 本文には顧客の環境情報が含まれうるため、ログに出すのは例外のみに留める
    console.error('triage failed:', error);
    const { status, error: message } = describeError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
