export interface WordCopyForGrading {
  spelling: string;
  otherSpellings: string[];
  meaningId: string;
}

export interface RawAnswer {
  questionId: string;
  selectedMeaningId?: string;
  typedAnswer?: string;
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

/** Only the first submitted attempt affects the saved result and streak. */
export function gradeAnswer(
  answer: RawAnswer,
  copy: WordCopyForGrading,
  mode: "MATCH_MEANINGS" | "LISTEN_AND_TYPE",
): boolean {
  if (mode === "MATCH_MEANINGS")
    return (
      answer.selectedMeaningId === copy.meaningId &&
      answer.typedAnswer === undefined
    );
  if (
    answer.selectedMeaningId !== undefined ||
    answer.typedAnswer === undefined
  )
    return false;
  const normalized = normalizeAnswer(answer.typedAnswer);
  return [copy.spelling, ...copy.otherSpellings].some(
    (spelling) => normalizeAnswer(spelling) === normalized,
  );
}

export function hasValidFirstOrder(
  answers: { answer: RawAnswer; firstOrder: number }[],
  questionIds: readonly string[],
): boolean {
  const ids = answers.map((a) => a.answer.questionId);
  const orders = answers.map((a) => a.firstOrder).sort((a, b) => a - b);
  return (
    new Set(ids).size === ids.length &&
    ids.every((id) => questionIds.includes(id)) &&
    orders.every((order, i) => order === i + 1)
  );
}

export function nextGameStreak(
  current: number,
  best: number,
  results: readonly boolean[],
): { current: number; best: number } {
  for (const correct of results) {
    current = correct ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}
