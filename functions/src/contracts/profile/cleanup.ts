export interface CleanupCandidate {
  key: string;
  assetId: string;
}
export interface CleanupAsset {
  ownerUid: string;
  state: string;
  expiresAt?: Date | null;
  stagingPath?: string;
  storagePath?: string;
}
export interface CleanupTransaction {
  readAsset(): Promise<CleanupAsset | undefined>;
  currentAvatar(ownerUid: string): Promise<string | undefined>;
  lease(until: Date): void;
}
export interface AvatarCleanupStore {
  now(): Date;
  candidates(before: Date): Promise<CleanupCandidate[]>;
  transaction<Result>(
    candidate: CleanupCandidate,
    work: (tx: CleanupTransaction) => Promise<Result>,
  ): Promise<Result>;
  deleteFile(path: string): Promise<void>;
  deleteAsset(candidate: CleanupCandidate): Promise<void>;
}
