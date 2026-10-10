// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  CASE_SETUPS,
  checkoutPackages,
  isCaseSetup,
  packCommands,
  publishablePackages,
  registryTarballDir,
  setupCommands,
  tarballName,
} from "../case-setup.js";

/**
 * A case whose project already HAS NarrativeTrace — and this checkout's NarrativeTrace, because the
 * published release is behind the verbs such a case drives. The packages are packed and installed
 * as copies, never linked, so nothing the agent does in the project reaches this repository.
 */

const MANIFESTS: Record<string, unknown> = {
  "/repo/packages/cli/package.json": {
    name: "@narrativetrace/cli",
    version: "0.2.0",
    dependencies: { "@narrativetrace/tooling": "workspace:*" },
  },
  "/repo/packages/tooling/package.json": { name: "@narrativetrace/tooling", version: "0.2.0" },
  "/repo/packages/core/package.json": { name: "@narrativetrace/core", version: "0.2.0" },
  "/repo/packages/core-node/package.json": {
    name: "@narrativetrace/core-node",
    version: "0.2.0",
    dependencies: { "@narrativetrace/core": "workspace:*" },
  },
  "/repo/packages/proxy/package.json": {
    name: "@narrativetrace/proxy",
    version: "0.2.0",
    peerDependencies: { "@narrativetrace/core": "workspace:*" },
  },
};

const readJson = (path: string): unknown => {
  const manifest = MANIFESTS[path];
  if (manifest === undefined) throw new Error(`ENOENT ${path}`);
  return manifest;
};

const FIXTURE = {
  dependencies: { "@narrativetrace/core-node": "latest", "@narrativetrace/proxy": "latest" },
  devDependencies: { "@narrativetrace/cli": "latest", vitest: "^3.0.0" },
};

describe("the vocabulary", () => {
  it("has two members", () => {
    expect(CASE_SETUPS).toEqual(["checkout-install", "checkout-registry"]);
  });

  it.each([
    ["checkout-install", true],
    ["checkout-registry", true],
    ["npm-install", false],
    [1, false],
    [null, false],
  ])("isCaseSetup(%j) is %s", (value, expected) => {
    expect(isCaseSetup(value)).toBe(expected);
  });
});

describe("checkoutPackages", () => {
  it("closes over every workspace package the fixture's own declarations reach, sorted", () => {
    expect(checkoutPackages(FIXTURE, "/repo", readJson).map((p) => p.dir)).toEqual([
      "/repo/packages/cli",
      "/repo/packages/core",
      "/repo/packages/core-node",
      "/repo/packages/proxy",
      "/repo/packages/tooling",
    ]);
  });

  it("follows a peer dependency, which npm would otherwise fetch from the registry", () => {
    const only = { dependencies: { "@narrativetrace/proxy": "latest" } };
    expect(checkoutPackages(only, "/repo", readJson).map((p) => p.name)).toEqual([
      "@narrativetrace/core",
      "@narrativetrace/proxy",
    ]);
  });

  it("leaves third-party packages to the registry", () => {
    const names = checkoutPackages(FIXTURE, "/repo", readJson).map((p) => p.name);
    expect(names).not.toContain("vitest");
  });

  it("refuses a fixture that declares no NarrativeTrace package — there is nothing to install", () => {
    expect(() => checkoutPackages({ dependencies: { pino: "9" } }, "/repo", readJson)).toThrow(
      /declares no @narrativetrace\/\* package/,
    );
  });

  it("refuses a package this checkout does not have, rather than installing the published one", () => {
    const fixture = { dependencies: { "@narrativetrace/nope": "latest" } };
    expect(() => checkoutPackages(fixture, "/repo", readJson)).toThrow(/ENOENT/);
  });

  it("refuses a directory whose manifest names a different package", () => {
    const lying = (path: string) =>
      path.endsWith("/proxy/package.json")
        ? { name: "@narrativetrace/core", version: "1" }
        : readJson(path);
    const fixture = { dependencies: { "@narrativetrace/proxy": "latest" } };
    expect(() => checkoutPackages(fixture, "/repo", lying)).toThrow(/names @narrativetrace\/core/);
  });
});

describe("tarballName", () => {
  it("is the file pnpm pack writes: the scope's @ dropped and its slash a hyphen", () => {
    expect(tarballName({ name: "@narrativetrace/core-node", version: "0.2.0", dir: "/x" })).toBe(
      "narrativetrace-core-node-0.2.0.tgz",
    );
  });
});

describe("setupCommands", () => {
  const packages = checkoutPackages(FIXTURE, "/repo", readJson);

  it("packs each package into the work directory, installs the copies, then runs init", () => {
    const commands = setupCommands(packages, "/work", "/scratch", "claude");
    expect(commands[0]).toEqual({
      argv: ["pnpm", "pack", "--pack-destination", "/work/packages"],
      cwd: "/repo/packages/cli",
    });
    expect(commands).toHaveLength(packages.length + 2);
    expect(commands.at(-2)).toEqual({
      argv: [
        "npm",
        "install",
        "--no-save",
        "--no-audit",
        "--no-fund",
        ...packages.map((p) => `/work/packages/${tarballName(p)}`),
      ],
      cwd: "/scratch",
    });
  });

  it("installs the skills with the checkout's own installer, for the trial's platform", () => {
    const [init] = setupCommands(packages, "/work", "/scratch", "claude").slice(-1);
    expect(init).toEqual({
      argv: [
        "node",
        "/scratch/node_modules/@narrativetrace/cli/bin/narrativetrace.js",
        "init",
        "--vendor",
        "claude",
      ],
      cwd: "/scratch",
    });
  });

  it("installs only the open-standard pages for a platform that is not claude", () => {
    const [init] = setupCommands(packages, "/work", "/scratch", "codex").slice(-1);
    expect(init?.argv.slice(-2)).toEqual(["--vendor", "none"]);
  });
});

describe("publishablePackages", () => {
  const dirs = ["tooling", "cli", "skills-catalogue", "core", "no-manifest"];
  const manifests: Record<string, unknown> = {
    ...MANIFESTS,
    "/repo/packages/skills-catalogue/package.json": {
      name: "@narrativetrace/skills-catalogue",
      version: "0.2.0",
      private: true,
    },
  };
  const read = (path: string): unknown => {
    const manifest = manifests[path];
    if (manifest === undefined) throw new Error(`ENOENT ${path}`);
    return manifest;
  };

  it("is every package a reader could install: private ones and stray directories left out, sorted", () => {
    expect(publishablePackages("/repo", () => dirs, read).map((pkg) => pkg.name)).toEqual([
      "@narrativetrace/cli",
      "@narrativetrace/core",
      "@narrativetrace/tooling",
    ]);
  });

  it("refuses a package with no version: no tarball name can be known for it", () => {
    const noVersion = (path: string): unknown =>
      path.endsWith("core/package.json") ? { name: "@narrativetrace/core" } : read(path);
    expect(() => publishablePackages("/repo", () => ["core"], noVersion)).toThrow(
      "/repo/packages/core/package.json has no version",
    );
  });

  it("refuses a checkout with nothing to publish", () => {
    expect(() => publishablePackages("/repo", () => [], read)).toThrow(
      "no publishable @narrativetrace/* package under /repo/packages",
    );
  });
});

describe("packCommands", () => {
  it("packs each package into the registry's tarball directory, from its own directory", () => {
    const packages = [
      { name: "@narrativetrace/core", version: "0.2.0", dir: "/repo/packages/core" },
    ];
    expect(packCommands(packages, "/work")).toEqual([
      {
        argv: ["pnpm", "pack", "--pack-destination", registryTarballDir("/work")],
        cwd: "/repo/packages/core",
      },
    ]);
    expect(registryTarballDir("/work")).toBe("/work/packages");
  });
});
