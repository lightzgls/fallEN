export type ReportStatus =
  "OPEN" | "IN_REVIEW" | "WAITING_RELEASE" | "RESOLVED" | "REJECTED";
export type ReportCategory =
  "MEANING" | "EXAMPLE_TRANSLATION" | "IMAGE" | "PRONUNCIATION" | "OTHER";
export interface TargetRef {
  type: "WORD" | "SET_WORD" | "SPEECH";
  wordId: string;
  wordVersion?: number;
  releaseId?: string;
  wordSetId?: string;
  revisionId?: string;
  meaningId?: string;
  speechVersion?: number;
}
export interface ContentReport {
  reportId: string;
  id?: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  version: number;
  targetRef: TargetRef;
  targetSnapshot: Record<string, unknown>;
  publicResolution?: string;
  resolutionKind?: string;
  resolutionRef?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  actions?: ReportAction[];
}
export interface ReportAction {
  actionId: string;
  fromStatus: ReportStatus;
  toStatus: ReportStatus;
  note?: string;
  createdAt: string;
}
export interface ReportPage {
  items: ContentReport[];
  cursor?: string;
}
