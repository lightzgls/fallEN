import type { Actor } from "../../contracts/callable.js";
import type { ConfigurationStore } from "../../contracts/content/ports.js";
import type {
  GetSpeechInput,
  SaveSpeechInput,
  GetTopicInput,
  ListTopicsInput,
  SaveTopicInput,
  GetLimitInput,
  SaveLimitInput,
} from "../../contracts/content/config-inputs.js";
import { stableId } from "../../domain/values.js";
import { contentVersion } from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
export function createConfigurationOperations(store: ConfigurationStore) {
  return {
    getSpeech: async (actor: Actor, req: GetSpeechInput) => {
      await store.active(actor);
      return (
        (await store.speech(req.wordId)) ?? {
          provider: "ANDROID_TTS",
          text: "",
          listenAllowed: false,
          version: 0,
        }
      );
    },
    saveSpeech: async (actor: Actor, req: SaveSpeechInput) =>
      store.command(actor, "saveSpeech", req, async (tx) => {
        const release = await tx.release(),
          entry = required(await tx.releaseEntry(release.id, req.wordId));
        const lexical = await tx.wordVersion(req.wordId, entry.wordVersion),
          old = await tx.speech(req.wordId);
        contentVersion(old?.version ?? 0, req.expectedVersion);
        if (req.listenAllowed && (!entry.active || !lexical.meanings.length))
          fail("VALIDATION_FAILED");
        const speech = {
          provider: "ANDROID_TTS",
          text: lexical.spelling,
          listenAllowed: req.listenAllowed,
          version: req.expectedVersion + 1,
        };
        tx.stageSpeech(req.wordId, speech);
        return speech;
      }),
    listTopics: async (actor: Actor, _req: ListTopicsInput) => {
      await store.active(actor);
      return { items: await store.topics() };
    },
    getTopic: async (actor: Actor, req: GetTopicInput) => {
      await store.active(actor);
      return required(await store.topic(req.topicId));
    },
    saveTopic: async (actor: Actor, req: SaveTopicInput) =>
      store.command(actor, "saveTopic", req, async (tx, now) => {
        const topicId =
            req.topicId ?? stableId(actor.uid, "topic", req.commandId),
          old = await tx.topic(topicId);
        contentVersion(old?.version ?? 0, req.expectedVersion);
        const { expectedVersion, commandId: _commandId, ...data } = req;
        const topic = {
          ...data,
          id: topicId,
          version: expectedVersion + 1,
          updatedAt: now,
        };
        tx.stageTopic(topicId, topic);
        return topic;
      }),
    getLimit: async (actor: Actor, _req: GetLimitInput) => {
      await store.active(actor);
      return (await store.limit()) ?? { maxSessionsPerDay: 0, version: 0 };
    },
    saveLimit: async (actor: Actor, req: SaveLimitInput) =>
      store.command(actor, "saveLimit", req, async (tx) => {
        const old = await tx.limit();
        contentVersion(old?.version ?? 0, req.expectedVersion);
        const limit = {
          maxSessionsPerDay: req.maxSessionsPerDay,
          version: req.expectedVersion + 1,
        };
        tx.stageLimit(limit);
        return limit;
      }),
  };
}
