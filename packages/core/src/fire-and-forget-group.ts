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

/**
 * Launches background tasks that are traced but never awaited by the caller. Each
 * {@link FireAndForgetGroup.launch} runs its task in a child context that inherits the parent's
 * trace identity — the same `traceId`, service identity, and per-request/user context extras — so
 * detached work still attaches to the originating trace. Fork-created events are emitted when the
 * task settles (on both fulfilment and rejection), so a failing task cannot break the parent flow.
 *
 * INTENT: use for genuine fire-and-forget side effects (notifications, audit writes); reach for
 * {@link ForkJoinGroup} instead whenever you need the results or a join barrier.
 */
export class FireAndForgetGroup {
  readonly groupId: string;
  private readonly parentContext: NarrativeContext;
  private readonly config: NarrativeTraceConfig;
  private readonly pipeline: EventPipeline;
  private readonly serviceIdentity: ServiceIdentity | undefined;

  private constructor(
    parentContext: NarrativeContext,
    config: NarrativeTraceConfig,
    pipeline: EventPipeline,
    serviceIdentity: ServiceIdentity | undefined,
  ) {
    this.groupId = `fanf-${++groupCounter}`;
    this.parentContext = parentContext;
    this.config = config;
    this.pipeline = pipeline;
    this.serviceIdentity = serviceIdentity;
  }

  static create(context: NarrativeContext): FireAndForgetGroup {
    const { config, pipeline } = extractContextInfo(context);
    const serviceIdentity = extractServiceIdentity(context);
    return new FireAndForgetGroup(context, config, pipeline, serviceIdentity);
  }

  launch(task: (ctx: NarrativeContext) => unknown | Promise<unknown>): void {
    const parentSpanId = extractActiveSpanId(this.parentContext);
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
    const taskPromise = new Promise<void>((resolve) => resolve(task(forked) as undefined));
    taskPromise
      .then(() => this.emitForkCreated(forked, parentSpanId))
      .catch(() => this.emitForkCreated(forked, parentSpanId));
  }

  // Publication is the group's own, at settle: a detached child joins the launching trace when the
  // launcher says so, not because a capture caught it mid-flight and the tree happened to grow.
  private emitForkCreated(forked: SyncNarrativeContext, parentSpanId: SpanId | null): void {
    this.pipeline.flush();
    publishForkCreatedEvents(
      this.pipeline,
      this.groupId,
      "fire-and-forget",
      forked.knownSpanIds(),
      parentSpanId,
    );
    publishChildrenTo(this.parentContext, forked.reportableSpanIds());
  }
}
