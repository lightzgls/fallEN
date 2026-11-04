import { db, type Actor } from "../../shared/core.js";

export const userRef = (actor: Actor, collection: string, document: string) =>
  db.doc(`users/${actor.uid}/${collection}/${document}`);

export const dataWithId = (snapshot: FirebaseFirestore.DocumentSnapshot) => ({
  ...snapshot.data(),
  id: snapshot.id,
});
