// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Mirrors NarrativeTrace span ids into the OpenTelemetry SDK, so a span's OTel id IS its
 * NarrativeTrace id and a parent id is exact whenever it is named.
 *
 * INTENT: install it as the provider's `idGenerator` — `new NodeTracerProvider({ idGenerator: new
 * NarrativeTraceIdGenerator() })`. The consumer ({@link createOtelEventConsumer}) and the batch
 * exporter ({@link TraceSpanExporter}) put the NarrativeTrace ids on offer right before
 * `tracer.startSpan` and withdraw them right after; the SDK asks the generator for ids inside that
 * call. The hand-off is a module-level slot, no AsyncLocalStorage needed: `startSpan` is
 * synchronous, so the offer cannot be seen by any other span. Every span started with no offer on
 * the table gets a random id, as the SDK's own generator would give it.
 *
 * @edgeCase An id already handed out (a bounded recent set) is never handed out twice. When the
 * same span is exported by both paths (live consumer and batch exporter) the second request gets a
 * random id and a one-time warning names the double export.
 *
 * Opt-out: `NARRATIVETRACE_OTEL_MIRROR_IDS=false` in the environment, or `{ enabled: false }`; the
 * generator then behaves as a random one and the consumer falls back to remembering finished frames
 * and marking reconstructed parents as synthetic.
 */
export interface IdGeneratorLike {
  generateTraceId(): string;
  generateSpanId(): string;
}

export interface NarrativeTraceIdGeneratorOptions {
  /** Defaults to on unless `NARRATIVETRACE_OTEL_MIRROR_IDS` is `false`. */
  readonly enabled?: boolean;
}

export type IdSource = "live" | "batch";

interface Offer {
  readonly spanId: string;
  readonly traceId: string | null;
  readonly source: IdSource;
  /** The span id has been handed out for this offer (the SDK asks for the span id before the trace id). */
  spanGiven: boolean;
}

const RECENT_CAPACITY = 4096;
const recentSpanIds = new Set<string>();
let pending: Offer | null = null;
let warned = false;

/** Puts a span's ids on offer; `traceId` only for a span with no parent. Pair with {@link withdraw}. */
export function offerIds(
  spanId: string,
  traceId: string | null,
  source: IdSource,
): { readonly spanId: string } {
  const offer: Offer = { spanId, traceId, source, spanGiven: false };
  pending = offer;
  return offer;
}

export function withdraw(offer: { readonly spanId: string }): void {
  if (pending === offer) pending = null;
}

/** Runs `start` (a synchronous `tracer.startSpan`) with the span's ids on offer, withdrawn after. */
export function startWithIds<T>(
  ids: { readonly spanId: string; readonly traceId: string | null } | null,
  source: IdSource,
  start: () => T,
): T {
  if (ids === null) return start();
  const offer = offerIds(ids.spanId, ids.traceId, source);
  try {
    return start();
  } finally {
    withdraw(offer);
  }
}

/** The offer to use, or null when none is on the table or its span id was handed out already. */
function usableOffer(forTraceId: boolean): Offer | null {
  if (pending === null) return null;
  if (pending.spanGiven) return forTraceId ? pending : null;
  if (recentSpanIds.has(pending.spanId)) {
    if (!warned) {
      warned = true;
      console.warn(
        `NarrativeTrace: span ${pending.spanId} was exported twice (${pending.source} path asked for ` +
          "an id the other path already used) — the duplicate gets a fresh id. Export each trace " +
          "through one path, the live consumer or the batch exporter.",
      );
    }
    return null;
  }
  return pending;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf.every((b) => b === 0));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function enabledByEnvironment(): boolean {
  const raw =
    typeof process !== "undefined" ? process.env?.NARRATIVETRACE_OTEL_MIRROR_IDS : undefined;
  return raw?.trim().toLowerCase() !== "false";
}

export class NarrativeTraceIdGenerator implements IdGeneratorLike {
  private readonly enabled: boolean;

  constructor(options: NarrativeTraceIdGeneratorOptions = {}) {
    this.enabled = options.enabled ?? enabledByEnvironment();
  }

  generateTraceId(): string {
    // The SDK asks for the trace id first, and only for a span with no valid parent.
    const offer = this.enabled ? usableOffer(true) : null;
    return offer?.traceId ?? randomHex(16);
  }

  generateSpanId(): string {
    const offer = this.enabled ? usableOffer(false) : null;
    if (offer === null) return randomHex(8);
    offer.spanGiven = true;
    recentSpanIds.add(offer.spanId);
    if (recentSpanIds.size > RECENT_CAPACITY) {
      recentSpanIds.delete(recentSpanIds.values().next().value as string);
    }
    return offer.spanId;
  }
}
