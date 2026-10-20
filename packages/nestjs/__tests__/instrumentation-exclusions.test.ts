// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  registerExcludeFromEnv,
  resetExclusionReports,
  SyncNarrativeContext,
} from "@narrativetrace/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AutoProxyExplorer } from "../src/auto-proxy-explorer.js";
import type { AutoProxyOptions } from "../src/auto-proxy-options.js";
import { NarrativeStorage } from "../src/narrative-storage.js";

type Metatype = Function & { prototype?: object };

function explorerFor(metatypes: Metatype[], options: AutoProxyOptions, storage: NarrativeStorage) {
  const discovery = {
    getProviders: () => metatypes.map((metatype) => ({ metatype })),
    getControllers: () => [],
  };
  // biome-ignore lint/suspicious/noExplicitAny: a minimal DiscoveryService stand-in
  return new AutoProxyExplorer(discovery as any, storage, options);
}

function spansOf(storage: NarrativeStorage, run: () => void): string[] {
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  storage.run(ctx, run);
  return ctx.captureTrace().roots.map((r) => `${r.signature.className}.${r.signature.methodName}`);
}

// Fresh classes per test: wrapping mutates the prototype once and keeps its first storage.
function fixtures() {
  class Reflector {
    get(): number {
      return 1;
    }
  }
  class Billing {
    charge(): number {
      return 2;
    }
  }
  return { Reflector, Billing };
}

function bootstrap(metatypes: Metatype[], options: AutoProxyOptions = {}): NarrativeStorage {
  const storage = new NarrativeStorage();
  explorerFor(metatypes, options, storage).onApplicationBootstrap();
  return storage;
}

beforeEach(() => resetExclusionReports());
afterEach(() => {
  registerExcludeFromEnv(undefined);
  vi.restoreAllMocks();
});

describe("auto-proxy exclude (list 2)", () => {
  test("a provider on the shipped default list is not wrapped, an ordinary one is", () => {
    const { Billing } = fixtures();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class ModuleRef {
      get(): number {
        return 3;
      }
    }
    const storage = bootstrap([ModuleRef, Billing]);
    const spans = spansOf(storage, () => {
      new ModuleRef().get();
      new Billing().charge();
    });
    expect(spans).toEqual(["Billing.charge"]);
  });

  test("string entries in exclude replace the default and name what is skipped", () => {
    const { Reflector, Billing } = fixtures();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = bootstrap([Reflector, Billing], { exclude: ["Billing"] });
    const spans = spansOf(storage, () => {
      new Reflector().get();
      new Billing().charge();
    });
    expect(spans).toEqual(["Reflector.get"]);
  });

  test("class entries keep working and, being the only thing stated, replace the name list too", () => {
    const { Reflector } = fixtures();
    class Skipped {
      go(): number {
        return 4;
      }
    }
    const storage = bootstrap([Skipped, Reflector], { exclude: [Skipped] });
    const spans = spansOf(storage, () => {
      new Skipped().go();
      new Reflector().get();
    });
    expect(spans).toEqual(["Reflector.get"]);
  });

  test("classes and strings can be mixed in one exclude", () => {
    const { Reflector, Billing } = fixtures();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class Skipped {
      go(): number {
        return 4;
      }
    }
    const storage = bootstrap([Skipped, Billing, Reflector], { exclude: [Skipped, "Billing"] });
    const spans = spansOf(storage, () => {
      new Skipped().go();
      new Billing().charge();
      new Reflector().get();
    });
    expect(spans).toEqual(["Reflector.get"]);
  });

  test("an empty exclude excludes nothing, shipped default included", () => {
    const { Reflector } = fixtures();
    const storage = bootstrap([Reflector], { exclude: [] });
    expect(spansOf(storage, () => new Reflector().get())).toEqual(["Reflector.get"]);
  });

  test("NARRATIVETRACE_EXCLUDE replaces the default", () => {
    const { Billing } = fixtures();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerExcludeFromEnv("Billing");
    const fromEnv = bootstrap([Billing]);
    expect(spansOf(fromEnv, () => new Billing().charge())).toEqual([]);
  });

  test("an exclude prefix honours delimiters: Acme never matches AcmeExtra", () => {
    class AcmeExtra {
      go(): number {
        return 5;
      }
    }
    const storage = bootstrap([AcmeExtra], { exclude: ["Acme"] });
    expect(spansOf(storage, () => new AcmeExtra().go())).toEqual(["AcmeExtra.go"]);
  });

  test("each matched prefix is reported once however many providers it excludes", () => {
    const { Reflector, Billing } = fixtures();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class ModuleRef {}
    bootstrap([Reflector, Reflector, ModuleRef, Billing]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("an invalid exclude fails at construction, before any provider is touched", () => {
    expect(() => explorerFor([], { exclude: ["a", "a"] }, new NarrativeStorage())).toThrow(
      /duplicate/,
    );
    expect(() => explorerFor([], { exclude: [""] }, new NarrativeStorage())).toThrow(RangeError);
  });
});

describe("auto-proxy structural skips (list 1)", () => {
  test("toJSON and then on a provider are runtime hooks and stay unwrapped", () => {
    class Dto {
      toJSON(): string {
        return "dto";
      }
      // biome-ignore lint/suspicious/noThenProperty: a thenable provider is the case under test
      then(): undefined {
        return undefined;
      }
      real(): number {
        return 6;
      }
    }
    const storage = bootstrap([Dto]);
    const spans = spansOf(storage, () => {
      const dto = new Dto();
      JSON.stringify(dto);
      dto.then();
      dto.real();
    });
    expect(spans).toEqual(["Dto.real"]);
  });

  test("a class held on the prototype is left alone and reported once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    class Holder {}
    class Inner {}
    (Holder.prototype as unknown as Record<string, unknown>).Inner = Inner;
    bootstrap([Holder]);
    expect((Holder.prototype as unknown as Record<string, unknown>).Inner).toBe(Inner);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
