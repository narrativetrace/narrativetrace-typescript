// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { classifyVerb, type VerbCategory, verbCategoryMembers } from "../src/verb-dictionary.js";

// Classifications mirror Java VerbDictionary exactly (828 domain / 197 standard / 21 generic / 17
// boolean). Notably, CRUD verbs (create/find/update/save/delete) are STANDARD in Java, not domain;
// sort/merge/match are domain; send/receive/connect/open/close are standard.
describe("verb category invariants (drift guard)", () => {
  const { domain, generic, booleanPrefixes } = verbCategoryMembers();
  const domainSet = new Set(domain);

  test("curated Generic ∩ Domain = ∅", () => {
    expect(generic.filter((v) => domainSet.has(v))).toEqual([]);
  });

  test("curated Boolean ∩ Domain = ∅", () => {
    expect(booleanPrefixes.filter((v) => domainSet.has(v))).toEqual([]);
  });

  // Load-bearing since the project vocabulary landed: classifyVerb decides generic before the
  // project's own verbs (so a glossary cannot promote `process`), which puts generic ahead of
  // standard. That reordering is behaviour-preserving only while these two tiers are disjoint.
  test("curated Generic ∩ Standard = ∅", () => {
    const standardSet = new Set(verbCategoryMembers().standard);
    expect(generic.filter((v) => standardSet.has(v))).toEqual([]);
  });

  test("every generic verb effectively classifies as generic (not shadowed)", () => {
    for (const v of generic) expect(classifyVerb(v), v).toBe("generic");
  });

  test("every boolean prefix effectively classifies as boolean", () => {
    for (const v of booleanPrefixes) expect(classifyVerb(v), v).toBe("boolean");
  });

  test("precedence: boolean beats domain (predicate verbs), run→generic, start→standard", () => {
    // `run` is generic; `start` moved to standard (Java parity) — the old run/start generic clash.
    expect(classifyVerb("run")).toBe("generic");
    expect(classifyVerb("start")).toBe("standard");
    // Predicate verbs are boolean even though they read like actions.
    expect(classifyVerb("contains")).toBe("boolean");
    expect(classifyVerb("exists")).toBe("boolean");
    expect(classifyVerb("matches")).toBe("boolean");
    expect(classifyVerb(domain[0] as string)).toBe("domain");
  });
});

describe("VerbDictionary", () => {
  const expectAll = (verbs: string[], category: VerbCategory) => {
    for (const v of verbs) expect(classifyVerb(v), v).toBe(category);
  };

  test("classifies industry domain verbs as 'domain'", () => {
    expectAll(
      ["reserve", "charge", "authenticate", "validate", "calculate", "transfer", "notify"],
      "domain",
    );
  });

  test("classifies generic verbs as 'generic'", () => {
    expectAll(["process", "handle", "execute", "do", "run", "manage", "get", "set"], "generic");
  });

  test("classifies boolean prefixes as 'boolean'", () => {
    expectAll(["is", "has", "can", "should", "was", "contains", "exists"], "boolean");
  });

  test("classifies standard-library verbs as 'standard'", () => {
    // Java places CRUD + collection + connection lifecycle verbs in the standard tier.
    expectAll(
      ["create", "find", "update", "save", "delete", "map", "filter", "send", "connect", "open"],
      "standard",
    );
  });

  test("classifies industry-specific domain verbs", () => {
    expectAll(["invoice", "diagnose", "fulfill", "refund"], "domain");
  });

  test("classifies unrecognized verbs as 'unknown'", () => {
    expectAll(["frobulate", "xyz", "did", "does"], "unknown");
  });

  test("is case-insensitive", () => {
    expect(classifyVerb("Create")).toBe("standard" satisfies VerbCategory);
    expect(classifyVerb("MAP")).toBe("standard" satisfies VerbCategory);
    expect(classifyVerb("Process")).toBe("generic" satisfies VerbCategory);
    expect(classifyVerb("RESERVE")).toBe("domain" satisfies VerbCategory);
  });

  test("covers business-operation domain verbs", () => {
    expectAll(["submit", "approve", "reject", "cancel", "ship", "refund"], "domain");
  });

  test("covers auth and security domain verbs", () => {
    expectAll(
      ["authenticate", "authorize", "verify", "validate", "encrypt", "decrypt", "sign", "revoke"],
      "domain",
    );
  });

  test("covers communication domain verbs (publish/subscribe/dispatch/emit)", () => {
    expectAll(["notify", "publish", "subscribe", "dispatch", "broadcast", "emit"], "domain");
  });

  test("covers programming and platform domain verbs", () => {
    expectAll(
      ["deserialize", "instantiate", "serialize", "tokenize", "deprecate", "throttle", "enqueue"],
      "domain",
    );
  });

  test("covers observability and ml domain verbs", () => {
    expectAll(
      ["annotate", "correlate", "mitigate", "postmortem", "train", "rerank", "vectorize"],
      "domain",
    );
  });

  test("sort/merge/match are domain; map/filter/reduce/compare are standard (Java parity)", () => {
    expectAll(["sort", "merge", "match"], "domain");
    expectAll(["map", "filter", "reduce", "split", "join", "compare"], "standard");
  });

  test("collocation/role-derived verbs still classify (TS-ahead fallback)", () => {
    // A verb present only via collocation/role expectations is never 'unknown'.
    const derived = verbCategoryMembers().derivedDomain;
    for (const v of derived.slice(0, 20)) expect(classifyVerb(v), v).not.toBe("unknown");
  });
});
