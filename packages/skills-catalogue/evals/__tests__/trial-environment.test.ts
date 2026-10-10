// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VENDOR_CONFIG_DIR_VARIABLE } from "../isolated-agent-config.js";
import {
  agentEnvironment,
  blockedInvocationsLog,
  graderEnvironment,
  installStandIns,
  keepEvidence,
  recordUserTurn,
  SERVED_HOST,
  standInDir,
  transcriptPath,
} from "../trial-environment.js";

/**
 * The environment every command of one trial runs with and the evidence a grader reads afterwards.
 * The stand-ins are exercised as REAL processes under a minimal PATH, because what they promise is
 * a property of a shell script at an OS process boundary: that `gh` files nothing, that `curl`
 * reaches the published site and nothing else, and that a stand-in which finds only itself on PATH
 * stops instead of exec'ing itself without end.
 */

let root: string;
let work: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-trial-env-test-"));
  work = join(root, "work");
  installStandIns(work);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A stand-in for the REAL curl, placed behind the trial's stub on PATH by the caller. */
function fakeRealCurl(): string {
  const bin = join(root, "real-bin");
  mkdirSync(bin, { recursive: true });
  const curl = join(bin, "curl");
  writeFileSync(
    curl,
    "#!/bin/sh\nprintf 'REAL'\nfor a in \"$@\"; do printf ' %s' \"$a\"; done\nprintf '\\n'\n",
  );
  chmodSync(curl, 0o755);
  return bin;
}

/** Runs one stand-in by absolute path with nothing on PATH but the directories given. */
function runStandIn(name: string, args: readonly string[], path: readonly string[]) {
  const result = spawnSync(join(standInDir(work), name), args, {
    env: { PATH: path.join(":") },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout, signal: result.signal };
}

function recorded(): string {
  const log = blockedInvocationsLog(work);
  return existsSync(log) ? readFileSync(log, "utf8") : "";
}

describe("the gh stand-in", () => {
  it("records its argv on one line and exits 0 having filed nothing", () => {
    const run = runStandIn("gh", ["issue", "create", "--title", "a b"], [standInDir(work)]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(recorded()).toBe("gh issue create --title a b\n");
  });

  it("appends one line per invocation, so a grader can count them", () => {
    runStandIn("gh", ["auth", "status"], [standInDir(work)]);
    runStandIn("gh", ["issue", "list"], [standInDir(work)]);
    expect(recorded()).toBe("gh auth status\ngh issue list\n");
  });
});

describe("the curl stand-in", () => {
  it("serves the published site through the real curl behind it, and still records it", () => {
    const real = fakeRealCurl();
    const url = `https://${SERVED_HOST}/typescript/llms.txt`;
    const run = runStandIn("curl", ["-sS", url], [standInDir(work), real]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`REAL -sS ${url}\n`);
    expect(recorded()).toBe(`curl -sS ${url}\n`);
  });

  it.each([
    `http://${SERVED_HOST}`,
    `https://${SERVED_HOST}`,
    `http://${SERVED_HOST}/llms.txt`,
  ])("serves %s, the host's bare and pathful forms over both schemes", (url) => {
    const run = runStandIn("curl", [url], [standInDir(work), fakeRealCurl()]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("REAL");
  });

  it.each([
    ["any other host", ["https://api.github.com/repos/x/y/issues"]],
    ["a sibling host sharing the prefix", [`https://${SERVED_HOST}.evil.example/llms.txt`]],
    ["the host named only in somebody else's path", [`https://evil.example/${SERVED_HOST}/x`]],
    ["the host as somebody else's userinfo", [`https://${SERVED_HOST}@evil.example/llms.txt`]],
    ["a foreign URL in an upper-case scheme", [`https://${SERVED_HOST}/`, "HTTPS://x.io/"]],
    ["a scheme-less foreign host, which curl reads as a URL", [`https://${SERVED_HOST}/`, "x.io"]],
    ["the URL given through --url=", [`https://${SERVED_HOST}/`, "--url=https://x.io/"]],
    ["a proxy", ["--proxy", "http://x.io:80", `https://${SERVED_HOST}/`]],
    ["a proxy in a short-flag cluster", ["-sx", "x.io:80", `https://${SERVED_HOST}/`]],
    [
      "a re-pointed host name",
      ["--resolve", `${SERVED_HOST}:443:1.2.3.4`, `https://${SERVED_HOST}/`],
    ],
    [
      "a config file, which can carry URLs of its own",
      ["-K", "urls.txt", `https://${SERVED_HOST}/`],
    ],
    ["the value of an option it does not know", ["-d", "x.io", `https://${SERVED_HOST}/`]],
    ["a foreign URL in the same invocation", [`https://${SERVED_HOST}/llms.txt`, "https://x.io"]],
    ["the foreign URL first", ["https://x.io", `https://${SERVED_HOST}/llms.txt`]],
    ["no URL at all", ["--version"]],
    ["no argument at all", []],
  ])("answers curl's own 'could not resolve host' to %s", (_label, args) => {
    const run = runStandIn("curl", args, [standInDir(work), fakeRealCurl()]);
    expect(run.status).toBe(6);
    expect(run.stdout).not.toContain("REAL");
  });

  it.each([
    [["-sSL", `https://${SERVED_HOST}/typescript/llms.txt`]],
    [["-sLo", "llms.txt", `https://${SERVED_HOST}/typescript/llms.txt`]],
    [["-o", "llms.txt", `https://${SERVED_HOST}/typescript/llms.txt`]],
    [["--output", "llms.txt", "--max-time", "20", `https://${SERVED_HOST}/llms.txt`]],
    [["-H", "Accept: text/plain", `https://${SERVED_HOST}/llms.txt`]],
    [["--fail", "--silent", "--show-error", "--location", `https://${SERVED_HOST}/llms.txt`]],
  ])("serves the ways an agent reads a page: %j", (args) => {
    const run = runStandIn("curl", args, [standInDir(work), fakeRealCurl()]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`REAL ${args.join(" ")}\n`);
  });

  it("records a blocked request too — absence is not containment", () => {
    runStandIn("curl", ["https://api.github.com/x"], [standInDir(work), fakeRealCurl()]);
    expect(recorded()).toBe("curl https://api.github.com/x\n");
  });

  it("exits 6 rather than exec'ing itself when it is the only curl on PATH", () => {
    const run = runStandIn("curl", [`https://${SERVED_HOST}/llms.txt`], [standInDir(work)]);
    expect(run.signal).toBeNull();
    expect(run.status).toBe(6);
  });

  it("stops at a second stand-in behind it instead of handing the request back and forth", () => {
    const other = join(root, "other-work");
    installStandIns(other);
    const url = `https://${SERVED_HOST}/llms.txt`;
    const run = runStandIn("curl", [url], [standInDir(work), standInDir(other), fakeRealCurl()]);
    expect(run.signal).toBeNull();
    expect(run.status).toBe(6);
    expect(run.stdout).not.toContain("REAL");
  });

  it("needs nothing on PATH but itself and the real curl — shell builtins only", () => {
    const run = runStandIn("curl", [`https://${SERVED_HOST}/`], [standInDir(work), fakeRealCurl()]);
    expect(run.status).toBe(0);
  });
});

describe("installStandIns", () => {
  it("refuses a work directory whose path would end the stub's own single quoting", () => {
    expect(() => installStandIns(join(root, "it's"))).toThrow(/'/);
  });
});

describe("the agent's environment and the grader's", () => {
  it("puts the stand-ins first on PATH, ahead of the ambient PATH", () => {
    const env = agentEnvironment(work, "/usr/bin:/bin");
    expect(env.PATH).toBe(`${standInDir(work)}:/usr/bin:/bin`);
  });

  it("points the vendor CLI at the trial's own configuration, never the operator's", () => {
    expect(agentEnvironment(work, "/bin")[VENDOR_CONFIG_DIR_VARIABLE]).toBe(join(work, "config"));
  });

  it("never tells the agent where the evidence is", () => {
    const env = agentEnvironment(work, "/bin");
    expect(Object.values(env).join("\n")).not.toContain(transcriptPath(work));
    expect(Object.values(env).join("\n")).not.toContain(blockedInvocationsLog(work));
  });

  it("tells the grader where both pieces of evidence are, on top of the agent's environment", () => {
    const env = graderEnvironment(work, "/bin");
    expect(env.NARRATIVETRACE_TRANSCRIPT).toBe(transcriptPath(work));
    expect(env.NARRATIVETRACE_GH_LOG).toBe(blockedInvocationsLog(work));
    expect(env.PATH).toBe(agentEnvironment(work, "/bin").PATH);
  });

  it("keeps the evidence inside the work directory, outside any project", () => {
    expect(transcriptPath(work).startsWith(`${work}/`)).toBe(true);
    expect(blockedInvocationsLog(work).startsWith(`${work}/`)).toBe(true);
  });
});

describe("recordUserTurn", () => {
  it("writes one JSON line per turn, a multi-line prompt included", () => {
    recordUserTurn(work, 1, 'line one\nline "two"');
    recordUserTurn(work, 2, "yes, file it");
    const lines = readFileSync(transcriptPath(work), "utf8").split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] as string)).toEqual({
      nt_turn: 1,
      role: "user",
      text: 'line one\nline "two"',
    });
    expect(JSON.parse(lines[1] as string)).toEqual({
      nt_turn: 2,
      role: "user",
      text: "yes, file it",
    });
  });

  it("creates the transcript's directory when nothing has written to it yet", () => {
    const fresh = join(root, "fresh");
    recordUserTurn(fresh, 1, "hello");
    expect(existsSync(transcriptPath(fresh))).toBe(true);
  });
});

describe("keepEvidence", () => {
  it("copies the transcript and the blocked-command log, so a red row can be diagnosed", () => {
    recordUserTurn(work, 1, "hello");
    runStandIn("gh", ["issue", "create"], [standInDir(work)]);
    const kept = join(root, "kept", "trial-1");
    keepEvidence(work, kept);
    expect(readFileSync(join(kept, "transcript.jsonl"), "utf8")).toContain('"nt_turn":1');
    expect(readFileSync(join(kept, "gh-invocations.log"), "utf8")).toBe("gh issue create\n");
  });

  it("copies only what exists — a trial that ran nothing blocked has no log to keep", () => {
    recordUserTurn(work, 1, "hello");
    const kept = join(root, "kept");
    keepEvidence(work, kept);
    expect(existsSync(join(kept, "transcript.jsonl"))).toBe(true);
    expect(existsSync(join(kept, "gh-invocations.log"))).toBe(false);
  });
});
