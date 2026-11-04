import { callable } from "../handlers/callable.js";

import { createReportService } from "../services/reports.js";
import { createReportStore } from "../infrastructure/reports/store.js";
import { createReportControllers } from "../controllers/reports.js";
export const reportHandlers = createReportControllers(
  createReportService(createReportStore()),
);
export const submitReport = callable(
  "submitReport",
  reportHandlers.submitReport,
);
export const updateReportStatus = callable(
  "updateReportStatus",
  reportHandlers.updateReportStatus,
);
export const getReportContext = callable(
  "getReportContext",
  reportHandlers.getReportContext,
);
export const getMyReports = callable(
  "getMyReports",
  reportHandlers.getMyReports,
);
export const getMyReport = callable("getMyReport", reportHandlers.getMyReport);
export const listReports = callable("listReports", reportHandlers.listReports);
export const getReport = callable("getReport", reportHandlers.getReport);
export const closeReport = callable("closeReport", reportHandlers.closeReport);
