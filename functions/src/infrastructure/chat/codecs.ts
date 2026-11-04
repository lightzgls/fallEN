import type { z } from "zod";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  chatRecord,
  chatSummaryRecord,
  endCommandRecord,
  scenarioRecord,
  turnRecord,
} from "../../contracts/chat/records.js";
import { parse } from "../../shared/validation.js";
import { fail } from "../../shared/errors.js";
import { plainValue } from "../firebase/records.js";

export function stored<Schema extends z.ZodType>(
  schema: Schema,
  doc: DocumentSnapshot,
): z.output<Schema> | undefined {
  return doc.exists ? parse(schema, plainValue(doc.data())) : undefined;
}
export const storedChat = (doc: DocumentSnapshot) =>
  stored(chatRecord, doc) ?? fail("NOT_FOUND");
export const storedTurn = (doc: DocumentSnapshot) => stored(turnRecord, doc);
export const storedSummary = (doc: DocumentSnapshot) =>
  stored(chatSummaryRecord, doc);
export const storedCommand = (doc: DocumentSnapshot) =>
  stored(endCommandRecord, doc);
export const storedScenario = (doc: DocumentSnapshot) =>
  stored(scenarioRecord, doc) ?? fail("TOPIC_NOT_FOUND");
