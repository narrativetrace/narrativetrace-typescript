// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  returned,
  type TraceTree,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { describe, expect, test } from "vitest";
import { hostileStrings } from "../src/corpus/hostile-corpus.js";

/**
 * Diagram alias mode, driven by a class name — the one route the shared hostile corpus never
 * reached before 2026-09-13 (mirrors the Java canonical source's `DiagramAliasCorpusPropertyTest`).
 * Every corpus *value* already drives `renderMermaidSequence`/
 * `renderPlantUmlSequence` through the captured-value and narration routes (`emitters.ts`'s
 * `treeOf`); what no per-commit test ever did was drive a class name — the one field
 * `DiagramText.aliasToken` turns into a bare, unquoted token — with corpus strings, which is
 * exactly how a class literally named `end` would have slipped through here too.
 *
 * @llmNote The oracle here is stricter than mere well-formedness: a participant line whose alias
 * happens to be a sequence-diagram keyword is still a syntactically well-shaped `participant`
 * statement — `end` matches `[A-Za-z0-9_]+` just as well as `end_` does. Three assertions pin the
 * actual contract: (1) exactly one participant line per distinct class — a collision silently
 * merging two different classes into one participant would still be well formed; (2) every alias
 * token contains only `[A-Za-z0-9_]`, the bare-token grammar both formats share; (3) no alias
 * token, lowercased, equals a reserved word of the format it renders in.
 * {@link MERMAID_RESERVED_ALIASES}/{@link PLANTUML_RESERVED_ALIASES} are kept INDEPENDENT of
 * `diagram-text.ts`'s own charset and of each other's list rather than importing anything from
 * production — a test that asks production for the very thing it is checked against cannot fail
 * when that thing is wrong.
 *
 * This runtime is a stricter target than Java's Mermaid-only alias mode: `sequence-walk.ts`
 * always renders both grammars in alias mode (see that module's own doc), so both are exercised
 * here, not just Mermaid.
 *
 * Alias extraction reads each format's OWN call-arrow line, never the `participant` declaration
 * line — a root node's call arrow is a self-loop (`${alias}->></-> ${alias}: ...`), so both
 * endpoints name the class's one alias regardless of which order a `participant` line lists the
 * alias and display name in (this runtime's PlantUML fix, `fix(diagrams): PlantUML participants
 * are declared display-name first`, changes that order without touching call-arrow syntax at
 * all).
 */

const CORPUS_PREFIX = "diagram-alias-";
const BARE_ALIAS_TOKEN = /^[A-Za-z0-9_]+$/;

/**
 * Mermaid sequence-diagram keywords, independently sourced from `sequenceDiagram.jison`
 * (mermaid-js/mermaid, verified 2026-09-13) — the same set the Java canonical source's own
 * independent list uses, and the same set `alias-generator.test.ts`'s two hand-picked cases
 * (`end`, `participant`) are drawn from.
 */
const MERMAID_RESERVED_ALIASES = new Set([
  "sequencediagram",
  "participant",
  "actor",
  "create",
  "destroy",
  "box",
  "loop",
  "rect",
  "opt",
  "alt",
  "else",
  "par",
  "par_over",
  "and",
  "critical",
  "option",
  "break",
  "end",
  "links",
  "link",
  "properties",
  "details",
  "over",
  "note",
  "activate",
  "deactivate",
  "autonumber",
  "off",
  "title",
]);

/**
 * PlantUML sequence-diagram keywords, independently sourced from PlantUML's own sequence-diagram
 * documentation (plantuml.com/sequence-diagram — participants, grouping/`alt`-`else`-`end`
 * constructs, activation, autonumber, and the `title`/`hide`/`show`/`skinparam` declaration
 * keywords), verified 2026-09-13. Kept separate from Mermaid's list: the two grammars reserve
 * different words (`hide`/`show`/`skinparam`/`ref` have no Mermaid equivalent; Mermaid's
 * `sequencediagram`/`links`/`properties`/`details`/`over` have no PlantUML equivalent).
 */
const PLANTUML_RESERVED_ALIASES = new Set([
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
  "end",
  "note",
  "alt",
  "else",
  "loop",
  "group",
  "opt",
  "par",
  "break",
  "critical",
  "ref",
  "activate",
  "deactivate",
  "destroy",
  "create",
  "return",
  "box",
  "title",
  "hide",
  "show",
  "skinparam",
  "autonumber",
]);

function oneClassTree(className: string): TraceTree {
  const node = traceNode(methodSignature(className, "run", []), returned("true"), [], 1_000_000);
  return traceTree([node]);
}

function twoClassTree(callerClassName: string, targetClassName: string): TraceTree {
  const child = traceNode(
    methodSignature(targetClassName, "run", []),
    returned("true"),
    [],
    1_000_000,
  );
  const root = traceNode(
    methodSignature(callerClassName, "call", []),
    returned("true"),
    [child],
    2_000_000,
  );
  return traceTree([root]);
}

function participantLineCount(diagram: string): number {
  return diagram
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("participant")).length;
}

/**
 * Every alias appearing as a call-arrow endpoint, deduplicated — order-agnostic, format-specific.
 * Reads ONLY the pure call-arrow line (`caller->>target:`, single dash): the return arrow
 * (`target-->>caller:`, double dash) also contains the substring `->>`, one character in from its
 * own leading dash, so a naive `includes("->>")` filter would split it one character short and
 * leave a stray trailing `-` on the extracted alias — excluded explicitly rather than relied on to
 * fail loudly, since a dash IS one of the characters this property means to reject.
 */
function mermaidCallArrowAliases(diagram: string): string[] {
  const aliases = new Set<string>();
  for (const raw of diagram.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("participant") || line.includes("-->>") || !line.includes("->>")) {
      continue;
    }
    const [caller, rest] = line.split("->>");
    aliases.add(caller);
    aliases.add(rest.split(":")[0] ?? "");
  }
  return [...aliases];
}

function plantUmlCallArrowAliases(diagram: string): string[] {
  const aliases = new Set<string>();
  for (const raw of diagram.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("participant") || !line.includes(" -> ")) continue;
    const [caller, rest] = line.split(" -> ");
    aliases.add(caller);
    aliases.add(rest.split(" : ")[0] ?? "");
  }
  return [...aliases];
}

function assertEverySafeAlias(aliases: readonly string[], reserved: ReadonlySet<string>): void {
  for (const alias of aliases) {
    expect(alias, `a participant alias containing anything but [A-Za-z0-9_]: ${alias}`).toMatch(
      BARE_ALIAS_TOKEN,
    );
    expect(
      reserved.has(alias.toLowerCase()),
      `a participant alias that is a bare reserved word: ${alias}`,
    ).toBe(false);
  }
}

function corpusAliasCases() {
  return hostileStrings().filter((c) => c.id.startsWith(CORPUS_PREFIX));
}

describe("diagram alias corpus — every diagram-alias-* case is actually present", () => {
  test("the corpus was not silently renamed out from under this property", () => {
    const ids = corpusAliasCases().map((c) => c.id);
    expect(ids.sort()).toEqual(
      [
        "diagram-alias-arrow",
        "diagram-alias-empty",
        "diagram-alias-quote-collision",
        "diagram-alias-reserved-word",
      ].sort(),
    );
  });
});

describe("diagram alias corpus — Mermaid alias mode", () => {
  test.each(
    corpusAliasCases().map((c) => [c.id, c.value] as const),
  )("%s produces exactly one safe participant", (_id, value) => {
    const diagram = renderMermaidSequence(oneClassTree(value));

    expect(participantLineCount(diagram)).toBe(1);
    assertEverySafeAlias(mermaidCallArrowAliases(diagram), MERMAID_RESERVED_ALIASES);
  });

  test("a quote and its apostrophe twin, which sanitize to the same alias, stay distinct participants", () => {
    const diagram = renderMermaidSequence(twoClassTree('a"b', "a'b"));

    expect(participantLineCount(diagram)).toBe(2);
    const aliases = mermaidCallArrowAliases(diagram);
    assertEverySafeAlias(aliases, MERMAID_RESERVED_ALIASES);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("diagram alias corpus — PlantUML alias mode (this runtime always aliases PlantUML too)", () => {
  test.each(
    corpusAliasCases().map((c) => [c.id, c.value] as const),
  )("%s produces exactly one safe participant", (_id, value) => {
    const diagram = renderPlantUmlSequence(oneClassTree(value));

    expect(participantLineCount(diagram)).toBe(1);
    assertEverySafeAlias(plantUmlCallArrowAliases(diagram), PLANTUML_RESERVED_ALIASES);
  });

  test("a quote and its apostrophe twin, which sanitize to the same alias, stay distinct participants", () => {
    const diagram = renderPlantUmlSequence(twoClassTree('a"b', "a'b"));

    expect(participantLineCount(diagram)).toBe(2);
    const aliases = plantUmlCallArrowAliases(diagram);
    assertEverySafeAlias(aliases, PLANTUML_RESERVED_ALIASES);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
