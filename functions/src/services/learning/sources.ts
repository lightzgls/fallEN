import { type Transaction } from "firebase-admin/firestore";
import { type Source } from "../../domain/backend.js";
import { type Actor } from "../../shared/core.js";
import { readDeckSource, readPersonalSource } from "../dictionary.js";

export async function sourceWords(
  actor: Actor,
  source: Source,
  tx?: Transaction,
) {
  return source.sourceType === "SYSTEM_DECK"
    ? readDeckSource(source, tx)
    : readPersonalSource(actor, tx);
}
