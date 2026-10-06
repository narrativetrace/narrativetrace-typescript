// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  coordinateIn,
  PROVENANCE_PREFIX,
  PROVENANCE_SUFFIX,
  provenanceLine,
  stampProvenance,
} from "../../src/init/provenance.js";

/**
 * The provenance line decides, years later, whether a skill directory is ours. These cases pin
 * where it goes (after the frontmatter, never before), what counts as one (column 0, whole line),
 * and that stamping is idempotent.
 *
 * Named after `ProvenanceTest` in the Java reference so the two lists diff.
 */

const COORDINATE = "@narrativetrace/skills@1.2.3";

const PAGE = "---\nname: narrativetrace-doctor\ndescription: d\n---\n\nBody\n";

describe("provenance", () => {
  test("reads back the coordinate it wrote", () => {
    expect(coordinateIn(stampProvenance(PAGE, COORDINATE))).toBe(COORDINATE);
  });

  test("puts the line directly after the frontmatter, never before it", () => {
    const stamped = stampProvenance(PAGE, COORDINATE);

    expect(stamped).toBe(
      `---\nname: narrativetrace-doctor\ndescription: d\n---\n${provenanceLine(COORDINATE)}\n\nBody\n`,
    );
    expect(stamped.startsWith("---\n")).toBe(true);
  });

  test("puts the line at the top of a page without frontmatter", () => {
    const stamped = stampProvenance("Body only\n", COORDINATE);

    expect(stamped).toBe(`${provenanceLine(COORDINATE)}\n\nBody only\n`);
    expect(coordinateIn(stamped)).toBe(COORDINATE);
  });

  test("treats an unclosed frontmatter fence as no frontmatter", () => {
    expect(stampProvenance("---\nname: x\nbody\n", COORDINATE)).toMatch(
      new RegExp(`^${provenanceLine(COORDINATE).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  });

  test("stamping twice is stamping once", () => {
    const once = stampProvenance(PAGE, COORDINATE);

    expect(stampProvenance(once, COORDINATE)).toBe(once);
  });

  test("restamping replaces an older coordinate", () => {
    const older = stampProvenance(PAGE, "@narrativetrace/skills@0.0.9");

    const newer = stampProvenance(older, COORDINATE);

    expect(coordinateIn(newer)).toBe(COORDINATE);
    expect(newer).not.toContain("0.0.9");
    expect(newer).toBe(stampProvenance(PAGE, COORDINATE));
  });

  test("keeps the file's line endings", () => {
    const stamped = stampProvenance(PAGE.replaceAll("\n", "\r\n"), COORDINATE);

    expect(stamped).not.toContain("\r\r");
    expect(stamped).toContain(`---\r\n${provenanceLine(COORDINATE)}\r\n`);
    expect(coordinateIn(stamped)).toBe(COORDINATE);
  });

  test("ignores a line that only looks like provenance", () => {
    const indented = `---\nx\n---\n  ${provenanceLine(COORDINATE)}\n`;
    const truncated = `---\nx\n---\n${PROVENANCE_PREFIX}${COORDINATE}\n`;
    const empty = `---\nx\n---\n${PROVENANCE_PREFIX}${PROVENANCE_SUFFIX.trim()}\n`;

    expect(coordinateIn(indented)).toBeUndefined();
    expect(coordinateIn(truncated)).toBeUndefined();
    expect(coordinateIn(empty)).toBeUndefined();
    expect(coordinateIn("")).toBeUndefined();
  });

  // Prefix and suffix meet with nothing between them: a provenance line naming no carrier.
  test("reads no coordinate from a line that names none", () => {
    const empty = PROVENANCE_PREFIX + PROVENANCE_SUFFIX;

    expect(coordinateIn(`---\nx\n---\n${empty}\n`)).toBeUndefined();
    expect(stampProvenance(`---\nx\n---\n${empty}\n`, COORDINATE)).toBe(
      `---\nx\n---\n${provenanceLine(COORDINATE)}\n`,
    );
  });

  test("stamps an empty page", () => {
    expect(stampProvenance("", COORDINATE)).toBe(`${provenanceLine(COORDINATE)}\n\n`);
  });

  test("finds the line in a page whose last line has no terminator", () => {
    expect(coordinateIn(`---\nx\n---\n${provenanceLine(COORDINATE)}`)).toBe(COORDINATE);
  });
});
