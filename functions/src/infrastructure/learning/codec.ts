import type { DocumentSnapshot } from "firebase-admin/firestore";
import type { z } from "zod";
import { plainValue as plain } from "../firebase/records.js";
export { plain };
export function record<S extends z.ZodType>(
  snapshot: DocumentSnapshot,
  schema: S,
): z.output<S> | undefined {
  return snapshot.exists ? schema.parse(plain(snapshot.data())) : undefined;
}
