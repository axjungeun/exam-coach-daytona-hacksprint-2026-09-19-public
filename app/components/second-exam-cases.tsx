"use client";

import { useState } from "react";
import { secondExamCases } from "../data/second-exam-cases";
import type { SecondSubject } from "../lib/essay-review";

export function SecondExamCases({ subject }: { subject: SecondSubject }) {
  const cases = secondExamCases.filter(item => item.subject === subject);
  const [id, setId] = useState("");
  const selected = cases.find(item => item.id === id) ?? cases[0];
  if (!selected) return null;
  const labels = { "answer-review": "합성 답안 + 예시 분석", "answer-mapping": "합성 답안 + 개념 매핑", mapping: "합성 개념 매핑 · 답안 미연결" };
  return <section className="second-source-cases" aria-label="합성 주관식 답안과 분석">
    <header><h2>DEMO · 합성 답안·분석</h2><span>{cases.length}개 합성 사례</span></header>
    <p className="source-case-notice">공개 시연용으로 만든 가상 답안과 분석입니다. 개인 기록·교재 발췌·공식 문항이 아니며, 학습 성과나 이번 실행의 AI 진단을 뜻하지 않습니다.</p>
    <label className="source-case-select">분석 사례
      <select value={selected.id} onChange={e => setId(e.target.value)}>
        {cases.map(item => <option key={item.id} value={item.id}>{item.question} · {item.title}</option>)}
      </select>
    </label>
    <h3>{selected.question} · {selected.title}</h3>
    <p className="source-case-kind">{labels[selected.kind]}</p>
    <div className="source-case-columns">
      <section><h4>합성 답안 예시</h4>{selected.answer ? <blockquote>{selected.answer}</blockquote> : <p>연결된 답안 없음 · 아래 내용은 답안 평가가 아닌 문항 매핑입니다.</p>}</section>
      <section><h4>{selected.kind === "answer-review" ? "합성 분석 예시" : "합성 매핑과 검토 지점"}</h4><p>{selected.observation}</p>
        <h4>다음 검토·보강</h4><ul>{selected.next.map(step => <li key={step}>{step}</li>)}</ul>
      </section>
    </div>
    <dl className="source-case-links"><dt>개념</dt><dd>{selected.keywords.join(" · ")}</dd><dt>연결 자료</dt><dd>{selected.lectures}</dd></dl>
    <details><summary>합성 자료 출처</summary><ul>{selected.sources.map(source => <li key={source}>{source}</li>)}</ul><p>DEMO: 새로 작성한 합성 자료입니다. 실제 학습자 성과 집계에 포함하지 않습니다.</p></details>
  </section>;
}
