import type { Actor } from "../callable.js";
import type { Data } from "../../shared/types.js";
import type { Target, Resolution } from "../../contracts/reports/values.js";
import type { ListReportsInput } from "./inputs.js";
import type {
  RecordData,
  RevisionRecord,
  SetWordRecord,
  ReleaseEntry,
  SpeechRecord,
} from "../content/records.js";
export interface ReportRecord extends RecordData {
  reportId: string;
  ownerUid: string;
  category:
    "MEANING" | "EXAMPLE_TRANSLATION" | "IMAGE" | "PRONUNCIATION" | "OTHER";
  description: string;
  targetRef: Target;
  targetSnapshot: Data;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface ReportReader {
  report(id: string): Promise<ReportRecord | undefined>;
  actions(id: string): Promise<RecordData[]>;
  revision(deck: string, id: string): Promise<RevisionRecord | undefined>;
  entry(
    deck: string,
    revision: string,
    word: string,
  ): Promise<SetWordRecord | undefined>;
  release(id: string): Promise<{ state: string } | undefined>;
  publicRelease(id?: string): Promise<{ id: string }>;
  releaseEntry(
    release: string,
    word: string,
  ): Promise<ReleaseEntry | undefined>;
  wordVersion(word: string, version: number): Promise<Data>;
  speech(word: string): Promise<SpeechRecord | undefined>;
  listeningContext(
    uid: string,
    ref: Extract<Target, { type: "SPEECH" }>["gameRef"] & {},
  ): Promise<{
    mode: string;
    roundStatus: string;
    wordId: string;
    wordVersion: number;
    copy: Data;
  }>;
}
export interface ReportTransaction extends ReportReader {
  stageReport(id: string, report: RecordData, create?: boolean): void;
  stageAction(id: string, actionId: string, action: RecordData): void;
}
export interface ReportStore extends ReportReader {
  active(actor: Actor): Promise<void>;
  command(
    actor: Actor,
    kind: string,
    input: RecordData,
    work: (tx: ReportTransaction, now: Date) => Promise<RecordData>,
  ): Promise<RecordData>;
  ownerReports(
    uid: string,
    cursor?: string,
  ): Promise<{ items: ReportRecord[]; cursor?: string }>;
  queue(
    filter: ListReportsInput,
  ): Promise<{ items: ReportRecord[]; cursor?: string }>;
}
export type ReportTarget = Target;
export type ReportResolution = Resolution;
