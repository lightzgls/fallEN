import type { ApiMap, ContentReport, ReportStatus } from "../../models";
export interface ReportResolutionForm {
  newStatus: ReportStatus;
  note: string;
  kind: string;
  setId: string;
  revisionId: string;
  releaseId: string;
  speechVersion: string;
}
export function buildReportStatusPayload(
  report: ContentReport,
  form: ReportResolutionForm,
): Omit<ApiMap["updateReportStatus"]["input"], "commandId"> {
  let resolutionRef: Record<string, unknown> | undefined;
  if (form.newStatus === "RESOLVED") {
    if (form.kind === "DECK_REVISION") {
      if (!form.setId.trim() || !form.revisionId.trim())
        throw new Error("Cần mã bộ và revision đã công khai.");
      resolutionRef = {
        kind: form.kind,
        wordSetId: form.setId.trim(),
        revisionId: form.revisionId.trim(),
      };
    } else if (form.kind === "SPEECH") {
      const version = Number(form.speechVersion);
      if (!Number.isSafeInteger(version) || version < 1)
        throw new Error("Nhập phiên bản Speech đã lưu.");
      resolutionRef = {
        kind: form.kind,
        wordId: report.targetRef.wordId,
        speechVersion: version,
      };
    } else {
      if (!form.releaseId.trim())
        throw new Error("Nhập mã release đã công khai.");
      resolutionRef = { kind: form.kind, releaseId: form.releaseId.trim() };
    }
  }
  return {
    reportId: report.reportId,
    expectedVersion: report.version,
    newStatus: form.newStatus,
    ...(form.note.trim() ? { publicNote: form.note.trim() } : {}),
    ...(form.newStatus === "RESOLVED"
      ? { resolutionKind: "FIXED", resolutionRef }
      : {}),
  };
}
