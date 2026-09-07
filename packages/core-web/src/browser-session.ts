// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { EnduserId, NarrativeContext, SessionId, TenantId } from "@narrativetrace/core";
import { generateTraceId } from "@narrativetrace/core";

/**
 * Where the tab's session id is kept.
 *
 * INTENT: `sessionStorage`, never `localStorage`. A session id exists to group the calls
 * of one visit so they can be correlated; an id that outlives the tab stops being
 * correlation and becomes tracking. This is a deliberate product limit, not an oversight.
 */
export const SESSION_STORAGE_KEY = "narrativetrace.session.id";

const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The current tab's session id, minted on first use.
 *
 * INTENT: maps to OpenTelemetry's `session.id`. It answers "which calls came from the same
 * client visit" — the question `trace_id` cannot, because every interaction is its own
 * trace.
 *
 * Follows ADR-014's ladder: **adopt** the id already stored for this tab, else **generate**
 * one, because a session id is an opaque handle whose only job is to be unique. It is never
 * derived from anything about the visitor.
 *
 * Storage can fail or be absent — Safari's private mode throws on access, an embedding
 * context may deny it, and a non-browser runtime has none. Any such failure degrades to a
 * fresh per-call id rather than throwing: observability must never break the page.
 */
export function resolveSessionId(): SessionId {
  const stored = readStored();
  if (stored !== null && SESSION_ID_PATTERN.test(stored)) {
    return stored as SessionId;
  }
  const minted = generateTraceId() as string as SessionId;
  writeStored(minted);
  return minted;
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readStored(): string | null {
  try {
    return storage()?.getItem(SESSION_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStored(id: SessionId): void {
  try {
    storage()?.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // A session that cannot be stored is still valid for this call; it simply will not
    // correlate with the next one. Degrading beats throwing inside a page.
  }
}

/**
 * Stamps this tab's session id onto `context` so every span it captures carries it.
 *
 * INTENT: the one call a browser application makes to get client correlation. Deliberately
 * explicit rather than an import side effect — minting an identifier is a privacy-relevant
 * act, and a library should not do it merely because it was loaded.
 *
 * Pass `enduserId` once the visitor is authenticated (OpenTelemetry's `user.id`); leave it
 * out while they are anonymous. `tenantId` is for multi-tenant front ends.
 */
export function applyBrowserIdentity(
  context: Pick<NarrativeContext, "setUserContext">,
  identity: { enduserId?: EnduserId; tenantId?: TenantId } = {},
): SessionId {
  const sessionId = resolveSessionId();
  context.setUserContext(identity.enduserId, sessionId, identity.tenantId);
  return sessionId;
}
