// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** How long the runner waits for the registry to write the npmrc that says it is serving. */
const READY_WITHIN_MS = 30_000;
const POLL_MS = 100;

/** Blocks the calling thread for `ms` — the runner is synchronous end to end, by design. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Whether `ready()` turned true within `withinMs`, polling every {@link POLL_MS}. */
export function waitUntil(ready: () => boolean, withinMs: number, pause = sleep): boolean {
  for (let waited = 0; waited < withinMs; waited += POLL_MS) {
    if (ready()) return true;
    pause(POLL_MS);
  }
  return ready();
}

/**
 * The production `startRegistry`: `local-registry.ts` in a process of its own — the runner drives
 * the agent with a SYNCHRONOUS spawn, so a server inside the runner's own process would never get
 * to answer npm — returning once it has written the npmrc, with the function that stops it.
 *
 * @throws {Error} when no npmrc appears within 30 s; the process is stopped first
 */
export function registryProcessStarter(
  evalsDir: string,
): (tarballDir: string, npmrcPath: string) => () => void {
  return (tarballDir, npmrcPath) => {
    const script = join(evalsDir, "local-registry.ts");
    const child = spawn(process.execPath, ["--import", "tsx", script, tarballDir, npmrcPath], {
      cwd: evalsDir,
      stdio: ["ignore", "ignore", "inherit"],
    });
    const stop = () => void child.kill("SIGTERM");
    if (!waitUntil(() => existsSync(npmrcPath), READY_WITHIN_MS)) {
      stop();
      throw new Error(`no ${npmrcPath} after ${READY_WITHIN_MS / 1000} s`);
    }
    return stop;
  };
}
