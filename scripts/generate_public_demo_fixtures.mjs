/** Rebuild public fixtures using only independently authored practice questions.
 * Run from repository root: node scripts/generate_public_demo_fixtures.mjs
 * No network, private files, personal records, or copyrighted textbooks are read.
 */
import fs from 'node:fs';
const dir = new URL('../app/data/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, dir), 'utf8'));
const write = (name, data) => fs.writeFileSync(new URL(name, dir), JSON.stringify(data, null, 2) + '\n');
const practice = read('public-practice-questions.json');
const options = ['①', '②', '③', '④'];
const subjectCodes = ['BIZ', 'CONTRACT', 'THEORY'];
const generatedDate = '2026-09-19';
const notice = '합성 데모 데이터입니다. 54개의 독립 제작 연습문항을 반복 배치한 1,200개 레코드이며, 공식 기출·개인 답안·실제 학습 이력이 아닙니다. 회차 40~49는 호환성용 가상 슬롯입니다.';
const metadata = { contentMode: 'synthetic_demo', rightsStatus: 'independently_authored_templates', generatedDate, notice, distinctTemplateCount: practice.questions.length, containsPersonalRecords: false, containsOfficialExamQuestions: false, containsTextbookExcerpts: false };
const questions = [];
for (let round = 40; round <= 49; round++) {
  for (const subjectCode of subjectCodes) {
    const templates = practice.questions.filter(q => q.subjectCode === subjectCode);
    for (let no = 1; no <= 40; no++) {
      const source = templates[((round - 40) * 40 + no - 1) % templates.length];
      questions.push({ id: `${round}-${subjectCode}-${String(no).padStart(2, '0')}`, round,
        subject: source.subject, subjectCode, questionNo: no,
        questionText: `[합성 데모] ${source.prompt}`,
        presentation: { prompt: `[합성 데모] ${source.prompt}`, context: source.context ? { label: '사례', text: source.context.text } : null,
          dataTable: source.dataTable, statements: source.statements, structure: source.dataTable ? 'context-data' : source.statements.length ? 'korean-statements' : 'context-only' },
        choices: source.choices, answer: source.answer, acceptedAnswers: source.acceptedAnswers,
        domain: source.domain, concept: source.concept, keywords: source.keywords,
        trapType: '합성 예시 선택지 비교', numericType: '없음', questionForm: '합성 연습문항',
        sourceFile: 'app/data/public-practice-questions.json', sourceTemplateId: source.id,
        classificationSource: '독립 제작 연습문항의 공개 메타데이터', contentMode: 'synthetic_demo',
      });
    }
  }
}
write('exam-questions-40-49.json', { metadata: { ...metadata, scope: '합성 3과목 × 10개 가상 슬롯 × 40레코드', count: questions.length }, questions });
const roundQuestions = questions.filter(q => q.round === 48);
write('keyword-map.json', { metadata: { ...metadata, title: '합성 데모 문항별 개념 연결', questionCount: roundQuestions.length, subjects: subjectCodes.map(s => questions.find(q => q.subjectCode === s).subject), scope: '공개 연습문항 메타데이터 기반 합성 연결', sourceDirectory: 'app/data/public-practice-questions.json', originalFilesModified: false },
  taxonomy: { dimensions: ['가상슬롯', '과목', '공개연습개념'], numericTypes: ['없음'] },
  questions: roundQuestions.map(q => ({ ...q, examStage: '합성 1차 데모', calculationPatternId: '', reviewStatus: '합성 예시', tagConfidence: '데모', sourceNote: notice })),
  calculationPatterns: [], qualityIssues: [],
});
const theory = roundQuestions.filter(q => q.subjectCode === 'THEORY');
const statusRules = [
  { status: '고정취약', score: 100, nextAction: '합성 예시의 정답 선택지와 비교하기' },
  { status: '불안정', score: 90, nextAction: '합성 예시의 선택 이유를 다시 확인하기' },
  { status: '미학습', score: 85, nextAction: '연습문항 선택지를 읽어보기' },
  { status: '미복습', score: 80, nextAction: '연습문항을 다시 풀어보기' },
  { status: '개선', score: 50, nextAction: '합성 기록에서 바뀐 선택지를 비교하기' },
  { status: '1회독 정답', score: 30, nextAction: '연습문항을 한 번 더 확인하기' },
  { status: '안정', score: 10, nextAction: '다른 연습문항 살펴보기' },
];
const diagnostics = theory.map((q, i) => {
  const correct = options.indexOf(q.answer) + 1;
  const wrong = correct % 4 + 1;
  const status = i % 5 === 0 ? '불안정' : i % 5 === 1 ? '개선' : '안정';
  const attempts = status === '불안정' ? [correct, wrong, null] : status === '개선' ? [wrong, correct, null] : [correct, correct, null];
  const rule = statusRules.find(s => s.status === status);
  return { id: q.id, round: q.round, questionNo: q.questionNo, correct, attempts,
    results: attempts.map(a => a === null ? '미입력' : a === correct ? '정답' : '오답'),
    status, priorityScore: rule.score, priority: rule.score >= 85 ? '높음' : rule.score >= 50 ? '보통' : '낮음',
    domain: q.domain, concept: q.concept, keywords: q.keywords, questionForm: q.questionForm,
    trapType: q.trapType, numericType: '없음', diagnosis: `합성 기록 예시: ${status}`, nextAction: rule.nextAction,
    lectureSearchQuery: `공개 연습문항 ${q.concept}`, lectureResourceId: null,
    sourceNote: '프로그램으로 생성한 가상 선택 기록. 실제 학습자가 아님.', questionText: q.questionText, contentMode: 'synthetic_demo' };
});
const countStatuses = Object.fromEntries(statusRules.map(s => [s.status, diagnostics.filter(d => d.status === s.status).length]));
write('diagnosis.json', { metadata: { ...metadata, title: '합성 데모 선택 기록', sourceAnswerWorkbook: '없음: 프로그램 생성', sourceKeywordMap: 'app/data/public-practice-questions.json', originalFilesModified: false },
  summary: { attemptScores: { first: diagnostics.filter(d => d.attempts[0] === d.correct).length, second: diagnostics.filter(d => d.attempts[1] === d.correct).length, third: 0 }, statusCounts: countStatuses,
    highPriorityCount: diagnostics.filter(d => d.priorityScore >= 85).length, reviewQueueCount: diagnostics.filter(d => d.status !== '안정').length },
  rules: { statusRules, numericWeights: [{ numericType: '없음', weight: 0 }], priorityRules: [{ priority: '높음', minimumScore: 85 }, { priority: '보통', minimumScore: 50 }, { priority: '낮음', minimumScore: 0 }], wHandling: '합성 예시는 선택 번호를 명시함' },
  diagnostics, reviewQueue: diagnostics.filter(d => d.status !== '안정'),
});
const attempts = [];
for (let round = 43; round <= 48; round++) {
  const roundTheory = questions.filter(q => q.round === round && q.subjectCode === 'THEORY');
  for (const attemptNo of [1, 2]) {
    const records = roundTheory.map((q, i) => {
      const correct = attemptNo === 1 ? i % 3 !== 0 : i % 5 !== 0;
      const selectedChoice = correct ? q.answer : options[(options.indexOf(q.answer) + 1) % 4];
      return { questionId: q.id, questionNo: q.questionNo, concept: q.concept, domain: q.domain, rawEntry: String(options.indexOf(selectedChoice) + 1), selectedChoice, correct, acceptedAnswers: q.acceptedAnswers, recordState: 'answered', contentMode: 'synthetic_demo' };
    });
    const score = records.filter(r => r.correct).length;
    attempts.push({ id: `synthetic-${round}-THEORY-${attemptNo}`, round, subject: roundTheory[0].subject, subjectCode: 'THEORY', attemptNo, score, total: 40, percentage: score / 40 * 100,
      recordCount: 40, choiceCount: 40, unknownMarkCount: 0, sourceSheet: '합성 데모 생성기', recordedAt: null, records, contentMode: 'synthetic_demo' });
  }
}
write('legacy-attempts.json', { metadata: { ...metadata, title: '합성 데모 풀이 기록', sourceType: '합성 데모', sourceFile: 'scripts/generate_public_demo_fixtures.mjs', subject: '손해사정이론', subjectCode: 'THEORY', rounds: [43,44,45,46,47,48], attemptCount: attempts.length, questionRecordCount: 480, explicitChoiceCount: 480, unknownMarkCount: 0,
  averageScore: attempts.reduce((s,a) => s + a.score, 0) / attempts.length, answerKeyChecks: 0, gradingSource: '독립 제작 연습문항의 데모 정답', originalWorkbookModified: false, recordedAtPolicy: '실제 학습 날짜 없음', unknownMarkPolicy: '합성 예시는 미상 선택 없음' }, attempts });
const choiceQuestions = {};
for (const q of theory) {
  choiceQuestions[q.id] = { axis: '합성 선택지 비교', correctPrinciple: `이 공개 연습문항의 설정된 답은 ${q.answer}입니다. 실제 학습자 진단이 아닌 화면 흐름 예시입니다.`,
    choices: Object.fromEntries(options.filter(o => o !== q.answer).map(o => [o, {
      diagnosis: '합성 예시: 설정된 정답과 선택이 다름', whyWrong: `선택한 ${o}와 설정된 정답 ${q.answer}를 비교하는 데모입니다.`,
      misconception: '선택 기록만으로 학습자의 오개념을 확정하지 않습니다.', selectedInterpretation: `합성 선택 ${o}`,
      focusTerms: q.keywords, reasoningSteps: ['문항 조건 확인', '선택지의 차이 비교', '필요한 개념을 강사와 검토'],
    }])) };
}
write('choice-diagnostics.json', { metadata: { ...metadata, title: '합성 선택지 비교 예시', method: '공개 템플릿 정답과 선택 비교', scope: '실제 오개념 판단이나 강사 검수가 아님', questionCount: theory.length }, questions: choiceQuestions });
write('exam-concept-notes.json', {});
for (const file of ['lecture-evidence-index.json', 'lecture-evidence-top.json']) write(file, { metadata: { ...metadata, title: '공개 데모: 교재 근거 없음', sourceCatalog: '', sourcePolicy: '비공개 교재·강의 발췌를 포함하지 않음', sourceFilesModified: false, questionCount: 0, indexedPageCount: 0, candidateCountPerQuestion: 0 }, matches: {} });
const vocabulary = read('exam-vocabulary-standard.json');
vocabulary.metadata = { ...vocabulary.metadata, title: '공개 연습문항 표준 어휘', referenceScope: 'app/data/public-practice-questions.json의 독립 제작 연습문항', displayRule: '표준 용어만 표시하며, 강사별 표현이나 비공개 자료를 사용하지 않는다.' };
write('exam-vocabulary-standard.json', vocabulary);
practice.metadata = { ...practice.metadata, notice: '독립 제작한 54개 MVP 연습문항입니다. 공식 기출문항이나 개인 학습 기록이 아닙니다. 시험 대비 정확성은 별도 검토가 필요합니다.' };
write('public-practice-questions.json', practice);
write('daytona-hacksprint-evidence.json', {
  event: 'Daytona HackSprint Seoul 2026 — public synthetic edition', verifiedAtKst: '미실행: 공개 합성 데이터', provider: 'Daytona Sandbox (not run)', keyScope: 'Set your own sandbox API key', sandboxId: '', command: 'POST /api/daytona-hacksprint', sourcePath: 'app/data/exam-questions-40-49.json',
  result: { questionCount: 0, uniqueIds: 0, subjectCount: 0, roundRange: 'not-run', invalidChoiceCounts: 0, missingAnswers: 0, valid: false },
  secretBoundary: 'No private exam questions, personal records, textbook passages, API keys, or account IDs are included. This placeholder is not a live receipt.', contentMode: 'synthetic_demo', executionStatus: 'not-run',
});
write('sponsor-readiness.json', { schemaVersion: 1, project: 'Exam Coach public synthetic demo', generatedAt: null, mode: 'dry-run', adapterReadyCount: 2, configuredCount: 0, verifiedCount: 0, failedCount: 0,
  integrations: [{ id: 'daytona', name: 'Daytona', purpose: 'Validate synthetic record structure in an ephemeral sandbox', adapter: 'scripts/sponsors/daytona_validate.mjs', requiredSecrets: ['DAYTONA_API_KEY'] }, { id: 'nosana', name: 'Nosana', purpose: 'Generate a review suggestion from a fixed synthetic example', adapter: 'app/lib/hacksprint-sponsors.ts', requiredSecrets: ['NOSANA_API_KEY'] }].map(x => ({ ...x, adapterSha256: '', adapterReady: true, configured: false, durationMs: 0, status: 'awaiting-key', proof: 'Public checkout has no configured keys and no live receipt. Historical private-demo evidence is separate.', evidenceFile: '', evidenceSha256: '', error: null })) });
console.log(JSON.stringify({ syntheticRecords: questions.length, distinctTemplates: practice.questions.length, syntheticAttemptRecords: 480, textbookExcerpts: 0, privateSourceFilesRead: 0 }));
