// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type LocalRegistry,
  npmrcFor,
  packumentFor,
  startLocalRegistry,
} from "../local-registry.js";

let dir: string;
let registry: LocalRegistry | undefined;

/** A real tarball, laid out as `npm pack`/`pnpm pack` write one: `package/package.json` inside. */
function packTarball(name: string, version: string): string {
  const staging = join(dir, "staging", name.replace("/", "-"));
  mkdirSync(join(staging, "package"), { recursive: true });
  writeFileSync(join(staging, "package", "package.json"), JSON.stringify({ name, version }));
  writeFileSync(join(staging, "package", "index.js"), "module.exports = 42;\n");
  const tarball = join(dir, "tarballs", `${name.slice(1).replace("/", "-")}-${version}.tgz`);
  mkdirSync(join(dir, "tarballs"), { recursive: true });
  execFileSync("tar", ["-czf", tarball, "-C", staging, "package"]);
  return tarball;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-registry-"));
});

afterEach(async () => {
  await registry?.close();
  registry = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("packumentFor", () => {
  it("describes one version as latest, pointing at its tarball with both digests npm checks", () => {
    const bytes = Buffer.from("tarball bytes");
    const packument = packumentFor(
      { name: "@narrativetrace/x", version: "1.2.3" },
      "http://h/t.tgz",
      bytes,
    );
    expect(packument).toEqual({
      name: "@narrativetrace/x",
      "dist-tags": { latest: "1.2.3" },
      versions: {
        "1.2.3": {
          name: "@narrativetrace/x",
          version: "1.2.3",
          _id: "@narrativetrace/x@1.2.3",
          dist: {
            tarball: "http://h/t.tgz",
            shasum: createHash("sha1").update(bytes).digest("hex"),
            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
          },
        },
      },
    });
  });
});

describe("npmrcFor", () => {
  it("routes only the @narrativetrace scope to the local registry", () => {
    expect(npmrcFor(4873)).toBe("@narrativetrace:registry=http://127.0.0.1:4873/\n");
  });
});

describe("startLocalRegistry", () => {
  beforeEach(() => {
    packTarball("@narrativetrace/x", "1.2.3");
  });

  it("serves a packument under the encoded and the plain scoped name", async () => {
    registry = await startLocalRegistry(join(dir, "tarballs"));
    for (const path of ["/@narrativetrace%2fx", "/@narrativetrace/x", "/@narrativetrace%2Fx"]) {
      const response = await fetch(`${registry.url}${path.slice(1)}`);
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as { "dist-tags": { latest: string } };
      expect(body["dist-tags"].latest).toBe("1.2.3");
    }
  });

  it("serves the tarball bytes its packument points at", async () => {
    registry = await startLocalRegistry(join(dir, "tarballs"));
    const packument = (await (await fetch(`${registry.url}@narrativetrace%2fx`)).json()) as {
      versions: Record<string, { dist: { tarball: string } }>;
    };
    const tarball = packument.versions["1.2.3"]?.dist.tarball as string;
    const bytes = Buffer.from(await (await fetch(tarball)).arrayBuffer());
    expect(bytes.equals(readFileSync(join(dir, "tarballs", "narrativetrace-x-1.2.3.tgz")))).toBe(
      true,
    );
  });

  it("answers 404 for a package it does not carry, never somebody else's copy", async () => {
    registry = await startLocalRegistry(join(dir, "tarballs"));
    expect((await fetch(`${registry.url}@narrativetrace%2fy`)).status).toBe(404);
    expect((await fetch(`${registry.url}tarballs/../../etc/passwd`)).status).toBe(404);
  });

  it("refuses to write: a publish is not something a trial does", async () => {
    registry = await startLocalRegistry(join(dir, "tarballs"));
    const response = await fetch(`${registry.url}@narrativetrace%2fx`, { method: "PUT" });
    expect(response.status).toBe(405);
  });

  it("refuses a tarball directory with nothing to serve", async () => {
    mkdirSync(join(dir, "empty"));
    await expect(startLocalRegistry(join(dir, "empty"))).rejects.toThrow(
      `no .tgz to serve in ${join(dir, "empty")}`,
    );
  });

  it("is what npm itself installs from, through the scoped npmrc alone", async () => {
    registry = await startLocalRegistry(join(dir, "tarballs"));
    const project = join(dir, "project");
    mkdirSync(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "p", version: "1.0.0" }));
    writeFileSync(join(dir, "npmrc"), npmrcFor(registry.port));
    const env = {
      ...process.env,
      NPM_CONFIG_USERCONFIG: join(dir, "npmrc"),
      npm_config_cache: join(dir, "cache"),
    };
    // Asynchronous on purpose: the registry answers from THIS process, which a synchronous child
    // would block for as long as npm waits on it.
    await promisify(execFile)("npm", ["install", "--no-audit", "--no-fund", "@narrativetrace/x"], {
      cwd: project,
      env,
    });
    const installed = JSON.parse(
      readFileSync(join(project, "node_modules", "@narrativetrace", "x", "package.json"), "utf-8"),
    ) as { version: string };
    expect(installed.version).toBe("1.2.3");
  }, 60_000);
});
