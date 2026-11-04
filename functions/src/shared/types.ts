import { type DocumentData } from "firebase-admin/firestore";

/** Untrusted Firestore records are validated by the service that owns their schema. */
export type Data = DocumentData;

export interface Actor {
  uid: string;
  contentAdmin: boolean;
  authTime: number;
}
