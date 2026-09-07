// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { EnduserId, TenantId } from "@narrativetrace/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyBrowserIdentity,
  resolveSessionId,
  SESSION_STORAGE_KEY,
} from "../src/browser-session.js";

beforeEach(() => sessionStorage.clear());

describe("browser session id", () => {
  test("is kept under a stable, namespaced storage key", () => {
    // The key is a compatibility contract, not an implementation detail: changing it orphans
    // every session already stored in a visitor's open tab.
    expect(SESSION_STORAGE_KEY).toBe("narrativetrace.session.id");
  });

  test("generates one on first call and stores it for the tab", () => {
    const id = resolveSessionId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(id);
  });

  test("adopts the stored id rather than minting a second one", () => {
    // ADR-014's ladder: adopt before generate. Two calls in one tab are one session.
    const first = resolveSessionId();

    expect(resolveSessionId()).toBe(first);
  });

  test("a new tab (empty sessionStorage) starts a new session", () => {
    const first = resolveSessionId();
    sessionStorage.clear();

    expect(resolveSessionId()).not.toBe(first);
  });

  test("never writes to localStorage — a session must not outlive the tab", () => {
    // Asserted against a stand-in so this holds in any runtime, not only where a real
    // localStorage happens to exist. Persisting the id past the tab turns correlation
    // into tracking, so the guarantee is worth pinning explicitly.
    const setItem = vi.fn();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: () => null, setItem, removeItem: vi.fn(), clear: vi.fn(), length: 0 },
      configurable: true,
    });
    try {
      resolveSessionId();

      expect(setItem).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("replaces a stored value that is not a well-formed session id", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "not-a-session-id");

    const id = resolveSessionId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(id);
  });

  test.each([
    ["a well-formed id with junk in front", `tracking-${"a".repeat(32)}`],
    ["a well-formed id with junk after it", `${"a".repeat(32)}-tracking`],
    ["more hex than an id can hold", "a".repeat(33)],
  ])("replaces %s rather than adopting it", (_case, stored) => {
    // Near misses, because the check is an anchored match: a value that merely *contains*
    // 32 hex characters is someone else's identifier, and adopting it would carry whatever
    // it is attached to into this tab's session.
    sessionStorage.setItem(SESSION_STORAGE_KEY, stored);

    const id = resolveSessionId();

    expect(id).not.toBe(stored);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("degrades to a per-call id when storage throws (Safari private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(resolveSessionId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("degrades when reaching for sessionStorage itself throws", () => {
    // An embedding context can deny storage access at the property, not the method:
    // touching `globalThis.sessionStorage` throws before `getItem` is ever reached.
    const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      get() {
        throw new Error("SecurityError");
      },
      configurable: true,
    });
    try {
      expect(resolveSessionId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      if (original) Object.defineProperty(globalThis, "sessionStorage", original);
      else Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });

  test("returns a usable id even when it cannot be stored", () => {
    // Storage can be readable but full or write-denied. The visitor still gets a session
    // id for this call; it simply will not correlate with the next one.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      expect(resolveSessionId()).toMatch(/^[0-9a-f]{32}$/);
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("mints a fresh id per call while storage stays unwritable", () => {
    // Without storage there is nothing to adopt, so successive calls are separate
    // sessions — the documented degradation, pinned so it cannot silently become a
    // process-wide cached id.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      expect(resolveSessionId()).not.toBe(resolveSessionId());
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("degrades when sessionStorage is absent entirely", () => {
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, "sessionStorage", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(resolveSessionId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("applyBrowserIdentity", () => {
  test("stamps the session id onto the context", () => {
    const setUserContext = vi.fn();

    const id = applyBrowserIdentity({ setUserContext });

    expect(setUserContext).toHaveBeenCalledWith(undefined, id, undefined);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("passes an authenticated user and tenant through when supplied", () => {
    const setUserContext = vi.fn();

    const id = applyBrowserIdentity(
      { setUserContext },
      {
        enduserId: "u-1" as EnduserId,
        tenantId: "t-1" as TenantId,
      },
    );

    expect(setUserContext).toHaveBeenCalledWith("u-1", id, "t-1");
  });

  test("the same tab keeps one session across repeated calls", () => {
    const setUserContext = vi.fn();

    expect(applyBrowserIdentity({ setUserContext })).toBe(applyBrowserIdentity({ setUserContext }));
  });
});
