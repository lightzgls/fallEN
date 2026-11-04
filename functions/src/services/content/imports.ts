import type { Actor } from "../../contracts/callable.js";
import type { ImportQueryStore } from "../../contracts/content/ports.js";
import type {
  GetImportInput,
  ListImportsInput,
} from "../../contracts/content/imports-inputs.js";
import { required } from "./required.js";
import { rowCounts } from "./match-row.js";
export function createImportQueries(store: ImportQueryStore) {
  return {
    getImport: async (actor: Actor, req: GetImportInput) => {
      await store.active(actor);
      const batch = required(await store.batch(req.importId)),
        rows = await store.rows(req.importId);
      return { ...batch, rows, counts: rowCounts(rows) };
    },
    listImports: async (actor: Actor, req: ListImportsInput) => {
      await store.active(actor);
      return { items: await store.batches(req.wordSetId) };
    },
  };
}
