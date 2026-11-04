import { useCallback, useEffect, useRef, useState } from "react";

function currentPath() {
  return window.location.hash.replace(/^#/, "") || "/decks";
}
export function useAdminNavigation(phase: string) {
  const [path, setPath] = useState(currentPath);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string>();
  const [waitingSave, setWaitingSave] = useState(false);
  const pathRef = useRef(path),
    dirtyRef = useRef(dirty);
  pathRef.current = path;
  dirtyRef.current = dirty;
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  const go = useCallback((next: string) => {
    setDirty(false);
    setPath(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo(0, 0);
  }, []);
  const navigate = useCallback(
    (next: string) => {
      if (next === pathRef.current) return;
      if (dirtyRef.current || phase === "saving" || phase === "unknown") {
        setPending(next);
        return;
      }
      go(next);
    },
    [go, phase],
  );
  useEffect(() => {
    const onHash = () => {
      const next = currentPath();
      if (next === pathRef.current) return;
      if (dirtyRef.current) {
        window.history.replaceState(null, "", `#${pathRef.current}`);
        setPending(next);
      } else {
        setPath(next);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    if (waitingSave && !dirty && pending) {
      go(pending);
      setPending(undefined);
      setWaitingSave(false);
    }
    if (waitingSave && ["failed", "conflict"].includes(phase)) {
      setWaitingSave(false);
      setPending(undefined);
    }
  }, [dirty, waitingSave, pending, go, phase]);
  function saveBeforeLeaving() {
    const form = document.querySelector<HTMLFormElement>(
      "main form[data-dirty-form]",
    );
    const save = document.querySelector<HTMLButtonElement>(
      "main button[data-save]",
    );
    if (form || save) {
      setWaitingSave(true);
      form?.requestSubmit();
      save?.click();
    } else setPending(undefined);
  }
  function discardAndLeave() {
    if (pending) go(pending);
    setPending(undefined);
  }
  return {
    path,
    dirty,
    pending,
    waitingSave,
    onDirty,
    navigate,
    saveBeforeLeaving,
    discardAndLeave,
    closePending: () => setPending(undefined),
  };
}
