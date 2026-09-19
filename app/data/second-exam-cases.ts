import type { SecondSubject } from "../lib/essay-review";

export type SecondExamCase = {
  id: string; subject: SecondSubject; session: number; question: string; title: string;
  kind: "answer-review" | "answer-mapping" | "mapping";
  answer?: string; observation: string; next: string[]; keywords: string[];
  lectures: string; sources: string[];
};

// Independently written synthetic examples. No personal answers or textbook excerpts.
// These show review organization only, not official grading or professional advice.
export const secondExamCases: SecondExamCase[] = [
  {
    id: "synthetic-medical-01", subject: "MEDICAL", session: 1, question: "DEMO 1", title: "합성 예시 · 관찰과 해석 구분",
    kind: "answer-review", answer: "[가상 답안] 관찰한 내용을 먼저 기록하고, 해석은 별도 문단에 정리한다. 수치가 제시되면 단위도 함께 적는다.",
    observation: "공개 데모를 위해 새로 작성한 답안 구성 예시입니다. 관찰·해석·추가 확인 항목의 구분을 보여줍니다. 실제 환자 정보나 의학적 진단이 아닙니다.",
    next: ["관찰 내용과 해석을 각각 한 문단으로 나누기", "수치와 단위를 함께 썼는지 검토하기"],
    keywords: ["관찰", "해석", "단위", "추가 확인"], lectures: "연결 교재 없음 · 합성 구성 예시",
    sources: ["app/data/second-exam-cases.ts · independently authored synthetic example"],
  },
  {
    id: "synthetic-liability-01", subject: "LIABILITY", session: 1, question: "DEMO 1", title: "합성 예시 · 사실과 쟁점 정리",
    kind: "answer-review", answer: "[가상 답안] 당사자 A와 B를 나누어 사실관계를 정리했다. 적용 근거와 결론은 추가 검토가 필요하다.",
    observation: "가상의 A·B 관계를 이용한 답안 구성 예시입니다. 법적 책임이나 금액을 판단하지 않습니다.",
    next: ["당사자별 확인된 사실을 분리하기", "적용 근거를 확인한 뒤 결론 작성하기"],
    keywords: ["당사자", "사실관계", "쟁점", "근거"], lectures: "연결 교재 없음 · 합성 구성 예시",
    sources: ["app/data/second-exam-cases.ts · independently authored synthetic example"],
  },
  {
    id: "synthetic-auto-01", subject: "AUTO", session: 1, question: "DEMO 1", title: "합성 예시 · 시간 순서 검토",
    kind: "answer-mapping", answer: "[가상 답안] 사건 전·중·후의 관찰을 시간순으로 정리한다. 확인하지 않은 원인은 확정하지 않는다.",
    observation: "합성 검토 메모입니다. 실제 사고 기록, 개인 답안 또는 법적 판단을 포함하지 않습니다.",
    next: ["가정과 확인된 내용을 별도 항목으로 나누기", "빠진 시간 정보가 있는지 확인하기"],
    keywords: ["시간 순서", "관찰", "가정", "검토"], lectures: "연결 교재 없음 · 합성 구성 예시",
    sources: ["app/data/second-exam-cases.ts · independently authored synthetic example"],
  },
  {
    id: "synthetic-third-01", subject: "THIRD", session: 1, question: "DEMO 1", title: "합성 예시 · 근거 연결 준비",
    kind: "mapping",
    observation: "공개 데모에서 답안 미작성 상태를 보여주는 합성 예시입니다. 연결된 교재나 개인 답안이 없습니다.",
    next: ["문항에서 요구하는 내용을 항목별로 정리하기", "공개 가능한 근거를 확보한 뒤 검토 기록 연결하기"],
    keywords: ["요구사항", "근거", "검토 기록"], lectures: "연결 교재 없음 · 합성 구성 예시",
    sources: ["app/data/second-exam-cases.ts · independently authored synthetic example"],
  },
];
