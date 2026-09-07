// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  ControlEscape,
  type EnterEvent,
  type EventConsumer,
  type ExitEvent,
  errorMessage,
  errorTypeName,
  type ForkCreatedEvent,
  type JoinCompleteEvent,
  type MethodSignature,
  type TraceEvent,
} from "../packages/core/src/index.js";

/**
 * The launcher's live `→ ← !!` stream: an `EventConsumer` for the inline path of the example's
 * `DualPathPipeline` (the twin of Java's `Slf4jTraceEventListener`). It formats each event as it
 * happens and hands the line to `sink`; the colorizer indents by line shape afterwards. Every
 * line is control-escaped, so a value cannot smuggle terminal escapes into the demo.
 */

const UNKNOWN = "<unknown span>";

function params(signature: MethodSignature): string {
  return signature.parameters
    .map((p) => `${p.name}: ${p.redacted ? "[REDACTED]" : p.renderedValue}`)
    .join(", ");
}

function callName(signature: MethodSignature | undefined): string {
  return signature === undefined ? UNKNOWN : `${signature.className}.${signature.methodName}`;
}

function formatExit(event: ExitEvent, signature: MethodSignature | undefined): string {
  const call = callName(signature);
  const outcome = event.outcome;
  if (outcome.kind === "threw") {
    const error = `${errorTypeName(outcome.error)}: ${errorMessage(outcome.error)}`;
    const context = outcome.errorContext === null ? "" : ` [${outcome.errorContext}]`;
    return `!! ${call} ✖ ${error}${context}`;
  }
  if (outcome.kind === "incomplete") return `← ${call} ⏳ (incomplete)`;
  const value = outcome.renderedValue;
  return value === null || value === "undefined" ? `← ${call}` : `← ${call} → ${value}`;
}

function formatGroup(event: ForkCreatedEvent | JoinCompleteEvent): string {
  if (event.type === "join-complete") {
    return `⑃ fork joined [groupId: ${event.groupId}, members: ${event.memberCount}, ${event.wallTimeMs}ms]`;
  }
  return event.strategy === "fork-join"
    ? `⑂ fork group created [groupId: ${event.groupId}]`
    : `⤳ fire-and-forget launched [groupId: ${event.groupId}]`;
}

export function createLiveStreamConsumer(sink: (line: string) => void): EventConsumer {
  const open = new Map<string, MethodSignature>();
  const emit = (line: string): void => sink(ControlEscape.sanitize(line));
  const onEnter = (event: EnterEvent): void => {
    open.set(event.spanContext.spanId, event.signature);
    emit(`→ ${callName(event.signature)}(${params(event.signature)})`);
  };
  const onExit = (event: ExitEvent): void => {
    const signature = open.get(event.spanContext.spanId);
    open.delete(event.spanContext.spanId);
    emit(formatExit(event, signature));
  };
  return (event: TraceEvent) => {
    if (event.type === "enter") onEnter(event);
    else if (event.type === "exit") onExit(event);
    else emit(formatGroup(event));
  };
}
