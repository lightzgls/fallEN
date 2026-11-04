import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, functions, storage } from "./firebase";
import type { ApiMap, CommandStatus, ImageAsset } from "../models";
import {
  clearPendingCommand,
  recordCommand,
  type PendingCommand,
} from "./command-journal";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public uncertain = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function apiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = error && typeof error === "object" ? error : {};
  const sdkCode =
    "code" in e && typeof e.code === "string" ? e.code : undefined;
  const details =
    "details" in e && e.details && typeof e.details === "object"
      ? e.details
      : {};
  const detailCode =
    "code" in details && typeof details.code === "string"
      ? details.code
      : undefined;
  const message =
    "message" in e && typeof e.message === "string" ? e.message : undefined;
  const code = detailCode || sdkCode?.replace("functions/", "") || "UNKNOWN";
  const uncertain = [
    "unavailable",
    "deadline-exceeded",
    "internal",
    "unknown",
    "UNKNOWN",
  ].includes(code);
  const messages: Record<string, string> = {
    CONFLICT:
      "Dữ liệu đã được cập nhật ở nơi khác. Tải lại trước khi tiếp tục.",
    IMPORT_STALE: "Bản nháp hoặc danh mục đã đổi. Cần xem trước lại lô nhập.",
    DICTIONARY_NOT_READY:
      "Danh mục từ điển chưa sẵn sàng. Chưa thể tìm hoặc nhập từ.",
    RELEASE_UNAVAILABLE:
      "Phiên bản danh mục không còn khả dụng. Tìm lại để dùng bản hiện hành.",
    PERMISSION_DENIED: "Tài khoản không có quyền thực hiện thao tác này.",
    ACCOUNT_DELETING: "Tài khoản đang được xóa. Không thể truy cập dữ liệu.",
    "permission-denied": "Tài khoản không có quyền thực hiện thao tác này.",
    unauthenticated: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  };
  return new ApiError(
    code,
    messages[code] || message || "Không thể kết nối máy chủ.",
    uncertain,
  );
}
export async function api<K extends keyof ApiMap>(
  name: K,
  input: ApiMap[K]["input"],
): Promise<ApiMap[K]["output"]> {
  const commandId =
    "commandId" in input && typeof input.commandId === "string"
      ? input.commandId
      : undefined;
  const uid = auth.currentUser?.uid;
  if (commandId && uid) {
    try {
      recordCommand({ uid, commandId, name, input });
    } catch {
      throw new ApiError(
        "LOCAL_STORAGE_UNAVAILABLE",
        "Không lưu được mã lệnh trên trình duyệt. Cho phép lưu trữ rồi thử lại.",
      );
    }
  }
  try {
    const result = (
      await httpsCallable<ApiMap[K]["input"], ApiMap[K]["output"]>(
        functions,
        name,
      )(input)
    ).data;
    if (
      commandId &&
      uid &&
      !(
        result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "IN_PROGRESS"
      )
    )
      clearPendingCommand(uid, commandId);
    return result;
  } catch (error) {
    const mapped = apiError(error);
    if (commandId && uid && !mapped.uncertain)
      clearPendingCommand(uid, commandId);
    if (
      ["PERMISSION_DENIED", "permission-denied", "ACCOUNT_DELETING"].includes(
        mapped.code,
      )
    )
      window.dispatchEvent(new Event("fallen-access-denied"));
    throw mapped;
  }
}
export async function retryPendingCommand(
  command: PendingCommand,
): Promise<unknown> {
  if (auth.currentUser?.uid !== command.uid)
    throw new ApiError("PERMISSION_DENIED", "Tài khoản đã thay đổi.");
  try {
    const result = (
      await httpsCallable<unknown, unknown>(
        functions,
        command.name,
      )(command.input)
    ).data;
    return completeResult(result, command.commandId);
  } catch (error) {
    throw apiError(error);
  }
}
export async function pollCommand<T>(
  commandId: string,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (signal?.aborted)
      throw new ApiError(
        "CANCELLED",
        "Đã dừng theo dõi. Mã lệnh được giữ để kiểm tra lại.",
        true,
      );
    const status = (await api("getCommandStatus", {
      commandId,
    })) as CommandStatus<T>;
    if (status.status === "SUCCEEDED") {
      if (auth.currentUser)
        clearPendingCommand(auth.currentUser.uid, commandId);
      return status.receipt as T;
    }
    if (status.status === "FAILED")
      throw new ApiError(
        status.error?.code || "FAILED",
        status.error?.message || "Máy chủ chưa hoàn tất lệnh.",
      );
    if (status.status === "ABSENT")
      throw new ApiError(
        "ABSENT",
        "Máy chủ chưa ghi nhận lệnh. Có thể thử lại cùng mã.",
        true,
      );
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000)),
    );
  }
  throw new ApiError(
    "IN_PROGRESS",
    "Máy chủ đang xử lý. Hãy kiểm tra lại trạng thái.",
    true,
  );
}
export async function completeResult<T>(
  result: T | CommandStatus<T>,
  commandId: string,
): Promise<T> {
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    ["IN_PROGRESS", "SUCCEEDED", "FAILED", "ABSENT"].includes(
      String(result.status),
    )
  ) {
    const status = result as CommandStatus<T>;
    if (status.status === "SUCCEEDED") return status.receipt as T;
    return pollCommand<T>(commandId);
  }
  return result as T;
}
export async function uploadAsset(
  file: File,
  kind: "IMAGE" | "IMPORT",
): Promise<ImageAsset> {
  const grant = await api("beginContentUpload", {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    byteSize: file.size,
    kind,
    commandId: crypto.randomUUID(),
  });
  await uploadBytes(ref(storage, grant.storagePath), file, {
    contentType: file.type || "application/octet-stream",
  });
  return api("finalizeContentUpload", { assetId: grant.assetId });
}
export function assetUrl(storagePath: string) {
  return getDownloadURL(ref(storage, storagePath));
}
