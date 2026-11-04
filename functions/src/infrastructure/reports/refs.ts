import { db } from "../../shared/core.js";

export const reportRef = (reportId: string) =>
  db.doc(`contentReports/${reportId}`);
