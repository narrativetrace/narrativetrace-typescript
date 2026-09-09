// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** A package presence poll's per-package outcome. */
export type PresenceVerdict = "PRESENT" | "LAGGING" | "MISSING";

export interface RegistryTarget {
  readonly name: string;
  readonly version: string;
}

/** Injectable so the backoff loop is testable without a real clock or network. */
export type FetchStatus = (url: string) => Promise<number>;
export type Sleep = (ms: number) => Promise<void>;

export const DEFAULT_REGISTRY_BASE = "https://registry.npmjs.org";

/**
 * HTTP status → verdict. 200 is PRESENT. 404 is LAGGING — a clean "not found yet" answer; npm's
 * own propagation is normally seconds, not Central's "minutes to hours", but a poll still gives
 * it room. Anything else (5xx, a fetch that never got a response) is MISSING — not explained by
 * ordinary propagation and worth attention.
 */
export function classifyStatus(status: number): PresenceVerdict {
  if (status === 200) return "PRESENT";
  if (status === 404) return "LAGGING";
  return "MISSING";
}

/** The registry URL this tool polls for one package version's metadata. */
export function versionUrl(registryBase: string, name: string, version: string): string {
  return `${registryBase}/${name}/${version}`;
}

async function defaultFetchStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.status;
  } catch {
    return 0;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkAll(
  targets: readonly RegistryTarget[],
  registryBase: string,
  fetchStatus: FetchStatus,
): Promise<Map<string, PresenceVerdict>> {
  const results = await Promise.all(
    targets.map(async (target) => {
      const status = await fetchStatus(versionUrl(registryBase, target.name, target.version));
      return [target.name, classifyStatus(status)] as const;
    }),
  );
  return new Map(results);
}

export interface PollOptions {
  readonly registryBase?: string;
  /** Overall deadline for the whole batch — one shared timeout, never a per-package one. */
  readonly timeoutMs?: number;
  readonly initialBackoffMs?: number;
  readonly maxIntervalMs?: number;
  readonly fetchStatus?: FetchStatus;
  readonly sleep?: Sleep;
  /** Injectable clock so the deadline itself is a controllable test input, not real wall-clock
   * time — the same reasoning this repo applies everywhere else timeouts are tested. */
  readonly now?: () => number;
  readonly onPending?: (pending: readonly RegistryTarget[]) => void;
}

/**
 * Polls `registry.npmjs.org` for every target until all read PRESENT or the overall timeout
 * elapses, backing off between rounds (doubling, capped at `maxIntervalMs`) — one round checks
 * every not-yet-PRESENT target together in one round rather than polling each on its own
 * schedule — one release event should cost one shared wait, not N of them.
 */
export async function pollPresence(
  targets: readonly RegistryTarget[],
  options: PollOptions = {},
): Promise<Map<string, PresenceVerdict>> {
  const registryBase = options.registryBase ?? DEFAULT_REGISTRY_BASE;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const maxIntervalMs = options.maxIntervalMs ?? 60_000;
  const fetchStatus = options.fetchStatus ?? defaultFetchStatus;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let wait = options.initialBackoffMs ?? 15_000;
  let verdicts = await checkAll(targets, registryBase, fetchStatus);
  while (true) {
    const pending = targets.filter((target) => verdicts.get(target.name) !== "PRESENT");
    if (pending.length === 0 || now() >= deadline) return verdicts;
    options.onPending?.(pending);
    await sleep(wait);
    wait = Math.min(wait * 2, maxIntervalMs);
    const rechecked = await checkAll(pending, registryBase, fetchStatus);
    verdicts = new Map([...verdicts, ...rechecked]);
  }
}
