import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  limit as qLimit, onSnapshot, orderBy as qOrderBy,
  query, setDoc, updateDoc, where as qWhere,
  type QueryConstraint, type WhereFilterOp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface ListOpts {
  where?: [string, WhereFilterOp, unknown][];
  orderBy?: [string, "asc" | "desc"];
  limit?: number;
}

function makeQuery(col: string, opts: ListOpts): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (opts.where) for (const w of opts.where) c.push(qWhere(w[0], w[1], w[2]));
  if (opts.orderBy) c.push(qOrderBy(opts.orderBy[0], opts.orderBy[1]));
  if (opts.limit) c.push(qLimit(opts.limit));
  return c;
}

export async function dbAdd(col: string, data: object): Promise<string> {
  const ref = await addDoc(collection(db, col), data);
  return ref.id;
}

export async function dbSet(col: string, id: string, data: object): Promise<void> {
  await setDoc(doc(db, col, id), data, { merge: true });
}

export async function dbGet<T>(col: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}

export async function dbList<T>(col: string, opts: ListOpts = {}): Promise<T[]> {
  const base = collection(db, col);
  const constraints = makeQuery(col, opts);
  const snap = await getDocs(constraints.length ? query(base, ...constraints) : base);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export function dbWatch<T>(col: string, opts: ListOpts, cb: (items: T[]) => void): () => void {
  const base = collection(db, col);
  const constraints = makeQuery(col, opts);
  const q = constraints.length ? query(base, ...constraints) : base;
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    (err) => console.error("Firestore watch error:", err.message),
  );
}

export async function dbUpdate(col: string, id: string, patch: object): Promise<void> {
  await updateDoc(doc(db, col, id), patch);
}

export async function dbDelete(col: string, id: string): Promise<void> {
  await deleteDoc(doc(db, col, id));
}
