export type SubjectCode = "BIZ" | "CONTRACT" | "THEORY";

export type KeywordQuestion = {
  id: string;
  round: number;
  subject: string;
  subjectCode: SubjectCode;
  questionNo: number;
  questionText: string;
  choices: Record<string, string>;
  domain: string;
  concept: string;
  keywords: string[];
  numericType: string;
  questionForm: string;
};

export type KeywordQuestionRef = {
  id: string;
  round: number;
  questionNo: number;
};

export type KeywordInsight = {
  id: string;
  subject: string;
  subjectCode: SubjectCode;
  area: string;
  keyword: string;
  questionCount: number;
  roundCount: number;
  baselineCount: number;
  recentCount: number;
  baselineRate: number;
  recentRate: number;
  trendDelta: number;
  caseCount: number;
  numericCount: number;
  questionRefs: KeywordQuestionRef[];
};

type KeywordRule = {
  area: string;
  keyword: string;
  pattern: RegExp;
};

const taxonomy: Record<SubjectCode, KeywordRule[]> = {
  BIZ: [
    { area: "근로자 보호", keyword: "고객응대직원 보호", pattern: /고객응대직원|고객을 직접 응대하는 직원|폭언이나 성희롱|폭언등으로부터 보호/ },
    { area: "계약자 보호", keyword: "전문·일반계약자와 청약철회", pattern: /전문보험계약자|일반보험계약자|청약철회|청약의 철회/ },
    { area: "시장질서", keyword: "상호협정·보험조사", pattern: /상호협정|보험조사협의회/ },
    { area: "계약자 보호", keyword: "의무보험·제3자 보호", pattern: /제3자 보호|보험금의 지급이 보장|가입이 강제|의무보험/ },
    { area: "보험모집", keyword: "모집종사자 등록·자격", pattern: /보험설계사|보험대리점|보험중개사|모집종사자|모집.*등록|교차모집/ },
    { area: "보험모집", keyword: "모집질서·소비자보호", pattern: /특별이익|자기계약|모집.*금지|설명의무|적합성|부당권유|통신판매|광고/ },
    { area: "보험전문인", keyword: "손해사정사·보험계리사", pattern: /손해사정사|보험계리사|선임계리사|보험전문인/ },
    { area: "보험회사 경영", keyword: "자산운용·대주주 거래", pattern: /자산운용|신용공여|대주주|자회사|부동산.*소유|특별계정.*자산/ },
    { area: "보험상품", keyword: "보험상품·기초서류", pattern: /보험상품|기초서류|사업방법서|책임준비금 산출방법서|보험료.*산출방법서|상품공시/ },
    { area: "보험회사 경영", keyword: "재무건전성·책임준비금", pattern: /총자산|자기자본|지급여력|재무건전성|책임준비금|비상위험준비금|해약환급금준비금|결산|보험회계/ },
    { area: "감독·제재", keyword: "검사·제재·과징금", pattern: /검사|과징금|과태료|영업정지|허가.*취소|청문|제재|금융감독원/ },
    { area: "보험관계단체", keyword: "보험협회·보험개발원", pattern: /보험협회|보험개발원|보험요율 산출기관|요율산출기관|보험관계단체/ },
    { area: "보험회사 조직", keyword: "주식회사·상호회사 조직", pattern: /상호회사|주식회사|조직변경|합병|해산|사원총회|이사회|임원/ },
    { area: "보험업 진입", keyword: "외국보험회사·국경간계약", pattern: /외국보험회사|외국에서.*보험계약|국외.*보험계약|수출적하보험/ },
    { area: "보험업 진입", keyword: "보험업 허가·자본금", pattern: /예비허가|보험업.*허가|최저자본금|자본금|기금|보험회사가 아닌 자/ },
    { area: "보험회사 업무", keyword: "겸영·부수업무·보험종목", pattern: /겸영|부수업무|보험업.*종류|보험종목|업무.*위탁/ },
    { area: "계약자 보호", keyword: "공시·계약이전·보호", pattern: /공시|계약이전|보험계약자.*보호|예금자보호|계약자배당/ },
  ],
  CONTRACT: [
    { area: "보험계약 총칙", keyword: "보험법 적용범위", pattern: /상법 제4편|보험의 규정.*적용|보험의 규정.*준용/ },
    { area: "보험약관", keyword: "약관 교부·설명의무", pattern: /설명의무|설명.*의무|약관.*교부|교부.*의무|중요내용.*설명/ },
    { area: "보험약관", keyword: "약관 해석·효력", pattern: /보험약관|약관.*해석|약관.*효력|약관.*구속|작성자.*불이익/ },
    { area: "계약 전후 의무", keyword: "고지의무·통지의무", pattern: /고지의무|통지의무|계약 전 알릴|위험.*변경|위험.*증가|중요한 사항/ },
    { area: "보험계약 성립", keyword: "청약·승낙·계약성립", pattern: /청약|승낙|낙부통지|보험계약.*성립|소급보험/ },
    { area: "보험계약 성립", keyword: "보험증권", pattern: /보험증권/ },
    { area: "보험계약 효력", keyword: "보험료·실효·부활", pattern: /보험료|실효|부활|최초.*보험료|계속.*보험료|보험료.*반환/ },
    { area: "보험금", keyword: "보험금청구·소멸시효", pattern: /보험금.*청구|청구권.*소멸시효|소멸시효|제척기간/ },
    { area: "보험사고", keyword: "보험사고·면책", pattern: /보험사고|면책|고의|중과실|전쟁위험|자살|범죄행위/ },
    { area: "손해보험", keyword: "보험가액·중복보험·손해보상", pattern: /보험가액|일부보험|초과보험|중복보험|실손보상|손해방지|보험금액과 보험가액/ },
    { area: "손해보험", keyword: "보험자대위·구상", pattern: /보험자대위|잔존물대위|제3자에 대한 권리|구상권|대위권/ },
    { area: "손해보험", keyword: "책임보험·자동차 운행자", pattern: /책임보험|피해자.*직접청구|직접청구권|배상책임|자동차손해배상보장법|운행자/ },
    { area: "손해보험", keyword: "화재보험", pattern: /화재보험|화재로 인한|집합보험/ },
    { area: "손해보험", keyword: "운송·해상보험", pattern: /운송보험|해상보험|적하보험|선박보험|선박의 존부|항해|공동해손/ },
    { area: "인보험", keyword: "생명·상해·질병보험", pattern: /생명보험|상해보험|질병보험|타인의 생명|보험수익자.*지정|단체보험/ },
    { area: "보험계약 관계자", keyword: "계약자·피보험자·수익자", pattern: /보험계약자|피보험자|보험수익자|타인을 위한 보험/ },
    { area: "보험계약 종료", keyword: "무효·취소·해지", pattern: /무효|취소|해지|해제|종료/ },
  ],
  THEORY: [
    { area: "위험담보방식", keyword: "열거·포괄위험과 입증책임", pattern: /열거위험|포괄위험|담보위험|입증책임|보험자.*입증|피보험자.*입증|위험담보방식/ },
    { area: "해상·운송보험", keyword: "해상보험·공동해손", pattern: /해상보험|운송보험|공동해손|S\.G\.|협회전쟁약관|해상고유|묵시담보|감항|보험위부|warranty of seaworthiness/ },
    { area: "보험계약 기초", keyword: "보험계약의 법적 성격", pattern: /보험계약.*법적|부합계약|조건부계약|작성자.*불이익|유효한 법적계약|보험증권.*법적|보험증권.*문언|보통보험약관.*매개|보험계약.*무효/ },
    { area: "보험계약 기초", keyword: "보험계약조항·면책", pattern: /계약조항|타보험조항|제외손실|제외손인|면책|소급보험|승낙전보호|보험효력|효력.*소멸|보험사고의 요건|사고발생의 우연성/ },
    { area: "보험소비자 보호", keyword: "금융소비자 보호·분쟁", pattern: /금융소비자|소비자 보호|소액분쟁|보험 규제|영업행위 준수사항/ },
    { area: "보증·신용보험", keyword: "신용보험·보증보험", pattern: /신용보험|보증보험|채무불이행|채무이행.*보증/ },
    { area: "보험범죄", keyword: "보험사기", pattern: /보험사기/ },
    { area: "안전관리", keyword: "사고예방·손실통제", pattern: /도미노이론|사고의 구조|손실예방|사고예방/ },
    { area: "자동차보험", keyword: "교통사고 법규", pattern: /교통사고처리특례법|12대 중과실|교통사고.*우선 지급/ },
    { area: "보험경영", keyword: "보험경영·마케팅·경제", pattern: /인플레이션|보험마케팅|현금흐름|자산운용|특별계정|준비금.*자산.*구분|재무건전성/ },
    { area: "위험의 기초", keyword: "위험·위태의 분류", pattern: /순수위험|투기위험|보험가능위험|객관적 위험|주관적 위험|물리적 위태|도덕적 위태|정신적 위태|hazard|손인\(peril\)|최대.*손실|위험결합|위험성향/ },
    { area: "보험의 기본원리", keyword: "대수의 법칙·실손보상", pattern: /대수의 법칙|수지상등|급부.*반대급부|실손보상|이득금지|보험자대위|보험자의 구상권|구상권 행사|피보험이익|최대선의/ },
    { area: "리스크 관리", keyword: "위험관리 기법·의사결정", pattern: /위험관리|리스크 관리|위험통제|위험재무|위험전가|위험보유|손실통제|기대효용|효용함수|의사결정/ },
    { area: "보험요율·통계", keyword: "확률·통계·보험수리", pattern: /확률|기대값|분산|표준편차|신뢰도|보험수리|현가|연금현가|생명표/ },
    { area: "보험요율·통계", keyword: "보험요율 산정", pattern: /보험요율|순보험료|부가보험료|손해율법|순보험료법|요율산정|요율.*원칙|개별요율/ },
    { area: "언더라이팅", keyword: "위험선택·역선택", pattern: /언더라이팅|위험선택|역선택|adverse selection|인수.*위험|보험계약 인수/ },
    { area: "재보험", keyword: "비례·비비례 재보험", pattern: /재보험|출재|수재|quota share|surplus|초과손해|비례재보험|비비례재보험/ },
    { area: "재물보험", keyword: "재물손해·공제조항", pattern: /재물보험|기업휴지|대체비용|공동보험|공제조항|deductible|보험가액/ },
    { area: "배상책임보험", keyword: "배상책임 법리", pattern: /배상책임|책임보험계약|생산물책임|전문인배상|불법행위|과실상계|위험인수의 법리|공동불법행위/ },
    { area: "자동차·상해보험", keyword: "자동차·상해·실손의료", pattern: /자동차보험|상해보험|질병보험|실손의료|무보험자동차|자기신체사고/ },
    { area: "손해사정", keyword: "손해사정 절차·업무", pattern: /손해사정사|손해사정.*업무|손해사정.*절차|손해사정서/ },
    { area: "손해사정", keyword: "손해액·보험금 산정", pattern: /손해액|보험금.*산정|중간이자|휴업손해|상실수익|잔존물/ },
    { area: "산업재해", keyword: "산업재해·중대재해", pattern: /산업재해|중대재해|근로기준법|재해보상|업무상 재해/ },
    { area: "보험경영", keyword: "보험회계·경영지표", pattern: /지급여력|책임준비금|비상위험준비금|보험회계|경영성과|사업비율|합산비율|운용자산이익률/ },
    { area: "대체위험전가", keyword: "ART·보험연계증권", pattern: /대체위험전가|ART|보험연계증권|cat bond|캡티브/ },
    { area: "사회보험", keyword: "사회보험", pattern: /사회보험|국민건강보험|산재보험|고용보험|국민연금/ },
    { area: "민법", keyword: "민법·상속", pattern: /민법.*상속|상속 순위|피상속인|직계존속|직계비속/ },
  ],
};

const genericDomains = new Set([
  "보험업 허가·감독",
  "보험업법 일반",
  "보험계약법 일반",
  "손해사정이론 일반",
]);

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function fallbackRule(question: KeywordQuestion): Pick<KeywordRule, "area" | "keyword"> {
  if (!genericDomains.has(question.domain)) {
    return { area: question.domain.split("·")[0], keyword: question.domain };
  }
  return {
    area: question.subjectCode === "BIZ" ? "보험업 일반" : question.subjectCode === "CONTRACT" ? "보험계약 일반" : "손해사정 일반",
    keyword: question.subjectCode === "BIZ" ? "보험업법 기타" : question.subjectCode === "CONTRACT" ? "보험계약법 기타" : "손해사정이론 기타",
  };
}

export function classifyContentKeyword(question: KeywordQuestion) {
  const primaryText = [
    question.questionText,
    question.domain,
    question.concept,
    ...question.keywords,
  ].join(" ");
  const matched = taxonomy[question.subjectCode].find((rule) => rule.pattern.test(primaryText));
  return matched ? { area: matched.area, keyword: matched.keyword } : fallbackRule(question);
}

export function buildKeywordInsights(questions: KeywordQuestion[]): KeywordInsight[] {
  const groups = new Map<string, { area: string; keyword: string; subject: string; subjectCode: SubjectCode; questions: KeywordQuestion[] }>();
  for (const question of questions) {
    const classification = classifyContentKeyword(question);
    const key = `${question.subjectCode}:${classification.keyword}`;
    const group = groups.get(key) ?? {
      ...classification,
      subject: question.subject,
      subjectCode: question.subjectCode,
      questions: [],
    };
    group.questions.push(question);
    groups.set(key, group);
  }

  const subjectCounts = questions.reduce<Record<SubjectCode, { baseline: number; recent: number }>>((counts, question) => {
    counts[question.subjectCode][question.round <= 47 ? "baseline" : "recent"] += 1;
    return counts;
  }, {
    BIZ: { baseline: 0, recent: 0 },
    CONTRACT: { baseline: 0, recent: 0 },
    THEORY: { baseline: 0, recent: 0 },
  });

  return [...groups.entries()].map(([id, group]) => {
    const baselineCount = group.questions.filter((question) => question.round <= 47).length;
    const recentCount = group.questions.filter((question) => question.round >= 48).length;
    const denominator = subjectCounts[group.subjectCode];
    const baselineRate = roundOne((baselineCount / Math.max(1, denominator.baseline)) * 100);
    const recentRate = roundOne((recentCount / Math.max(1, denominator.recent)) * 100);
    return {
      id,
      subject: group.subject,
      subjectCode: group.subjectCode,
      area: group.area,
      keyword: group.keyword,
      questionCount: group.questions.length,
      roundCount: new Set(group.questions.map((question) => question.round)).size,
      baselineCount,
      recentCount,
      baselineRate,
      recentRate,
      trendDelta: roundOne(recentRate - baselineRate),
      caseCount: group.questions.filter((question) => question.questionForm === "사례적용형").length,
      numericCount: group.questions.filter((question) => question.numericType !== "없음").length,
      questionRefs: group.questions
        .map((question) => ({ id: question.id, round: question.round, questionNo: question.questionNo }))
        .sort((a, b) => b.round - a.round || a.questionNo - b.questionNo),
    };
  }).sort((a, b) => b.roundCount - a.roundCount || b.questionCount - a.questionCount || a.keyword.localeCompare(b.keyword, "ko"));
}
