// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import { expect, test } from "vitest";
import {
  collectGlossarySites,
  type GlossaryArtifactSink,
  GlossarySuiteReporter,
  glossaryHarvestEnabled,
  traceSites,
  writeSuiteGlossary,
} from "../src/index.js";

test("barrel harvests a suite's traces into glossary artifacts, end to end", () => {
  const written: Record<string, string> = {};
  const sink: GlossaryArtifactSink = {
    mkdir: () => {},
    writeFile: (path, content) => {
      written[path] = content;
    },
    fileExists: (path) => path in written,
    readFile: (path) => written[path] as string,
  };
  const tree = traceTree([
    traceNode(
      methodSignature("OverdraftService", "openAccount", [
        parameterCapture("customerId", "c-1", false),
      ]),
      returned(null),
      [],
    ),
  ]);
  const files = [{ tasks: [{ meta: { narrativeGlossary: traceSites(tree) } }] }];

  const outcome = writeSuiteGlossary(
    collectGlossarySites(files),
    { glossaryDir: ".", outputDir: "out", today: "2026-08-13" },
    sink,
  );

  expect(outcome.written).toBe(true);
  expect(
    JSON.parse(written["./glossary.json"] as string).terms.map((t: { term: string }) => t.term),
  ).toStrictEqual(["account", "customer", "open account", "overdraft"]);
  expect(written["./glossary.md"]).toContain("open account");
  expect(JSON.parse(written["out/glossary-usage.json"] as string).newTerms).toHaveLength(4);
});

test("barrel exposes the reporter and its opt-in", () => {
  expect(glossaryHarvestEnabled({})).toBe(false);
  expect(new GlossarySuiteReporter({ enabled: false }).issues).toStrictEqual([]);
});
