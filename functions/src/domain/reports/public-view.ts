import { type Data } from "../../shared/types.js";

export function publicReport(report: Data): Data {
  return {
    reportId: report.reportId,
    category: report.category,
    description: report.description,
    targetRef: report.targetRef,
    targetSnapshot: report.targetSnapshot,
    status: report.status,
    version: report.version,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    ...(report.publicResolution
      ? { publicResolution: report.publicResolution }
      : {}),
    ...(report.resolutionKind ? { resolutionKind: report.resolutionKind } : {}),
    ...(report.resolutionRef ? { resolutionRef: report.resolutionRef } : {}),
  };
}
