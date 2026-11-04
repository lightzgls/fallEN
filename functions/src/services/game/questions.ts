import type { QuestionReader } from "../../contracts/game/store.js";
import type { Game, Question, Round } from "../../contracts/game/records.js";
import type { TtsConfig } from "../../contracts/game/inputs.js";
import {
  selectRoundWords,
  type RoundWordCandidate,
} from "../../domain/round-words.js";
import { requireRecord } from "../../domain/study-consistency.js";
import { fail } from "../../shared/errors.js";
export async function chooseQuestions(
  ctx: QuestionReader,
  game: Game,
  ttsConfig?: TtsConfig,
): Promise<Question[]> {
  if (game.source.sourceType === "SYSTEM_DECK") {
    const active = requireRecord(await ctx.deckActive(game.source.wordSetId!));
    if (!active) fail("DECK_UNAVAILABLE");
  }
  const source = await ctx.sourceWords(game.id),
    rounds = await ctx.rounds(game.id),
    seen = new Set(rounds.flatMap((r) => r.wordIds)),
    releaseId = await ctx.releaseId(),
    candidates: RoundWordCandidate[] = [];
  for (const item of source) {
    const active = await ctx.entry(item.wordId, releaseId);
    if (!active?.active) continue;
    const word = await ctx.wordVersion(item.wordId, item.wordVersion),
      speech = await ctx.speech(item.wordId);
    const meaning =
      word.meanings.find((m: { id: string }) => m.id === item.focusMeaningId) ??
      word.meanings[0];
    if (!meaning?.text || !meaning.partOfSpeech) continue;
    if (
      game.mode === "LISTEN_AND_TYPE" &&
      (!speech?.listenAllowed || !ttsConfig)
    )
      continue;
    candidates.push({
      wordId: item.wordId,
      version: word.version,
      spelling: word.spelling,
      otherSpellings: word.otherSpellings ?? [],
      meaningId: meaning.id,
      meaning: meaning.text,
      partOfSpeech: meaning.partOfSpeech,
      ...(game.mode === "LISTEN_AND_TYPE"
        ? {
            text: word.spelling,
            speechVersion: speech!.version,
            listenAllowed: speech!.listenAllowed,
            ...ttsConfig,
          }
        : {}),
    });
  }
  const needed = game.mode === "MATCH_MEANINGS" ? 5 : 1,
    selected = selectRoundWords(candidates, seen, needed);
  if (selected.status === "EXHAUSTED")
    fail(
      "SOURCE_EXHAUSTED",
      "All suitable words in this source have been used",
    );
  if (selected.status === "INSUFFICIENT")
    fail(
      "INSUFFICIENT_GAME_SOURCE",
      `This mode requires ${needed} distinct usable words and meanings`,
    );
  return selected.words.map((wordCopy, i) => ({
    id: `q_${i + 1}`,
    wordId: wordCopy.wordId,
    wordVersion: wordCopy.version,
    wordCopy: { ...wordCopy },
    hintLevel: 0,
  }));
}
export function makeRound(game: Game, questions: Question[], now: Date): Round {
  const order = game.nextRoundOrder ?? 1;
  return {
    id: `${game.id}_${order}`,
    sessionId: game.id,
    order,
    status: "ACTIVE",
    wordIds: questions.map((q) => q.wordId),
    createdAt: now,
  };
}
