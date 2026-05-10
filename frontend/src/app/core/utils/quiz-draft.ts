export interface QuizDraftOption { text: string; is_correct: boolean; }
export interface QuizDraftQuestion { text: string; options: QuizDraftOption[]; }
export interface QuizDraft { pass_score: number; questions: QuizDraftQuestion[]; }

export function emptyQuizDraft(): QuizDraft {
  return { pass_score: 70, questions: [] };
}

export function addQuestion(draft: QuizDraft): QuizDraft {
  return {
    ...draft,
    questions: [
      ...draft.questions,
      { text: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] },
    ],
  };
}

export function removeQuestion(draft: QuizDraft, qi: number): QuizDraft {
  const qs = [...draft.questions];
  qs.splice(qi, 1);
  return { ...draft, questions: qs };
}

export function addOption(draft: QuizDraft, qi: number): QuizDraft {
  const qs = draft.questions.map((q, i) =>
    i === qi ? { ...q, options: [...q.options, { text: '', is_correct: false }] } : q
  );
  return { ...draft, questions: qs };
}

export function removeOption(draft: QuizDraft, qi: number, oi: number): QuizDraft {
  const qs = draft.questions.map((q, i) => {
    if (i !== qi) return q;
    const opts = [...q.options];
    opts.splice(oi, 1);
    return { ...q, options: opts };
  });
  return { ...draft, questions: qs };
}

export function setCorrect(draft: QuizDraft, qi: number, oi: number): QuizDraft {
  const qs = draft.questions.map((q, i) =>
    i === qi ? { ...q, options: q.options.map((o, j) => ({ ...o, is_correct: j === oi })) } : q
  );
  return { ...draft, questions: qs };
}

export function isQuizDraftValid(draft: QuizDraft): boolean {
  if (draft.questions.length === 0) return false;
  for (const q of draft.questions) {
    if (!q.text.trim()) return false;
    if (q.options.length < 2) return false;
    if (!q.options.some(o => o.is_correct)) return false;
    if (q.options.some(o => !o.text.trim())) return false;
  }
  return true;
}
