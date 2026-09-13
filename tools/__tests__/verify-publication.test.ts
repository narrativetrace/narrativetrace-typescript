// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveVersion } from "../verify-publication.js";

// The family finding this fixes: a scheduled run with no version input must never default to
// this workspace's own package.json version — that moves on to the next version the instant a
// release is cut, so a run reading it polls the registry for artifacts that were never going to
// exist. Every fixture below gives the workspace's own package.json a version deliberately AHEAD
// of / different from the correct answer, so a resolveVersion that ever consulted it would give
// itself away.

function runGit(dir: string, args: readonly string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "pipe" });
}

function initGitRepo(dir: string): void {
  // -b pins the initial branch name so the "unreachable tag" fixture below can check back out to
  // it by name, regardless of this host's own init.defaultBranch configuration.
  runGit(dir, ["init", "-q", "-b", "main"]);
  runGit(dir, ["config", "user.email", "verify-publication-test@example.com"]);
  runGit(dir, ["config", "user.name", "verify-publication-test"]);
  runGit(dir, ["config", "commit.gpgsign", "false"]);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  runGit(dir, ["add", "seed.txt"]);
  runGit(dir, ["commit", "-q", "-m", "seed"]);
}

function initGitRepoWithTag(dir: string, tag: string): void {
  initGitRepo(dir);
  runGit(dir, ["tag", tag]);
}

function writeDeliberatelyWrongWorkspaceVersion(dir: string): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "workspace-root", version: "99.9.9-deliberately-wrong" }),
  );
}

interface RegistryFixture {
  readonly server: Server;
  readonly baseUrl: string;
  close(): void;
}

/** A loopback HTTP server standing in for the npm registry's "latest" dist-tag packument — the
 * exact GET `<base>/<name>/latest` shape `latestDistTagVersion`'s real fetch hits, with no real
 * network involved. `listen` binds asynchronously, so the fixture resolves only once the
 * `listening` event actually fires and a real port is assigned. */
function startRegistryServer(name: string, latestVersion: string): Promise<RegistryFixture> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === `/${name}/latest`) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version: latestVersion }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("failed to bind the loopback registry fixture"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close() });
    });
  });
}

describe("resolveVersion", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nt-verify-publication-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("uses an explicit version verbatim and never resolves anything else", async () => {
    initGitRepoWithTag(repoRoot, "v1.2.3");
    writeDeliberatelyWrongWorkspaceVersion(repoRoot);

    const resolved = await resolveVersion(repoRoot, "9.9.9-explicit");

    expect(resolved).toEqual({ version: "9.9.9-explicit", source: "explicit version argument" });
  });

  it("uses the newest v* tag reachable from HEAD when no version is given", async () => {
    initGitRepoWithTag(repoRoot, "v3.4.5");
    writeDeliberatelyWrongWorkspaceVersion(repoRoot);

    const resolved = await resolveVersion(repoRoot, undefined);

    expect(resolved.version).toBe("3.4.5");
    expect(resolved.source).toContain("newest v* tag reachable from HEAD");
    expect(resolved.source).not.toContain("99.9.9");
  });

  it("falls back to the registry's latest dist-tag when no tag is reachable from HEAD", async () => {
    initGitRepo(repoRoot);
    writeDeliberatelyWrongWorkspaceVersion(repoRoot);
    const registry = await startRegistryServer("@narrativetrace/core", "2.7.1");
    try {
      const resolved = await resolveVersion(repoRoot, undefined, registry.baseUrl);

      expect(resolved.version).toBe("2.7.1");
      expect(resolved.source).toContain('npm registry "latest" dist-tag');
      expect(resolved.source).toContain("no v* tag found");
    } finally {
      registry.close();
    }
  });

  it("never considers a tag that exists but is not reachable from HEAD", async () => {
    initGitRepo(repoRoot);
    // A tag on an orphan branch, unreachable from the current HEAD.
    runGit(repoRoot, ["checkout", "--orphan", "unrelated"]);
    writeFileSync(join(repoRoot, "other.txt"), "other\n");
    runGit(repoRoot, ["add", "other.txt"]);
    runGit(repoRoot, ["commit", "-q", "-m", "unrelated"]);
    runGit(repoRoot, ["tag", "v8.8.8"]);
    runGit(repoRoot, ["checkout", "-q", "main"]);
    const registry = await startRegistryServer("@narrativetrace/core", "2.7.1");

    try {
      const resolved = await resolveVersion(repoRoot, undefined, registry.baseUrl);

      expect(resolved.version).toBe("2.7.1");
    } finally {
      registry.close();
    }
  });

  it("throws when there is no reachable tag and the registry does not answer", async () => {
    initGitRepo(repoRoot);

    await expect(resolveVersion(repoRoot, undefined, "http://127.0.0.1:1")).rejects.toThrow(
      /no v\* tag reachable/,
    );
  });
});
