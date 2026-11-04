import type { ReportStore } from "../contracts/reports/store.js";
import { createReportCommands } from "./reports/commands.js";
import { createReportQueries } from "./reports/queries.js";
export function createReportService(store: ReportStore) {
  return { ...createReportCommands(store), ...createReportQueries(store) };
}
export type ReportService = ReturnType<typeof createReportService>;
