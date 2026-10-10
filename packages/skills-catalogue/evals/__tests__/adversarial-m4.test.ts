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
import { agentTurns, commandForTurn, type TurnsRequest } from "../agent-turns.js";
import { checkoutPackages, setupCommands } from "../case-setup.js";
import { scriptedReplies as caseScriptedReplies } from "../case-turns.js";
import * as transcript from "../narrativetrace-feedback/transcript.mjs";
import { presetAgentCommand } from "../platform-presets.js";
import {
  blockedInvocationsLog,
  installStandIns,
  keepEvidence,
  recordUserTurn,
  SERVED_HOST,
  standInDir,
  transcriptPath,
} from "../trial-environment.js";

/**
 * Adversarial pass over the milestone-4 eval harness (written by a cheap model, every assertion
 * read before it was kept): behaviour the code implements that no other test pins, and its
 * boundaries. Seven of its "BUG?" findings were real and are fixed; four asserted behaviour that is
 * a DECISION, and those rows were inverted to pin the decision with its reason.
 */

const SESSION = "0F8FAD5B-D9CB-469F-A165-70867728950E";
const ISSUE = transcript.ISSUE_URL;
const SERVED = `https://${SERVED_HOST}/llms.txt`;

let root: string;
let work: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-adv-m4-"));
  work = join(root, "work");
  installStandIns(work);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

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

function runStandIn(name: string, args: readonly string[]) {
  const result = spawnSync(join(standInDir(work), name), args, {
    env: { PATH: [standInDir(work), fakeRealCurl()].join(":") },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

function writeTranscript(lines: readonly string[]): string {
  const path = join(root, "transcript.jsonl");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const marker = (turn: number, text: string) =>
  JSON.stringify({ nt_turn: turn, role: "user", text });

describe("the gh stand-in's record", () => {
  it("records an argument with quotes and apostrophes verbatim", () => {
    runStandIn("gh", ["issue", "create", "--body", `say "hi" it's`]);
    expect(readFileSync(blockedInvocationsLog(work), "utf8")).toBe(
      `gh issue create --body say "hi" it's\n`,
    );
  });

  it("keeps one invocation on one line when an argument carries line breaks", () => {
    runStandIn("gh", ["issue", "create", "--body", "line one\nline two\nthree"]);
    const lines = transcript.blockedInvocations(blockedInvocationsLog(work));
    expect(lines).toEqual(["gh issue create --body line one\\nline two\\nthree"]);
  });
});

describe("the curl stand-in's argument reading", () => {
  it("serves a request whose --output is attached with an equals sign", () => {
    const run = runStandIn("curl", ["--output=llms.txt", SERVED]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("REAL");
  });

  it("serves an attached short -o value that is a plain filename", () => {
    expect(runStandIn("curl", ["-ollms.html", SERVED]).status).toBe(0);
  });

  it("answers 6 to --url given as a separate flag, which names a host of its own", () => {
    const run = runStandIn("curl", ["--url", SERVED]);
    expect(run.status).toBe(6);
    expect(run.stdout).not.toContain("REAL");
  });

  it("answers 6 to a dangling -o when a foreign URL is also in the invocation", () => {
    expect(runStandIn("curl", ["https://api.github.com/x", "-o"]).status).toBe(6);
  });

  // A DECISION, not a defect: a short-flag cluster is not parsed letter by letter in shell
  // builtins, so any cluster carrying x, K or : fails CLOSED, an attached value included. The
  // cost is a refused filename; the alternative is a proxy smuggled in a cluster.
  it("fails closed on an attached -o value carrying an x, rather than parse the cluster", () => {
    const run = runStandIn("curl", ["-oindex.html", SERVED]);
    expect(run.status).toBe(6);
    expect(run.stdout).not.toContain("REAL");
  });

  it.each([
    ["the host in upper case", `https://${SERVED_HOST.toUpperCase()}/llms.txt`],
    ["the host with an explicit default port", `http://${SERVED_HOST}:80/`],
    ["the host as a fully qualified name", `https://${SERVED_HOST}./llms.txt`],
  ])("fails closed on %s — only the spelling the documentation uses is served", (_label, url) => {
    const run = runStandIn("curl", [url]);
    expect(run.status).toBe(6);
    expect(run.stdout).not.toContain("REAL");
  });
});

describe("recordUserTurn and keepEvidence", () => {
  it("round-trips unicode, line separators and emoji in a turn as one line", () => {
    const text = 'héllo 🙂 \u2028 second\nthird "quoted"';
    recordUserTurn(work, 1, text);
    const raw = readFileSync(transcriptPath(work), "utf8");
    expect(raw.split("\n")).toHaveLength(2);
    expect(JSON.parse(raw.trimEnd()).text).toBe(text);
  });

  it("keeps unrelated files in an existing destination and replaces the transcript", () => {
    recordUserTurn(work, 1, "first");
    const kept = join(root, "kept");
    mkdirSync(kept, { recursive: true });
    writeFileSync(join(kept, "notes.txt"), "keep me");
    writeFileSync(join(kept, "transcript.jsonl"), "old\n");
    keepEvidence(work, kept);
    expect(readFileSync(join(kept, "notes.txt"), "utf8")).toBe("keep me");
    expect(readFileSync(join(kept, "transcript.jsonl"), "utf8")).toContain('"text":"first"');
  });

  it("does not leave a previous trial's blocked-command log beside a trial that ran none", () => {
    const kept = join(root, "kept");
    mkdirSync(kept, { recursive: true });
    writeFileSync(join(kept, "gh-invocations.log"), "gh issue create\n");
    recordUserTurn(work, 1, "hello");
    keepEvidence(work, kept);
    expect(existsSync(join(kept, "gh-invocations.log"))).toBe(false);
  });
});

describe("blockedInvocations", () => {
  it("is empty for a log that was never written", () => {
    expect(transcript.blockedInvocations(join(root, "absent.log"))).toEqual([]);
  });

  it("trims each line and drops blank ones", () => {
    const path = join(root, "log");
    writeFileSync(path, "  gh a \n\ncurl b\n   \n");
    expect(transcript.blockedInvocations(path)).toEqual(["gh a", "curl b"]);
  });

  it("refuses to report 'nothing ran' for a log it cannot read", () => {
    expect(() => transcript.blockedInvocations(root)).toThrow();
  });
});

describe("transcript.read", () => {
  it("keeps non-JSON output inside a turn as that turn's text", () => {
    const path = writeTranscript([marker(2, "yes"), "plain words the agent printed"]);
    expect(transcript.read(path)[0].texts).toEqual(["plain words the agent printed"]);
  });

  it("keeps agent output that precedes the first turn marker in the record, as a turn 0", () => {
    const path = writeTranscript(["stray output before any marker", marker(2, "yes")]);
    expect(transcript.whole(transcript.read(path))).toContain("stray output before any marker");
  });

  it("joins a tool result whose content is a list of text parts", () => {
    const result = {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [
              { type: "text", text: "alpha" },
              { type: "text", text: "beta" },
            ],
          },
        ],
      },
    };
    const turn = transcript.read(writeTranscript([marker(2, "go"), JSON.stringify(result)]))[0];
    expect(turn.results.get("t1")).toBe("alpha\nbeta");
  });

  it("ignores a system event whose message is a plain string", () => {
    const system = JSON.stringify({ type: "system", subtype: "init", message: "hello" });
    const turn = transcript.read(writeTranscript([marker(2, "go"), system]))[0];
    expect(transcript.everything(turn)).toBe("");
  });

  it("does not open a turn for a bare JSON value that is not an object", () => {
    const turns = transcript.read(writeTranscript([marker(2, "go"), "42", "null"]));
    expect(turns).toHaveLength(1);
  });
});

describe("transcript.issueUrls", () => {
  it("finds two issue-form URLs written on one line", () => {
    const text = `A ${ISSUE}?title=one and B ${ISSUE}?title=two.`;
    expect(transcript.issueUrls(text)).toEqual([`${ISSUE}?title=one`, `${ISSUE}?title=two`]);
  });

  it("strips the closing parenthesis of a markdown link wrapped around a URL", () => {
    const url = `${ISSUE}?title=x`;
    expect(transcript.issueUrls(`[file](${url}),`)).toEqual([url]);
  });

  it("keeps a balanced parenthesis pair that is part of the title", () => {
    const url = `${ISSUE}?title=a%20(b%20(c))`;
    expect(transcript.issueUrls(`(${url})`)).toEqual([url]);
  });

  // A DECISION: the template chooser under the form is a way to file too, so it counts.
  it("counts a page UNDER the issue form — the template chooser files by another door", () => {
    const text = `see ${ISSUE}/choose`;
    expect(transcript.issueUrls(text)).toEqual([`${ISSUE}/choose`]);
  });

  it.each([
    "ed-later",
    "bie",
    "_x",
  ])("does not count a path sharing the form's prefix: new%s", (tail) => {
    expect(transcript.issueUrls(`${ISSUE}${tail} is a different page`)).toEqual([]);
  });

  it("reads a URL whose title holds an apostrophe whole, not up to the quote", () => {
    const url = `${ISSUE}?title=Don't%20panic&body=x`;
    expect(transcript.issueUrls(`open ${url} now`)).toEqual([url]);
  });

  // A DECISION: sentence punctuation after a URL is far commoner than a last parameter ending in
  // one, and the category the grader reads is never the verb's last parameter.
  it("peels a full stop off a URL's end, even one its last parameter carried", () => {
    const url = `${ISSUE}?category=doctor&title=Doctor%20is%20fine.`;
    const [read] = transcript.issueUrls(`open ${url} now`);
    expect(read).toBe(url.slice(0, -1));
    expect(new URL(read as string).searchParams.get("category")).toBe("doctor");
  });

  it("peels the closing quote of a shell-quoted URL", () => {
    const url = `${ISSUE}?category=doctor`;
    expect(transcript.issueUrls(`open '${url}'`)).toEqual([url]);
  });
});

describe("transcript.scriptedReplies (case.json reader)", () => {
  function caseDir(manifest: string): string {
    const dir = join(root, "case");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "case.json"), manifest);
    return dir;
  }

  it("is empty for a case that declares no turns", () => {
    expect(transcript.scriptedReplies(caseDir("{}"))).toEqual([]);
  });

  it("reads replies in turn order from the case's own field", () => {
    expect(transcript.scriptedReplies(caseDir('{"turns":{"3":"no","2":"yes"}}'))).toEqual([
      "yes",
      "no",
    ]);
  });

  it.each([
    '"yes"',
    '["yes"]',
    "null",
    '{"2": 7}',
  ])("reads no replies from a turns field of %s — never a string's characters", (turns) => {
    expect(transcript.scriptedReplies(caseDir(`{"turns":${turns}}`))).toEqual([]);
  });
});

describe("case-turns", () => {
  const MANIFEST = "/evals/case.json";

  it.each([
    ["a number", 5],
    ["a boolean", true],
  ])("refuses turns that are %s, not an object", (_label, turns) => {
    expect(() => caseScriptedReplies(MANIFEST, turns)).toThrow(/object keyed by turn number/);
  });

  it.each([
    ["an exponent", { "1e2": "x" }],
    ["a turn past the safe-integer range", { "2": "a", "9007199254740993": "b" }],
  ])("refuses a key that is %s", (_label, turns) => {
    expect(() => caseScriptedReplies(MANIFEST, turns)).toThrow(MANIFEST);
  });
});

function request(overrides: Partial<TurnsRequest> = {}): TurnsRequest {
  return {
    platform: "claude",
    model: "claude-haiku-5-5",
    skill: "narrativetrace-feedback",
    firstPrompt: "report it",
    replies: ["yes"],
    sessionId: SESSION,
    ...overrides,
  };
}

describe("agent-turns session ids", () => {
  it("accepts an upper-case uuid and splices it into both turns", () => {
    const turns = agentTurns(request());
    expect(commandForTurn(turns, 1)).toMatch(new RegExp(`--session-id ${SESSION}$`));
    expect(commandForTurn(turns, 2)).toMatch(new RegExp(`--resume ${SESSION}$`));
  });

  it("refuses a uuid followed by a newline", () => {
    expect(() => agentTurns(request({ sessionId: `${SESSION.toLowerCase()}\n` }))).toThrow(
      /opaque token/,
    );
  });

  it("never leaves the session placeholder in a command the agent is run with", () => {
    const turns = agentTurns(request({ replies: ["a", "b"] }));
    for (const turn of [1, 2, 3]) expect(commandForTurn(turns, turn)).not.toContain("{session}");
  });

  it("refuses an empty override in a multi-turn case, as it refuses any override", () => {
    expect(() => agentTurns(request({ override: "" }))).toThrow(/one --agent-command/);
  });

  it("runs the single-turn preset, not a session flag, for a case with no replies", () => {
    expect(commandForTurn(agentTurns(request({ replies: [] })), 1)).toBe(
      presetAgentCommand("claude", "claude-haiku-5-5", "narrativetrace-feedback"),
    );
  });
});

describe("case-setup closure over workspace packages", () => {
  const manifests: Record<string, unknown> = {};
  const readJson = (path: string): unknown => {
    const found = manifests[path];
    if (found === undefined) throw new Error(`ENOENT ${path}`);
    return found;
  };
  const add = (short: string, body: Record<string, unknown>) => {
    manifests[`/repo/packages/${short}/package.json`] = {
      name: `@narrativetrace/${short}`,
      version: "0.2.0",
      ...body,
    };
  };

  it("terminates on a package that depends on itself and lists it once", () => {
    add("core", { dependencies: { "@narrativetrace/core": "workspace:*" } });
    const found = checkoutPackages(
      { dependencies: { "@narrativetrace/core": "latest" } },
      "/repo",
      readJson,
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/core"]);
  });

  it("terminates on a cycle between two packages and returns each once", () => {
    add("core", { dependencies: { "@narrativetrace/tooling": "workspace:*" } });
    add("tooling", { peerDependencies: { "@narrativetrace/core": "workspace:*" } });
    const found = checkoutPackages(
      { dependencies: { "@narrativetrace/core": "latest" } },
      "/repo",
      readJson,
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/core", "@narrativetrace/tooling"]);
  });

  it("lists a package named in both dependencies and devDependencies once", () => {
    add("core", {});
    const fixture = {
      dependencies: { "@narrativetrace/core": "latest" },
      devDependencies: { "@narrativetrace/core": "latest" },
    };
    expect(checkoutPackages(fixture, "/repo", readJson)).toHaveLength(1);
  });

  it("does not mistake a scope that merely shares the prefix for a NarrativeTrace package", () => {
    expect(() =>
      checkoutPackages({ dependencies: { "@narrativetraces/core": "latest" } }, "/repo", readJson),
    ).toThrow(/declares no @narrativetrace\/\* package/);
  });

  it("refuses a package whose manifest has no version, not an install of 'undefined'", () => {
    manifests["/repo/packages/core/package.json"] = { name: "@narrativetrace/core" };
    expect(() =>
      checkoutPackages({ dependencies: { "@narrativetrace/core": "latest" } }, "/repo", readJson),
    ).toThrow(/version/);
  });

  it("passes the packed tarball list to the one npm install, sorted by name", () => {
    add("core", {});
    add("tooling", {});
    const found = checkoutPackages(
      { dependencies: { "@narrativetrace/tooling": "latest", "@narrativetrace/core": "latest" } },
      "/repo",
      readJson,
    );
    const install = setupCommands(found, "/work", "/scratch", "claude")[2];
    expect(install?.argv.slice(-2)).toEqual([
      "/work/packages/narrativetrace-core-0.2.0.tgz",
      "/work/packages/narrativetrace-tooling-0.2.0.tgz",
    ]);
  });
});
