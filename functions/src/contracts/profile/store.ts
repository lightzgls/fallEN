import type { Actor } from "../callable.js";
import type { Data } from "../../shared/types.js";

export interface AccountGate {
  status: string;
  version: number;
  deletionJobId?: string;
  [field: string]: unknown;
}
export interface UserProfile {
  uid: string;
  displayName: string;
  avatarMode: "DEFAULT" | "PROVIDER" | "CUSTOM";
  profileVersion: number;
  avatarAssetId?: string;
  createdAt: Date;
  updatedAt: Date;
  [field: string]: unknown;
}
export interface AvatarAsset {
  assetId: string;
  ownerUid: string;
  state: string;
  stagingPath: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date | null;
  cleanupLeaseUntil?: Date;
  storagePath?: string;
  [field: string]: unknown;
}
export interface ProfileTransaction {
  now: Date;
  readGate(): Promise<AccountGate | undefined>;
  readProfile(): Promise<UserProfile | undefined>;
  readAsset(assetId: string): Promise<AvatarAsset | undefined>;
  createProfile(profile: UserProfile, gate: AccountGate): void;
  saveProfile(profile: UserProfile): void;
  createAsset(asset: AvatarAsset): void;
  saveAsset(asset: AvatarAsset): void;
  patchAsset(assetId: string, changes: Partial<AvatarAsset>): void;
}
export interface ProfileStore {
  now(): Date;
  authUser(
    uid: string,
  ): Promise<{ disabled: boolean; displayName?: string; photoURL?: string }>;
  assertActive(actor: Actor): Promise<void>;
  readGate(actor: Actor): Promise<AccountGate>;
  readProfile(actor: Actor): Promise<UserProfile>;
  readAsset(actor: Actor, assetId: string): Promise<AvatarAsset>;
  transaction<Result>(
    actor: Actor,
    active: boolean,
    work: (tx: ProfileTransaction) => Promise<Result>,
  ): Promise<Result>;
  command(
    actor: Actor,
    kind: string,
    input: Data,
    work: (tx: ProfileTransaction) => Promise<Data>,
  ): Promise<Data>;
  prepareImage(
    uid: string,
    assetId: string,
    source: { stagingPath: string; mimeType: string; sizeBytes: number },
  ): Promise<{
    storagePath: string;
    contentHash: string;
    normalizedBytes: number;
  }>;
  avatarUrl(storagePath: string, expiresAt: Date): Promise<string>;
}
