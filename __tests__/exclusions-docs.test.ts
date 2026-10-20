// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SHIPPED_EXCLUDE, STRUCTURAL_SKIPS } from "../packages/core/src/index.js";

const CONFIGURATION_GUIDES = [
  "documentation/configuration-guide.md",
  "documentation/es/guia-de-configuracion.md",
  "documentation/pt-BR/guia-de-configuracao.md",
  "documentation/zh-CN/配置指南.md",
];

const INTEGRATION_GUIDES = [
  "documentation/framework-integration-guide.md",
  "documentation/es/guia-de-integracion-de-frameworks.md",
  "documentation/pt-BR/guia-de-integracao-de-frameworks.md",
  "documentation/zh-CN/框架集成指南.md",
];

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

/**
 * Both exclusion lists are published verbatim from the code that enforces them: the English guide
 * carries each member's row exactly as the constants spell it (never typed twice), and every
 * translation names each member, so a member added to the code fails here until every page moves.
 */
describe("the instrumentation-exclusion docs", () => {
  test("the English configuration guide publishes list 2 row for row", () => {
    const guide = read(CONFIGURATION_GUIDES[0] as string);
    for (const { prefix, reason, source } of SHIPPED_EXCLUDE) {
      expect(guide).toContain(`| \`${prefix}\` | ${reason} | [source](${source}) |`);
    }
  });

  test("the English configuration guide publishes list 1 row for row", () => {
    const guide = read(CONFIGURATION_GUIDES[0] as string);
    for (const [reason, rule] of Object.entries(STRUCTURAL_SKIPS)) {
      expect(guide).toContain(`| \`${reason}\` | ${rule} |`);
    }
  });

  test.each(CONFIGURATION_GUIDES)("%s names every member of both lists", (path) => {
    const guide = read(path);
    for (const { prefix } of SHIPPED_EXCLUDE) expect(guide).toContain(`\`${prefix}\``);
    for (const reason of Object.keys(STRUCTURAL_SKIPS)) expect(guide).toContain(`\`${reason}\``);
    expect(guide).toContain("NARRATIVETRACE_EXCLUDE");
  });

  test.each(INTEGRATION_GUIDES)("%s shows include and exclude together", (path) => {
    const guide = read(path);
    expect(guide).toContain("NARRATIVETRACE_EXCLUDE");
    expect(guide).toMatch(/exclude: \[[^\]]*"/);
  });
});
