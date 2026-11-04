import type { Actor } from "../callable.js";
import type { AccountGate } from "../profile/store.js";
export interface DeletionJob {
  jobId: string;
  ownerUid?: string;
  statusTokenHash: string;
  requestHash?: string;
  state: string;
  phase: string;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  leaseOwner?: string;
  leaseUntil?: Date;
  statusWindow?: number;
  statusReads?: number;
  lastErrorCode?: string;
}
export interface DeletionTransaction {
  now: Date;
  readJob(): Promise<DeletionJob | undefined>;
  assertActive(actor: Actor): Promise<void>;
  readGate(uid: string): Promise<AccountGate>;
  updateGate(uid: string, patch: Partial<AccountGate>): void;
  createJob(job: DeletionJob): void;
  updateJob(patch: Partial<DeletionJob>): void;
  completeJob(uid: string, job: DeletionJob): void;
}
export interface DeletionStore {
  now(): Date;
  transaction<Result>(
    jobId: string,
    work: (tx: DeletionTransaction) => Promise<Result>,
  ): Promise<Result>;
  disableAuth(uid: string): Promise<void>;
  revokeTokens(uid: string): Promise<void>;
  listOwnedReports(uid: string): Promise<string[]>;
  deleteReport(reportId: string): Promise<void>;
  deleteAvatars(uid: string): Promise<void>;
  deletePersonalData(uid: string): Promise<void>;
  deleteAuth(uid: string): Promise<void>;
}
