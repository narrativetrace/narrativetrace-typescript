// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderValue } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import {
  hostileGraphCases,
  hostileInjections,
  hostileNames,
  hostileRedactions,
  hostileStrings,
  hostileTemplates,
  hostileTraceparents,
  hostileTraceShapes,
  hostileTracestates,
} from "../src/corpus/hostile-corpus.js";
import { build, templateValues } from "../src/corpus/hostile-graphs.js";
import type {
  CountingAccessor,
  LookalikeCollection,
  SideEffectingIteratorList,
} from "../src/corpus/hostile-members.js";
import { build as buildTraceShape } from "../src/corpus/trace-shapes.js";
import { isMapKeyCase, isNameCase, secretOf } from "../src/corpus/types.js";
import { resolveMasterGraphsPath } from "./master-corpus-path.js";

/**
 * The corpus is data copied verbatim from the shared master copy, so its shape is a contract in
 * its own right — mirrors Java's `HostileCorpusTest`. A fixture that silently stopped loading
 * would turn every property below it green without testing anything.
 */

const CORPUS_DIR = fileURLToPath(new URL("../hostile-corpus/", import.meta.url));
const EM_DASH = "—";

function stringCaseValue(id: string): string {
  const found = hostileStrings().find((c) => c.id === id);
  if (found === undefined) throw new Error(`no corpus case with id ${id}`);
  return found.value;
}

function assertUniqueIds(ids: readonly string[]): void {
  expect(new Set(ids).size).toBe(ids.length);
}

describe("hostile corpus", () => {
  test("every fixture loads with cases", () => {
    expect(hostileStrings().length).toBeGreaterThan(50);
    expect(hostileInjections().length).toBeGreaterThan(30);
    expect(hostileTraceparents().length).toBeGreaterThan(30);
    expect(hostileTracestates().length).toBeGreaterThan(5);
    expect(hostileTemplates().length).toBeGreaterThan(30);
    expect(hostileGraphCases().length).toBeGreaterThan(40);
    expect(hostileNames().length).toBeGreaterThan(15);
    expect(hostileRedactions().length).toBeGreaterThan(60);
    expect(hostileTraceShapes().length).toBeGreaterThan(3);
  });

  test("case identifiers are unique within each fixture", () => {
    assertUniqueIds(hostileStrings().map((c) => c.id));
    assertUniqueIds(hostileInjections().map((c) => c.id));
    assertUniqueIds(hostileTraceparents().map((c) => c.id));
    assertUniqueIds(hostileTemplates().map((c) => c.id));
    assertUniqueIds(hostileGraphCases().map((c) => c.id));
    assertUniqueIds(hostileNames().map((c) => c.id));
    assertUniqueIds(hostileRedactions().map((c) => c.id));
    assertUniqueIds(hostileTraceShapes().map((c) => c.id));
  });

  test("every case carries a description saying what breaks", () => {
    for (const c of hostileStrings()) expect(c.description).not.toBe("");
    for (const c of hostileGraphCases()) expect(c.description).not.toBe("");
    for (const c of hostileNames()) expect(c.description).not.toBe("");
    for (const c of hostileRedactions()) expect(c.description).not.toBe("");
    for (const c of hostileTraceShapes()) expect(c.description).not.toBe("");
  });

  test("the generated cases materialize to the size they claim", () => {
    expect(stringCaseValue("long-1mib")).toHaveLength(1024 * 1024);
    expect(stringCaseValue("long-512")).toHaveLength(512);
    expect(stringCaseValue("long-truncation-boundary")).toHaveLength(200);
    expect(stringCaseValue("long-astral")).toHaveLength(300);
  });

  test("the escaped cases carry the code points they name", () => {
    expect(stringCaseValue("nul")).toBe(String.fromCodePoint(0x0000));
    expect(stringCaseValue("rtl-override").startsWith(String.fromCodePoint(0x202e))).toBe(true);
    expect(stringCaseValue("unpaired-high-surrogate")).toBe(String.fromCharCode(0xd800));
    expect(stringCaseValue("unpaired-low-surrogate")).toBe(String.fromCharCode(0xdc00));
    expect(stringCaseValue("zero-width")).toContain(String.fromCodePoint(0x200b));
    expect(stringCaseValue("zero-width")).toContain(String.fromCodePoint(0x2060));
    expect(stringCaseValue("noncharacter-arabic-block")).toBe(
      String.fromCodePoint(0xfdd0) + String.fromCodePoint(0xfdef),
    );
    // The fixture spells these as UTF-16 surrogate-pair escapes; JSON.parse combines each valid
    // pair, so the case surfaces as the two astral noncharacters, not four surrogate halves.
    expect(stringCaseValue("noncharacter-supplementary")).toBe(
      String.fromCodePoint(0x1fffe) + String.fromCodePoint(0x1ffff),
    );
  });

  test.each([
    "strings.json",
    "headers.json",
    "templates.json",
    "graphs.json",
    "injection.json",
    "names.json",
    "redaction.json",
    "trace-shapes.json",
  ])("%s stays ASCII on disk", (fileName) => {
    const text = readFileSync(`${CORPUS_DIR}${fileName}`, "utf-8");
    const offending = new Set<number>();
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code > 126 && code !== EM_DASH.codePointAt(0)) offending.add(code);
    }
    expect([...offending], `${fileName} must spell hostile characters as escapes`).toEqual([]);
  });

  test("every declared graph shape builds", () => {
    for (const graphCase of hostileGraphCases()) {
      expect(() => build(graphCase, "sentinel-probe"), `graph shape ${graphCase.id}`).not.toThrow();
    }
  });

  test("every declared trace shape builds", () => {
    for (const shapeCase of hostileTraceShapes()) {
      expect(() => buildTraceShape(shapeCase), `trace shape ${shapeCase.id}`).not.toThrow();
    }
  });

  test("every template fixture name resolves to a graph", () => {
    for (const templateCase of hostileTemplates()) {
      expect(
        () => templateValues(templateCase.values, "sentinel-probe"),
        `template case ${templateCase.id} names an unknown fixture`,
      ).not.toThrow();
    }
  });

  test("the header fixture marks both outcomes", () => {
    expect(hostileTraceparents().some((h) => h.accepted)).toBe(true);
    expect(hostileTraceparents().some((h) => !h.accepted)).toBe(true);
  });

  // A redaction row that named neither a field nor a value, or carried an unreadable `expect`,
  // would be replayed as a silently trivial assertion — the same failure mode as a fixture that
  // stopped loading, one row at a time.
  test("every redaction case declares exactly one subject and one direction", () => {
    for (const c of hostileRedactions()) {
      expect(secretOf(c).trim(), `${c.id} must carry a canary or a value`).not.toBe("");
      expect(
        isNameCase(c) === (c.value === undefined),
        `${c.id} must be a name case or a value case, never both or neither`,
      ).toBe(true);
      expect(["redacted", "visible"], `${c.id} must declare which way it goes`).toContain(c.expect);
    }
  });

  // ADV-2026-09-14-1: `position` only ever means "as a map key", and only a value case may declare
  // it — a name case already renders as a map, under its own field name, so a second map position
  // on top of that would test nothing new. Mirrors Java's `everyRedactionPositionIsWellFormed`.
  test("every redaction position is well-formed", () => {
    for (const c of hostileRedactions()) {
      if (c.position === undefined) continue;
      expect(c.position, `${c.id} declares an unknown position`).toBe("mapKey");
      expect(isNameCase(c), `${c.id}: only a value case may declare a map-key position`).toBe(
        false,
      );
    }
    expect(hostileRedactions().some(isMapKeyCase)).toBe(true);
  });

  // A name case whose canary is itself secret-shaped would pass the hidden assertion for the
  // wrong reason — the value axis would catch it whatever the name said.
  test("no redaction canary is itself a secret shape", () => {
    for (const c of hostileRedactions()) {
      if (!isNameCase(c)) continue;
      expect(c.canary, `${c.id} must test the name axis, not the value axis`).toMatch(
        /^canary-[a-z0-9-]+$/,
      );
    }
  });

  // Corpus replay for the three graphs.json rows added for the rule copied into the repository's
  // agent guide (owner ruling 2026-09-17, "rendering reads state, never runs behaviour"):
  // record-accessor-with-counter, platform-collection-side-effecting-iterator and
  // lookalike-collection-not-platform-defined. Each row's expected outcome is "rendered without
  // executing" — the renderer must never invoke the fixture's own overridden member. Reuses the
  // fixture idioms already pinned in `packages/core/__tests__/render-reads-state.test.ts`; mirrors
  // land the same three ids in every other runtime's corpus copy, per the cross-port rule.
  describe("the rendering rule: rendering reads state, never runs behaviour", () => {
    function graphOf(id: string): unknown {
      const graphCase = hostileGraphCases().find((c) => c.id === id);
      if (graphCase === undefined) throw new Error(`no corpus case with id ${id}`);
      return build(graphCase, "sentinel-probe");
    }

    // pending: rendering reads state, never runs behaviour — see the rendering rule in the repository's agent guide
    // Today, `renderPlainObject` (value-renderer.ts) reads an own-enumerable field with a plain
    // property access, which invokes an accessor's getter — the same documented gap
    // `render-reads-state.test.ts` pins for a plain getter. Observed red today: "expected 1 to be
    // +0" (the accessor ran once).
    test("record-accessor-with-counter renders without invoking the accessor", () => {
      const fixture = graphOf("record-accessor-with-counter") as CountingAccessor;
      renderValue(fixture);
      expect(fixture.calls).toBe(0);
    });

    // Live regression guard, not pending: `renderArray` (value-renderer.ts) reads elements via
    // `value.slice(0, n).map(...)`, defined over indexed access, never the iterator protocol — so
    // an `Array` subclass's overridden `[Symbol.iterator]` is already never reached
    // (`render-reads-state.test.ts` pins the same property directly against value-renderer.ts).
    test("platform-collection-side-effecting-iterator renders without executing the override", () => {
      const fixture = graphOf(
        "platform-collection-side-effecting-iterator",
      ) as SideEffectingIteratorList;
      renderValue(fixture);
      expect(fixture.iteratorCalls).toBe(0);
    });

    // Live regression guard, not pending: `renderPlainObject` walks `Object.keys(value)` only — a
    // string-keyed, own-enumerable field, never a Symbol-keyed member — so a hand-rolled
    // `[Symbol.iterator]` is never touched, whether or not the type's rendered shape (a bare
    // structural dump today, see `render-reads-state.test.ts`) is itself pending.
    test("lookalike-collection-not-platform-defined renders without executing its own iterator", () => {
      const fixture = graphOf("lookalike-collection-not-platform-defined") as LookalikeCollection;
      renderValue(fixture);
      expect(fixture.iteratorCalls).toBe(0);
    });
  });
});

/**
 * §6.7 rule: `graphs.json` is a byte-identical copy of the master corpus, found via
 * `master-corpus-path.ts`'s search order (env override, dev-container mount, host sibling
 * checkout). An absent master skips loudly rather than passing silently: a checkout without the
 * sibling repo — most checkouts, most of the time — must stay green, but with a printed line, not
 * a quiet no-op that looks the same as "checked and matched".
 */
const MASTER_GRAPHS_PATH = resolveMasterGraphsPath();
if (MASTER_GRAPHS_PATH === undefined) {
  console.warn(
    "SKIPPED: master corpus not mounted — set JAVA_REPO, or mount the golden Java repo at " +
      "/workspace-java or check it out as a host sibling, to run the graphs.json " +
      "byte-diff-against-master check",
  );
}

describe.skipIf(MASTER_GRAPHS_PATH === undefined)(
  "graphs.json byte-diff against the master corpus",
  () => {
    test("the whole file matches the master copy byte-for-byte", () => {
      const master = readFileSync(MASTER_GRAPHS_PATH as string, "utf-8");
      const local = readFileSync(`${CORPUS_DIR}graphs.json`, "utf-8");
      expect(local).toBe(master);
    });
  },
);
