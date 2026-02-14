import { describe, it, expect, beforeEach, vi } from "vitest";
import { AllowlistHolder } from "./index.js";
import type { AllowlistData } from "./index.js";

// config.adminTelegramId = 99999 from test-setup.ts
const ADMIN_ID = 99999;

function emptyAllowlist(): AllowlistData {
  return { approvedUserIds: [], pendingRequests: [] };
}

describe("AllowlistHolder", () => {
  let holder: AllowlistHolder;

  beforeEach(() => {
    holder = new AllowlistHolder(emptyAllowlist());
    vi.spyOn(holder, "save").mockResolvedValue(undefined);
  });

  // --- constructor ---

  describe("constructor", () => {
    it("auto-approves admin when starting from empty allowlist", () => {
      expect(holder.isApproved(ADMIN_ID)).toBe(true);
    });

    it("does not duplicate admin if already in approvedUserIds", () => {
      const data: AllowlistData = { approvedUserIds: [ADMIN_ID], pendingRequests: [] };
      const h = new AllowlistHolder(data);

      const count = h.current.approvedUserIds.filter((id) => id === ADMIN_ID).length;
      expect(count).toBe(1);
    });
  });

  // --- isApproved / isPending ---

  describe("isApproved / isPending", () => {
    it("admin is always approved", () => {
      expect(holder.isApproved(ADMIN_ID)).toBe(true);
    });

    it("unknown user is not approved", () => {
      expect(holder.isApproved(12345)).toBe(false);
    });

    it("unknown user is not pending", () => {
      expect(holder.isPending(12345)).toBe(false);
    });
  });

  // --- addPendingRequest ---

  describe("addPendingRequest", () => {
    it("adds a new pending request", () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });

      expect(holder.isPending(111)).toBe(true);
      expect(holder.current.pendingRequests).toHaveLength(1);
      expect(holder.current.pendingRequests[0]!.firstName).toBe("Alice");
    });

    it("request gets a requestedAt timestamp", () => {
      const before = Date.now();
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });
      const after = Date.now();

      const ts = holder.current.pendingRequests[0]!.requestedAt;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("skips if user is already pending", () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });
      holder.addPendingRequest({ userId: 111, firstName: "Alice Again" });

      expect(holder.current.pendingRequests).toHaveLength(1);
    });

    it("skips if user is already approved", () => {
      holder.addPendingRequest({ userId: ADMIN_ID, firstName: "Admin" });

      expect(holder.current.pendingRequests).toHaveLength(0);
    });
  });

  // --- approve ---

  describe("approve", () => {
    it("moves user from pending to approved", async () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });

      await holder.approve(111);

      expect(holder.isApproved(111)).toBe(true);
      expect(holder.isPending(111)).toBe(false);
    });

    it("removes pending request after approval", async () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });

      await holder.approve(111);

      expect(holder.current.pendingRequests).toHaveLength(0);
    });

    it("is idempotent — approving already-approved user does not duplicate", async () => {
      await holder.approve(ADMIN_ID);

      const count = holder.current.approvedUserIds.filter((id) => id === ADMIN_ID).length;
      expect(count).toBe(1);
    });

    it("calls save", async () => {
      await holder.approve(111);
      expect(holder.save).toHaveBeenCalled();
    });
  });

  // --- reject ---

  describe("reject", () => {
    it("removes user from pending requests", async () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });

      await holder.reject(111);

      expect(holder.isPending(111)).toBe(false);
    });

    it("user is not approved after rejection", async () => {
      holder.addPendingRequest({ userId: 111, firstName: "Alice" });

      await holder.reject(111);

      expect(holder.isApproved(111)).toBe(false);
    });

    it("is safe to call for non-pending user", async () => {
      await expect(holder.reject(99999999)).resolves.not.toThrow();
    });

    it("calls save", async () => {
      await holder.reject(111);
      expect(holder.save).toHaveBeenCalled();
    });
  });

  // --- seedFromEnv ---

  describe("seedFromEnv", () => {
    it("adds multiple user IDs to approved list", () => {
      holder.seedFromEnv([111, 222, 333]);

      expect(holder.isApproved(111)).toBe(true);
      expect(holder.isApproved(222)).toBe(true);
      expect(holder.isApproved(333)).toBe(true);
    });

    it("is idempotent — does not duplicate existing IDs", () => {
      holder.seedFromEnv([111, 222]);
      holder.seedFromEnv([111, 222, 333]);

      const count111 = holder.current.approvedUserIds.filter((id) => id === 111).length;
      expect(count111).toBe(1);
      expect(holder.isApproved(333)).toBe(true);
    });
  });
});
