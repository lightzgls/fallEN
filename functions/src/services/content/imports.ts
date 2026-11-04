import { z } from "zod";
import { objectId } from "../../domain/values.js";
import { publicItem } from "../../infrastructure/content/decks.js";
import { importRef } from "../../infrastructure/content/refs.js";
import { db, parse, requireDoc, type Actor } from "../../shared/core.js";
import { admin } from "./access.js";
import { rowCounts } from "./import-preview.js";

export async function getImport(actor: Actor, raw: unknown) {
  const req = parse(z.object({ importId: objectId }).strict(), raw);
  await admin(actor);
  const batch = requireDoc(await importRef(req.importId).get());
  const rows = (
    await importRef(req.importId).collection("rows").orderBy("rowNumber").get()
  ).docs.map((s) => s.data());
  return { ...batch, rows, counts: rowCounts(rows) };
}

export async function listImports(actor: Actor, raw: unknown) {
  const req = parse(z.object({ wordSetId: objectId }).strict(), raw);
  await admin(actor);
  return {
    items: (
      await db
        .collection("contentImports")
        .where("wordSetId", "==", req.wordSetId)
        .orderBy("createdAt", "desc")
        .get()
    ).docs.map(publicItem),
  };
}
