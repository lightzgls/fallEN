import { normalizeAnswer } from "./game-rules.js";

export interface RoundWordCandidate {
  wordId: string;
  version: number;
  spelling: string;
  otherSpellings: string[];
  meaningId: string;
  meaning: string;
  partOfSpeech: string;
  text?: string;
  speechVersion?: number;
  listenAllowed?: boolean;
  locale?: string;
  engineId?: string;
  voiceName?: string;
  rate?: number;
}

/** Keep unseen words first; fill a match round with already seen words only when necessary. */
export function selectRoundWords(
  candidates: RoundWordCandidate[],
  seen: ReadonlySet<string>,
  needed: number,
): {
  status: "READY" | "EXHAUSTED" | "INSUFFICIENT";
  words: RoundWordCandidate[];
} {
  const fresh = candidates.filter((word) => !seen.has(word.wordId));
  if (!fresh.length) return { status: "EXHAUSTED", words: [] };
  const ordered = [
    ...fresh,
    ...candidates.filter((word) => seen.has(word.wordId)),
  ];
  const selected: RoundWordCandidate[] = [];
  const meanings = new Set<string>();
  const meaningIds = new Set<string>();
  for (const candidate of ordered) {
    const key = normalizeAnswer(candidate.meaning);
    if (meanings.has(key) || meaningIds.has(candidate.meaningId)) continue;
    selected.push(candidate);
    meanings.add(key);
    meaningIds.add(candidate.meaningId);
    if (selected.length === needed) break;
  }
  return {
    status: selected.length === needed ? "READY" : "INSUFFICIENT",
    words: selected,
  };
}
