// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SHIPPED_EXCLUDE, STRUCTURAL_SKIPS } from "../src/exclusion-catalogue.js";
import {
  DEFAULT_EXCLUDE,
  effectiveExclude,
  excludedPrefixOf,
  parseExclude,
  registerExcludeFromEnv,
  reportStructuralSkip,
  resetExclusionReports,
  structuralSkipReason,
} from "../src/instrumentation-exclusions.js";

describe("parseExclude", () => {
  test("splits a semicolon or comma separated string and trims each entry", () => {
    expect(parseExclude(" Reflector ; ModuleRef,acme.internal ")).toEqual([
      "Reflector",
      "ModuleRef",
      "acme.internal",
    ]);
  });

  test("an empty string is an explicitly empty list, not an absent one", () => {
    expect(parseExclude("")).toEqual([]);
  });

  test("a trailing .*, .**, dot or slash all mean this name and what is under it", () => {
    expect(parseExclude(["a.*", "b.**", "c.", "d/", "e/*"])).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("rejects a blank entry, which would match everything", () => {
    expect(() => parseExclude("a;;b")).toThrow(RangeError);
    expect(() => parseExclude(["a", "  "])).toThrow(RangeError);
    expect(() => parseExclude(".*")).toThrow(RangeError);
  });

  test("rejects a duplicate entry, spelled differently or not", () => {
    expect(() => parseExclude("a;a")).toThrow(/duplicate/i);
    expect(() => parseExclude(["a", "a.*"])).toThrow(/duplicate/i);
  });

  test("rejects an entry that is not a string", () => {
    expect(() => parseExclude([1 as unknown as string])).toThrow(TypeError);
  });
});

describe("excludedPrefixOf", () => {
  beforeEach(() => resetExclusionReports());
  afterEach(() => vi.restoreAllMocks());

  test("matches the name itself and anything under it at a delimiter", () => {
    const list = ["acme.billing"];
    expect(excludedPrefixOf("acme.billing", list)).toBe("acme.billing");
    expect(excludedPrefixOf("acme.billing.Invoice", list)).toBe("acme.billing");
    expect(excludedPrefixOf("acme.billing/Invoice", list)).toBe("acme.billing");
    expect(excludedPrefixOf("acme.billing:Invoice", list)).toBe("acme.billing");
  });

  test("a sibling that shares the prefix but is not a child does not match", () => {
    const list = ["acme.billing"];
    expect(excludedPrefixOf("acme.billingExtra", list)).toBeUndefined();
    expect(excludedPrefixOf("acme.billingExtra.Invoice", list)).toBeUndefined();
    expect(excludedPrefixOf("acme", list)).toBeUndefined();
  });

  test("reports each matched prefix once, never once per target", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    excludedPrefixOf("Reflector", ["Reflector"]);
    excludedPrefixOf("Reflector", ["Reflector"]);
    excludedPrefixOf("a.B", ["a", "Reflector"]);
    excludedPrefixOf("a.C", ["a", "Reflector"]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("Reflector");
    expect(warn.mock.calls[1]?.[0]).toContain("a");
  });

  test("says nothing for a name nothing matches", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(excludedPrefixOf("Checkout", ["Reflector"])).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("effectiveExclude", () => {
  afterEach(() => registerExcludeFromEnv(undefined));

  test("with nothing stated the shipped default applies", () => {
    expect(effectiveExclude()).toEqual(DEFAULT_EXCLUDE);
  });

  test("an environment value replaces the default rather than extending it", () => {
    registerExcludeFromEnv("acme.vendor");
    expect(effectiveExclude()).toEqual(["acme.vendor"]);
  });

  test("an environment key that is present but empty states an empty list", () => {
    registerExcludeFromEnv("");
    expect(effectiveExclude()).toEqual([]);
  });

  test("an explicit option beats the environment, and an empty option beats both", () => {
    registerExcludeFromEnv("acme.vendor");
    expect(effectiveExclude(["Reflector"])).toEqual(["Reflector"]);
    expect(effectiveExclude([])).toEqual([]);
  });

  test("an invalid environment value degrades to the default and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resetExclusionReports();
    registerExcludeFromEnv("a;;b");
    expect(effectiveExclude()).toEqual(DEFAULT_EXCLUDE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("NARRATIVETRACE_EXCLUDE");
    vi.restoreAllMocks();
  });
});

describe("SHIPPED_EXCLUDE", () => {
  test("every member carries a reason and a source, and DEFAULT_EXCLUDE is exactly its prefixes", () => {
    expect(SHIPPED_EXCLUDE.length).toBeGreaterThan(0);
    for (const member of SHIPPED_EXCLUDE) {
      expect(member.reason.length).toBeGreaterThan(10);
      expect(member.source).toMatch(/^https?:\/\//);
    }
    expect(DEFAULT_EXCLUDE).toEqual(SHIPPED_EXCLUDE.map((member) => member.prefix));
  });

  test("the shipped prefixes are themselves valid, unique and normalised", () => {
    expect(parseExclude([...DEFAULT_EXCLUDE])).toEqual(DEFAULT_EXCLUDE);
  });
});

describe("structuralSkipReason (list 1, not configurable)", () => {
  test("the runtime's own protocol hooks are never business calls", () => {
    for (const key of ["toString", "valueOf", "toJSON", "then"]) {
      expect(structuralSkipReason(() => 1, key, {})).toBe("protocol-hook");
    }
  });

  test("every well-known symbol and the Node inspect hook is a protocol hook", () => {
    const hooks = [Symbol.iterator, Symbol.asyncIterator, Symbol.toPrimitive, Symbol.toStringTag];
    hooks.push(Symbol.hasInstance, Symbol.for("nodejs.util.inspect.custom"));
    for (const key of hooks) {
      expect(structuralSkipReason(() => 1, key, {})).toBe("protocol-hook");
    }
  });

  test("a user symbol-keyed method and a near-miss name are business calls", () => {
    expect(structuralSkipReason(() => 1, Symbol("mine"), {})).toBeUndefined();
    expect(structuralSkipReason(() => 1, "thenable", {})).toBeUndefined();
    expect(structuralSkipReason(() => 1, "toStrings", {})).toBeUndefined();
  });

  test("a class constructor cannot be wrapped without breaking `new`", () => {
    class Model {}
    expect(structuralSkipReason(Model, "Model", { Model })).toBe("class-constructor");
  });

  test("a plain function and a function whose source merely mentions class are not constructors", () => {
    const classy = function charge() {
      return "class Model {}";
    };
    expect(structuralSkipReason(classy, "charge", { charge: classy })).toBeUndefined();
  });

  test("a bound wrapper of something that is not this object's method is skipped", () => {
    const target = { log: console.log.bind(console) };
    expect(structuralSkipReason(target.log, "log", target)).toBe("bound-wrapper");
  });

  test("a bound copy that shadows the object's own prototype method stays traced", () => {
    class Handler {
      handle(): number {
        return 1;
      }
    }
    const instance = new Handler();
    instance.handle = instance.handle.bind(instance);
    expect(structuralSkipReason(instance.handle, "handle", instance)).toBeUndefined();
  });
});

describe("reportStructuralSkip", () => {
  beforeEach(() => resetExclusionReports());
  afterEach(() => vi.restoreAllMocks());

  test("a class that cannot be wrapped is reported once, naming where it was met", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reportStructuralSkip("class-constructor", "Registry", "Model");
    reportStructuralSkip("class-constructor", "Registry", "Other");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Registry.Model");
  });

  test("hooks and bound wrappers are silent by design", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reportStructuralSkip("protocol-hook", "Registry", "toJSON");
    reportStructuralSkip("bound-wrapper", "Registry", "log");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("STRUCTURAL_SKIPS", () => {
  test("publishes a rule for every reason and names every protocol hook name", () => {
    expect(Object.keys(STRUCTURAL_SKIPS).sort()).toEqual([
      "bound-wrapper",
      "class-constructor",
      "protocol-hook",
    ]);
    for (const name of ["toString", "valueOf", "toJSON", "then"]) {
      expect(STRUCTURAL_SKIPS["protocol-hook"]).toContain(`\`${name}\``);
      expect(structuralSkipReason(() => 1, name, {})).toBe("protocol-hook");
    }
  });
});
