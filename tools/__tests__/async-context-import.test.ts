// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { check } from "../async-context-import.js";

describe("async-context-import", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "async-context-import-test-"));
    mkdirSync(join(root, "documentation", "es"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function page(relativePath: string, content: string): void {
    writeFileSync(join(root, relativePath), content, "utf-8");
  }

  it("flags a snippet that imports AsyncNarrativeContext from core, naming file and line", () => {
    page(
      "documentation/guide.md",
      '# Guide\n\n```ts\nimport { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core";\n```\n',
    );

    expect(check(root)).toEqual([expect.stringMatching(/^documentation\/guide\.md:4: /)]);
  });

  it("flags a multi-line import and a single-quoted specifier", () => {
    page(
      "documentation/guide.md",
      "```ts\nimport {\n  NarrativeTraceConfig,\n  AsyncNarrativeContext,\n} from '@narrativetrace/core';\n```\n",
    );

    expect(check(root)).toHaveLength(1);
  });

  it("flags a type-only import and a translated mirror", () => {
    page(
      "documentation/es/guia.md",
      'import type { AsyncNarrativeContext } from "@narrativetrace/core";\n',
    );

    expect(check(root)).toHaveLength(1);
  });

  it("accepts the import from core-node", () => {
    page(
      "documentation/guide.md",
      'import { AsyncNarrativeContext } from "@narrativetrace/core-node";\n',
    );

    expect(check(root)).toEqual([]);
  });

  it("accepts core imports of other symbols, including a sibling symbol sharing the prefix", () => {
    page(
      "documentation/guide.md",
      'import { AsyncNarrativeContextFactory, SyncNarrativeContext } from "@narrativetrace/core";\n',
    );

    expect(check(root)).toEqual([]);
  });

  it("accepts a core-prefixed sibling package as the module specifier", () => {
    page(
      "documentation/guide.md",
      'import { AsyncNarrativeContext } from "@narrativetrace/core-node";\nimport { X } from "@narrativetrace/core";\n',
    );

    expect(check(root)).toEqual([]);
  });
});
