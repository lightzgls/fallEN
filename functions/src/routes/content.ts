import { callable } from "../handlers/callable.js";
import { requireAdmin } from "../middleware/auth.js";
import type { Actor } from "../contracts/callable.js";
import { createContentService } from "../services/content.js";
import { createContentStore } from "../infrastructure/content/store.js";
import { createContentControllers } from "../controllers/content.js";
const service = createContentService(createContentStore());
export const contentHandlers = createContentControllers(service);
export const createDeck = callable("createDeck", contentHandlers.createDeck);
export const openDraft = callable("openDraft", contentHandlers.openDraft);
export const saveDraft = callable("saveDraft", contentHandlers.saveDraft);
export const setDeckActive = callable(
  "setDeckActive",
  contentHandlers.setDeckActive,
);
export const listDecks = callable("listDecks", contentHandlers.listDecks);
export const getDraft = callable("getDraft", contentHandlers.getDraft);
export const previewImport = callable(
  "previewImport",
  contentHandlers.previewImport,
);
export const resolveImportRow = callable(
  "resolveImportRow",
  contentHandlers.resolveImportRow,
);
export const applyImport = callable("applyImport", contentHandlers.applyImport);
export const getImport = callable("getImport", contentHandlers.getImport);
export const listImports = callable("listImports", contentHandlers.listImports);
export const getSpeech = callable("getSpeech", contentHandlers.getSpeech);
export const saveSpeech = callable("saveSpeech", contentHandlers.saveSpeech);
export const getTopic = callable("getTopic", contentHandlers.getTopic);
export const listTopics = callable("listTopics", contentHandlers.listTopics);
export const saveTopic = callable("saveTopic", contentHandlers.saveTopic);
export const getLimit = callable("getLimit", contentHandlers.getLimit);
export const saveLimit = callable("saveLimit", contentHandlers.saveLimit);
export const beginContentUpload = callable(
  "beginContentUpload",
  contentHandlers.beginContentUpload,
);
export const finalizeContentUpload = callable(
  "finalizeContentUpload",
  contentHandlers.finalizeContentUpload,
);
export const getImageAsset = callable(
  "getImageAsset",
  contentHandlers.getImageAsset,
);
export const publishSet = callable("publishSet", contentHandlers.publishSet);
export async function resumeImport(
  actor: Actor,
  importId: string,
  commandId: string,
) {
  requireAdmin(actor);
  return service.resumeImport(actor, importId, commandId);
}
export async function resumePublish(
  actor: Actor,
  deckId: string,
  revisionId: string,
  commandId: string,
) {
  requireAdmin(actor);
  return service.resumePublish(actor, deckId, revisionId, commandId);
}
