export const metadata = {
  title: '提示词优化器 | 文生图 & 图生图 & 文生视频 & 图生视频',
  description: '使用 Gemini 2.5 Flash（高阶推理）优化提示词（不生成图片/视频）',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}


