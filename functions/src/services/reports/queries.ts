import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { objectId } from "../../domain/backend.js";
import {
  categorySchema,
  statusSchema,
  targetSchema,
} from "../../domain/reports/contracts.js";
import { publicReport } from "../../domain/reports/public-report.js";
import { reportRef } from "../../infrastructure/reports/references.js";
import { getSnapshot } from "../../infrastructure/reports/target-snapshot.js";
import {
  assertActive,
  assertAdmin,
  cursorDecode,
  cursorEncode,
  db,
  fail,
  hash,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";

export async function getReportContext(actor: Actor, raw: unknown) {
  const req = parse(z.object({ targetRef: targetSchema }).strict(), raw);
  await assertActive(actor);
  return {
    targetRef: req.targetRef,
    targetSnapshot: await getSnapshot(actor, req.targetRef),
  };
}

export async function getMyReports(actor: Actor, raw: unknown) {
  const req = parse(
    z.object({ cursor: z.string().max(2048).optional() }).strict(),
    raw,
  );
  await assertActive(actor);
  let query = db
    .collection("contentReports")
    .where("ownerUid", "==", actor.uid)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (req.cursor) {
    const cursor = cursorDecode(req.cursor);
    if (
      cursor.uid !== actor.uid ||
      cursor.kind !== "reports" ||
      !Number.isFinite(cursor.time)
    )
      fail("VALIDATION_FAILED");
    query = query.startAfter(
      Timestamp.fromMillis(cursor.time),
      parse(objectId, cursor.id),
    );
  }
  const result = await query.limit(21).get();
  const last = result.docs[19];
  return {
    items: result.docs.slice(0, 20).map((s) => publicReport(s.data())),
    ...(result.size > 20
      ? {
          cursor: cursorEncode({
            uid: actor.uid,
            kind: "reports",
            time: last.data().createdAt.toMillis(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function getMyReport(actor: Actor, raw: unknown) {
  const req = parse(z.object({ reportId: objectId }).strict(), raw);
  await assertActive(actor);
  const report = requireDoc(await reportRef(req.reportId).get());
  if (report.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
  return publicReport(report);
}

export async function listReports(actor: Actor, raw: unknown) {
  const req = parse(
    z
      .object({
        status: statusSchema.optional(),
        category: categorySchema.optional(),
        cursor: z.string().max(2048).optional(),
      })
      .strict(),
    raw,
  );
  assertAdmin(actor);
  await assertActive(actor);
  let query: FirebaseFirestore.Query = db.collection("contentReports");
  if (req.status) query = query.where("status", "==", req.status);
  if (req.category) query = query.where("category", "==", req.category);
  query = query.orderBy("updatedAt").orderBy(FieldPath.documentId());
  if (req.cursor) {
    const cursor = cursorDecode(req.cursor);
    if (
      cursor.filter !== hash({ status: req.status, category: req.category }) ||
      !Number.isFinite(cursor.time)
    )
      fail("VALIDATION_FAILED");
    query = query.startAfter(
      Timestamp.fromMillis(cursor.time),
      parse(objectId, cursor.id),
    );
  }
  const result = await query.limit(31).get();
  const last = result.docs[29];
  return {
    items: result.docs.slice(0, 30).map((s) => s.data()),
    ...(result.size > 30
      ? {
          cursor: cursorEncode({
            filter: hash({ status: req.status, category: req.category }),
            time: last.data().updatedAt.toMillis(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function getReport(actor: Actor, raw: unknown) {
  const req = parse(z.object({ reportId: objectId }).strict(), raw);
  assertAdmin(actor);
  await assertActive(actor);
  const ref = reportRef(req.reportId);
  const report = requireDoc(await ref.get());
  const actions = await ref.collection("actions").orderBy("createdAt").get();
  return { ...report, actions: actions.docs.map((s) => s.data()) };
}
