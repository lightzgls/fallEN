import type { ContentStore } from "../contracts/content/store.js";
import { createConfigurationOperations } from "./content/config.js";
import { createDraftOperations } from "./content/drafts.js";
import { createDeckQueries } from "./content/decks.js";
import { createImportApplication } from "./content/import-commands.js";
import { createPreviewOperations } from "./content/import-preview.js";
import { createImportQueries } from "./content/imports.js";
import { createPublicationOperations } from "./content/publish.js";
import { createUploadOperations } from "./content/uploads.js";
export function createContentService(store: ContentStore) {
  return {
    ...createConfigurationOperations(store),
    ...createDraftOperations(store),
    ...createDeckQueries(store),
    ...createImportApplication(store),
    ...createPreviewOperations(store),
    ...createImportQueries(store),
    ...createPublicationOperations(store),
    ...createUploadOperations(store),
  };
}
export type ContentService = ReturnType<typeof createContentService>;
