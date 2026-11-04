import type { ReportService } from "../services/reports.js";
import { controller } from "./controller.js";
import { requireAdmin, requireUser } from "../middleware/auth.js";
import {
  submitReportSchema,
  updateReportStatusSchema,
  getReportContextSchema,
  getMyReportsSchema,
  getMyReportSchema,
  listReportsSchema,
  getReportSchema,
} from "../contracts/reports/inputs.js";
export function createReportControllers(service: ReportService) {
  return {
    submitReport: controller(
      submitReportSchema,
      service.submitReport,
      requireUser,
    ),
    updateReportStatus: controller(
      updateReportStatusSchema,
      service.updateReportStatus,
      requireAdmin,
    ),
    getReportContext: controller(
      getReportContextSchema,
      service.getReportContext,
      requireUser,
    ),
    getMyReports: controller(
      getMyReportsSchema,
      service.getMyReports,
      requireUser,
    ),
    getMyReport: controller(
      getMyReportSchema,
      service.getMyReport,
      requireUser,
    ),
    listReports: controller(
      listReportsSchema,
      service.listReports,
      requireAdmin,
    ),
    getReport: controller(getReportSchema, service.getReport, requireAdmin),
    closeReport: controller(
      updateReportStatusSchema,
      service.updateReportStatus,
      requireAdmin,
    ),
  };
}
