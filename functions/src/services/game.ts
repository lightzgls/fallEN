import {
  FieldValue,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  command,
  assertActive,
  parse,
  fail,
  hash,
  requireDoc,
  checkVersion,
  type Actor,
  type Data,
} from "../shared/core.js";
import {
  readDeckSource,
  readPersonalSource,
  readWordVersion,
  resolveRelease,
} from "./dictionary.js";
import {
  objectId,
  version,
  sourceSchema,
  stableId,
  normalizeAnswer,
} from "../domain/backend.js";
import {
  readActivity,
  stageActivity,
} from "../infrastructure/learning-activity.js";
import { gradeAnswer, hasValidFirstOrder } from "../domain/game-rules.js";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../domain/backend-errors.js";

const ttsSchema = z
  .object({
    locale: z.enum(["en-GB", "en-US"]),
    engineId: z.string().min(1).max(200),
    voiceName: z.string().min(1).max(200),
    rate: z.number().min(0.25).max(2),
  })
  .strict();
const startSchema = z
  .object({
    mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    source: sourceSchema,
    commandId: objectId,
    ttsConfig: ttsSchema.optional(),
  })
  .strict();
const rawAnswer = z
  .object({
    questionId: objectId,
    selectedMeaningId: objectId.optional(),
    typedAnswer: z.string().max(300).optional(),
  })
  .strict();
const firstAnswer = z
  .object({
    answer: rawAnswer,
    firstOrder: z.number().int().positive(),
    hintLevel: z.number().int().min(0).max(3),
  })
  .strict();
const gameRef = (actor: Actor, sessionId: string) =>
  db.doc(`users/${actor.uid}/gameSessions/${sessionId}`);
const gameCommandSchema = z.object({
  sessionId: objectId,
  expectedGameVersion: version,
  commandId: objectId,
});
const roundIdFor = (sessionId: string, order: number) =>
  `${sessionId}_${order}`;

async function chooseQuestions(
  actor: Actor,
  game: Data,
  tx: Transaction,
  ttsConfig?: z.infer<typeof ttsSchema>,
) {
  if (game.source.sourceType === "SYSTEM_DECK") {
    const deck = requireDoc(
      await tx.get(db.doc(`systemDecks/${game.source.wordSetId}`)),
    );
    if (!deck.active) fail("DECK_UNAVAILABLE");
  }
  const source = await tx.get(
    gameRef(actor, game.id).collection("sourceWords").orderBy("position"),
  );
  const rounds = await tx.get(gameRef(actor, game.id).collection("rounds"));
  const seen = new Set<string>(
    rounds.docs.flatMap((s) => s.data().wordIds ?? []),
  );
  const release = await resolveRelease(undefined, tx);
  const candidates: Data[] = [];
  for (const item of source.docs) {
    const active = (
      await tx.get(
        db.doc(`dictionaryReleases/${release.id}/entries/${item.id}`),
      )
    ).data();
    if (!active?.active) continue;
    const word = await readWordVersion(item.id, item.data().wordVersion, tx);
    const operational = (await tx.get(db.doc(`words/${item.id}`))).data();
    const meaning =
      word.meanings.find((m: Data) => m.id === item.data().focusMeaningId) ??
      word.meanings[0];
    if (!meaning?.text || !meaning.partOfSpeech) continue;
    if (
      game.mode === "LISTEN_AND_TYPE" &&
      (!operational?.speech?.listenAllowed || !ttsConfig)
    )
      continue;
    candidates.push({
      wordId: item.id,
      version: word.version,
      spelling: word.spelling,
      otherSpellings: word.otherSpellings ?? [],
      meaningId: meaning.id,
      meaning: meaning.text,
      partOfSpeech: meaning.partOfSpeech,
      ...(game.mode === "LISTEN_AND_TYPE"
        ? {
            text: word.spelling,
            speechVersion: operational!.speech.version,
            listenAllowed: operational!.speech.listenAllowed,
            ...ttsConfig,
          }
        : {}),
    });
  }
  const fresh = candidates.filter((w) => !seen.has(w.wordId));
  if (!fresh.length)
    fail(
      "SOURCE_EXHAUSTED",
      "All suitable words in this source have been used",
    );
  const ordered = [...fresh, ...candidates.filter((w) => seen.has(w.wordId))];
  const needed = game.mode === "MATCH_MEANINGS" ? 5 : 1;
  const selected: Data[] = [];
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
  if (selected.length !== needed)
    fail(
      "INSUFFICIENT_GAME_SOURCE",
      `This mode requires ${needed} distinct usable words and meanings`,
    );
  return selected.map((wordCopy, i) => ({
    id: `q_${i + 1}`,
    wordId: wordCopy.wordId,
    wordVersion: wordCopy.version,
    wordCopy,
    hintLevel: 0,
  }));
}
function stageRound(
  tx: Transaction,
  actor: Actor,
  game: Data,
  questions: Data[],
  now: Timestamp,
) {
  const order = game.nextRoundOrder ?? 1;
  const roundId = roundIdFor(game.id, order);
  const round = {
    id: roundId,
    sessionId: game.id,
    order,
    status: "ACTIVE",
    wordIds: questions.map((q) => q.wordId),
    createdAt: now,
  };
  const ref = gameRef(actor, game.id).collection("rounds").doc(roundId);
  tx.create(ref, round);
  for (const question of questions)
    tx.create(ref.collection("questions").doc(question.id), question);
  return { ...round, questions };
}

async function startGame(actor: Actor, raw: unknown) {
  const req = parse(startSchema, raw);
  if (req.mode === "LISTEN_AND_TYPE" && !req.ttsConfig)
    fail("TTS_UNAVAILABLE", "Listening needs an available Android TTS voice");
  const sessionId = stableId(actor.uid, "game", req.commandId);
  const requestHash = hash({ kind: "startGame", input: req });
  const cmdRef = db.doc(`users/${actor.uid}/commands/${req.commandId}`);
  const existing = await db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const previous = (await tx.get(cmdRef)).data();
    if (previous) {
      if (previous.kind !== "startGame" || previous.requestHash !== requestHash)
        fail("COMMAND_REUSED");
      return previous;
    }
    const source =
      req.source.sourceType === "SYSTEM_DECK"
        ? await readDeckSource(req.source, tx)
        : await readPersonalSource(actor, tx);
    if (!source.words.length) fail("EMPTY_SOURCE");
    const manifest = source.words.map((w, position) => ({
      wordId: w.wordId,
      wordVersion: w.wordVersion,
      position,
      ...(w.entry?.focusMeaningId
        ? { focusMeaningId: w.entry.focusMeaningId }
        : {}),
    }));
    if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 750 * 1024)
      fail("PAYLOAD_LIMIT", "This source exceeds the game manifest size limit");
    const now = Timestamp.now();
    const game = {
      id: sessionId,
      mode: req.mode,
      source: source.source,
      status: "PREPARING",
      currentStreak: 0,
      bestStreak: 0,
      version: 0,
      nextRoundOrder: 1,
      sourceCount: manifest.length,
      sourceHash: hash(manifest),
      sourceManifest: manifest,
      commandId: req.commandId,
      ...(req.ttsConfig ? { ttsConfig: req.ttsConfig } : {}),
      createdAt: now,
    };
    tx.create(gameRef(actor, sessionId), game);
    tx.create(cmdRef, {
      kind: "startGame",
      requestHash,
      status: "IN_PROGRESS",
      progress: { sessionId, phase: "PREPARING" },
      createdAt: now,
    });
    return { status: "IN_PROGRESS" };
  });
  if (existing.status === "SUCCEEDED") return existing.receipt;
  if (existing.status === "FAILED")
    fail(existing.error?.code ?? "GAME_PREPARATION_FAILED");
  return prepareGame(actor, sessionId);
}

/** Resumable task entry point. The persisted manifest freezes personal membership as well as deck revision. */
export async function prepareGame(
  actor: Actor,
  sessionId: string,
): Promise<Data> {
  try {
    return await prepareGameSource(actor, sessionId);
  } catch (error) {
    const code = businessErrorCode(error);
    if (isPermanentJobFailure(code)) {
      await db.runTransaction(async (tx) => {
        const ref = gameRef(actor, sessionId);
        const game = requireDoc(await tx.get(ref));
        const cmdRef = db.doc(`users/${actor.uid}/commands/${game.commandId}`);
        const cmd = requireDoc(await tx.get(cmdRef));
        if (game.status === "PREPARING" && cmd.status === "IN_PROGRESS") {
          tx.update(ref, { status: "INTERRUPTED", error: { code } });
          tx.update(cmdRef, {
            status: "FAILED",
            error: { code },
            progress: FieldValue.delete(),
          });
        }
      });
    }
    throw error;
  }
}
async function prepareGameSource(
  actor: Actor,
  sessionId: string,
): Promise<Data> {
  const ref = gameRef(actor, sessionId);
  const snapshot = requireDoc(await ref.get());
  if (snapshot.status !== "PREPARING") {
    const done = requireDoc(
      await db.doc(`users/${actor.uid}/commands/${snapshot.commandId}`).get(),
    );
    if (done.status === "SUCCEEDED") return done.receipt;
    fail("CONFLICT");
  }
  const manifest: Data[] = snapshot.sourceManifest;
  if (
    hash(manifest) !== snapshot.sourceHash ||
    manifest.length !== snapshot.sourceCount
  )
    fail("SOURCE_INVALID");
  for (let offset = 0; offset < manifest.length; offset += 400) {
    await db.runTransaction(async (tx) => {
      await assertActive(actor, tx);
      const game = requireDoc(await tx.get(ref));
      if (game.status !== "PREPARING") return;
      for (const item of manifest.slice(offset, offset + 400))
        tx.set(ref.collection("sourceWords").doc(item.wordId), item);
    });
  }
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const game = requireDoc(await tx.get(ref));
    const cmdRef = db.doc(`users/${actor.uid}/commands/${game.commandId}`);
    const cmd = requireDoc(await tx.get(cmdRef));
    if (cmd.status === "SUCCEEDED") return cmd.receipt;
    if (game.status !== "PREPARING") fail("CONFLICT");
    const stored = await tx.get(
      ref.collection("sourceWords").orderBy("position"),
    );
    if (
      stored.size !== game.sourceCount ||
      hash(stored.docs.map((s) => s.data())) !== game.sourceHash
    )
      fail("SOURCE_INVALID");
    const questions = await chooseQuestions(actor, game, tx, game.ttsConfig);
    const now = Timestamp.now();
    const firstRound = stageRound(tx, actor, game, questions, now);
    const publicGame: Data = {
      ...game,
      status: "ACTIVE",
      version: 1,
      currentRoundId: firstRound.id,
      nextRoundOrder: 2,
    };
    delete publicGame.sourceManifest;
    tx.update(ref, {
      status: "ACTIVE",
      version: 1,
      currentRoundId: firstRound.id,
      nextRoundOrder: 2,
      sourceManifest: FieldValue.delete(),
    });
    const receipt = { game: publicGame, firstRound };
    if (Buffer.byteLength(JSON.stringify(receipt), "utf8") > 750 * 1024)
      fail("PAYLOAD_LIMIT", "This round exceeds the receipt size limit");
    tx.update(cmdRef, {
      status: "SUCCEEDED",
      receipt,
      progress: FieldValue.delete(),
    });
    return receipt;
  });
}
async function createRound(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema.extend({ ttsConfig: ttsSchema.optional() }).strict(),
    raw,
  );
  return command(actor, "createRound", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    if (game.currentRoundId) {
      const previous = requireDoc(
        await tx.get(ref.collection("rounds").doc(game.currentRoundId)),
      );
      if (!["COMMITTED", "CANCELLED"].includes(previous.status))
        fail("CONFLICT", "Finish the current round before starting another");
    }
    const questions = await chooseQuestions(actor, game, tx, req.ttsConfig);
    const round = stageRound(tx, actor, game, questions, now);
    tx.update(ref, {
      currentRoundId: round.id,
      nextRoundOrder: game.nextRoundOrder + 1,
      version: game.version + 1,
    });
    return { round, gameVersion: game.version + 1 };
  });
}
function grade(
  answer: z.infer<typeof rawAnswer>,
  question: Data,
  mode: string,
): boolean {
  const copy = parse(
    z.object({
      spelling: z.string(),
      otherSpellings: z.array(z.string()),
      meaningId: z.string(),
    }),
    question.wordCopy,
  );
  const checkedMode = parse(
    z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    mode,
  );
  return gradeAnswer(answer, copy, checkedMode);
}
async function saveRound(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema
      .extend({
        roundId: objectId,
        firstAnswers: z.array(firstAnswer).max(5),
        completionAnswers: z.array(rawAnswer).max(5),
        finishReason: z.enum(["COMPLETED", "STOP_AND_SAVE", "SKIPPED"]),
      })
      .strict(),
    raw,
  );
  return command(actor, "saveRound", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE" || game.currentRoundId !== req.roundId)
      fail("CONFLICT");
    const roundRef = ref.collection("rounds").doc(req.roundId);
    const round = requireDoc(await tx.get(roundRef));
    if (round.status !== "ACTIVE")
      fail("CONFLICT", "This round is already closed");
    const snapshots = await tx.get(roundRef.collection("questions"));
    const questions: Data[] = snapshots.docs.map((s) => ({
      ...s.data(),
      id: s.id,
    }));
    const questionById = new Map(questions.map((q) => [q.id, q]));
    if (!hasValidFirstOrder(req.firstAnswers, [...questionById.keys()]))
      fail(
        "VALIDATION_FAILED",
        "First answers must be unique with continuous firstOrder",
      );
    if (req.finishReason === "STOP_AND_SAVE" && game.mode !== "MATCH_MEANINGS")
      fail("VALIDATION_FAILED");
    if (req.finishReason === "SKIPPED" && game.mode !== "LISTEN_AND_TYPE")
      fail("VALIDATION_FAILED");
    const completionIds = req.completionAnswers.map((a) => a.questionId);
    if (
      new Set(completionIds).size !== completionIds.length ||
      completionIds.some((q) => !questionById.has(q))
    )
      fail("VALIDATION_FAILED");
    if (
      req.finishReason === "COMPLETED" &&
      (req.completionAnswers.length !== questions.length ||
        req.firstAnswers.length !== questions.length ||
        req.completionAnswers.some(
          (a) => !grade(a, questionById.get(a.questionId)!, game.mode),
        ))
    )
      fail(
        "VALIDATION_FAILED",
        "A completed round must finish every question correctly",
      );
    if (req.finishReason !== "COMPLETED" && req.completionAnswers.length)
      fail("VALIDATION_FAILED");
    const activity = await readActivity(tx, actor.uid, now);
    let current = game.currentStreak;
    let best = game.bestStreak;
    for (const answer of [...req.firstAnswers].sort(
      (a, b) => a.firstOrder - b.firstOrder,
    )) {
      const question = questionById.get(answer.answer.questionId)!;
      const correct = grade(answer.answer, question, game.mode);
      current = correct ? current + 1 : 0;
      best = Math.max(best, current);
      question.firstResult = correct ? "CORRECT" : "INCORRECT";
      question.firstOrder = answer.firstOrder;
      question.hintLevel = answer.hintLevel;
    }
    if (game.mode === "LISTEN_AND_TYPE" && !req.firstAnswers.length) {
      current = 0;
      questions[0].firstResult = "UNANSWERED";
    }
    for (const question of questions)
      tx.set(roundRef.collection("questions").doc(question.id), question);
    const committedRound = {
      ...round,
      status: "COMMITTED",
      savedAt: now,
      finishReason: req.finishReason,
    };
    tx.set(roundRef, committedRound);
    tx.update(ref, {
      version: game.version + 1,
      currentStreak: current,
      bestStreak: best,
    });
    stageActivity(tx, activity, game.mode, req.firstAnswers.length, 0, best);
    if (req.firstAnswers.length && game.source.sourceType === "SYSTEM_DECK")
      tx.set(
        db.doc(`users/${actor.uid}/deckActivity/${game.source.wordSetId}`),
        { wordSetId: game.source.wordSetId, lastActivityAt: now },
      );
    return {
      round: { ...committedRound, questions },
      gameVersion: game.version + 1,
      currentStreak: current,
      bestStreak: best,
      committed: true,
    };
  });
}
async function endGame(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema
      .extend({ cancelledRoundId: objectId.optional() })
      .strict(),
    raw,
  );
  return command(actor, "endGame", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    const rounds = await tx.get(ref.collection("rounds"));
    const active = rounds.docs.find((s) => s.data().status === "ACTIVE");
    if (
      active &&
      (game.mode !== "LISTEN_AND_TYPE" || req.cancelledRoundId !== active.id)
    )
      fail(
        "CONFLICT",
        "Save the match round or explicitly cancel the active listening round",
      );
    const results: Data[] = [];
    for (const round of rounds.docs.filter(
      (s) => s.data().status === "COMMITTED",
    )) {
      const questions = await tx.get(round.ref.collection("questions"));
      results.push(...questions.docs.map((s) => s.data()));
    }
    if (active) tx.update(active.ref, { status: "CANCELLED", savedAt: now });
    tx.update(ref, {
      status: "FINISHED",
      endedAt: now,
      version: game.version + 1,
    });
    const correct = results.filter((q) => q.firstResult === "CORRECT").length;
    const incorrect = results.filter(
      (q) => q.firstResult === "INCORRECT",
    ).length;
    return {
      sessionId: req.sessionId,
      mode: game.mode,
      gameVersion: game.version + 1,
      correctCount: correct,
      incorrectCount: incorrect,
      unansweredCount: results.filter((q) => q.firstResult === "UNANSWERED")
        .length,
      practicedWordCount: new Set(
        results.filter((q) => q.firstResult).map((q) => q.wordId),
      ).size,
      accuracy:
        correct + incorrect ? (correct / (correct + incorrect)) * 100 : null,
      bestStreak: game.bestStreak,
    };
  });
}
export const gameHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  startGame,
  createRound,
  saveRound,
  endGame,
  async getEligibleGameSource(actor, raw) {
    const req = parse(
      z
        .object({
          mode: z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
          source: sourceSchema,
        })
        .strict(),
      raw,
    );
    await assertActive(actor);
    const source =
      req.source.sourceType === "SYSTEM_DECK"
        ? await readDeckSource(req.source)
        : await readPersonalSource(actor);
    let count = 0;
    for (const word of source.words) {
      const speech = (await db.doc(`words/${word.wordId}`).get()).data()
        ?.speech;
      if (req.mode === "MATCH_MEANINGS" || speech?.listenAllowed) count++;
    }
    return {
      count,
      sourceVersion: hash(
        source.words.map((w) => ({
          wordId: w.wordId,
          wordVersion: w.wordVersion,
        })),
      ),
      reasons:
        count < (req.mode === "MATCH_MEANINGS" ? 5 : 1)
          ? ["INSUFFICIENT_GAME_SOURCE"]
          : [],
    };
  },
};
