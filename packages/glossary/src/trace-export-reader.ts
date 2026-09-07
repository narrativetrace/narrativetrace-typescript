// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { TreeWalk } from "@narrativetrace/core";
import { asArray, asObject, asString, type JsonObject, required } from "./json-shape.js";

/** One captured parameter of a call: its name, and its already-rendered value. */
export interface TranslatableParameter {
  /** Parameter identifier as written in the source. */
  readonly name: string;
  /** Rendered value exactly as the trace run recorded it — never re-rendered, never translated. */
  readonly value: string;
}

/** How a call ended, in the vocabulary the trace export writes. */
export type CallOutcome = "returned" | "threw" | "incomplete";

/**
 * One call of a stored trace, in the shape the translated view reads.
 *
 * INTENT: the structural half of a canonical trace file — identifiers, values and outcome, with the
 * pre-rendered `message` text deliberately absent. The translated line is re-derived from these
 * fields rather than substituted into rendered text, which is what makes "no value token is ever
 * altered" true by construction.
 */
export interface TranslatableCall {
  /** Declaring class name, as recorded. */
  readonly className: string;
  /** Method name, as recorded. */
  readonly methodName: string;
  /** Captured parameters in call order; empty when none were captured. */
  readonly parameters: readonly TranslatableParameter[];
  /** How the call ended. */
  readonly outcome: CallOutcome;
  /** Rendered return value; absent unless the call returned one, and `null` for a null return. */
  readonly returnValue?: string | null;
  /** Thrown error's type name; absent unless the call threw a typed error. */
  readonly errorType?: string;
  /** Thrown error's message, verbatim — a runtime value, never translated. */
  readonly errorMessage?: string;
  /** Calls this one made, in the order they were entered. */
  readonly children: readonly TranslatableCall[];
}

/** One stored trace file: the scenario it recorded, and its calls. */
export interface TranslatableTrace {
  /** Scenario name from the export's `scenario.name`. */
  readonly scenario: string;
  /** Root calls in the order they were entered. */
  readonly calls: readonly TranslatableCall[];
}

/** A call under construction: children and outcome arrive on later events. */
type MutableCall = {
  -readonly [Field in keyof Omit<TranslatableCall, "children">]: TranslatableCall[Field];
} & { children: MutableCall[] };

function readParameters(event: JsonObject): TranslatableParameter[] {
  const raw = event.get("parameters");
  if (raw === undefined) return [];
  return asArray(raw, "parameters").map((entry) => {
    const body = asObject(entry, "parameter");
    return {
      name: asString(required(body, "name", "parameter"), "parameter name"),
      value: asString(required(body, "value", "parameter"), "parameter value"),
    };
  });
}

function enterCall(event: JsonObject): MutableCall {
  return {
    className: asString(required(event, "className", "event"), "className"),
    methodName: asString(required(event, "methodName", "event"), "methodName"),
    parameters: readParameters(event),
    outcome: "incomplete",
    children: [],
  };
}

function applyOutcome(call: MutableCall, event: JsonObject): void {
  call.outcome = asString(required(event, "outcome", "exit event"), "outcome") as CallOutcome;
  if (event.has("returnValue")) {
    const value = event.get("returnValue");
    call.returnValue = value === null ? null : asString(value, "returnValue");
  }
  if (event.has("errorType")) call.errorType = asString(event.get("errorType"), "errorType");
  if (event.has("errorMessage")) {
    call.errorMessage = asString(event.get("errorMessage"), "errorMessage");
  }
}

/** A span named by one event but entered by none — the file is not a coherent trace. */
function entered(calls: Map<string, MutableCall>, spanId: string): MutableCall {
  const call = calls.get(spanId);
  if (call === undefined) throw new TypeError(`event references unentered span '${spanId}'`);
  return call;
}

function siblingsOf(
  event: JsonObject,
  calls: Map<string, MutableCall>,
  roots: MutableCall[],
): MutableCall[] {
  if (!event.has("parentSpanId")) return roots;
  return entered(calls, asString(event.get("parentSpanId"), "parentSpanId")).children;
}

function applyEvent(
  event: JsonObject,
  calls: Map<string, MutableCall>,
  roots: MutableCall[],
): void {
  const spanId = asString(required(event, "spanId", "event"), "spanId");
  if (asString(required(event, "type", "event"), "event type") !== "enter") {
    applyOutcome(entered(calls, spanId), event);
    return;
  }
  const call = enterCall(event);
  siblingsOf(event, calls, roots).push(call);
  calls.set(spanId, call);
}

function freezeLeaf(
  call: MutableCall,
  frozenChildren: readonly TranslatableCall[],
): TranslatableCall {
  return Object.freeze({
    ...call,
    parameters: Object.freeze([...call.parameters]),
    children: Object.freeze(frozenChildren),
  });
}

/** One MutableCall's place on the explicit freeze stack: its frozen children built so far. */
interface FreezeFrame {
  readonly call: MutableCall;
  readonly frozenChildren: TranslatableCall[];
  index: number;
}

// Explicit-stack (non-recursive) post-order build, depth-bounded via TreeWalk. Every call's
// children are built strictly bottom-up from a flat, append-only enter/exit event stream with
// fixed parentSpanId links — structurally incapable of a cycle (an "enter" event always creates a
// fresh call object, so nothing already placed in a children array can become its own ancestor) —
// so only the depth half of the bound applies; a call past the depth limit is silently dropped
// from its parent's children rather than crashing the read.
function freezeCall(root: MutableCall): TranslatableCall {
  const walk = new TreeWalk<MutableCall>();
  walk.enter(root);
  const stack: FreezeFrame[] = [{ call: root, frozenChildren: [], index: 0 }];
  let result: TranslatableCall | undefined;
  while (stack.length > 0) {
    result = stepFreezeFrame(stack, walk);
  }
  return result as TranslatableCall;
}

function stepFreezeFrame(
  stack: FreezeFrame[],
  walk: TreeWalk<MutableCall>,
): TranslatableCall | undefined {
  const frame = stack[stack.length - 1] as FreezeFrame;
  if (frame.index < frame.call.children.length) {
    const child = frame.call.children[frame.index++] as MutableCall;
    if (walk.enter(child) === undefined) stack.push({ call: child, frozenChildren: [], index: 0 });
    return undefined;
  }
  walk.exit(frame.call);
  const frozen = freezeLeaf(frame.call, frame.frozenChildren);
  stack.pop();
  const parent = stack[stack.length - 1];
  if (parent) parent.frozenChildren.push(frozen);
  return frozen;
}

/**
 * Reads a stored trace export into the structural view a translation renders from.
 *
 * INTENT: `translateTraces` is a pure function of stored files, so it re-runs over historical
 * traces long after the run that produced them. This is the door: the JSON a trace run wrote
 * (`{ version, scenario, events }`) becomes calls with their parameters, values and outcomes.
 *
 * @param json text of one exported trace file, as `exportJson` writes it.
 * @returns the scenario name and its calls.
 * @throws {TypeError} if the document is not a trace export — a missing `scenario`/`events`, a
 * field of the wrong JSON type, or an event naming a span no `enter` event opened. A malformed file
 * fails the run loudly instead of translating into a silently wrong call tree: an unentered parent
 * would otherwise flatten a nested call into a root, which reads as a different story.
 * @remarks Unknown keys are tolerated, unlike the glossary reader's strict rejection: this input is
 * machine-written, and a newer schema version must translate under an older reader rather than
 * failing the run.
 */
export function readTraceExport(json: string): TranslatableTrace {
  const document = asObject(JSON.parse(json), "trace export");
  const scenario = asObject(required(document, "scenario", "trace export"), "scenario");
  const calls = new Map<string, MutableCall>();
  const roots: MutableCall[] = [];
  for (const event of asArray(required(document, "events", "trace export"), "events")) {
    applyEvent(asObject(event, "event"), calls, roots);
  }
  return Object.freeze({
    scenario: asString(required(scenario, "name", "scenario"), "scenario name"),
    calls: Object.freeze(roots.map(freezeCall)),
  });
}
