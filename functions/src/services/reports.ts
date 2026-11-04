import { type Actor } from "../shared/types.js";
import { submitReport, updateReportStatus } from "./reports/commands.js";
import {
  getReportContext,
  getMyReports,
  getMyReport,
  listReports,
  getReport,
} from "./reports/queries.js";
export const reportHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  submitReport: submitReport,
  updateReportStatus: updateReportStatus,
  closeReport: updateReportStatus,
  getReportContext: getReportContext,
  getMyReports: getMyReports,
  getMyReport: getMyReport,
  listReports: listReports,
  getReport: getReport,
};
