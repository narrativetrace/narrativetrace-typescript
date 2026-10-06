// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { DOCS_URL, renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { hasExactlyOneRegion, scanMarkedBlocks } from "../../src/init/marked-block.js";
import { projectState } from "../../src/init/project-state.js";
import { FAKE_COORDINATE, fakeCarrier } from "./fixtures.js";

/**
 * The always-on pointer an agent reads at the start of its next session. These cases pin what goes in,
 * in what order, and the one thing that must never: a version literal anywhere but the machine-written
 * stamp on the opening marker.
 *
 * Named after `AgentsMdBlockTest` in the Java reference so the two lists diff. Java's Gradle-task case
 * has no counterpart — this runtime names one set of commands everywhere.
 */

const CARRIER = fakeCarrier(["narrativetrace-doctor", "add-narrative-tracing"]);

describe("the managed section", () => {
  test("is one well-formed region stamped with the carrier", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());

    expect(hasExactlyOneRegion(scanMarkedBlocks(block))).toBe(true);
    expect(scanMarkedBlocks(block).regions[0]?.coordinate).toBe(FAKE_COORDINATE);
    expect(block.endsWith("<!-- narrativetrace:end -->\n")).toBe(true);
  });

  // The whole section, asserted whole: it is PUBLISHED content — the first thing an agent reads in a
  // consumer project — so every sentence of it is the contract, not just the fragments the cases below
  // single out. A mutation run makes the difference visible: with fragment assertions only, rewriting
  // any other line changes nothing that fails.
  test("is exactly this text", () => {
    const carrier = fakeCarrier([
      { name: "narrativetrace-doctor", description: "Diagnoses an install." },
      { name: "add-narrative-tracing", description: "Installs NarrativeTrace." },
    ]);

    expect(renderAgentsMdBlock(carrier, projectState())).toBe(
      `<!-- narrativetrace:start ${FAKE_COORDINATE} -->
## NarrativeTrace

NarrativeTrace turns this project's own method names, parameters and return values into a readable execution narrative — no log statements. Rendered traces land in \`narrativetrace-output\`.

### Agent skills installed in this project

- \`narrativetrace-doctor\` — Diagnoses an install.
- \`add-narrative-tracing\` — Installs NarrativeTrace.

### Commands

- \`npx --yes @narrativetrace/cli doctor\` — diagnose this install; read-only, and every finding names the skill that fixes it
- \`npx --yes @narrativetrace/cli init --dry-run\` — show what re-installing the skills would change, as a diff
- \`npx --yes @narrativetrace/cli uninstall\` — remove exactly what the installer wrote, this section included

Documentation: https://narrativetrace.ai/typescript/llms.txt

### Rules

- Pass parameter names to \`traceObject\` explicitly. Without them the trace reads \`arg0\`, \`arg1\`, and the narrative is gone.
- Never disable redaction to make a trace easier to read.
- Commit \`.approved.nt\` files; never commit a \`.received.nt\`.

<!-- narrativetrace:end -->
`,
    );
  });

  test("lists every skill with its catalogue description verbatim and in order", () => {
    const carrier = fakeCarrier([
      { name: "narrativetrace-doctor", description: "Diagnoses an install. Read-only." },
      { name: "add-narrative-tracing", description: "Installs NarrativeTrace." },
    ]);

    const block = renderAgentsMdBlock(carrier, projectState());

    expect(block).toContain("- `narrativetrace-doctor` — Diagnoses an install. Read-only.\n");
    expect(block).toContain("- `add-narrative-tracing` — Installs NarrativeTrace.\n");
    expect(block.indexOf("narrativetrace-doctor")).toBeLessThan(
      block.indexOf("add-narrative-tracing"),
    );
  });

  test("names where traces land", () => {
    expect(renderAgentsMdBlock(CARRIER, projectState())).toContain("`narrativetrace-output`");
    expect(renderAgentsMdBlock(CARRIER, projectState({ outputDirectory: "traces" }))).toContain(
      "`traces`",
    );
  });

  test("names the command-line verbs, non-interactively", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());

    expect(block).toContain("`npx --yes @narrativetrace/cli doctor`");
    expect(block).toContain("`npx --yes @narrativetrace/cli init --dry-run`");
    expect(block).toContain("`npx --yes @narrativetrace/cli uninstall`");
    // A bare `npx` would stop to ask "Ok to proceed?" in a project without the CLI installed.
    expect(block).not.toMatch(/`npx @narrativetrace/);
  });

  test("points at the runtime's documentation index", () => {
    expect(renderAgentsMdBlock(CARRIER, projectState())).toContain(DOCS_URL);
    expect(DOCS_URL).toBe("https://narrativetrace.ai/typescript/llms.txt");
  });

  test("carries the three rules the evaluations keep tripping over", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());

    expect(block).toContain("traceObject");
    expect(block).toContain("arg0");
    expect(block).toContain("redaction");
    expect(block).toContain(".received.nt");
  });

  test("says nothing about a version beyond the machine-written stamp", () => {
    const block = renderAgentsMdBlock(CARRIER, projectState());

    expect(block.slice(block.indexOf("\n"))).not.toMatch(/\d+\.\d+\.\d+/);
  });

  test("refuses to render without a carrier or a project", () => {
    expect(() => renderAgentsMdBlock(undefined as never, projectState())).toThrow(TypeError);
    expect(() => renderAgentsMdBlock(CARRIER, undefined as never)).toThrow(TypeError);
  });

  test("is the same text for the same inputs", () => {
    expect(renderAgentsMdBlock(CARRIER, projectState())).toBe(
      renderAgentsMdBlock(CARRIER, projectState()),
    );
  });
});
