export function ExamStageNavigation({ stage }: { stage: "first" | "second" }) {
  return <nav className="exam-stage-navigation" aria-label="시험 단계">
    <a href="/exams/first" aria-current={stage === "first" ? "page" : undefined}>1차 시험<span>객관식</span></a>
    <a href="/exams/second" aria-current={stage === "second" ? "page" : undefined}>2차 시험<span>주관식</span></a>
  </nav>;
}
