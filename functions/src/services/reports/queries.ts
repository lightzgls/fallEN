import type { Actor } from "../../contracts/callable.js";
import type { ReportStore } from "../../contracts/reports/store.js";
import type {
  GetReportContextInput,
  GetMyReportsInput,
  GetMyReportInput,
  ListReportsInput,
  GetReportInput,
} from "../../contracts/reports/inputs.js";
import { publicReport } from "../../domain/reports/public-view.js";
import { fail } from "../../shared/errors.js";
import { required } from "../content/required.js";
import { getSnapshot } from "./snapshot.js";
export function createReportQueries(store: ReportStore) {
  return {
    getReportContext: async (actor: Actor, req: GetReportContextInput) => {
      await store.active(actor);
      return {
        targetRef: req.targetRef,
        targetSnapshot: await getSnapshot(store, actor, req.targetRef),
      };
    },
    getMyReports: async (actor: Actor, req: GetMyReportsInput) => {
      await store.active(actor);
      const result = await store.ownerReports(actor.uid, req.cursor);
      return { ...result, items: result.items.map(publicReport) };
    },
    getMyReport: async (actor: Actor, req: GetMyReportInput) => {
      await store.active(actor);
      const report = required(await store.report(req.reportId));
      if (report.ownerUid !== actor.uid) fail("PERMISSION_DENIED");
      return publicReport(report);
    },
    listReports: async (actor: Actor, req: ListReportsInput) => {
      await store.active(actor);
      return store.queue(req);
    },
    getReport: async (actor: Actor, req: GetReportInput) => {
      await store.active(actor);
      const report = required(await store.report(req.reportId));
      return { ...report, actions: await store.actions(req.reportId) };
    },
  };
}
