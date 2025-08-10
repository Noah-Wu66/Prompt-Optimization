export const metadata = {
  title: '提示词优化器 | 文生图 & 图生图',
  description: '使用 gpt-5（高阶推理）优化提示词并生成图片',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
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


