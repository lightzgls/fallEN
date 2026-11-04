import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ApiError } from "../services/api";
import { useMutation } from "../app/contexts";
export function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function QueryState({
  loading,
  error,
  empty,
  retry,
  children,
}: {
  loading: boolean;
  error?: ApiError;
  empty?: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="loading" role="status">
        Đang tải dữ liệu…
      </div>
    );
  if (error)
    return (
      <Notice tone="error">
        {error.message}
        <button className="link" onClick={retry}>
          Thử lại
        </button>
      </Notice>
    );
  if (empty) return <div className="empty">Chưa có dữ liệu.</div>;
  return children;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label id={id}>{label}</label>
      <div aria-labelledby={id} className="field-control">
        {children}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function TextField({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
  maxLength = 2000,
  disabled = false,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
  type?: string;
  min?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      {multiline ? (
        <textarea
          id={id}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          disabled={disabled}
        />
      ) : (
        <input
          id={id}
          type={type}
          min={min}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          disabled={disabled}
        />
      )}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const id = useId(),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const dialog = document.querySelector('[role="dialog"]');
        const items = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ) || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    return () => {
      document.removeEventListener("keydown", listener);
      prior?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-title">
          <h2 id={id}>{title}</h2>
          <button aria-label="Đóng" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function MutationBanner() {
  const m = useMutation();
  if (m.phase === "idle") return null;
  return (
    <div className="mutation-banner">
      <Notice
        tone={
          m.phase === "succeeded"
            ? "success"
            : ["failed", "conflict"].includes(m.phase)
              ? "error"
              : "neutral"
        }
      >
        <div>{m.message}</div>
        {m.commandId && <small>Mã lệnh: {m.commandId}</small>}
        {m.phase === "unknown" && (
          <div className="actions">
            <button onClick={m.check}>Kiểm tra kết quả</button>
            <button onClick={m.retry}>Thử lại cùng mã</button>
          </div>
        )}
        {["succeeded", "failed", "conflict"].includes(m.phase) && (
          <button className="link" onClick={m.clear}>
            Đóng thông báo
          </button>
        )}
      </Notice>
    </div>
  );
}
export function AssetImage({
  url,
  alt,
  className = "",
}: {
  url?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`image-placeholder ${className}`}
      role="img"
      aria-label={alt || "Chưa có ảnh"}
    >
      {failed ? "Không tải được ảnh" : "Chưa có ảnh"}
    </div>
  );
}
export function Icon({
  name,
}: {
  name: "library" | "arrow" | "back" | "upload" | "eye" | "save" | "speaker";
}) {
  return (
    <img
      className="action-icon"
      src={`/icons/${name}.svg`}
      width="24"
      height="24"
      alt=""
    />
  );
}
