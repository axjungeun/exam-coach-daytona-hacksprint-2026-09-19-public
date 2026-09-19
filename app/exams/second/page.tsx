"use client";

import { TeachingWorkspace } from "../../components/teaching-workspace";
import { ExamStageNavigation } from "../../components/exam-stage-navigation";

export default function SecondExamPage() {
  return <main className="app-shell second-exam-shell">
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-mark">EC</div><div><strong>Exam Coach</strong><span>2차 시험 · 주관식</span></div></div>
      <p className="second-exam-boundary">주관식 답안·강사 검토</p>
    </aside>
    <section className="workspace">
      <ExamStageNavigation stage="second" />
      <header className="topbar"><div><p className="eyebrow">2차 시험 · 주관식</p><h1>답안 분석과 강사 피드백</h1></div></header>
      <div className="review-boundary" role="note"><span><b>SYNTHETIC DEMO · 합성 자료</b> 공개 시연 자료이며 개인 답안·공식 시험 문항·실제 성과를 포함하지 않습니다.</span></div>
      <TeachingWorkspace initialTab="answers" />
    </section>
  </main>;
}
