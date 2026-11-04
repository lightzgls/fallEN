import type { Actor } from "../../contracts/callable.js";
import type { ReportStore } from "../../contracts/reports/store.js";
import type {
  SubmitReportInput,
  UpdateReportStatusInput,
} from "../../contracts/reports/inputs.js";
import { stableId } from "../../domain/values.js";
import { transitions } from "../../domain/reports/transitions.js";
import { publicReport } from "../../domain/reports/public-view.js";
import { contentVersion } from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { required } from "../content/required.js";
import { getSnapshot } from "./snapshot.js";
import { validateFix } from "./fix-validation.js";
export function createReportCommands(store: ReportStore) {
  return {
    submitReport: async (actor: Actor, req: SubmitReportInput) => {
      const reportId = stableId(actor.uid, "report", req.commandId);
      return store.command(actor, "submitReport", req, async (tx, now) => {
        const targetSnapshot = await getSnapshot(tx, actor, req.targetRef);
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
        tx.stageReport(reportId, report, true);
        return { report: publicReport(report) };
      });
    },
    updateReportStatus: async (actor: Actor, req: UpdateReportStatusInput) =>
      store.command(actor, "updateReportStatus", req, async (tx, now) => {
        const report = required(await tx.report(req.reportId));
        contentVersion(report.version, req.expectedVersion);
        if (!transitions[report.status]?.includes(req.newStatus))
          fail(
            "VALIDATION_FAILED",
            "This report status transition is not allowed",
          );
        if (["RESOLVED", "REJECTED"].includes(req.newStatus) && !req.publicNote)
          fail("VALIDATION_FAILED", "A public conclusion is required");
        if (req.newStatus === "RESOLVED") {
          if (req.resolutionKind !== "FIXED" || !req.resolutionRef)
            fail(
              "VALIDATION_FAILED",
              "Resolved reports need a published fix reference",
            );
          await validateFix(tx, report, req.resolutionRef);
        } else if (req.resolutionRef || req.resolutionKind)
          fail(
            "VALIDATION_FAILED",
            "Only resolved reports accept a fix reference",
          );
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
        tx.stageReport(req.reportId, updated);
        tx.stageAction(req.reportId, req.commandId, {
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
      }),
  };
}
