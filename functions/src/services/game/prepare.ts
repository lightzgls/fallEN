import type { Actor } from "../../contracts/callable.js";
import type { StartGameInput } from "../../contracts/game/inputs.js";
import type {
  Game,
  Command,
  SourceWord,
} from "../../contracts/game/records.js";
import type { PreparationStore } from "../../contracts/game/store.js";
import { stableId } from "../../domain/values.js";
import { requireRecord } from "../../domain/study-consistency.js";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/job-errors.js";
import { hash } from "../../shared/values.js";
import { fail } from "../../shared/errors.js";
import { chooseQuestions, makeRound } from "./questions.js";
export async function startGame(
  store: PreparationStore,
  actor: Actor,
  req: StartGameInput,
): Promise<unknown> {
  if (req.mode === "LISTEN_AND_TYPE" && !req.ttsConfig)
    fail("TTS_UNAVAILABLE", "Listening needs an available Android TTS voice");
  const sessionId = stableId(actor.uid, "game", req.commandId),
    requestHash = hash({ kind: "startGame", input: req });
  const existing = await store.transaction(actor, async (ctx) => {
    await ctx.requireActive();
    const previous = await ctx.command(req.commandId);
    if (previous) {
      if (previous.kind !== "startGame" || previous.requestHash !== requestHash)
        fail("COMMAND_REUSED");
      return previous;
    }
    const source = await ctx.source(req.source);
    if (!source.words.length) fail("EMPTY_SOURCE");
    const manifest: SourceWord[] = source.words.map((w, position) => ({
      wordId: w.wordId,
      wordVersion: w.wordVersion,
      position,
      ...(w.entry?.focusMeaningId
        ? { focusMeaningId: w.entry.focusMeaningId }
        : {}),
    }));
    if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 750 * 1024)
      fail("PAYLOAD_LIMIT", "This source exceeds the game manifest size limit");
    const now = store.now(),
      game: Game = {
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
    const command: Command = {
      kind: "startGame",
      requestHash,
      status: "IN_PROGRESS",
      progress: { sessionId, phase: "PREPARING" },
      createdAt: now,
    };
    ctx.createGame(game);
    ctx.createCommand(req.commandId, command);
    return command;
  });
  if (existing.status === "SUCCEEDED") return existing.receipt;
  if (existing.status === "FAILED")
    fail(existing.error?.code ?? "GAME_PREPARATION_FAILED");
  return prepareGame(store, actor, sessionId);
}
export async function prepareGame(
  store: PreparationStore,
  actor: Actor,
  sessionId: string,
): Promise<unknown> {
  try {
    return await prepareGameSource(store, actor, sessionId);
  } catch (error) {
    const code = businessErrorCode(error);
    if (isPermanentJobFailure(code)) {
      await store.transaction(actor, async (ctx) => {
        const game = requireRecord(await ctx.game(sessionId)),
          command = requireRecord(await ctx.command(game.commandId));
        if (game.status === "PREPARING" && command.status === "IN_PROGRESS") {
          ctx.saveGame({ ...game, status: "INTERRUPTED", error: { code } });
          const failed: Command = {
            ...command,
            status: "FAILED",
            error: { code: code! },
          };
          delete failed.progress;
          ctx.saveCommand(game.commandId, failed);
        }
      });
    }
    throw error;
  }
}
async function prepareGameSource(
  store: PreparationStore,
  actor: Actor,
  sessionId: string,
): Promise<unknown> {
  const snapshot = await store.read(actor, async (ctx) =>
    requireRecord(await ctx.game(sessionId)),
  );
  if (snapshot.status !== "PREPARING") {
    const done = await store.read(actor, async (ctx) =>
      requireRecord(await ctx.command(snapshot.commandId)),
    );
    if (done.status === "SUCCEEDED") return done.receipt;
    fail("CONFLICT");
  }
  const manifest = requireRecord(snapshot.sourceManifest, "SOURCE_INVALID");
  if (
    hash(manifest) !== snapshot.sourceHash ||
    manifest.length !== snapshot.sourceCount
  )
    fail("SOURCE_INVALID");
  for (let offset = 0; offset < manifest.length; offset += 400) {
    await store.transaction(actor, async (ctx) => {
      await ctx.requireActive();
      const game = requireRecord(await ctx.game(sessionId));
      if (game.status !== "PREPARING") return;
      ctx.saveSourceWords(sessionId, manifest.slice(offset, offset + 400));
    });
  }
  return store.transaction(actor, async (ctx) => {
    await ctx.requireActive();
    const game = requireRecord(await ctx.game(sessionId)),
      command = requireRecord(await ctx.command(game.commandId));
    if (command.status === "SUCCEEDED") return command.receipt;
    if (game.status !== "PREPARING") fail("CONFLICT");
    const stored = await ctx.sourceWords(sessionId);
    if (stored.length !== game.sourceCount || hash(stored) !== game.sourceHash)
      fail("SOURCE_INVALID");
    const questions = await chooseQuestions(ctx, game, game.ttsConfig),
      firstRound = makeRound(game, questions, store.now());
    const publicGame: Game = {
      ...game,
      status: "ACTIVE",
      version: 1,
      currentRoundId: firstRound.id,
      nextRoundOrder: 2,
    };
    delete publicGame.sourceManifest;
    ctx.createRound(firstRound);
    ctx.createQuestions(game.id, firstRound.id, questions);
    ctx.saveGame(publicGame);
    const receipt = {
      game: publicGame,
      firstRound: { ...firstRound, questions },
    };
    if (Buffer.byteLength(JSON.stringify(receipt), "utf8") > 750 * 1024)
      fail("PAYLOAD_LIMIT", "This round exceeds the receipt size limit");
    const completed: Command = { ...command, status: "SUCCEEDED", receipt };
    delete completed.progress;
    ctx.saveCommand(game.commandId, completed);
    return receipt;
  });
}
