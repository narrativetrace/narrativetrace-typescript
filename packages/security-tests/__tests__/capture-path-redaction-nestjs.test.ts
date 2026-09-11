// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "reflect-metadata";
import { NarrativeTraceConfig, SyncNarrativeContext, type TraceTree } from "@narrativetrace/core";
import { AutoProxyModule, NarrativeStorage } from "@narrativetrace/nestjs";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { hostileRedactions } from "../src/corpus/hostile-corpus.js";
import { isNameCase, type RedactionCase } from "../src/corpus/types.js";

/**
 * The NestJS arm of the corpus replay, VALUE rows only.
 *
 * @llmNote NAME rows are deliberately excluded — not an oversight. `AutoProxyModule`'s capture
 * path (`wrapPrototypeMethods`) mutates a raw prototype method with no decorator/reflection
 * metadata, so it can never recover a real parameter name; every captured parameter renders as
 * `arg0`, `arg1`, … regardless of what a corpus row's `name` field says (see
 * `packages/nestjs/src/wrap-prototype.ts` and `documentation/privacy-and-redaction.md`'s
 * surface-by-surface note, both from the 2026-09-10 session that found and fixed this). A NAME
 * row driven through this path would test nothing real — the always-on NAME deny-list simply
 * cannot reach it here, by design, not by bug. VALUE rows apply: the value-shape axis
 * (`RedactionPolicy.DEFAULT`'s `shouldRedactValue`) is name-independent and runs the same way
 * under `wrapPrototypeMethods` as it does under `traceObject()`.
 *
 * Goes through the REAL production seam: `AutoProxyModule.forRoot()` wired into a compiled,
 * initialized Nest module (`Test.createTestingModule(...).compile()` + `moduleRef.init()`, which
 * fires `onApplicationBootstrap` — the hook `AutoProxyExplorer` uses to wrap every provider — the
 * same lifecycle a real Nest application runs, without the HTTP-server ceremony `createNestApplication()`
 * would add on top for no benefit here). Decorators are applied as plain function calls
 * (`Injectable()(Cls)`, `Module({...})(Cls)`) rather than `@` syntax, so this file needs no
 * decorator-compiler plugin wired into this package's Vitest config — a deliberate, narrow scope
 * decision for an otherwise decorator-free test package, not a workaround for a missing feature.
 */

// wrapPrototypeMethods never reads a parameter name at all (see the module doc comment above), so
// unlike the proxy arm's INNOCUOUS_VALUE_PARAM_NAME there is no name to choose here — every
// parameter renders as `arg0` regardless of what this one is called.
class ProbeService {
  method(_value: unknown): string {
    return "ok";
  }
}
Injectable()(ProbeService);

class TestAppModule {}
Module({
  imports: [AutoProxyModule.forRoot({ serviceName: "hostile-corpus-probe" })],
  providers: [ProbeService],
})(TestAppModule);

describe("hostile corpus redaction, replayed through wrapPrototypeMethods (NestJS auto-wrap)", () => {
  let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>>;
  let storage: NarrativeStorage;
  let probe: ProbeService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    await moduleRef.init();
    storage = moduleRef.get(NarrativeStorage);
    probe = moduleRef.get(ProbeService);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  function driveThroughAutoWrap(value: unknown): {
    renderedValue: string;
    redacted: boolean;
    tree: TraceTree;
  } {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    storage.run(ctx, () => probe.method(value));
    const tree = ctx.captureTrace();
    const param = tree.roots[0]?.signature.parameters[0];
    if (!param) throw new Error("expected exactly one captured parameter");
    return { renderedValue: param.renderedValue, redacted: param.redacted, tree };
  }

  // Every value-shape detector this runtime has (JWT, PAN, Set-Cookie, and — since 2026-09-10 —
  // all six national-id schemes) applies here exactly as it does under traceObject(), since both
  // paths render through the same RedactionPolicy.DEFAULT. All 38 value rows run; the 50 NAME rows
  // stay excluded for the structural reason in this file's own doc comment above.
  const valueCases = hostileRedactions().filter((c) => !isNameCase(c));

  test("row accounting: every value-shape row runs — name rows stay excluded by design", () => {
    expect(valueCases.length, "value-case rows in the corpus").toBe(38);
  });

  test.each(
    valueCases.map((c) => [c.id, c] as const),
  )("%s", (_id, redactionCase: RedactionCase) => {
    const secret = redactionCase.value as string;
    const { renderedValue, redacted } = driveThroughAutoWrap(secret);
    if (redactionCase.expect === "redacted") {
      expect(
        renderedValue,
        `${redactionCase.id}: the captured parameter must not carry the secret`,
      ).not.toContain(secret);
      // Oracle contract clause 3: names are
      // unrecoverable through this auto-wrap path (every parameter renders as `argN`), so
      // value-shape is the ONLY axis that can flag a NestJS capture. A JWT/PAN/Set-Cookie/
      // national-id argument through the auto-proxy must still carry `redacted: true`.
      expect(redacted, `${redactionCase.id}: the captured parameter must be flagged redacted`).toBe(
        true,
      );
    } else {
      expect(
        renderedValue,
        `${redactionCase.id}: must survive at capture — over-redaction`,
      ).toContain(secret);
      expect(
        redacted,
        `${redactionCase.id}: the captured parameter must NOT be flagged redacted (over-flagging)`,
      ).toBe(false);
    }
  });
});
