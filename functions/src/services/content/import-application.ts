import { FieldValue } from "firebase-admin/firestore";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/backend-errors.js";
import { importRef } from "../../infrastructure/content/references.js";
import {
  assertActive,
  assertAdmin,
  db,
  fail,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { applyImportRow } from "./import-row-application.js";
export async function resumeImport(
  actor: Actor,
  importId: string,
  commandId: string,
): Promise<Data> {
  try {
    return await applyImportRows(actor, importId, commandId);
  } catch (error) {
    const code = businessErrorCode(error);
    if (isPermanentJobFailure(code)) {
      await db.runTransaction(async (tx) => {
        const batchRef = importRef(importId);
        const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
        const [batchSnapshot, commandSnapshot] = await tx.getAll(
          batchRef,
          cmdRef,
        );
        if (
          batchSnapshot.data()?.status === "APPLYING" &&
          batchSnapshot.data()?.applyCommandId === commandId &&
          commandSnapshot.data()?.status === "IN_PROGRESS"
        ) {
          tx.update(batchRef, { status: "FAILED", error: { code } });
          tx.update(cmdRef, {
            status: "FAILED",
            error: { code },
            progress: FieldValue.delete(),
          });
        }
      });
    }
    throw error;
  }
}

export async function applyImportRows(
  actor: Actor,
  importId: string,
  commandId: string,
): Promise<Data> {
  assertAdmin(actor);
  const batchRef = importRef(importId);
  const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
  const rows = await batchRef.collection("rows").orderBy("rowNumber").get();
  for (const rowSnapshot of rows.docs) {
    await db.runTransaction((tx) =>
      applyImportRow(actor, commandId, batchRef, rowSnapshot.ref, cmdRef, tx),
    );
  }
  return finishImportApplication(actor, importId, commandId);
}

async function finishImportApplication(
  actor: Actor,
  importId: string,
  commandId: string,
): Promise<Data> {
  const batchRef = importRef(importId);
  const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [batchSnapshot, cmdSnapshot] = await tx.getAll(batchRef, cmdRef);
    if (cmdSnapshot.data()?.status === "SUCCEEDED")
      return cmdSnapshot.data()!.receipt;
    const current = requireDoc(batchSnapshot);
    const rowSnapshots = await tx.get(batchRef.collection("rows"));
    if (
      current.applyCommandId !== commandId ||
      rowSnapshots.docs.some(
        (s) => !["APPLIED", "SKIPPED"].includes(s.data().status),
      )
    )
      fail("CONFLICT");
    const receipt = {
      importId,
      appliedRowIds: rowSnapshots.docs
        .filter((s) => s.data().status === "APPLIED")
        .map((s) => s.id),
      skippedRowIds: rowSnapshots.docs
        .filter((s) => s.data().status === "SKIPPED")
        .map((s) => s.id),
      errors: [],
      draftVersion: current.progressDraftVersion,
    };
    tx.update(batchRef, { status: "APPLIED" });
    tx.update(cmdRef, {
      status: "SUCCEEDED",
      receipt,
      progress: FieldValue.delete(),
    });
    return receipt;
  });
}
