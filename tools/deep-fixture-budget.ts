// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A vitest `test(`/`it(` call site: repo-relative POSIX path, 1-indexed line of the call, the
 * test's own name (its first argument), whether it already declares a third (timeout) argument,
 * and the raw text of its callback (second argument) — the only span this module ever pattern-
 * matches against, so a fixture-shaped literal in the test *name* can never trigger a false hit.
 */
interface CallSite {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly hasTimeout: boolean;
  readonly bodyText: string;
}

export interface DeepFixtureViolation {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

/** A named, reasoned exception — never a whole file, always one test by name (mirrors
 * `comment-hygiene`'s per-file allowlist, scoped per-test here since a file can hold both a
 * flagged and an excused test). */
export interface DeepFixtureAllowlistEntry {
  readonly file: string;
  readonly testName: string;
  readonly reason: string;
}

export interface DeepFixtureLintResult {
  /** Violations outside the allowlist — a red gate: `pnpm run check` must fail on these. */
  readonly violations: readonly DeepFixtureViolation[];
  /** Allowlist entries naming a test that no longer matches any current hit — meant to shrink
   * as a fixture is fixed or removed, never to accumulate dead entries nobody has to remove. */
  readonly staleAllowlistEntries: readonly DeepFixtureAllowlistEntry[];
}

/** If `source[i]` starts a `//`/`/* … * /`-comment or a string/template literal, returns the index
 * just past it; otherwise returns `i` unchanged. Every scanner below calls this first so brackets
 * and commas inside comments, strings, and template literals never miscount depth. */
function skipNonCode(source: string, i: number): number {
  const ch = source[i];
  if (ch === "/" && source[i + 1] === "/") {
    const nl = source.indexOf("\n", i);
    return nl === -1 ? source.length : nl;
  }
  if (ch === "/" && source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (ch === '"' || ch === "'") return skipQuoted(source, i, ch);
  if (ch === "`") return skipTemplate(source, i);
  return i;
}

function skipQuoted(source: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < source.length && source[j] !== quote) {
    j += source[j] === "\\" ? 2 : 1;
  }
  return j + 1;
}

function skipTemplate(source: string, i: number): number {
  let j = i + 1;
  let exprDepth = 0;
  while (j < source.length) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    if (source[j] === "`" && exprDepth === 0) return j + 1;
    if (source[j] === "$" && source[j + 1] === "{") {
      exprDepth++;
      j += 2;
      continue;
    }
    if (source[j] === "}" && exprDepth > 0) {
      exprDepth--;
      j++;
      continue;
    }
    j++;
  }
  return j;
}

/** Index of the bracket matching `source[openIndex]` (one of `( { [`), skipping over comments
 * and string/template literals so nested brackets inside them never miscount depth. -1 if
 * unmatched (malformed input — callers treat that call site as unparseable and skip it). */
function matchingBracket(source: string, openIndex: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const openChar = source[openIndex];
  const closeChar = pairs[openChar];
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    const skipped = skipNonCode(source, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Top-level comma-separated arguments of a call's inner text (between its outer parens),
 * skipping commas nested inside brackets, strings, and template literals. */
function splitTopLevelArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < inner.length) {
    const skipped = skipNonCode(inner, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = inner[i];
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      args.push(inner.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  if (inner.slice(start).trim()) args.push(inner.slice(start));
  return args.map((a) => a.trim());
}

const CALL_HEAD = /(?<![.\w$])(?:test|it)\(/g;

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

/** The test's display name from its raw first argument — the quotes off a plain string literal,
 * or the argument text itself for anything else (a template literal, a computed name). */
function extractName(firstArg: string): string {
  const m = firstArg.trim().match(/^(["'`])((?:(?!\1).)*)\1$/s);
  return m ? m[2] : firstArg.trim();
}

/** Every `test(`/`it(` call in `source`, each paired with its own callback text — the unit every
 * other check in this module reasons about. Skips a call whose parens don't balance (malformed
 * input) or that has fewer than two arguments (not a real test body, e.g. a bare declaration). */
function callSites(source: string, file: string): CallSite[] {
  const sites: CallSite[] = [];
  for (const m of source.matchAll(CALL_HEAD)) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchingBracket(source, openParen);
    if (closeParen === -1) continue;
    const args = splitTopLevelArgs(source.slice(openParen + 1, closeParen));
    if (args.length < 2) continue;
    sites.push({
      file,
      line: lineOf(source, m.index),
      name: extractName(args[0]),
      hasTimeout: args.length >= 3,
      bodyText: args[1],
    });
  }
  return sites;
}

/** Known fixture-builder helpers this suite's deep-chain tests call directly, each local to the
 * `.test.ts` file that defines it: `deepChain`/`deepChainJson` (a `TraceNode`/JSON chain),
 * `chain` (a plain nested-object chain), `documentNesting` (a nested glossary JSON document). */
const BUILDER_CALL =
  /\b(?:deepChain|deepChainJson|chain|documentNesting)\s*\(\s*(?:50_000|10_000)\b/;

const ACCUMULATING_LOOP =
  /for\s*\(\s*let\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(?:50_000|10_000)\s*;\s*\w+\+\+\s*\)/g;

function loopStatementText(source: string, from: number): string {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "{") {
    const end = source.indexOf(";", i);
    return end === -1 ? source.slice(i) : source.slice(i, end + 1);
  }
  const close = matchingBracket(source, i);
  return close === -1 ? source.slice(i) : source.slice(i, close + 1);
}

/** True if `stmt` reassigns a variable to a call that also references that same variable among
 * its own arguments — the chain-growing shape every raw-loop fixture in this suite uses
 * (`root = node(..., [root])`, `node = traceNode(..., [node])`). A loop that just calls a method
 * 50,000 times with no such self-reference (`walk.enter({})`) never matches: it isn't a growing
 * fixture, just a bounded number of cheap calls. */
function isSelfAccumulating(stmt: string): boolean {
  const assign = stmt.match(/(\w+)\s*=\s*[\w$]+\(/);
  if (!assign) return false;
  const varName = assign[1];
  const rest = stmt.slice((assign.index ?? 0) + assign[0].length);
  return new RegExp(`\\b${varName}\\b`).test(rest);
}

/** A `for` loop bounded at 50,000 or 10,000 whose body grows a chain by self-reassignment — see
 * {@link isSelfAccumulating}. Catches the raw-loop fixtures the named-builder pattern above
 * can't (`tree-walk.test.ts`'s and `glossary-suite-accumulator.test.ts`'s own chain loops). */
function hasAccumulatingLoop(bodyText: string): boolean {
  for (const m of bodyText.matchAll(ACCUMULATING_LOOP)) {
    const stmt = loopStatementText(bodyText, m.index + m[0].length);
    if (isSelfAccumulating(stmt)) return true;
  }
  return false;
}

/** `source` with every comment and string/template literal blanked out — real code structure
 * (parens, braces, identifiers, numeric literals) survives untouched, positioned exactly as it
 * was, but a fixture-shaped literal quoted as *data* (a test's own expected-output string, or —
 * this module's own test suite — a fixture file's source text written as a string) can never be
 * mistaken for the code that builds one. */
function codeOnly(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const skipped = skipNonCode(source, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    out += source[i];
    i++;
  }
  return out;
}

/** True if a test's callback builds a 50,000- or 10,000-node chain/tree fixture — via a known
 * builder call or a raw accumulating loop — the class of test this whole module budgets. Only
 * ever reasons about {@link codeOnly} text, never the callback's raw source. */
function isDeepFixtureBody(bodyText: string): boolean {
  const code = codeOnly(bodyText);
  return BUILDER_CALL.test(code) || hasAccumulatingLoop(code);
}

const EXCLUDED_DIR = /^(?:node_modules|dist|\.stryker-tmp|coverage|\.git|\.turbo)$/;

/** Every `*.test.ts` file under `repoRoot`, any depth, excluding build/tooling noise dirs and
 * `*.stress.test.ts` — the stress suite budgets itself via `NARRATIVETRACE_STRESS_BUDGET_SECONDS`
 * on a wholly separate turbo task (see `turbo.json`'s `stress` task), never a vitest per-test
 * timeout, so a literal 50,000/10,000 there is never this guard's concern. */
function testFiles(repoRoot: string, dir: string, files: string[]): void {
  for (const name of readdirSync(dir)) {
    if (EXCLUDED_DIR.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) testFiles(repoRoot, full, files);
    else if (name.endsWith(".test.ts") && !name.endsWith(".stress.test.ts")) files.push(full);
  }
}

function allSites(repoRoot: string): CallSite[] {
  const files: string[] = [];
  testFiles(repoRoot, repoRoot, files);
  const sites: CallSite[] = [];
  for (const file of files.sort()) {
    const rel = relative(repoRoot, file);
    sites.push(...callSites(readFileSync(file, "utf-8"), rel));
  }
  return sites;
}

function allowlistKey(file: string, testName: string): string {
  return `${file} ${testName}`;
}

/**
 * Lints every `*.test.ts` file under `repoRoot` for a `test(`/`it(` that builds a 50,000- or
 * 10,000-node chain/tree fixture (see {@link isDeepFixtureBody}) yet declares no third (timeout)
 * argument, excusing exactly the `(file, testName)` pairs named in `allowlist` — each with a
 * human reason, enforced by the caller, never read here. An allowlisted test with no current hit
 * is flagged too (`staleAllowlistEntries`): the allowlist shrinks as each fixture gets its own
 * budget, it never accumulates entries nobody has to remove.
 */
export function lint(
  repoRoot: string,
  allowlist: readonly DeepFixtureAllowlistEntry[],
): DeepFixtureLintResult {
  const flagged = allSites(repoRoot).filter((s) => !s.hasTimeout && isDeepFixtureBody(s.bodyText));
  const allowed = new Set(allowlist.map((e) => allowlistKey(e.file, e.testName)));
  const flaggedKeys = new Set(flagged.map((s) => allowlistKey(s.file, s.name)));
  return {
    violations: flagged
      .filter((s) => !allowed.has(allowlistKey(s.file, s.name)))
      .map(({ file, line, name }) => ({ file, line, name })),
    staleAllowlistEntries: allowlist.filter(
      (e) => !flaggedKeys.has(allowlistKey(e.file, e.testName)),
    ),
  };
}
