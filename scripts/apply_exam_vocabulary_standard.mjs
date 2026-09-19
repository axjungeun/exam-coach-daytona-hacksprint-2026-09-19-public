import { readFile, writeFile } from "node:fs/promises";

const bankPath = new URL("../app/data/public-practice-questions.json", import.meta.url);
const standardPath = new URL("../app/data/exam-vocabulary-standard.json", import.meta.url);
const shouldWrite = process.argv.includes("--write");

const bank = JSON.parse(await readFile(bankPath, "utf8"));
const standard = JSON.parse(await readFile(standardPath, "utf8"));
const failures = [];
const changed = [];

for (const question of bank.questions) {
  const terms = standard.subjects[question.subjectCode] ?? [];
  const match = terms.find((term) => term.canonical === question.concept || term.aliases.includes(question.concept));
  if (!match) {
    failures.push(`${question.id}: 표준 어휘에 없는 개념 '${question.concept}'`);
    continue;
  }
  if (question.concept !== match.canonical) changed.push(`${question.id}: ${question.concept} -> ${match.canonical}`);
  question.concept = match.canonical;
  question.vocabularyLevel = standard.metadata.level;

  const displayText = [question.prompt, question.context?.text, ...Object.values(question.choices)].filter(Boolean).join(" ");
  for (const phrase of standard.forbiddenDisplayPhrases) {
    if (displayText.includes(phrase)) failures.push(`${question.id}: 비표준 표시어 '${phrase}'`);
  }
}

bank.metadata.vocabularyStandard = standard.metadata.id;
bank.metadata.vocabularyLevel = standard.metadata.level;

if (shouldWrite && failures.length === 0) {
  await writeFile(bankPath, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  valid: failures.length === 0,
  mode: shouldWrite ? "write" : "check",
  questionCount: bank.questions.length,
  changedCount: changed.length,
  changed,
  failures,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
