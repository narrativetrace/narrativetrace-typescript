// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeTraceConfig } from "./config.js";
import { SyncNarrativeContext } from "./context.js";
import {
  extractActiveSpanId,
  extractContextInfo,
  extractRequestExtras,
  extractServiceIdentity,
  extractTraceId,
  publishChildrenTo,
  publishForkCreatedEvents,
} from "./context-extraction.js";
import type { EventPipeline } from "./event-pipeline.js";
import type { NarrativeContext } from "./narrative-context.js";
import type { ServiceIdentity } from "./service-identity.js";
import type { SpanId } from "./span-id-generator.js";

let groupCounter = 0;

/** Options for {@link ForkJoinGroup}: an optional `AbortSignal` that rejects pending/new forks. */
export interface ForkJoinGroupOptions {
  readonly signal?: AbortSignal;
}

interface ForkedTask<T> {
  readonly promise: Promise<T>;
  readonly context: SyncNarrativeContext;
  readonly parentSpanId: SpanId | null;
}

/**
 * Runs concurrent tasks under one parent span and joins them into a single fork/join segment in the
 * trace. Each {@link ForkJoinGroup.fork} runs its task in a child context that inherits the parent's
 * trace identity — the same `traceId`, service identity, and per-request/user context extras — so
 * forked work stays on the same trace. {@link ForkJoinGroup.join} awaits all tasks, then emits
 * fork-created events plus a `join-complete` carrying member count and wall-time for wait analysis.
 *
 * INTENT: use {@link ForkJoinGroup.all} for the common fork-all-then-await case; construct via
 * {@link ForkJoinGroup.create} when you fork incrementally.
 *
 * @example
 * ```ts
 * const [price, stock] = await ForkJoinGroup.all(ctx, [
 *   (c) => priceService.quote(c, sku),
 *   (c) => stockService.check(c, sku),
 * ]);
 * ```
 */
export class ForkJoinGroup {
  readonly groupId: string;
  private readonly parentContext: NarrativeContext;
  private readonly config: NarrativeTraceConfig;
  private readonly pipeline: EventPipeline;
  private readonly signal: AbortSignal | undefined;
  private readonly tasks: ForkedTask<unknown>[] = [];
  private readonly serviceIdentity: ServiceIdentity | undefined;

  private constructor(
    parentContext: NarrativeContext,
    config: NarrativeTraceConfig,
    pipeline: EventPipeline,
    options?: ForkJoinGroupOptions,
    serviceIdentity?: ServiceIdentity,
  ) {
    this.groupId = `fork-${++groupCounter}`;
    this.parentContext = parentContext;
    this.config = config;
    this.pipeline = pipeline;
    this.signal = options?.signal;
    this.serviceIdentity = serviceIdentity;
  }

  static create(context: NarrativeContext, options?: ForkJoinGroupOptions): ForkJoinGroup {
    const { config, pipeline } = extractContextInfo(context);
    const serviceIdentity = extractServiceIdentity(context);
    return new ForkJoinGroup(context, config, pipeline, options, serviceIdentity);
  }

  private createForkedContext(parentSpanId: SpanId | null): SyncNarrativeContext {
    const traceId = extractTraceId(this.parentContext);
    const forked = new SyncNarrativeContext(
      this.config,
      undefined,
      this.pipeline,
      parentSpanId,
      this.serviceIdentity,
      traceId ?? undefined,
    );
    forked.applyRequestExtras(extractRequestExtras(this.parentContext));
    return forked;
  }

  fork<T>(task: (ctx: NarrativeContext) => T | Promise<T>): Promise<T> {
    if (this.signal?.aborted) return Promise.reject(abortError());
    const parentSpanId = extractActiveSpanId(this.parentContext);
    const forked = this.createForkedContext(parentSpanId);
    const taskPromise = new Promise<T>((resolve) => resolve(task(forked)));
    const promise = wrapWithAbort(taskPromise, this.signal);
    this.tasks.push({ promise: promise as Promise<unknown>, context: forked, parentSpanId });
    return promise;
  }

  async join(): Promise<unknown[]> {
    const results = await Promise.all(this.tasks.map((t) => t.promise));
    this.emitLifecycleEvents();
    return results;
  }

  // The group publishes its own members here rather than joining the parent's live-child registry:
  // a fork's members belong to the trace from the moment the group joins, under the span that
  // forked them, and never because one of them happened to still be running at capture time.
  private emitLifecycleEvents(): void {
    this.pipeline.flush();
    const wallTimeMs = this.computeMaxDuration();
    for (const task of this.tasks) {
      publishForkCreatedEvents(
        this.pipeline,
        this.groupId,
        "fork-join",
        task.context.knownSpanIds(),
        task.parentSpanId,
      );
      publishChildrenTo(this.parentContext, task.context.reportableSpanIds());
    }
    this.publishJoinComplete(wallTimeMs);
  }

  private publishJoinComplete(wallTimeMs: number): void {
    this.pipeline.publish({
      type: "join-complete",
      groupId: this.groupId,
      memberCount: this.tasks.length,
      wallTimeMs,
      timestamp: performance.now(),
    });
  }

  private computeMaxDuration(): number {
    const events = this.pipeline.events();
    const enterTimestamps = new Map<string, number>();
    for (const e of events) {
      if (e.type === "enter") enterTimestamps.set(e.spanContext.spanId, e.timestamp);
    }
    let maxDuration = 0;
    for (const task of this.tasks) {
      const known = task.context.knownSpanIds();
      for (const event of events) {
        if (event.type === "exit" && known.has(event.spanContext.spanId)) {
          const enterTs = enterTimestamps.get(event.spanContext.spanId);
          if (enterTs !== undefined) maxDuration = Math.max(maxDuration, event.timestamp - enterTs);
        }
      }
    }
    return maxDuration;
  }

  static async all<T extends readonly ((ctx: NarrativeContext) => unknown)[]>(
    context: NarrativeContext,
    tasks: T,
    options?: ForkJoinGroupOptions,
  ): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
    const group = ForkJoinGroup.create(context, options);
    for (const task of tasks) {
      group.fork(task);
    }
    const results = await group.join();
    return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function wrapWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
    promise.then(resolve, reject);
  });
}
