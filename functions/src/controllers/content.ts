import type { ContentService } from "../services/content.js";
import { controller } from "./controller.js";
import { requireAdmin, requireUser } from "../middleware/auth.js";
import {
  createDeckSchema,
  openDraftSchema,
  saveDraftSchema,
  setDeckActiveSchema,
  listDecksSchema,
  getDraftSchema,
} from "../contracts/content/drafts-inputs.js";
import {
  previewImportSchema,
  resolveImportRowSchema,
  applyImportSchema,
  getImportSchema,
  listImportsSchema,
} from "../contracts/content/imports-inputs.js";
import {
  getSpeechSchema,
  saveSpeechSchema,
  getTopicSchema,
  listTopicsSchema,
  saveTopicSchema,
  getLimitSchema,
  saveLimitSchema,
} from "../contracts/content/config-inputs.js";
import {
  beginContentUploadSchema,
  finalizeContentUploadSchema,
  getImageAssetSchema,
} from "../contracts/content/uploads-inputs.js";
import { publishSetSchema } from "../contracts/content/publication-inputs.js";
export function createContentControllers(service: ContentService) {
  return {
    createDeck: controller(createDeckSchema, service.createDeck, requireAdmin),
    openDraft: controller(openDraftSchema, service.openDraft, requireAdmin),
    saveDraft: controller(saveDraftSchema, service.saveDraft, requireAdmin),
    setDeckActive: controller(
      setDeckActiveSchema,
      service.setDeckActive,
      requireAdmin,
    ),
    listDecks: controller(listDecksSchema, service.listDecks, requireAdmin),
    getDraft: controller(getDraftSchema, service.getDraft, requireAdmin),
    previewImport: controller(
      previewImportSchema,
      service.previewImport,
      requireAdmin,
    ),
    resolveImportRow: controller(
      resolveImportRowSchema,
      service.resolveImportRow,
      requireAdmin,
    ),
    applyImport: controller(
      applyImportSchema,
      service.applyImport,
      requireAdmin,
    ),
    getImport: controller(getImportSchema, service.getImport, requireAdmin),
    listImports: controller(
      listImportsSchema,
      service.listImports,
      requireAdmin,
    ),
    getSpeech: controller(getSpeechSchema, service.getSpeech, requireAdmin),
    saveSpeech: controller(saveSpeechSchema, service.saveSpeech, requireAdmin),
    getTopic: controller(getTopicSchema, service.getTopic, requireAdmin),
    listTopics: controller(listTopicsSchema, service.listTopics, requireAdmin),
    saveTopic: controller(saveTopicSchema, service.saveTopic, requireAdmin),
    getLimit: controller(getLimitSchema, service.getLimit, requireAdmin),
    saveLimit: controller(saveLimitSchema, service.saveLimit, requireAdmin),
    beginContentUpload: controller(
      beginContentUploadSchema,
      service.beginContentUpload,
      requireAdmin,
    ),
    finalizeContentUpload: controller(
      finalizeContentUploadSchema,
      service.finalizeContentUpload,
      requireAdmin,
    ),
    getImageAsset: controller(
      getImageAssetSchema,
      service.getImageAsset,
      requireUser,
    ),
    publishSet: controller(publishSetSchema, service.publishSet, requireAdmin),
  };
}
