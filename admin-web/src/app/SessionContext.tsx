import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "../services/firebase";
import { api, apiError } from "../services/api";
import { clearUserCommandJournal } from "../services/command-journal";
interface Session {
  user: User | null;
  state: "loading" | "signed-out" | "allowed" | "denied" | "error";
  error?: string;
  reload: () => void;
}
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [state, setState] = useState<Session["state"]>("loading"),
    [error, setError] = useState<string>(),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      const token = ++generation;
      setUser(current);
      setError(undefined);
      if (!current) {
        setState("signed-out");
        return;
      }
      setState("loading");
      try {
        await api("ensureProfile", {});
        const access = await api("getAccess", {});
        if (token === generation)
          setState(
            access.roles.includes("CONTENT_ADMIN") ? "allowed" : "denied",
          );
      } catch (e) {
        if (token === generation) {
          setError(apiError(e).message);
          setState("error");
        }
      }
    });
    return () => {
      generation++;
      unsubscribe();
    };
  }, [revision]);
  return (
    <SessionContext
      value={{ user, state, error, reload: () => setRevision((x) => x + 1) }}
    >
      {children}
    </SessionContext>
  );
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}

export async function logout() {
  const uid = auth.currentUser?.uid;
  if (uid) clearUserCommandJournal(uid);
  await signOut(auth);
}
