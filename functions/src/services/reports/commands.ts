import { z } from "zod";
import { objectId, stableId, version } from "../../domain/backend.js";
import {
  categorySchema,
  resolutionSchema,
  statusSchema,
  targetSchema,
  transitions,
} from "../../domain/reports/contracts.js";
import { publicReport } from "../../domain/reports/public-report.js";
import { reportRef } from "../../infrastructure/reports/references.js";
import { getSnapshot } from "../../infrastructure/reports/target-snapshot.js";
import {
  assertAdmin,
  checkVersion,
  command,
  fail,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";
import { validateFix } from "./fix-validation.js";

export async function submitReport(actor: Actor, raw: unknown) {
  const req = parse(
    z
      .object({
        commandId: objectId,
        targetRef: targetSchema,
        category: categorySchema,
        description: z.string().trim().min(1).max(1000),
      })
      .strict(),
    raw,
  );
  const reportId = stableId(actor.uid, "report", req.commandId);
  return command(actor, "submitReport", req, async (tx, now) => {
    const targetSnapshot = await getSnapshot(actor, req.targetRef, tx);
    const report = {
      reportId,
      ownerUid: actor.uid,
      category: req.category,
      description: req.description,
      targetRef: req.targetRef,
      targetSnapshot,
      status: "OPEN",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(reportRef(reportId), report);
    return { report: publicReport(report) };
  });
}

export async function updateReportStatus(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        commandId: objectId,
        reportId: objectId,
        expectedVersion: version,
        newStatus: statusSchema,
        publicNote: z.string().trim().min(1).max(1000).optional(),
        resolutionKind: z.enum(["FIXED", "NOT_AN_ERROR"]).optional(),
        resolutionRef: resolutionSchema.optional(),
      })
      .strict(),
    raw,
  );
  return command(actor, "updateReportStatus", req, async (tx, now) => {
    const ref = reportRef(req.reportId);
    const report = requireDoc(await tx.get(ref));
    checkVersion(report.version, req.expectedVersion);
    if (!transitions[report.status]?.includes(req.newStatus))
      fail("VALIDATION_FAILED", "This report status transition is not allowed");
    if (["RESOLVED", "REJECTED"].includes(req.newStatus) && !req.publicNote)
      fail("VALIDATION_FAILED", "A public conclusion is required");
    if (req.newStatus === "RESOLVED") {
      if (req.resolutionKind !== "FIXED" || !req.resolutionRef)
        fail(
          "VALIDATION_FAILED",
          "Resolved reports need a published fix reference",
        );
      await validateFix(report, req.resolutionRef, tx);
    } else if (req.resolutionRef || req.resolutionKind)
      fail("VALIDATION_FAILED", "Only resolved reports accept a fix reference");
    const updated = {
      ...report,
      status: req.newStatus,
      version: report.version + 1,
      updatedAt: now,
      reviewerUid: actor.uid,
      ...(req.publicNote ? { publicResolution: req.publicNote } : {}),
      ...(req.resolutionKind
        ? {
            resolutionKind: req.resolutionKind,
            resolutionRef: req.resolutionRef,
          }
        : {}),
    };
    tx.set(ref, updated);
    tx.create(ref.collection("actions").doc(req.commandId), {
      actionId: req.commandId,
      commandId: req.commandId,
      actorUid: actor.uid,
      fromStatus: report.status,
      toStatus: req.newStatus,
      ...(req.publicNote ? { note: req.publicNote } : {}),
      ...(req.resolutionRef ? { resolutionRef: req.resolutionRef } : {}),
      createdAt: now,
    });
    return { report: updated };
  });
}
