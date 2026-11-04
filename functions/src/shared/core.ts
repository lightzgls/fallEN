import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Transaction, type DocumentSnapshot, type DocumentData } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

if (!getApps().length) initializeApp();
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const bucket = getStorage().bucket(process.env.STORAGE_BUCKET || `${process.env.GCLOUD_PROJECT || 'demo-fallen'}.firebasestorage.app`);
export type Data = DocumentData;
export interface Actor { uid: string; contentAdmin: boolean; authTime: number }
export const id = (): string => randomUUID();
export const identifier = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);
export const commandId = identifier;
export const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const empty = z.object({}).strict();

export function fail(code: string, message = code): never {
  const status = code === 'CONFLICT' || code === 'IMPORT_STALE' ? 'aborted'
    : code === 'UNAUTHENTICATED' ? 'unauthenticated'
    : code === 'PERMISSION_DENIED' ? 'permission-denied'
    : code.endsWith('NOT_FOUND') ? 'not-found'
    : code === 'VALIDATION_FAILED' || code === 'COMMAND_REUSED' ? 'invalid-argument'
    : code.includes('LIMIT') || code === 'RATE_LIMITED' ? 'resource-exhausted'
    : 'failed-precondition';
  throw new HttpsError(status, message, { code });
}
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpsError('invalid-argument', 'Dữ liệu không hợp lệ.', {
    code: 'VALIDATION_FAILED', fields: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  });
  return result.data;
}
export function requireDoc(snap: DocumentSnapshot, code = 'NOT_FOUND'): Data {
  if (!snap.exists) fail(code);
  return snap.data()!;
}
export function checkVersion(actual: unknown, expected: number): void {
  if (actual !== expected) fail('CONFLICT', 'Dữ liệu đã thay đổi. Hãy tải lại.');
}
export function assertAdmin(actor: Actor): void {
  if (!actor.contentAdmin) fail('PERMISSION_DENIED');
}
export async function assertActive(actor: Actor, tx?: Transaction): Promise<void> {
  if (!actor.uid) fail('UNAUTHENTICATED');
  const ref = db.doc(`accountStates/${actor.uid}`);
  const state = (await (tx ? tx.get(ref) : ref.get())).data();
  if (state?.status === 'DELETING') fail('ACCOUNT_DELETING');
  if (state?.status !== 'ACTIVE') fail('PROFILE_PENDING');
}
function canonical(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)]));
  return value;
}
export function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
}
export function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v])=>[k,serialize(v)]));
  return value;
}
export function dayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0,10);
}
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+days); return date.toISOString().slice(0,10);
}
export async function command(
  actor: Actor, kind: string, input: Data,
  callback: (tx: Transaction, now: Timestamp) => Promise<Data>,
): Promise<Data> {
  const key = parse(identifier, input.commandId ?? input.eventId);
  const requestHash = hash({kind,input});
  return db.runTransaction(async tx => {
    await assertActive(actor,tx);
    const ref = db.doc(`users/${actor.uid}/commands/${key}`);
    const previous = (await tx.get(ref)).data();
    if (previous) {
      if (previous.kind !== kind || previous.requestHash !== requestHash) fail('COMMAND_REUSED');
      if (previous.status === 'SUCCEEDED') return previous.receipt;
      if (previous.status === 'IN_PROGRESS') return {status:'IN_PROGRESS',commandId:key,progress:previous.progress};
      fail(previous.error?.code || 'COMMAND_FAILED');
    }
    const now = Timestamp.now();
    const receipt = await callback(tx,now);
    tx.create(ref,{kind,requestHash,status:'SUCCEEDED',receipt,createdAt:now});
    return receipt;
  });
}
export async function getCommandStatus(actor: Actor, raw: unknown): Promise<Data> {
  const input = parse(z.object({commandId}).strict(),raw);
  await assertActive(actor);
  const doc = (await db.doc(`users/${actor.uid}/commands/${input.commandId}`).get()).data();
  return doc ? {status:doc.status,receipt:doc.receipt,error:doc.error,progress:doc.progress} : {status:'ABSENT'};
}
export function cursorEncode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
export function cursorDecode(value: string): Data {
  try { const parsed:unknown = JSON.parse(Buffer.from(value,'base64url').toString()); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('VALIDATION_FAILED'); return parsed as Data; }
  catch { return fail('VALIDATION_FAILED','Cursor không hợp lệ.'); }
}
