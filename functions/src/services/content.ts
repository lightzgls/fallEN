import { type Actor } from "../shared/types.js";
import {
  getLimit,
  getSpeech,
  getTopic,
  listTopics,
  saveLimit,
  saveSpeech,
  saveTopic,
} from "./content/configuration.js";
import {
  createDeck,
  openDraft,
  saveDraft,
  setDeckActive,
} from "./content/deck-drafts.js";
import { getDraft, listDecks } from "./content/deck-queries.js";
import { applyImport } from "./content/import-apply.js";
import { previewImport, resolveImportRow } from "./content/import-preview.js";
import { getImport, listImports } from "./content/import-queries.js";
import { publishSet } from "./content/publication.js";
import {
  beginContentUpload,
  finalizeContentUpload,
  getImageAsset,
} from "./content/uploads.js";

export { resumeImport } from "./content/import-application.js";
export { resumePublish } from "./content/publication.js";

/** Public Callable registry; each operation is implemented in its feature module. */
export const contentHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  createDeck,
  openDraft,
  saveDraft,
  publishSet,
  previewImport,
  resolveImportRow,
  applyImport,
  beginContentUpload,
  finalizeContentUpload,
  listDecks,
  getDraft,
  setDeckActive,
  getImport,
  listImports,
  getImageAsset,
  getSpeech,
  saveSpeech,
  listTopics,
  getTopic,
  saveTopic,
  getLimit,
  saveLimit,
};
