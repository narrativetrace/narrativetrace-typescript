// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Turns a `--agent-command` template (`platform-presets.ts`'s default, or an explicit override)
 * into an argv array — the fix for the shell-injection defect the first real trial surfaced
 * (2026-09-13): the old runner built `${command}`.replace("{prompt}", prompt)` and ran the result
 * through `sh -c`, so a backtick, `$(...)`, or quote character *inside the prompt* was parsed as
 * shell syntax before the agent ever saw it. The prompt must never reach a shell parser.
 *
 * The template is tokenised shell-style (whitespace-separated, a `"..."` or `'...'` span kept as
 * one token with its quotes stripped) and the literal `{prompt}` token is replaced with the raw
 * prompt text as a single argv element — never by substituting into a string that is then handed
 * to a shell. `execFileSync(argv[0], argv.slice(1))` (no `shell: true`) is what makes this safe:
 * argv elements are passed to the process directly, so nothing in the prompt is ever re-parsed.
 */

const TOKEN_PATTERN = /"([^"]*)"|'([^']*)'|(\S+)/g;

/** Splits `template` on unquoted whitespace; a `"..."`/`'...'` span becomes one token, unquoted. */
export function tokenizeCommandTemplate(template: string): readonly string[] {
  const tokens: string[] = [];
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    // One of the three alternatives always matches (that's what "|" between them guarantees), so
    // this is a type-narrowing cast, not a runtime fallback — there is no fourth, unreachable case.
    tokens.push((match[1] ?? match[2] ?? match[3]) as string);
  }
  return tokens;
}

/**
 * Tokenises `template` and substitutes `prompt` verbatim into the token that is exactly
 * `{prompt}` (however it was quoted in the template) — per-argv-element, never by string-splicing
 * into a shell line. A template with no `{prompt}` token is returned unchanged (matches the old
 * `.replace()`'s silent no-op when the placeholder is absent).
 */
export function buildAgentArgv(template: string, prompt: string): readonly string[] {
  return tokenizeCommandTemplate(template).map((token) => (token === "{prompt}" ? prompt : token));
}
