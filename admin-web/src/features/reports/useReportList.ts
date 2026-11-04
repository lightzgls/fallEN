import { useEffect, useState } from "react";
import type { ReportStatus, ReportCategory, ReportPage } from "../../models";
import { api, apiError } from "../../services/api";
import { useQuery } from "../../hooks/useQuery";
export function useReportList() {
  const [status, setStatus] = useState<ReportStatus | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const query = useQuery(
    () =>
      api("listReports", {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      }),
    [status, category],
  );
  const [page, setPage] = useState<ReportPage>();
  const [loadingMore, setLoadingMore] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setPage(query.data), [query.data]);
  async function more() {
    if (!page?.cursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const next = await api("listReports", {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        cursor: page.cursor,
      });
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (failure) {
      setError(apiError(failure).message);
    } finally {
      setLoadingMore(false);
    }
  }
  return {
    status,
    setStatus,
    category,
    setCategory,
    query,
    page,
    loadingMore,
    error,
    more,
  };
}
