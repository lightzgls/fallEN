import {
  FieldPath,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import type {
  ReportStore,
  ReportTransaction,
} from "../../contracts/reports/store.js";
import { db } from "../firebase/runtime.js";
import { assertActive } from "../firebase/access.js";
import { command } from "../firebase/commands.js";
import { cursorDecode, cursorEncode, hash } from "../../shared/values.js";
import { fail } from "../../shared/errors.js";
import { parse } from "../../shared/validation.js";
import { objectId } from "../../domain/values.js";
import { fromStored } from "../content/stored-values.js";
import { reportReader, reportRecord } from "./reader.js";
function reportTransaction(tx: Transaction): ReportTransaction {
  return {
    ...reportReader(tx),
    stageReport: (id, data, create = false) => {
      const ref = db.doc(`contentReports/${id}`);
      if (create) tx.create(ref, data);
      else tx.set(ref, data);
    },
    stageAction: (id, actionId, data) => {
      tx.create(db.doc(`contentReports/${id}/actions/${actionId}`), data);
    },
  };
}
export function createReportStore(): ReportStore {
  return {
    ...reportReader(),
    active: (actor) => assertActive(actor),
    command: async (actor, kind, input, work) =>
      parse(
        z.record(z.string(), z.unknown()),
        fromStored(
          await command(actor, kind, input, (tx, now) =>
            work(reportTransaction(tx), now.toDate()),
          ),
        ),
      ),
    ownerReports: async (uid, token) => {
      let query = db
        .collection("contentReports")
        .where("ownerUid", "==", uid)
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (token) {
        const cursor = cursorDecode(token);
        if (
          cursor.uid !== uid ||
          cursor.kind !== "reports" ||
          !Number.isFinite(cursor.time)
        )
          fail("VALIDATION_FAILED");
        query = query.startAfter(
          Timestamp.fromMillis(cursor.time),
          parse(objectId, cursor.id),
        );
      }
      const result = await query.limit(21).get(),
        last = result.docs[19];
      return {
        items: result.docs
          .slice(0, 20)
          .map((snapshot) => parse(reportRecord, fromStored(snapshot.data()))),
        ...(result.size > 20
          ? {
              cursor: cursorEncode({
                uid,
                kind: "reports",
                time: last.data().createdAt.toMillis(),
                id: last.id,
              }),
            }
          : {}),
      };
    },
    queue: async (filter) => {
      let query: FirebaseFirestore.Query = db.collection("contentReports");
      if (filter.status) query = query.where("status", "==", filter.status);
      if (filter.category)
        query = query.where("category", "==", filter.category);
      query = query.orderBy("updatedAt").orderBy(FieldPath.documentId());
      if (filter.cursor) {
        const cursor = cursorDecode(filter.cursor);
        if (
          cursor.filter !==
            hash({ status: filter.status, category: filter.category }) ||
          !Number.isFinite(cursor.time)
        )
          fail("VALIDATION_FAILED");
        query = query.startAfter(
          Timestamp.fromMillis(cursor.time),
          parse(objectId, cursor.id),
        );
      }
      const result = await query.limit(31).get(),
        last = result.docs[29];
      return {
        items: result.docs
          .slice(0, 30)
          .map((snapshot) => parse(reportRecord, fromStored(snapshot.data()))),
        ...(result.size > 30
          ? {
              cursor: cursorEncode({
                filter: hash({
                  status: filter.status,
                  category: filter.category,
                }),
                time: last.data().updatedAt.toMillis(),
                id: last.id,
              }),
            }
          : {}),
      };
    },
  };
}
