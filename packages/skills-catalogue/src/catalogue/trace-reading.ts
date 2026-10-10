// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { skillSection } from "../skill.js";

/**
 * How to read a trace — the reference text every skill that reads one renders, written once. Port
 * of Java `TraceReading`, with this runtime's file locations and renderer names.
 *
 * INTENT: the verify skill reads a trace to check a change, the debug skill to find a defect; both
 * need the same answer to "which artifact answers which question" and the same list of shapes that
 * mean something went wrong. Rendered into both pages, never copied into either.
 */
export const TraceReading = {
  /** Which flavour answers which question, cheapest first, with where each one is written. */
  FLAVOURS: skillSection(
    "Which flavour answers which question",
    `| flavour | where | carries | answers |
|---|---|---|---|
| structural \`.nt\` | \`narrativetrace-output/structural/<test file>/<scenario>.nt\` | shape only: calls, order, nesting, parameter names, multiplicity, span ids — dozens of lines for a whole flow | did the flow do what I meant? |
| Markdown narrative | \`narrativetrace-output/<test file>/<scenario>.md\` | values (redacted), outcomes, durations | what value crossed this boundary? — read one span, by id |
| indented text | \`renderIndentedText\`, a failing test's console output | the same values as plain text | the same question, in a console or a failure message |
| sequence diagram | \`narrativetrace-output/diagrams/<test file>/<scenario>.mmd\` | who called whom, in order, across async work | ordering across components and concurrent tasks |
| approval delta | the failing test's message: \`.received.nt\` against \`.approved.nt\` | what changed in the shape, citing both sides' ids | is this change intended? |
| prose | \`renderProse\` | narration for a person | explaining the flow to the user — never read it to check the code |

Use the cheapest flavour that answers the question, and look at values only where the
shape says to look. A span id (\`#1\`, \`#1.3\`, \`#1.3.2\`) is the span's position in the tree
and the same in every flavour: find in the \`.md\` the span the \`.nt\` flagged by its id.
Redaction stays on — the deny-list and \`[REDACTED]\` are never turned off to see more; a
redacted value that matters is reasoned about by its parameter name and the shape around
it.`,
  ),

  /** The shapes in a structural trace that mean the flow did something other than intended. */
  SHAPES: skillSection(
    "Shapes that mean something went wrong",
    `- a call made twice that the intent makes once
- a call before its precondition — a notification before the payment that it announces
- a branch never taken that the intent takes
- a retry that masks a failure
- a side effect inside a loop
- a swallowed exception: a thrown outcome \`!!\` under a call that returned normally
- a cleanup that never ran
- a value crossing a boundary that should have been redacted`,
  ),

  /** Every claim about a trace points at the span it rests on. */
  CITE_SPAN_IDS: {
    rule: "Cite a span id for every claim about the trace",
    reason:
      "an id points at one span in every flavour, so a reviewer can check the claim; a claim without one cannot be checked",
  },

  /** Redaction is never the price of seeing more. */
  NEVER_REDACTION_OFF: {
    rule: "Never turn redaction off to see more",
    reason:
      "a redacted value that matters is reasoned about by its name and shape; turning redaction off puts the user's secrets in the transcript",
  },
} as const;
