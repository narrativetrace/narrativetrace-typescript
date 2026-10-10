// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import type { Platform } from "./platform-presets.js";

/**
 * INTENT: the closed vocabulary of SETUPS a Tier B case may declare in its `case.json`
 * (`"setup": "checkout-install"`) — what the harness does to a scaffolded project before the agent
 * starts, for a case whose premise is a project that already has NarrativeTrace.
 *
 * `checkout-install`: this checkout's packages, packed with `pnpm pack` into the trial's work
 * directory and installed into the project with `npm install --no-save`, then this checkout's own
 * `narrativetrace init`. Not the published release, because the published release is behind the
 * verbs such a case drives (2026-10-08: `@narrativetrace/cli@0.2.0` on npm has no `feedback` verb,
 * so a feedback trial against it measures the release calendar). Not links into the checkout
 * either: a tarball install is a COPY, so nothing an agent does in the project reaches this
 * repository — the reference implementation's local test repository, in npm's terms.
 *
 * The skill pages come from the installer, never from a copy of the rendered tree, so they carry
 * the provenance line a reader's own install has and `config.skills-installed` reports what it
 * would for that reader.
 *
 * `checkout-registry`: EVERY publishable package of this checkout, packed into the trial's work
 * directory and served by `local-registry.ts` under the `@narrativetrace` scope alone, through the
 * trial's own npmrc. The project starts WITHOUT NarrativeTrace — the init-prompt cases' premise —
 * and every `npm install @narrativetrace/…` or `npx @narrativetrace/cli` the agent itself types
 * resolves to this checkout; every other package still comes from the public registry.
 *
 * @llmNote A closed list rather than a command in `case.json`, for the reason
 * `registry-pre-step.ts` gives: data that may name any executable is a shell this harness does not
 * have. The packed code is the checkout's `dist/` — build first, or the trial measures stale code.
 */
export const CASE_SETUPS = ["checkout-install", "checkout-registry"] as const;

export type CaseSetup = (typeof CASE_SETUPS)[number];

/** Takes `unknown`: what reaches this is a field read out of a committed JSON file. */
export function isCaseSetup(value: unknown): value is CaseSetup {
  return (CASE_SETUPS as readonly unknown[]).includes(value);
}

/** One workspace package to pack: its published name, its version, and its directory. */
export interface CheckoutPackage {
  readonly name: string;
  readonly version: string;
  readonly dir: string;
}

/** A command of the setup and the directory it runs in. */
export interface SetupCommand {
  readonly argv: readonly string[];
  readonly cwd: string;
}

const SCOPE = "@narrativetrace/";

interface Manifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

/** Every `@narrativetrace/*` name a manifest declares, in any of the four dependency fields. */
function declaredNames(manifest: Manifest): string[] {
  const fields = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ];
  return fields.flatMap((field) => Object.keys(field ?? {})).filter((n) => n.startsWith(SCOPE));
}

/** The workspace package `name` is, read from its own directory and checked to be that package. */
function workspacePackage(
  name: string,
  repoRoot: string,
  readJson: (path: string) => unknown,
): CheckoutPackage & { readonly manifest: Manifest } {
  const dir = join(repoRoot, "packages", name.slice(SCOPE.length));
  const manifest = readJson(join(dir, "package.json")) as Manifest;
  if (manifest.name !== name) {
    throw new Error(`${dir}/package.json names ${String(manifest.name)}, not ${name}`);
  }
  if (typeof manifest.version !== "string" || manifest.version === "") {
    throw new Error(`${dir}/package.json has no version, so no tarball name can be known for it`);
  }
  return { name, version: manifest.version, dir, manifest };
}

/**
 * Every workspace package the fixture's own declarations reach, its peers included — a peer npm
 * would otherwise fetch from the registry, at the published version — sorted by name.
 *
 * @throws {Error} when the fixture declares none, or names one this checkout does not have, or a
 * package's manifest carries no version.
 */
export function checkoutPackages(
  fixtureManifest: Manifest,
  repoRoot: string,
  readJson: (path: string) => unknown,
): readonly CheckoutPackage[] {
  const pending = declaredNames(fixtureManifest);
  if (pending.length === 0) throw new Error(`the fixture declares no ${SCOPE}* package`);
  const found = new Map<string, CheckoutPackage>();
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (found.has(name)) continue;
    const { manifest, ...pkg } = workspacePackage(name, repoRoot, readJson);
    found.set(name, pkg);
    pending.push(...declaredNames(manifest));
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Where a trial's packed packages go, and what the local registry serves. */
export function registryTarballDir(workDir: string): string {
  return join(workDir, "packages");
}

/**
 * Every package of this checkout a reader could install: each `packages/<dir>` whose manifest
 * names an `@narrativetrace/*` package and is not private, sorted by name.
 *
 * @throws {Error} when a publishable manifest has no version, or when there is none at all
 */
export function publishablePackages(
  repoRoot: string,
  listPackageDirs: () => readonly string[],
  readJson: (path: string) => unknown,
): readonly CheckoutPackage[] {
  const found: CheckoutPackage[] = [];
  for (const entry of listPackageDirs()) {
    const dir = join(repoRoot, "packages", entry);
    const manifest = readManifestOrNothing(join(dir, "package.json"), readJson);
    if (typeof manifest?.name !== "string" || !manifest.name.startsWith(SCOPE)) continue;
    if (manifest.private === true) continue;
    if (typeof manifest.version !== "string" || manifest.version === "") {
      throw new Error(`${dir}/package.json has no version, so no tarball name can be known for it`);
    }
    found.push({ name: manifest.name, version: manifest.version, dir });
  }
  if (found.length === 0)
    throw new Error(`no publishable ${SCOPE}* package under ${repoRoot}/packages`);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function readManifestOrNothing(
  path: string,
  readJson: (path: string) => unknown,
): (Manifest & { readonly private?: unknown }) | undefined {
  try {
    return readJson(path) as Manifest & { readonly private?: unknown };
  } catch {
    return undefined;
  }
}

/** One `pnpm pack` per package, into {@link registryTarballDir}. */
export function packCommands(
  packages: readonly CheckoutPackage[],
  workDir: string,
): readonly SetupCommand[] {
  const destination = registryTarballDir(workDir);
  return packages.map((pkg) => ({
    argv: ["pnpm", "pack", "--pack-destination", destination],
    cwd: pkg.dir,
  }));
}

/** The file `pnpm pack` writes for `pkg`: the scope's `@` dropped and its `/` a hyphen. */
export function tarballName(pkg: CheckoutPackage): string {
  return `${pkg.name.slice(1).replace("/", "-")}-${pkg.version}.tgz`;
}

/**
 * Everything `checkout-install` runs, in order: one `pnpm pack` per package into the work
 * directory, ONE `npm install` of every tarball together (so each package's dependency on a sibling
 * is satisfied by the sibling's copy, not by the registry), then the installed CLI's own `init`.
 */
export function setupCommands(
  packages: readonly CheckoutPackage[],
  workDir: string,
  project: string,
  platform: Platform,
): readonly SetupCommand[] {
  const destination = registryTarballDir(workDir);
  const packs = packCommands(packages, workDir);
  const tarballs = packages.map((pkg) => join(destination, tarballName(pkg)));
  const cli = join(project, "node_modules", "@narrativetrace", "cli", "bin", "narrativetrace.js");
  const vendor = platform === "claude" ? "claude" : "none";
  return [
    ...packs,
    { argv: ["npm", "install", "--no-save", "--no-audit", "--no-fund", ...tarballs], cwd: project },
    { argv: ["node", cli, "init", "--vendor", vendor], cwd: project },
  ];
}
