// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Licensing is a publish-time promise made in a file nobody reads on the way past.
 * These are the two places a wrong answer becomes public: the manifest npm shows on
 * every package page, and the LICENSE the manifest points at.
 */

const REPO_ROOT = join(import.meta.dirname, "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const RUNTIME_LICENSE = "BUSL-1.1";
const OPEN_LICENSE = "Apache-2.0";

// The "open" tier (README § License; free-repo `licensing.properties` precedent): the standards
// surface third-party code compiles against ships Apache 2.0, distinct from the BUSL-1.1 runtime.
// `cli` is the first such package — the format CLI over the open artifact formats (Pro TODO §4.5,
// ruled free/Open). Adding a package here is a licensing decision, not a default: it belongs on
// this list only when that decision has actually been made and recorded (commit message + this
// comment), same discipline as every other named exception in this file.
const OPEN_TIER_PACKAGES = new Set(["cli"]);

function expectedLicense(dir: string): string {
  return OPEN_TIER_PACKAGES.has(dir) ? OPEN_LICENSE : RUNTIME_LICENSE;
}

interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly license?: string;
  readonly description?: string;
  readonly publishConfig?: { readonly access?: string };
}

function readManifest(pkgDir: string): Manifest {
  return JSON.parse(readFileSync(join(PACKAGES_DIR, pkgDir, "package.json"), "utf-8")) as Manifest;
}

function publishablePackages(): { dir: string; manifest: Manifest }[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, manifest: readManifest(entry.name) }))
    .filter(({ manifest }) => manifest.private !== true);
}

describe("publishable package manifests", () => {
  const publishable = publishablePackages();

  it("finds the workspace packages", () => {
    expect(publishable.length).toBeGreaterThan(0);
  });

  it.each(publishable)("$dir declares its tier's license", ({ dir, manifest }) => {
    expect(manifest.license).toBe(expectedLicense(dir));
  });

  it("declares no package under a license the repository does not grant", () => {
    const wrong = publishable.filter(
      ({ dir, manifest }) => manifest.license !== expectedLicense(dir),
    );
    expect(wrong.map(({ dir }) => dir)).toEqual([]);
  });

  // release.yml publishes with `pnpm -r publish`, no --access flag: every scoped
  // package must carry its own publishConfig.access, or npm defaults it to
  // restricted and the publish fails on a package nobody remembered to flag.
  it.each(publishable)("$dir declares publishConfig.access: public", ({ manifest }) => {
    expect(manifest.publishConfig?.access).toBe("public");
  });

  // Provenance MUST live in publishConfig, not on the publish command line:
  // pnpm's recursive publish rebuilds argv and silently drops --provenance
  // (proven empirically, 2026-09-06 snapshot audit) — the manifest field is
  // the only route npm reliably honours. And an attestation's Sigstore
  // repository URI is validated against the manifest's repository field, so
  // both travel together or the publish half-fails on burnt versions.
  it.each(publishable)("$dir opts into provenance in its manifest", ({ manifest }) => {
    expect(manifest.publishConfig?.provenance).toBe(true);
  });

  it.each(publishable)("$dir names the public repository", ({ manifest }) => {
    expect(manifest.repository?.url).toBe(
      "git+https://github.com/narrativetrace/narrativetrace-typescript.git",
    );
    expect(manifest.repository?.directory).toMatch(/^packages\//);
  });

  // description is what npm's search results and package cards render — a
  // publishable package without one ships a blank card.
  it.each(publishable)("$dir declares a non-empty description", ({ manifest }) => {
    expect(manifest.description?.trim()).toBeTruthy();
  });
});

describe("LICENSE", () => {
  const license = readFileSync(join(REPO_ROOT, "LICENSE"), "utf-8");

  it("is the Business Source License 1.1", () => {
    expect(license).toContain("Business Source License 1.1");
  });

  it.each([
    ["Licensor", "Licensor:             Empower Agile"],
    [
      "Change Date",
      "Change Date:          Four years from the date the Licensed Work is published.",
    ],
    ["Change License", "Change License:       Apache License, Version 2.0"],
  ])("pins the %s parameter", (_name, text) => {
    expect(license).toContain(text);
  });

  it("grants production use except as a competing product", () => {
    expect(license).toContain("You may make production use of the Licensed Work for any");
    expect(license).toContain("logging, tracing, or code-narrative product");
  });
});

describe("LICENSE-APACHE", () => {
  const license = readFileSync(join(REPO_ROOT, "LICENSE-APACHE"), "utf-8");

  it("is the Apache License, Version 2.0", () => {
    expect(license).toContain("Apache License");
    expect(license).toContain("Version 2.0, January 2004");
  });
});
