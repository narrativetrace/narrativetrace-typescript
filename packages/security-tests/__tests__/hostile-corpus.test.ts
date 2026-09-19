// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderStructured, renderValue } from "@narrativetrace/core";
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
  AbstractCollectionSubclassOverride,
  AbstractMapSubclassOverride,
  CountingAccessor,
  LookalikeCollection,
  SideEffectingIteratorList,
} from "../src/corpus/hostile-members.js";
import {
  FieldlessAbstractSubclassToStringDoor,
  FieldlessSideTableToStringDoor,
  type NumberSubclassToStringDoor,
} from "../src/corpus/hostile-members.js";
import { build as buildTraceShape } from "../src/corpus/trace-shapes.js";
import { isKindCase, isMapKeyCase, isNameCase, secretOf } from "../src/corpus/types.js";
import { resolveMasterGraphs, resolveMasterRedaction } from "./master-corpus-path.js";

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

  // A redaction row that named no subject at all, two subjects at once, or carried an unreadable
  // `expect`, would be replayed as a silently trivial assertion — the same failure mode as a
  // fixture that stopped loading, one row at a time. Mirrors Java's
  // `everyRedactionCaseDeclaresExactlyOneSubjectAndOneDirection`.
  test("every redaction case declares exactly one subject and one direction", () => {
    for (const c of hostileRedactions()) {
      expect(secretOf(c).trim(), `${c.id} must carry a canary or a value`).not.toBe("");
      const subjects = [isNameCase(c), isKindCase(c), c.value !== undefined].filter(Boolean).length;
      expect(
        subjects,
        `${c.id} must be exactly one of a name case, a value case or a kind case`,
      ).toBe(1);
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

  // A name or kind case whose canary is itself secret-shaped would pass the hidden assertion for
  // the wrong reason — the value axis would catch it whatever the name or kind said.
  test("no redaction canary is itself a secret shape", () => {
    for (const c of hostileRedactions()) {
      if (!isNameCase(c) && !isKindCase(c)) continue;
      expect(c.canary, `${c.id} must test its own axis, not the value axis`).toMatch(
        /^canary-[a-z0-9-]+$/,
      );
    }
  });

  // Corpus replay for the graphs.json rows added for the rule copied into the repository's
  // agent guide (owner ruling 2026-09-17, "rendering reads state, never runs behaviour"):
  // record-accessor-with-counter, platform-collection-side-effecting-iterator and
  // lookalike-collection-not-platform-defined. Each row's expected outcome is "rendered without
  // executing" — the renderer must never invoke the fixture's own overridden member. Reuses the
  // fixture idioms already pinned in `packages/core/__tests__/render-reads-state.test.ts`; mirrors
  // land the same three ids in every other runtime's corpus copy, per the cross-port rule.
  //
  // The 2026-09-18 refinement adds two more rows for Java's ABSTRACT-platform-base case
  // (`AbstractMap`/`AbstractCollection`, which own no state of their own — a subclass's override
  // is the only path to the data, so there is no honest ancestor read to fall back on):
  // abstract-map-subclass-override and abstract-collection-subclass-override. TypeScript has no
  // abstract platform collection base, so the honest twin (`hostile-members.ts`) is a hand-rolled
  // type implementing the Map-like/Set-like shape from scratch rather than extending `Map`/`Set`
  // — see the doc comments on `AbstractMapSubclassOverride`/`AbstractCollectionSubclassOverride`
  // for why extending would not reproduce the Java row (a `Map`/`Set` subclass still carries real
  // platform-ancestor state `renderMap`/`renderSet` already reads through, the same shape
  // `platform-collection-side-effecting-iterator` below already covers for `Array`).
  //
  // The 2026-09-18 rows close two gaps a follow-up report left open (see the row descriptions in
  // graphs.json for the full citation): gap 1,
  // structured-path-user-collection-not-enumerated (the STRUCTURED path enumerating any user
  // Collection unconditionally, origin-blind — reuses lookalikeCollection, replayed through
  // `renderStructured` instead of `renderValue`), and gap 2, fieldless-abstract-subclass-
  // tostring-door (a FIELDLESS abstract-base subclass still reaching its override through an
  // inherited `toString()` Java's `rendersItsOwnString` trusts once a type declares no field).
  // Java keeps both `@Disabled` pending its own fix. Both are LIVE here already: `dispatchObject`
  // (value-renderer.ts) and `structuredFields`/`dispatchObject` (rendered-value.ts) enumerate only
  // Array/Set/Map, checked by identity, never any user iterable regardless of field count — and
  // both paths trust a custom `toString()` only for a value identity-checked as a realm platform
  // intrinsic (`isPlatformValue`), never for "has no field" alone, so there is no door here by
  // construction of the dispatch itself. Each row is replayed through BOTH render paths under its
  // own id, for independent traceability to the byte-identical master corpus row per §6.7 (the
  // flat path for gap 1 duplicates lookalike-collection-not-platform-defined's own coverage above
  // — deliberately, so this id's own replay does not depend on that other row staying in place).
  //
  // The 2026-09-19 row, gap 3, fieldless-sidetable-tostring-door, is a fieldless class that is no
  // composite at all — its real state lives off the reflectable-field graph entirely, in a static
  // identity-keyed side table (Java's `FieldlessSideTableToStringDoor`; here `FieldlessSideTable-
  // ToStringDoor`'s side table is a `WeakMap` keyed by `this`). Emptiness is not statelessness, so
  // the same `isPlatformValue` identity check that closes gap 2 also closes this one by
  // construction: `toString()` — and the side-table read inside it — is never a candidate on
  // either render path.
  //
  // The number-subclass-tostring-door row: a `Number` subclass carrying a deny-listed field
  // (`password`) whose own `toString()` interpolates it — a composite whose base merely happens
  // to be numeric, which a scalar-numeric fast path could wrongly trust for its own text.
  // TypeScript never had this door: `dispatchObject` dispatches by `typeof`, which is `"object"`
  // for any `Number` subclass instance (never `"number"`), so a scalar-numeric fast path is never
  // even a candidate — the fixture always took the object-introspection/deny-list path, on both
  // render paths, by construction of the dispatch itself, same as `NumberHostileToString` above.
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

    // Live regression guard, not pending: the fixture is not `instanceof Map` (it implements the
    // Map-like shape from scratch, never extends `Map` — see the class doc), so `dispatchObject`
    // (value-renderer.ts) never reaches `renderMap` at all and falls through to
    // `renderPlainObject`, which reads `entriesCalls`/`held` by introspection and never calls
    // `entries()`. Observed today: `renderValue` returns
    // `{"entriesCalls": 0, "held": {"label": "visible-label", "secret": [REDACTED]}}`.
    test("abstract-map-subclass-override renders by introspection, without executing entries()", () => {
      const fixture = graphOf("abstract-map-subclass-override") as AbstractMapSubclassOverride;
      renderValue(fixture);
      expect(fixture.entriesCalls).toBe(0);
    });

    // Live regression guard, not pending: same reasoning as the Map row above, for `Set`/
    // `renderSet` — the fixture is never `instanceof Set`, so `renderPlainObject` reads
    // `iteratorCalls`/`held` by introspection and `[Symbol.iterator]` is never invoked. Observed
    // today: `renderValue` returns
    // `{"iteratorCalls": 0, "held": {"label": "visible-label", "secret": [REDACTED]}}`.
    test("abstract-collection-subclass-override renders by introspection, without executing the iterator", () => {
      const fixture = graphOf(
        "abstract-collection-subclass-override",
      ) as AbstractCollectionSubclassOverride;
      renderValue(fixture);
      expect(fixture.iteratorCalls).toBe(0);
    });

    // Live regression guard: gap 1's flat-path replay, under its own id — see the describe-level
    // comment for why this duplicates lookalike-collection-not-platform-defined's coverage on
    // purpose. No canary check: `#backing` (holding the sentinel) is a true private field, never
    // own-enumerable, so it is structurally unreachable from `renderValue` regardless of this
    // property — same reasoning as `lookalikeCollectionRowRendersWithoutExecutingItsOwnIterator`.
    test("structured-path-user-collection-not-enumerated is never enumerated by the flat path", () => {
      const fixture = graphOf(
        "structured-path-user-collection-not-enumerated",
      ) as LookalikeCollection;
      const rendered = renderValue(fixture);
      expect(fixture.iteratorCalls).toBe(0);
      expect(rendered).not.toContain("<error:");
    });

    // Live regression guard: gap 1 itself — `renderStructured`'s `dispatchObject` (rendered-
    // value.ts) checks Array/Set/Map by identity only, never "any iterable", so a hand-rolled
    // collection falls through to `structuredFields`, which reads `iteratorCalls` by introspection
    // and never touches `[Symbol.iterator]`. Observed today (not pending, unlike Java):
    // `renderStructured` returns `{"kind":"object","typeName":"LookalikeCollection",
    // "fields":{"iteratorCalls":{"kind":"number","value":0}}}`.
    test("structured-path-user-collection-not-enumerated is never enumerated by the structured path", () => {
      const fixture = graphOf(
        "structured-path-user-collection-not-enumerated",
      ) as LookalikeCollection;
      const rendered = renderStructured(fixture);
      expect(fixture.iteratorCalls).toBe(0);
      expect(JSON.stringify(rendered)).not.toContain("sentinel-probe");
    });

    // Live regression guard: gap 2 on the flat path — `dispatchObject` only trusts a custom
    // `toString()` for a value identity-checked as a realm platform intrinsic (`isPlatformValue`),
    // never for "declares no field" alone, so this fieldless fixture's `toString()` (and the
    // `[Symbol.iterator]` it would reach) is never invoked — `renderPlainObject`'s zero-keys branch
    // answers with the type name instead. Observed today: `renderValue` returns
    // `"FieldlessAbstractSubclassToStringDoor<size unknown>"`, no `<error:` marker. No canary
    // check: the fixture carries no sentinel at all (see the class doc) — the row's own point is
    // that there is no field to dump, not that a dumped field stays hidden.
    test("fieldless-abstract-subclass-tostring-door is never enumerated by the flat path", () => {
      FieldlessAbstractSubclassToStringDoor.iteratorCalls = 0;
      const fixture = graphOf(
        "fieldless-abstract-subclass-tostring-door",
      ) as FieldlessAbstractSubclassToStringDoor;
      const rendered = renderValue(fixture);
      expect(FieldlessAbstractSubclassToStringDoor.iteratorCalls).toBe(0);
      expect(rendered).not.toContain("<error:");
    });

    // Live regression guard: gap 2 on the structured path — `structuredFields` walks
    // `Object.keys(value)` only, which is empty here, so `toString()` is never a candidate at all
    // on this path (it has no toString-trust branch to begin with). Observed today:
    // `renderStructured` returns `{"kind":"object","typeName":
    // "FieldlessAbstractSubclassToStringDoor","fields":{}}`.
    test("fieldless-abstract-subclass-tostring-door is never enumerated by the structured path", () => {
      FieldlessAbstractSubclassToStringDoor.iteratorCalls = 0;
      const fixture = graphOf(
        "fieldless-abstract-subclass-tostring-door",
      ) as FieldlessAbstractSubclassToStringDoor;
      const rendered = renderStructured(fixture);
      expect(FieldlessAbstractSubclassToStringDoor.iteratorCalls).toBe(0);
      expect(JSON.stringify(rendered)).not.toContain("sentinel-probe");
    });

    // Live regression guard: gap 3, the fieldless-sidetable-tostring-door row on the flat path —
    // a fieldless class that is no composite at all, holding its real state in a static
    // identity-keyed side table. Emptiness is not statelessness, so `dispatchObject`'s
    // `isPlatformValue` identity check must still refuse to trust this `toString()`; the side
    // table is never read, which means `toString()` was never entered. Observed today: `renderValue`
    // returns `"{}"`, no `<error:` marker. No type-name assertion here, unlike the abstract-
    // subclass-door sibling above: that row's `<size unknown>` naming comes from
    // `hasOwnIteratorMethod` in `renderPlainObject` (value-renderer.ts), a branch that exists for
    // COLLECTION-shaped fieldless types specifically; this fixture is not iterable-shaped at all, so
    // it takes the ordinary "object introspection of its own fields" path with zero fields — the
    // same `{}` a genuinely empty plain object would render, and the same reasoning every sibling
    // `hostileMember` test in this block already applies (none of them assert a bare type name on
    // the flat path; `renderValue`'s flat format never carries one for an ordinary object). The
    // security property under test — the side table is never read — holds regardless.
    test("fieldless-sidetable-tostring-door is never enumerated by the flat path", () => {
      FieldlessSideTableToStringDoor.sideTableReads = 0;
      const fixture = graphOf(
        "fieldless-sidetable-tostring-door",
      ) as FieldlessSideTableToStringDoor;
      const rendered = renderValue(fixture);
      expect(FieldlessSideTableToStringDoor.sideTableReads).toBe(0);
      expect(rendered).not.toContain("sentinel-probe");
      expect(rendered).not.toContain("<error:");
    });

    // Live regression guard: gap 3 on the structured path — `structuredFields` walks
    // `Object.keys(value)` only, which is empty here, so `toString()` — and the side-table read
    // inside it — is never a candidate at all on this path. Observed today: `renderStructured`
    // returns `{"kind":"object","typeName":"FieldlessSideTableToStringDoor","fields":{}}`.
    test("fieldless-sidetable-tostring-door is never enumerated by the structured path", () => {
      FieldlessSideTableToStringDoor.sideTableReads = 0;
      const fixture = graphOf(
        "fieldless-sidetable-tostring-door",
      ) as FieldlessSideTableToStringDoor;
      const rendered = renderStructured(fixture);
      expect(FieldlessSideTableToStringDoor.sideTableReads).toBe(0);
      const json = JSON.stringify(rendered);
      expect(json).toContain("FieldlessSideTableToStringDoor");
      expect(json).not.toContain("sentinel-probe");
    });

    // Live regression guard: number-subclass-tostring-door on the flat path — `dispatchObject`
    // (value-renderer.ts) dispatches by `typeof`, which is `"object"` for a `Number` subclass
    // instance, so the scalar-numeric fast path is never a candidate; the fixture is field-walked
    // like any other ordinary composite, with `password` caught by the default deny-list. Observed
    // today: `renderValue` returns `{"cents": 1999, "password": [REDACTED]}` — no type name, same
    // as every sibling ordinary-composite `hostileMember` test in this block (`renderValue`'s flat
    // format never carries one for an ordinary object); the security property is `[REDACTED]`
    // standing in for the field, never the sentinel or the fixture's own `toString()` text.
    test("number-subclass-tostring-door is walked, never read through its own toString, on the flat path", () => {
      const fixture = graphOf("number-subclass-tostring-door") as NumberSubclassToStringDoor;
      const rendered = renderValue(fixture);
      expect(rendered).toContain("[REDACTED]");
      expect(rendered).not.toContain("sentinel-probe");
      expect(rendered).not.toContain(fixture.toString());
      expect(rendered).not.toContain("<error:");
    });

    // Live regression guard: the same row on the structured path — one dispatch decision shared by
    // both channels, so they cannot drift.
    test("number-subclass-tostring-door is walked, never read through its own toString, on the structured path", () => {
      const fixture = graphOf("number-subclass-tostring-door") as NumberSubclassToStringDoor;
      const rendered = renderStructured(fixture);
      const json = JSON.stringify(rendered);
      expect(json).toContain("NumberSubclassToStringDoor");
      expect(json).not.toContain("sentinel-probe");
      expect(json).not.toContain(fixture.toString());
    });
  });
});

/**
 * §6.7 rule: `graphs.json` is a byte-identical copy of the master corpus, found via
 * `master-corpus-path.ts`'s search order (env override, dev-container mount, host sibling
 * checkout). An absent master skips loudly rather than passing silently: a checkout without the
 * sibling repo — most checkouts, most of the time — must stay green, but with a printed line, not
 * a quiet no-op that looks the same as "checked and matched".
 *
 * The comparison reads the master's committed `HEAD`, never its working tree (see
 * `master-corpus-path.ts`'s module doc): an in-progress edit sitting uncommitted in a live master
 * checkout must never turn this port red before it ever lands. `MASTER_GRAPHS.source` names what
 * was actually compared against — folded into the test name so a run's own output says it, with no
 * need to go read the resolver.
 */
const MASTER_GRAPHS = resolveMasterGraphs();
if (MASTER_GRAPHS === undefined) {
  console.warn(
    "SKIPPED: master corpus not mounted — set JAVA_REPO, or mount the canonical Java repo at " +
      "/workspace-java or check it out as a host sibling, to run the graphs.json " +
      "byte-diff-against-master check",
  );
}

describe.skipIf(MASTER_GRAPHS === undefined)(
  "graphs.json byte-diff against the master corpus",
  () => {
    test(`the whole file matches the master copy byte-for-byte (${MASTER_GRAPHS?.source})`, () => {
      const local = readFileSync(`${CORPUS_DIR}graphs.json`, "utf-8");
      expect(local).toBe((MASTER_GRAPHS as NonNullable<typeof MASTER_GRAPHS>).content);
    });
  },
);

/**
 * §6.7 rule: `redaction.json` is a byte-identical copy of the master corpus, same search order and
 * same HEAD-not-working-tree comparison as graphs.json above.
 */
const MASTER_REDACTION = resolveMasterRedaction();
if (MASTER_REDACTION === undefined) {
  console.warn(
    "SKIPPED: master corpus not mounted — set JAVA_REPO, or mount the canonical Java repo at " +
      "/workspace-java or check it out as a host sibling, to run the redaction.json " +
      "byte-diff-against-master check",
  );
}

describe.skipIf(MASTER_REDACTION === undefined)(
  "redaction.json byte-diff against the master corpus",
  () => {
    test(`the whole file matches the master copy byte-for-byte (${MASTER_REDACTION?.source})`, () => {
      const local = readFileSync(`${CORPUS_DIR}redaction.json`, "utf-8");
      expect(local).toBe((MASTER_REDACTION as NonNullable<typeof MASTER_REDACTION>).content);
    });
  },
);
