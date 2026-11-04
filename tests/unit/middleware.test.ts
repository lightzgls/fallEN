import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import type { Actor } from "../../functions/src/contracts/callable.js";
import {
  requireAdmin,
  requireUser,
} from "../../functions/src/middleware/auth.js";
import { callableError } from "../../functions/src/middleware/errors.js";
import { ApplicationError } from "../../functions/src/shared/errors.js";

const learner: Actor = {
  uid: "learner-middleware",
  contentAdmin: false,
  authTime: 0,
};
const administrator: Actor = {
  uid: "admin-middleware",
  contentAdmin: true,
  authTime: 0,
};

describe("verified-actor access guards", () => {
  it("requires an authenticated UID even when an admin claim is present", () => {
    const guest = { ...administrator, uid: "" };

    expect(() => requireUser(guest)).toThrowError(
      expect.objectContaining({ details: { code: "UNAUTHENTICATED" } }),
    );
    expect(() => requireAdmin(guest)).toThrowError(
      expect.objectContaining({ details: { code: "UNAUTHENTICATED" } }),
    );
  });

  it("allows learner access but denies administrative access to a learner", () => {
    expect(() => requireUser(learner)).not.toThrow();
    expect(() => requireAdmin(learner)).toThrowError(
      expect.objectContaining({ details: { code: "PERMISSION_DENIED" } }),
    );
  });

  it("allows administrative access using the verified actor", () => {
    expect(() => requireAdmin(administrator)).not.toThrow();
  });
});

describe("stable Callable error contract", () => {
  it.each([
    ["CONFLICT", "aborted"],
    ["IMPORT_STALE", "aborted"],
    ["UNAUTHENTICATED", "unauthenticated"],
    ["PERMISSION_DENIED", "permission-denied"],
    ["WORD_NOT_FOUND", "not-found"],
    ["VALIDATION_FAILED", "invalid-argument"],
    ["COMMAND_REUSED", "invalid-argument"],
    ["AI_DAILY_LIMIT", "resource-exhausted"],
    ["RATE_LIMITED", "resource-exhausted"],
    ["ACCOUNT_DELETING", "failed-precondition"],
  ] as const)(
    "maps %s without losing its business code",
    (businessCode, transportCode) => {
      const mapped = callableError(
        new ApplicationError(businessCode, "Thông báo nghiệp vụ."),
      );

      expect(mapped).toBeInstanceOf(HttpsError);
      expect(mapped.code).toBe(transportCode);
      expect(mapped.details).toEqual({ code: businessCode });
      expect(mapped.message).toBe("Thông báo nghiệp vụ.");
    },
  );

  it("retains field locations and descriptions for validation feedback", () => {
    const fields = [
      { path: "metadata.name", message: "Tên bộ không được để trống." },
    ];
    const mapped = callableError(
      new ApplicationError(
        "VALIDATION_FAILED",
        "Dữ liệu không hợp lệ.",
        fields,
      ),
    );

    expect(mapped.code).toBe("invalid-argument");
    expect(mapped.details).toEqual({ code: "VALIDATION_FAILED", fields });
  });

  it("preserves a deliberate SDK transport error from the adapter boundary", () => {
    const original = new HttpsError("permission-denied", "Không có quyền.", {
      code: "PERMISSION_DENIED",
    });

    expect(callableError(original)).toBe(original);
  });

  it.each([
    new Error("PRIVATE_PROVIDER_DIAGNOSTIC"),
    {
      code: "permission-denied",
      message: "PRIVATE_PROVIDER_DIAGNOSTIC",
      details: { code: "PERMISSION_DENIED" },
    },
    "PRIVATE_PROVIDER_DIAGNOSTIC",
  ])(
    "masks unexpected failures rather than trusting provider messages or lookalike error objects",
    (failure) => {
      const mapped = callableError(failure);

      expect(mapped.code).toBe("internal");
      expect(mapped.details).toEqual({ code: "INTERNAL", retryable: true });
      expect(mapped.message).not.toContain("PRIVATE_PROVIDER_DIAGNOSTIC");
      expect(mapped.message).not.toContain("permission-denied");
    },
  );
});
