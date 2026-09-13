// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  type TreeWalkStop,
  threw,
  traceNode,
  walkPreOrder,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import type { DiagramLabel } from "../src/diagram-label.js";
import { MERMAID_GRAMMAR } from "../src/mermaid-grammar.js";
import { PLANTUML_GRAMMAR } from "../src/plantuml-grammar.js";
import type { SequenceGrammar } from "../src/sequence-grammar.js";
import { collectParticipants, renderInteractions } from "../src/sequence-walk.js";

/**
 * The invariant `sequence-walk.ts`'s composition is supposed to guarantee: whichever grammar it is
 * given, the walk emits exactly one call arrow and exactly one outcome per node it visits or stops
 * at — never more, never fewer, whatever the tree's shape or the metadata's content. Port of the
 * Java reference's `SequenceWalkContractTest`.
 *
 * @remarks `mermaid-sequence.test.ts`/`plantuml-sequence.test.ts` already pin each grammar's own
 * output text; this test pins the shared traversal contract those two grammars can never diverge
 * on, by counting hook invocations rather than parsing rendered text — parsing would be fooled by
 * the hostile-metadata cases below, where the trace-derived text legitimately contains arrow-like
 * substrings.
 */

/** Counts how many times each hook fired, while still producing the real grammar's output. */
class CountingGrammar implements SequenceGrammar {
  callArrows = 0;
  returns = 0;
  throwsCount = 0;
  incompletes = 0;
  limitedNotes = 0;

  constructor(private readonly delegate: SequenceGrammar) {}

  get header(): string {
    return this.delegate.header;
  }
  get footer(): string {
    return this.delegate.footer;
  }
  get outcomes(): number {
    return this.returns + this.throwsCount + this.incompletes;
  }

  callArrow(caller: DiagramLabel, target: DiagramLabel, signature: DiagramLabel): string {
    this.callArrows++;
    return this.delegate.callArrow(caller, target, signature);
  }
  returnArrow(target: DiagramLabel, caller: DiagramLabel, message: DiagramLabel): string {
    this.returns++;
    return this.delegate.returnArrow(target, caller, message);
  }
  throwArrow(target: DiagramLabel, caller: DiagramLabel, exceptionType: DiagramLabel): string {
    this.throwsCount++;
    return this.delegate.throwArrow(target, caller, exceptionType);
  }
  incomplete(target: DiagramLabel): string {
    this.incompletes++;
    return this.delegate.incomplete(target);
  }
  limitedNote(target: DiagramLabel, stop: TreeWalkStop): string {
    this.limitedNotes++;
    return this.delegate.limitedNote(target, stop);
  }
}

function deepChain(depth: number): TraceNode {
  let current = traceNode(methodSignature("Recursive", "bottom", []), returned('"ok"'), []);
  for (let i = 0; i < depth; i++) {
    current = traceNode(methodSignature("Recursive", `call${i}`, []), returned('"ok"'), [current]);
  }
  return current;
}

// A genuine cycle can't be built through `traceNode` (it freezes a copy of `children`), so this
// mirrors mermaid-sequence.test.ts's own `cyclicRoot` helper: a hand-built object cast to
// `TraceNode`, the shape a deserialized or hand-built tree can arrive in.
function cyclicRing(): TraceNode {
  const b = {
    signature: methodSignature("Ring", "b", []),
    outcome: returned('"ok"'),
    children: [] as unknown[],
    durationMs: 0,
    startTimeMs: 0,
  };
  const a = {
    signature: methodSignature("Ring", "a", []),
    outcome: returned('"ok"'),
    children: [b],
    durationMs: 0,
    startTimeMs: 0,
  };
  b.children = [a];
  return a as unknown as TraceNode;
}

const QUOTE_AND_BREAK =
  'Victim"\nparticipant InjectedActor\nclick InjectedActor href "https://attacker.example"';
const NOTE_FORGERY = "Victim\nnote over Victim: forged\n";
const ARROW_LOOKALIKE = "->>-->>-x-> --> -[#red]->";

function hostileMetadata(hostile: string): TraceNode {
  return traceNode(
    methodSignature(hostile, hostile, [parameterCapture(hostile, '"v"', false)]),
    threw(new Error(hostile)),
    [],
  );
}

/** How many nodes a plain walk actually visits or stops at, independent of any grammar. */
function nodeCount(root: TraceNode): number {
  let count = 0;
  walkPreOrder(
    [root],
    (n) => n.children,
    () => {
      count++;
    },
  );
  return count;
}

/** How many of those nodes the walk stopped at instead of visiting (a cycle or the depth cap). */
function limitCount(root: TraceNode): number {
  let count = 0;
  walkPreOrder(
    [root],
    (n) => n.children,
    (_n, stop) => {
      if (stop !== undefined) count++;
    },
  );
  return count;
}

const HOSTILE_TREES: ReadonlyArray<[string, TraceNode]> = [
  ["deep chain", deepChain(5_000)],
  // 3, not 2: the walk visits a and b, then stops at the re-encountered a — three emissions
  // total, matching mermaid-sequence.test.ts's own cyclic case.
  ["cyclic ring", cyclicRing()],
  ["quote+break metadata", hostileMetadata(QUOTE_AND_BREAK)],
  ["note forgery metadata", hostileMetadata(NOTE_FORGERY)],
  ["arrow-lookalike metadata", hostileMetadata(ARROW_LOOKALIKE)],
];

function assertOneArrowAndOneOutcomePerNode(root: TraceNode, real: SequenceGrammar): void {
  const expectedNodes = nodeCount(root);
  const counting = new CountingGrammar(real);
  const aliases = collectParticipants([root]);

  renderInteractions([root], aliases, counting);

  expect(counting.callArrows, "call arrows").toBe(expectedNodes);
  expect(counting.outcomes, "outcomes (return + throw + incomplete)").toBe(expectedNodes);
  expect(counting.limitedNotes, "limited notes").toBe(limitCount(root));
}

describe.each(HOSTILE_TREES)("sequence walk contract: %s", (_label, root) => {
  test("mermaid emits exactly one call arrow and one outcome per node", () => {
    assertOneArrowAndOneOutcomePerNode(root, MERMAID_GRAMMAR);
  });

  test("plantuml emits exactly one call arrow and one outcome per node", () => {
    assertOneArrowAndOneOutcomePerNode(root, PLANTUML_GRAMMAR);
  });
});

test("both grammars agree on node count for the same hostile tree", () => {
  const root = hostileMetadata(QUOTE_AND_BREAK);
  const aliases = collectParticipants([root]);

  const mermaid = new CountingGrammar(MERMAID_GRAMMAR);
  const plantUml = new CountingGrammar(PLANTUML_GRAMMAR);
  renderInteractions([root], aliases, mermaid);
  renderInteractions([root], aliases, plantUml);

  expect(mermaid.callArrows).toBe(plantUml.callArrows);
  expect(mermaid.outcomes).toBe(plantUml.outcomes);
});
