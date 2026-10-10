// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * INTENT: a throwaway vendor-tool configuration a trial owns, in BOTH directions.
 *
 * Outward: a marketplace and a plugin are USER-level state, the only scope the documentation
 * describes, so a registry trial's installs land in the trial's own directory and never in the
 * configuration of the person running it.
 *
 * Inward, and just as load-bearing: no trial inherits that person's configuration either. A trial
 * driven against the operator's own configuration is driven against the operator's own skills — the
 * skill under test as one line among forty, and a red row that reproduces nowhere else.
 *
 * Two things stay deliberately OUTSIDE the isolation. `HOME` is untouched: it is where the package
 * manager's store and the toolchain live, and a trial that moved it would spend its first minutes
 * refetching dependencies instead of measuring a skill. And the subscription LOGIN is copied in,
 * because a fresh configuration is a logged-out one — the agent CLI answers "Not logged in" and the
 * trial would measure the harness.
 *
 * @llmNote The login file is a secret. It is copied owner-only into a directory the runner deletes
 * when the trial ends, and it is the only file this module ever reads out of the real configuration
 * — never the history, the sessions or the projects beside it.
 */

/** The vendor CLI's own configuration-directory override. */
export const VENDOR_CONFIG_DIR_VARIABLE = "CLAUDE_CONFIG_DIR";

/** The subscription login, the one file a fresh configuration cannot do without. */
const LOGIN_FILE = ".credentials.json";

/** The conventional configuration directory under whichever home the tools read. */
const CONFIG_DIRECTORY_NAME = ".claude";

/** The isolated configuration directory inside a trial's work directory. */
export function configDir(workDir: string): string {
  return join(workDir, "config");
}

/**
 * The trial's own npm user configuration. EVERY trial points npm at it, so the operator's
 * `~/.npmrc` (registries, tokens) never reaches an agent; a `checkout-registry` trial writes its one
 * scoped-registry line there, and every other trial leaves it absent — npm reads a missing user
 * configuration as empty.
 */
export function npmrcPath(workDir: string): string {
  return join(workDir, "npmrc");
}

/** Where the package runner caches its downloads — the ambient one may not be writable. */
export function npmCacheDir(workDir: string): string {
  return join(workDir, "npm-cache");
}

/**
 * The environment every command of a registry trial runs with: the isolated configuration, a
 * writable package cache, and a best-effort telemetry opt-out for the registry tool that has one.
 */
export function registryEnv(workDir: string): Record<string, string> {
  return {
    [VENDOR_CONFIG_DIR_VARIABLE]: configDir(workDir),
    npm_config_cache: npmCacheDir(workDir),
    NPM_CONFIG_USERCONFIG: npmrcPath(workDir),
    DO_NOT_TRACK: "1",
  };
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * The configuration directory the ambient environment points the vendor CLI at: the override when
 * one is set, otherwise the conventional directory under the home the TOOLS use.
 *
 * @llmNote `HOME` is asked before the runtime's own notion of a user home on purpose: every CLI
 * this harness drives reads the environment variable, and a container whose uid has no passwd entry
 * reports a home of `?` — a path with no login file under it, which turns into a logged-out agent
 * two steps later.
 */
export function realConfigDir(
  override: string | undefined,
  homeVariable: string | undefined,
  runtimeHome: string,
): string {
  if (!blank(override)) return override as string;
  return join(blank(homeVariable) ? runtimeHome : (homeVariable as string), CONFIG_DIRECTORY_NAME);
}

/**
 * Creates the isolated configuration and cache directories and copies the subscription login in
 * when `realConfig` has one.
 *
 * @returns whether a login was found and copied. A caller SAYS which it was: a trial with no login
 * does not fail here, it fails three steps later when the agent answers "Not logged in", and that
 * is a long way from the cause.
 * @sideEffects creates {@link configDir} and {@link npmCacheDir}; writes one owner-only copy of the
 * login file there. Reads exactly one file of `realConfig` and writes none.
 */
export function seedLogin(realConfig: string, workDir: string): boolean {
  const isolated = configDir(workDir);
  mkdirSync(isolated, { recursive: true });
  mkdirSync(npmCacheDir(workDir), { recursive: true });
  const login = join(realConfig, LOGIN_FILE);
  if (!existsSync(login) || !statSync(login).isFile()) return false;
  const copy = join(isolated, LOGIN_FILE);
  copyFileSync(login, copy);
  chmodSync(copy, 0o600);
  return true;
}
