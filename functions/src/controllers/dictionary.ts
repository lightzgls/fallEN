import { controller } from "./controller.js";
import {
  connectionsSchema,
  empty,
  findWordsSchema,
  studySourceSchema,
  wordSchema,
  wordVersionSchema,
} from "../contracts/dictionary/requests.js";
import { requireUser } from "../middleware/auth.js";
import type { createDictionaryService } from "../services/dictionary.js";

export function createDictionaryControllers(
  service: ReturnType<typeof createDictionaryService>,
) {
  return {
    findWords: controller(findWordsSchema, service.findWords),
    getWord: controller(wordSchema, service.getWord),
    getWordVersion: controller(wordVersionSchema, service.getWordVersion),
    findConnections: controller(connectionsSchema, service.findConnections),
    getPublishedDecks: controller(empty, service.getPublishedDecks),
    getStudySource: controller(
      studySourceSchema,
      service.getStudySource,
      requireUser,
    ),
  };
}
