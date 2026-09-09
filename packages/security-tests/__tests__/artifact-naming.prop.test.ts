// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { hostileNames } from "../src/corpus/hostile-corpus.js";
import { treeOf, writtenArtifactsNamed } from "../src/oracle/emitters.js";

/**
 * The writers' other input: not the value, the *name*. Mirrors Java's
 * `ArtifactNamingPropertyTest`.
 *
 * INTENT: every other target in this suite feeds hostile data through a renderer. This one feeds
 * it through the path builder, because a trace artifact's location is derived from a module and
 * test name, and `writeTraceOutput` is public API whose callers do not all derive those from a JS
 * identifier — a scenario name, an HTTP route or a generated property-test description reaches it
 * in real integrations.
 *
 * @llmNote The limit asserted here is 255 *bytes*, not characters — the family artifact-path-cap
 * scheme Java's and Swift's `OutputDirectoryResolver` share. This runtime's own cap
 * (`MAX_SEGMENT_LENGTH` in `@narrativetrace/vitest`) is a smaller, deliberately conservative 100,
 * so this bound is a portable ceiling, not the runtime's exact figure.
 */

const MAX_COMPONENT_BYTES = 255;

function sandboxFor(root: string, id: string): string {
  const dir = join(root, `case-${id}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

describe("artifact naming", () => {
  test.each(hostileNames())("$id writes every artifact without throwing", ({
    id,
    description,
    value,
  }) => {
    const tree = treeOf('"probe"', '"result"');
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-naming-"));
    try {
      expect(
        () => writtenArtifactsNamed(tree, join(dir, "as-module"), value, "m"),
        `class name ${id}: ${description}`,
      ).not.toThrow();
      expect(
        () => writtenArtifactsNamed(tree, join(dir, "as-test"), "cls", value),
        `method name ${id}: ${description}`,
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("every artifact a hostile name produces stays inside the output directory", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "narrativetrace-naming-enclosure-"));
    try {
      const tree = treeOf('"probe"', '"result"');
      for (const name of hostileNames()) {
        const enclosure = sandboxFor(sandbox, name.id);
        const output = join(enclosure, "out");

        writtenArtifactsNamed(tree, output, name.value, name.value);

        const written = filesUnder(enclosure);
        expect(written.length, `${name.id} wrote nothing, so nothing was checked`).toBeGreaterThan(
          0,
        );
        for (const file of written) {
          const rel = relative(output, file);
          expect(
            rel.startsWith(`..${sep}`) || rel === "..",
            `${name.id}: ${name.description} — wrote outside the output directory (${file})`,
          ).toBe(false);
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("no path component a hostile name produces exceeds the filesystem limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-naming-limit-"));
    try {
      const tree = treeOf('"probe"', '"result"');
      for (const name of hostileNames()) {
        const output = join(dir, `case-${name.id}`);
        const outputs = writtenArtifactsNamed(tree, output, name.value, "m");
        for (const file of filesUnder(output)) {
          for (const component of relative(dir, file).split(sep)) {
            expect(
              Buffer.byteLength(component, "utf-8"),
              `${name.id}: component '${component}' must fit a filesystem path element`,
            ).toBeLessThanOrEqual(MAX_COMPONENT_BYTES);
          }
        }
        expect(Object.keys(outputs).length).toBeGreaterThan(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Truncation without disambiguation is a silent overwrite: two long names sharing their first
  // several hundred characters would land on one artifact, and one test's approved baseline would
  // then judge another test's trace.
  test("names that differ only past the limit still resolve to different artifacts", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-naming-collision-"));
    try {
      const tree = treeOf('"probe"', '"result"');
      const longNames = hostileNames().filter((n) => n.id.startsWith("long-"));
      const output = join(dir, "shared");

      for (const name of longNames) {
        writtenArtifactsNamed(tree, output, "cls", `${name.value}${name.id}`);
      }

      // Every format writes its own file per name; count only one format's worth of files so a
      // collision (one name's write overwriting another's) shows up as a missing entry rather than
      // being masked by the other formats' file count.
      const moduleDir = join(output, "cls");
      const written = new Set(readdirSync(moduleDir).filter((file) => file.endsWith(".md")));
      expect(written.size, "two long names collided into one artifact after truncation").toBe(
        longNames.length,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolving the same name twice always gives the same path", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-naming-determinism-"));
    try {
      const tree = treeOf('"probe"', '"result"');
      for (const name of hostileNames()) {
        const first = join(dir, `first-${name.id}`);
        const second = join(dir, `second-${name.id}`);
        writtenArtifactsNamed(tree, first, name.value, name.value);
        writtenArtifactsNamed(tree, second, name.value, name.value);

        const firstRel = filesUnder(first)
          .map((f) => relative(first, f))
          .sort();
        const secondRel = filesUnder(second)
          .map((f) => relative(second, f))
          .sort();
        expect(secondRel, `${name.id} must resolve deterministically`).toEqual(firstRel);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
