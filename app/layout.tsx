import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "AI Exam Coach | 자격시험 학습 분석 엔진";
const description = "문제은행형 자격시험 풀이 기록을 오답 원인, 취약 개념, 근거 자료, 다음 학습 행동으로 연결하는 AI 학습 분석 엔진";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title,
      description,

    },
    twitter: {
      card: "summary",
      title,
      description,

    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
