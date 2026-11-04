import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/job-errors.js";
import { stableId } from "../../domain/values.js";
import { gameRef } from "../../infrastructure/game/refs.js";
import { stageRound } from "../../infrastructure/game/round-store.js";
import {
  assertActive,
  db,
  fail,
  hash,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { readDeckSource, readPersonalSource } from "../dictionary.js";
import { startSchema } from "./schemas.js";
import { chooseQuestions } from "./questions.js";

export async function startGame(actor: Actor, raw: unknown) {
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

export async function prepareGameSource(
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
