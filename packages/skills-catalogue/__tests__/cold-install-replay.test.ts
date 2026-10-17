// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packCommands, publishablePackages, registryTarballDir } from "../evals/case-setup.js";
import { registryProcessStarter } from "../evals/registry-process.js";
import { ADD_NARRATIVE_TRACING } from "../src/catalogue/add-narrative-tracing.js";
import { type PlaceSnippet, replaySkill } from "../src/replay.js";
import { REPO_ROOT } from "./repo-root.js";

// Tier A2 for the install skill, from ZERO (B-87). The page used to be replayed only in
// examples/sixty-seconds, a workspace member that already declares every @narrativetrace package —
// the one project where "the page never adds the packages" cannot show. Here the skill's own
// fixture (an empty project) is copied OUTSIDE the repository, and the `@narrativetrace` scope is
// routed through the project's own `.npmrc` to the Tier B `checkout-registry` setup's registry,
// serving THIS checkout's packed packages; every other package comes from the public registry.
// A snippet step's file is written into the project before its verify runs, as the reader would.
//
// The budget guards against a hang, not a performance figure: packing measures ~6 s of it, and the
// whole replay ~12 s in isolation and ~17 s inside a full `pnpm run check` (2026-10-16, dev VM).
const REPLAY_BUDGET_MS = 180_000;

const SCOPE = "@narrativetrace/";

/**
 * `pnpm` for a project outside the workspace: THIS checkout's pinned pnpm (corepack reads the root
 * manifest's `packageManager`), pointed at the directory it was called from. A bare `pnpm` there
 * would be whatever corepack resolves with no manifest to read — the latest release, downloaded
 * per run, or nothing at all where corepack's cache is not writable (the dev container).
 */
function pinnedPnpmShim(binDir: string): void {
  const real = execFileSync("sh", ["-c", "command -v pnpm"], { encoding: "utf-8" }).trim();
  const script = `#!/bin/sh\nproject=$(pwd)\ncd '${REPO_ROOT}' && exec '${real}' --dir "$project" "$@"\n`;
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, "pnpm"), script);
  chmodSync(join(binDir, "pnpm"), 0o755);
}

/**
 * The environment a reader's own shell would have: none of the surrounding `pnpm run`'s `npm_*`
 * settings, a private npm cache (so `npx` cannot reuse a PUBLISHED release it cached under the
 * same version), and the pinned pnpm first on the path.
 */
function readerEnvironment(scratch: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)),
  );
  const binDir = join(scratch, "bin");
  pinnedPnpmShim(binDir);
  return {
    ...env,
    npm_config_cache: join(scratch, "npm-cache"),
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
  };
}

/** Every publishable package of this checkout packed, and served under the scope to `project`. */
function serveCheckout(scratch: string, project: string): () => void {
  const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf-8"));
  const listDirs = () => readdirSync(join(REPO_ROOT, "packages"));
  const packages = publishablePackages(REPO_ROOT, listDirs, readJson);
  for (const { argv, cwd } of packCommands(packages, scratch)) {
    execFileSync(argv[0] as string, argv.slice(1), { cwd, stdio: "pipe" });
  }
  const start = registryProcessStarter(join(REPO_ROOT, "packages", "skills-catalogue", "evals"));
  return start(registryTarballDir(scratch), join(project, ".npmrc"));
}

/** The reader writing the shown file into their project, under its own name. */
const placeSnippet: PlaceSnippet = (snippet, cwd) =>
  cpSync(join(REPO_ROOT, snippet.path), join(cwd, basename(snippet.path)));

function manifestOf(project: string): Record<string, unknown> & {
  dependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(project, "package.json"), "utf-8"));
}

describe.sequential("Tier A2 replay of add-narrative-tracing from a cold project", () => {
  const fixture = join(REPO_ROOT, ADD_NARRATIVE_TRACING.fixture);
  const scratch = mkdtempSync(join(tmpdir(), "nt-cold-install-"));
  const project = join(scratch, "project");
  let results: ReturnType<typeof replaySkill> = [];
  let stopRegistry = () => {};

  beforeAll(async () => {
    // Hand the event loop back once before blocking it: see replay.test.ts's own hooks.
    await new Promise<void>((resolve) => setImmediate(resolve));
    cpSync(fixture, project, { recursive: true });
    stopRegistry = serveCheckout(scratch, project);
    const env = readerEnvironment(scratch);
    const run = (command: string, cwd: string) =>
      void execFileSync(command, { shell: true, cwd, stdio: "pipe", env });
    results = replaySkill(ADD_NARRATIVE_TRACING, project, run, placeSnippet);
  }, REPLAY_BUDGET_MS);

  afterAll(() => {
    stopRegistry();
    rmSync(scratch, { recursive: true, force: true });
  });

  it("the fixture starts from zero: no dependency, no lockfile, no module type", () => {
    const manifest = JSON.parse(readFileSync(join(fixture, "package.json"), "utf-8"));
    expect(Object.keys(manifest)).toEqual(["name", "version", "private"]);
    expect(existsSync(join(fixture, "pnpm-lock.yaml"))).toBe(false);
  });

  it("every step with something mechanical to run succeeds", () => {
    const failing = results.filter((r) => !r.ok);
    expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
    expect(results.every((r) => r.ran)).toBe(true);
  });

  it("the project ends declaring exactly the packages the page added, as an ES module", () => {
    const manifest = manifestOf(project);
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      `${SCOPE}core-node`,
      `${SCOPE}pino`,
      `${SCOPE}proxy`,
      "pino",
    ]);
    expect(manifest.type).toBe("module");
  });

  it("the NarrativeTrace packages came from this checkout's registry, not a published release", () => {
    const lockfile = readFileSync(join(project, "pnpm-lock.yaml"), "utf-8");
    expect(lockfile).toMatch(/http:\/\/127\.0\.0\.1:\d+\/tarballs\/narrativetrace-core-node-/);
  });
});
