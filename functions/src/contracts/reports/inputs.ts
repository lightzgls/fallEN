import { z } from "zod";
import { objectId, version } from "../../domain/values.js";
import {
  categorySchema,
  resolutionSchema,
  statusSchema,
  targetSchema,
} from "../../contracts/reports/values.js";
export const submitReportSchema = z
  .object({
    commandId: objectId,
    targetRef: targetSchema,
    category: categorySchema,
    description: z.string().trim().min(1).max(1000),
  })
  .strict();
export type SubmitReportInput = z.output<typeof submitReportSchema>;
export const updateReportStatusSchema = z
  .object({
    commandId: objectId,
    reportId: objectId,
    expectedVersion: version,
    newStatus: statusSchema,
    publicNote: z.string().trim().min(1).max(1000).optional(),
    resolutionKind: z.enum(["FIXED", "NOT_AN_ERROR"]).optional(),
    resolutionRef: resolutionSchema.optional(),
  })
  .strict();
export type UpdateReportStatusInput = z.output<typeof updateReportStatusSchema>;
export const getReportContextSchema = z
  .object({ targetRef: targetSchema })
  .strict();
export type GetReportContextInput = z.output<typeof getReportContextSchema>;
export const getMyReportsSchema = z
  .object({ cursor: z.string().max(2048).optional() })
  .strict();
export type GetMyReportsInput = z.output<typeof getMyReportsSchema>;
export const getMyReportSchema = z.object({ reportId: objectId }).strict();
export type GetMyReportInput = z.output<typeof getMyReportSchema>;
export const listReportsSchema = z
  .object({
    status: statusSchema.optional(),
    category: categorySchema.optional(),
    cursor: z.string().max(2048).optional(),
  })
  .strict();
export type ListReportsInput = z.output<typeof listReportsSchema>;
export const getReportSchema = z.object({ reportId: objectId }).strict();
export type GetReportInput = z.output<typeof getReportSchema>;
