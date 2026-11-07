import { createLearningService } from "../services/learning.js";
import { createFirebaseLearningStore } from "../infrastructure/learning/store.js";
import { createLearningControllers } from "../controllers/learning.js";
import { callable } from "../handlers/callable.js";
import type { Actor } from "../contracts/callable.js";
import { z } from "zod";
import { identifier, parse } from "../shared/validation.js";
import { fail } from "../shared/errors.js";
import { wordCommand } from "../contracts/learning/inputs.js";
import { removeOfflineWord } from "../services/learning/vocabulary.js";
import { offlineVocabularyPage } from "../infrastructure/learning/offline-vocabulary.js";
const learningStore = createFirebaseLearningStore();
export const learningHandlers = createLearningControllers(
  createLearningService(learningStore),
);
const offlineVocabulary = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      owner: z.string().min(1).max(128),
      cursor: identifier.optional(),
      pageSize: z.number().int().min(1).max(30).default(30),
    })
    .strict(),
  wordCommand
    .extend({ action: z.literal("save"), owner: z.string().min(1).max(128) })
    .strict(),
  wordCommand
    .extend({ action: z.literal("remove"), owner: z.string().min(1).max(128) })
    .strict(),
]);
export async function syncVocabularyRequest(actor: Actor, raw: unknown) {
  const input = parse(offlineVocabulary, raw);
  if (input.owner !== actor.uid) fail("PERMISSION_DENIED");
  if (input.action === "list")
    return offlineVocabularyPage(actor, input.cursor, input.pageSize);
  const command = { wordId: input.wordId, commandId: input.commandId };
  if (input.action === "save")
    return learningHandlers.saveWord(actor, {
      ...command,
      source: "DICTIONARY",
    });
  return removeOfflineWord(learningStore, actor, command);
}
export const syncVocabulary = callable("syncVocabulary", syncVocabularyRequest);
export const saveWord = callable("saveWord", learningHandlers.saveWord);
export const removeWord = callable("removeWord", learningHandlers.removeWord);
export const getSavedWords = callable(
  "getSavedWords",
  learningHandlers.getSavedWords,
);
export const getSavedWordCount = callable(
  "getSavedWordCount",
  learningHandlers.getSavedWordCount,
);
export const startStudy = callable("startStudy", learningHandlers.startStudy);
export const startReview = callable(
  "startReview",
  learningHandlers.startReview,
);
export const endStudy = callable("endStudy", learningHandlers.endStudy);
export const getStudySource = callable(
  "getStudySource",
  learningHandlers.getStudySource,
);
export const getStudyPlace = callable(
  "getStudyPlace",
  learningHandlers.getStudyPlace,
);
export const getRatingContext = callable(
  "getRatingContext",
  learningHandlers.getRatingContext,
);
export const saveRating = callable("saveRating", learningHandlers.saveRating);
export const getDueWords = callable(
  "getDueWords",
  learningHandlers.getDueWords,
);
export const getStats = callable("getStats", learningHandlers.getStats);
export const getDashboard = callable(
  "getDashboard",
  learningHandlers.getDashboard,
);
export const getLearningDays = callable(
  "getLearningDays",
  learningHandlers.getLearningDays,
);
export const getHeatmap = callable("getHeatmap", learningHandlers.getHeatmap);
export const getDayActivity = callable(
  "getDayActivity",
  learningHandlers.getDayActivity,
);
export const getChart = callable("getChart", learningHandlers.getChart);
export const getRecentSets = callable(
  "getRecentSets",
  learningHandlers.getRecentSets,
);
