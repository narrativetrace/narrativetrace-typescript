// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { registryEnv } from "./isolated-agent-config.js";

/**
 * INTENT: the environment every command of one trial runs with, and the evidence a grader reads
 * afterwards — the transcript, the recording `gh` and `curl` stand-ins, and their log.
 *
 * All of it lives in the trial's WORK directory, outside the scaffolded project. That is the whole
 * point: the agent cannot read what it is graded on and cannot write it either, so a transcript is
 * evidence rather than something the subject produced about itself. Only the grader is told where
 * the two files are ({@link graderEnvironment}); the agent's own environment never names them.
 *
 * @llmNote The stand-ins are installed on EVERY trial's PATH, not only the feedback cases'. `gh`
 * being merely absent makes "the agent tried to file an issue" and "the agent did not try" the same
 * observation — `command not found` says nothing about intent, and intent is what an approval gate
 * measures — and with them in place no trial can file anything or reach a network, whatever an
 * agent decides to run. Both commands are outside every skill's closed vocabulary by ruling, so
 * nothing a skill legitimately instructs loses anything by it.
 *
 * @sideEffects {@link installStandIns} creates the work directory and writes one executable per
 * blocked command; {@link recordUserTurn} appends to the transcript; {@link keepEvidence} copies.
 */

/** The one host the `curl` stand-in hands to the real curl: the published site. */
export const SERVED_HOST = "narrativetrace.ai";

/**
 * Each blocked command and the exit code its stand-in answers. `gh` exits 0: the point is to record
 * that the agent tried to FILE, so it behaves as if that worked and files nothing. `curl` exits 6,
 * curl's own "could not resolve host" — the truthful answer from a sandbox with no network, where 0
 * with empty output would read as "that page is empty" and send the agent down a wrong path.
 */
const BLOCKED_COMMANDS: Readonly<Record<string, number>> = { gh: 0, curl: 6 };

/** What the grader is told, and the agent is not. */
const TRANSCRIPT_VARIABLE = "NARRATIVETRACE_TRANSCRIPT";
const BLOCKED_LOG_VARIABLE = "NARRATIVETRACE_GH_LOG";

/** Where the stand-ins live: first on the agent's PATH, inside the work directory. */
export function standInDir(workDir: string): string {
  return join(workDir, "bin");
}

/** Every turn's prompt and the agent's own standard output, in order. */
export function transcriptPath(workDir: string): string {
  return join(workDir, "transcript.jsonl");
}

/**
 * One line per invocation of a blocked command, argv included — `gh` and `curl` in the same file,
 * so "what did this trial try to reach?" is one place to look. The name keeps `gh` because the
 * graders' variable does: "was anything filed?" reads the right file under either name.
 */
export function blockedInvocationsLog(workDir: string): string {
  return join(workDir, "gh-invocations.log");
}

/** The stub embeds its log path in a POSIX single-quoted string, which one quote would end. */
function requireQuotable(path: string): void {
  if (path.includes("'")) {
    throw new Error(
      `a trial's work directory may not carry a ' — the stand-ins quote their log path: ${path}`,
    );
  }
}

/**
 * Writes the `gh` and `curl` stand-ins into {@link standInDir}, creating the work directory.
 *
 * @throws {Error} when the work directory's path could break out of the stub's own quoting.
 */
export function installStandIns(workDir: string): void {
  requireQuotable(workDir);
  mkdirSync(standInDir(workDir), { recursive: true });
  for (const [name, exitCode] of Object.entries(BLOCKED_COMMANDS)) {
    const stub = join(standInDir(workDir), name);
    writeFileSync(stub, standInScript(name, exitCode, blockedInvocationsLog(workDir)));
    chmodSync(stub, 0o755);
  }
}

/**
 * A recording stand-in: it writes its argv on ONE line — so a grader can count invocations and
 * search them for a planted value — and does nothing else, except `curl` for {@link SERVED_HOST}.
 * A line break inside an argument is written as the two characters `\n` (shell builtins only), so
 * a multi-line `--body` is still one invocation on one line.
 */
function standInScript(name: string, exitCode: number, log: string): string {
  return [
    "#!/bin/sh",
    `# A recording stand-in for \`${name}\`, installed first on this trial's PATH by the eval`,
    "# runner. It records its argv so that 'the agent tried to' is distinguishable from 'it did",
    "# not', which the command merely being absent is not — and so no trial files an issue.",
    "nl='",
    "'",
    "{",
    `  printf '${name}'`,
    '  for arg in "$@"; do',
    `    while :; do case "$arg" in *"$nl"*) arg="\${arg%%"$nl"*}\\\\n\${arg#*"$nl"}" ;; *) break ;; esac; done`,
    "    printf ' %s' \"$arg\"",
    "  done",
    "  printf '\\n'",
    `} >> '${log}'`,
    name === "curl" ? curlTail(exitCode) : `exit ${exitCode}`,
    "",
  ].join("\n");
}

/**
 * The curl stand-in's tail. The published site is served because reading `llms.txt` is the
 * product's own first instruction: on 2026-10-08 the reference implementation's Haiku 5.5 trials
 * refused a summarising page tool, reached for curl, met exit 6 six times out of six and stopped —
 * a harness verdict, not a product one.
 *
 * @llmNote STRICTER than the reference's rule, which inspects only arguments spelled `http(s)://`
 * and so passes a mixed invocation to the real curl when the foreign half is a scheme-less host
 * (`x.io`, which curl reads as a URL), an upper-case scheme, `--url=`, a proxy, `--resolve` or a
 * config file. Here EVERY argument must be a flag, a served URL, or the value of an option known to
 * name no host (`-o`, `-H`, `--max-time`, ...); anything else answers 6. Shell builtins only, with
 * a recursion guard: a trial's PATH may hold no `dirname`, and a stand-in that cannot tell its own
 * file apart from the real curl would exec itself without end.
 */
function curlTail(exitCode: number): string {
  return [...servedRequestCheck(exitCode), ...execTheRealCurl(exitCode)].join("\n");
}

/** Sets `served=1` only when every argument is harmless and at least one is the served host. */
function servedRequestCheck(exitCode: number): string[] {
  const host = SERVED_HOST;
  return [
    "served=0",
    "value=0",
    'for arg in "$@"; do',
    '  if [ "$value" = 1 ]; then value=0; continue; fi',
    '  case "$arg" in',
    `    http://${host}|http://${host}/*|https://${host}|https://${host}/*) served=1 ;;`,
    "    -o|--output|-m|--max-time|--connect-timeout|-H|--header|-A|--user-agent|-w|--write-out|--retry) value=1 ;;",
    `    --url*|--proxy*|--preproxy*|--resolve*|--connect-to*|--config*|--next|--socks*) exit ${exitCode} ;;`,
    "    --*) ;;",
    `    -*[xK:]*) exit ${exitCode} ;;`,
    "    -*[omHAw]) value=1 ;;",
    "    -*) ;;",
    `    *) exit ${exitCode} ;;`,
    "  esac",
    "done",
    `[ "$served" = 1 ] || exit ${exitCode}`,
  ];
}

/** Hands the request to the first curl on PATH that is not a stand-in, or answers `exitCode`. */
function execTheRealCurl(exitCode: number): string[] {
  return [
    `[ -n "$NARRATIVETRACE_CURL_STANDIN" ] && exit ${exitCode}`,
    "export NARRATIVETRACE_CURL_STANDIN=1",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion — the stand-in's own directory, without dirname
    "self=${0%/*}",
    "set -f",
    "IFS=:",
    "for dir in $PATH; do",
    '  [ "$dir" = "$self" ] && continue',
    '  [ "$dir/curl" -ef "$0" ] && continue',
    '  [ -x "$dir/curl" ] && exec "$dir/curl" "$@"',
    "done",
    `exit ${exitCode}`,
  ];
}

/**
 * What every agent turn runs with: the stand-ins first on PATH, and the trial's own throwaway
 * vendor configuration (`isolated-agent-config.ts`) — on EVERY trial, because a configuration wider
 * than the product measures the operator's machine, and one narrower measures the sandbox.
 */
export function agentEnvironment(workDir: string, ambientPath: string): Record<string, string> {
  return { ...registryEnv(workDir), PATH: `${standInDir(workDir)}:${ambientPath}` };
}

/** The agent's environment plus the two things only the grader may know: where the evidence is. */
export function graderEnvironment(workDir: string, ambientPath: string): Record<string, string> {
  return {
    ...agentEnvironment(workDir, ambientPath),
    [TRANSCRIPT_VARIABLE]: transcriptPath(workDir),
    [BLOCKED_LOG_VARIABLE]: blockedInvocationsLog(workDir),
  };
}

/**
 * Marks the start of `turn` in the transcript with the words the user is given there, as one JSON
 * line whatever the text carries. Every agent line after it and before the next marker belongs to
 * that turn, and a grader compares against the reply actually scripted rather than a copy of it.
 */
export function recordUserTurn(workDir: string, turn: number, text: string): void {
  mkdirSync(workDir, { recursive: true });
  const marker = JSON.stringify({ nt_turn: turn, role: "user", text });
  appendFileSync(transcriptPath(workDir), `${marker}\n`);
}

/**
 * Copies whatever evidence the trial produced into `destination`. The work directory is deleted
 * when the trial ends whatever the outcome — right for a pass, useless for a fail, whose record a
 * red row nobody can diagnose would otherwise lose along with the request it cost.
 *
 * @sideEffects creates `destination`; replaces at most the transcript and the blocked-command log
 * there, removing either one this trial did not produce.
 */
export function keepEvidence(workDir: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const evidence of [transcriptPath(workDir), blockedInvocationsLog(workDir)]) {
    const kept = join(destination, basename(evidence));
    // Never a stale record beside this trial's: a log an earlier trial left there would read as
    // "this trial ran gh" when it ran nothing.
    rmSync(kept, { force: true });
    if (existsSync(evidence)) copyFileSync(evidence, kept);
  }
}
