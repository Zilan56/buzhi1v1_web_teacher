export interface DiagnoseQuestion {
  id: string
  title: string
  videoId: string
  paperUrl: string
  answerUrl: string
}

export interface DiagnosePaperOption {
  id: 'standard' | 'beijing' | 'jiangsu' | 'custom'
  label: string
  description: string
  questionIds: string[]
}

export const DIAGNOSE_QUESTION_BANK: Record<string, DiagnoseQuestion> = {
  q1: {
    id: 'q1',
    title: '第一题',
    videoId: '1e6eaa05afeb89757a5409bb5a0cf576_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777432534990.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777432796607.pdf',
  },
  q2: {
    id: 'q2',
    title: '第二题',
    videoId: '1e6eaa05af8f4a5e85f1ff27dccf12be_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777433648776.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777433727402.pdf',
  },
  q3: {
    id: 'q3',
    title: '第三题',
    videoId: '1e6eaa05afbeb7ba10d7b7d7dea30f55_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777433764480.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777433821143.pdf',
  },
  q4: {
    id: 'q4',
    title: '第四题',
    videoId: '1e6eaa05afe16d19ec24e3ee3645bb83_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777433474117.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777433472351.pdf',
  },
  q5: {
    id: 'q5',
    title: '第五题',
    videoId: '1e6eaa05af082915a9688d4572869807_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777433506581.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777433554374.pdf',
  },
  bj_q1: {
    id: 'bj_q1',
    title: '考情版-第一题（替换）',
    videoId: '1e6eaa05afd5a3e9810b1cdb2aa00877_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777432135191.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777432111112.pdf',
  },
  js_q3: {
    id: 'js_q3',
    title: '考情版-第三题（替换）',
    videoId: '1e6eaa05af8d11e1177bdddc8474afbe_1',
    paperUrl: 'https://img.yaotia.com/2026/04-29/1777432113968.pdf',
    answerUrl: 'https://img.yaotia.com/2026/04-29/1777432147057.pdf',
  },
}

export const DIAGNOSE_PAPER_OPTIONS: DiagnosePaperOption[] = [
  {
    id: 'standard',
    label: '标准版',
    description: '固定 5 题标准卷',
    questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  },
  {
    id: 'beijing',
    label: '北京',
    description: '替换第 1 题，其余沿用标准版',
    questionIds: ['bj_q1', 'q2', 'q3', 'q4', 'q5'],
  },
  {
    id: 'jiangsu',
    label: '江苏',
    description: '替换第 1 题和第 3 题',
    questionIds: ['bj_q1', 'q2', 'js_q3', 'q4', 'q5'],
  },
  {
    id: 'custom',
    label: '自主组卷',
    description: '从 7 道候选题里自由选题排序',
    questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  },
]

export const DIAGNOSE_CUSTOM_QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'bj_q1', 'js_q3']

export function getDiagnosePaperOption(optionId: DiagnosePaperOption['id']): DiagnosePaperOption {
  return DIAGNOSE_PAPER_OPTIONS.find((option) => option.id === optionId) || DIAGNOSE_PAPER_OPTIONS[0]
}

export function resolveDiagnoseQuestions(questionIds: string[]): DiagnoseQuestion[] {
  return questionIds
    .map((questionId) => DIAGNOSE_QUESTION_BANK[questionId])
    .filter((question): question is DiagnoseQuestion => Boolean(question))
}
