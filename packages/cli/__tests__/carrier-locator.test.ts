// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cliPackageDirectory, openCarrierFor } from "../src/carrier-locator.js";
import { carrierFixture } from "./fixture.js";

// The path arithmetic from this module's own location to the package root is the one thing here
// that a build-layout change breaks silently, so it is asserted against the real bundled carrier —
// the same point Java's CliExecutableJarTest makes about `java -jar`, one level down.

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-cli-locator-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("cliPackageDirectory", () => {
  test("is the directory whose skills/ holds the carrier this CLI bundles", () => {
    const root = cliPackageDirectory();

    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "skills", "catalogue.json"))).toBe(true);
  });
});

describe("openCarrierFor", () => {
  test("opens the bundled carrier when nothing was asked for", () => {
    const carrier = openCarrierFor(project, undefined);

    expect(carrier.source).toBe("bundled");
    expect(carrier.catalogue.skills.map((skill) => skill.name)).toContain("narrativetrace-doctor");
    expect(carrier.coordinate).toMatch(/^@narrativetrace\/skills@\d+\.\d+\.\d+/);
  });

  test("a --from directory wins over the copy this CLI bundles", () => {
    const carrier = openCarrierFor(project, carrierFixture(project));

    expect(carrier.source).toBe("from");
    expect(carrier.coordinate).toBe("@narrativetrace/skills@1.2.3");
  });
});
