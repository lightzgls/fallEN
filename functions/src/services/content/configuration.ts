import { z } from "zod";
import { empty, objectId, stableId, version } from "../../domain/backend.js";
import { publicItem } from "../../infrastructure/content/deck-reads.js";
import {
  assertAdmin,
  checkVersion,
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";
import { readWordVersion, resolveRelease } from "../dictionary.js";
import { admin } from "./access.js";

export async function getSpeech(actor: Actor, raw: unknown) {
  const req = parse(z.object({ wordId: objectId }).strict(), raw);
  await admin(actor);
  const word = requireDoc(await db.doc(`words/${req.wordId}`).get());
  return (
    word.speech ?? {
      provider: "ANDROID_TTS",
      text: "",
      listenAllowed: false,
      version: 0,
    }
  );
}

export async function saveSpeech(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        wordId: objectId,
        listenAllowed: z.boolean(),
        expectedVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  return command(actor, "saveSpeech", req, async (tx) => {
    const release = await resolveRelease(undefined, tx);
    const entry = requireDoc(
      await tx.get(
        db.doc(`dictionaryReleases/${release.id}/entries/${req.wordId}`),
      ),
    );
    const lexical = await readWordVersion(req.wordId, entry.wordVersion, tx);
    const ref = db.doc(`words/${req.wordId}`);
    const word = requireDoc(await tx.get(ref));
    checkVersion(word.speech?.version ?? 0, req.expectedVersion);
    if (req.listenAllowed && (!entry.active || !lexical.meanings.length))
      fail("VALIDATION_FAILED");
    const speech = {
      provider: "ANDROID_TTS",
      text: lexical.spelling,
      listenAllowed: req.listenAllowed,
      version: req.expectedVersion + 1,
    };
    tx.update(ref, { speech });
    return speech;
  });
}

export async function listTopics(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await admin(actor);
  return {
    items: (
      await db.collection("aiScenarios").orderBy("__name__").get()
    ).docs.map(publicItem),
  };
}

export async function getTopic(actor: Actor, raw: unknown) {
  const req = parse(z.object({ topicId: objectId }).strict(), raw);
  await admin(actor);
  return requireDoc(await db.doc(`aiScenarios/${req.topicId}`).get());
}

export async function saveTopic(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        topicId: objectId.optional(),
        name: z.string().trim().min(1).max(150),
        context: z.string().trim().min(1).max(2000),
        learnerRole: z.string().trim().min(1).max(300),
        aiRole: z.string().trim().min(1).max(300),
        goal: z.string().trim().min(1).max(1000),
        openingLine: z.string().trim().min(1).max(1000),
        guide: z.string().trim().min(1).max(2000),
        active: z.boolean(),
        expectedVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  return command(actor, "saveTopic", req, async (tx, now) => {
    const topicId = req.topicId ?? stableId(actor.uid, "topic", req.commandId);
    const ref = db.doc(`aiScenarios/${topicId}`);
    const old = (await tx.get(ref)).data();
    checkVersion(old?.version ?? 0, req.expectedVersion);
    const { expectedVersion, commandId: _commandId, ...data } = req;
    const topic = {
      ...data,
      id: topicId,
      version: expectedVersion + 1,
      updatedAt: now,
    };
    tx.set(ref, topic);
    return topic;
  });
}

export async function getLimit(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await admin(actor);
  return (
    (await db.doc("config/ai").get()).data() ?? {
      maxSessionsPerDay: 0,
      version: 0,
    }
  );
}

export async function saveLimit(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        maxSessionsPerDay: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        expectedVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  return command(actor, "saveLimit", req, async (tx) => {
    const ref = db.doc("config/ai");
    const old = (await tx.get(ref)).data();
    checkVersion(old?.version ?? 0, req.expectedVersion);
    const limit = {
      maxSessionsPerDay: req.maxSessionsPerDay,
      version: req.expectedVersion + 1,
    };
    tx.set(ref, limit);
    return limit;
  });
}
