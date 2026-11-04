import { useEffect, useRef, useState } from "react";
import { apiError, type ApiError } from "../services/api";
export function useQuery<T>(
  load: () => Promise<T>,
  dependencies: unknown[] = [],
) {
  const [data, setData] = useState<T>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<ApiError>(),
    [revision, setRevision] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("fallen-command-complete", refresh);
    return () => window.removeEventListener("fallen-command-complete", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    latest
      .current()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(apiError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...dependencies, revision]);
  return {
    data,
    loading,
    error,
    reload: () => setRevision((x) => x + 1),
    setData,
  };
}
