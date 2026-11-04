import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type {
  Actor,
  Operation,
} from "../../functions/src/contracts/callable.js";
import { controller } from "../../functions/src/controllers/controller.js";
import {
  requireAdmin,
  requireUser,
} from "../../functions/src/middleware/auth.js";
import { ApplicationError } from "../../functions/src/shared/errors.js";

const learner: Actor = {
  uid: "learner-controller",
  contentAdmin: false,
  authTime: 0,
};
const guest: Actor = { uid: "", contentAdmin: false, authTime: 0 };

describe("validated controller dispatch", () => {
  it("passes trimmed values and schema defaults to the operation, without changing the raw request", async () => {
    const schema = z
      .object({
        name: z.string().trim().min(1),
        pageSize: z.number().int().positive().default(20),
      })
      .strict();
    const operation = vi
      .fn<
        Operation<z.output<typeof schema>, { label: string; count: number }>
      >()
      .mockImplementation(async (_actor, input) => ({
        label: input.name,
        count: input.pageSize,
      }));
    const raw = { name: "  Bộ từ du lịch  " };

    const result = await controller(
      schema,
      operation,
      requireUser,
    )(learner, raw);

    expect(operation).toHaveBeenCalledExactlyOnceWith(learner, {
      name: "Bộ từ du lịch",
      pageSize: 20,
    });
    expect(result).toEqual({ label: "Bộ từ du lịch", count: 20 });
    expect(raw).toEqual({ name: "  Bộ từ du lịch  " });
  });

  it("rejects a spoofed UID instead of forwarding unknown fields to a service", async () => {
    const schema = z.object({ wordId: z.string().min(1) }).strict();
    const operation = vi
      .fn<Operation<z.output<typeof schema>, void>>()
      .mockResolvedValue(undefined);

    await expect(
      controller(
        schema,
        operation,
        requireUser,
      )(learner, { wordId: "book", uid: "another-owner" }),
    ).rejects.toMatchObject({ details: { code: "VALIDATION_FAILED" } });

    expect(operation).not.toHaveBeenCalled();
  });

  it("returns usable nested field locations and never invokes a service for invalid input", async () => {
    const schema = z
      .object({
        metadata: z.object({ name: z.string().trim().min(1) }).strict(),
        rows: z.array(z.object({ word: z.string().min(1) }).strict()),
      })
      .strict();
    const operation = vi
      .fn<Operation<z.output<typeof schema>, void>>()
      .mockResolvedValue(undefined);

    await expect(
      controller(schema, operation)(learner, {
        metadata: { name: "   " },
        rows: [{ word: "" }],
      }),
    ).rejects.toMatchObject({
      details: {
        code: "VALIDATION_FAILED",
        fields: expect.arrayContaining([
          { path: "metadata.name", message: expect.any(String) },
          { path: "rows.0.word", message: expect.any(String) },
        ]),
      },
    });

    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated admin request before parsing it or invoking the operation", async () => {
    const refined = vi.fn();
    const schema = z
      .object({ name: z.string().superRefine(() => refined()) })
      .strict();
    const operation = vi
      .fn<Operation<z.output<typeof schema>, void>>()
      .mockResolvedValue(undefined);

    await expect(
      controller(
        schema,
        operation,
        requireAdmin,
      )(guest, { name: "Private request" }),
    ).rejects.toMatchObject({ details: { code: "UNAUTHENTICATED" } });

    expect(refined).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("preserves a business failure for error middleware instead of remapping it in the controller", async () => {
    const failure = new ApplicationError("CONFLICT", "Dữ liệu đã thay đổi.");
    const operation = vi
      .fn<Operation<Record<string, never>, void>>()
      .mockRejectedValue(failure);

    await expect(
      controller(z.object({}).strict(), operation, requireUser)(learner, {}),
    ).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledExactlyOnceWith(learner, {});
  });
});
