import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '問い合わせ判定デモ | Jev / TypeSafe System One',
  description:
    'サポート窓口に届く問い合わせを、Jev (TypeSafe System One) の choice / score / noul で判定するデモ。判断はモデル、処理はコード。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
