// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Rewrites an absolute home directory to `~` — the one normalisation a draft performs before the
 * gate reads anything.
 *
 * INTENT: a home path names the account it belongs to, and a problem report is full of them because
 * that is where people's projects live. Refusing the report would be the wrong answer to a mistake
 * nobody made on purpose; `~` says the same thing about the same file and names nobody. So this
 * runs FIRST, and the `vf.home-path` rule is left as the backstop for a form this cannot normalise
 * — a UNC share, or a path typed into the body file after the draft was shown.
 *
 * @llmNote `/home` with nothing after it is NOT a home directory, and neither is `/usr/share/ada`:
 * the account segment has to be present and has to follow one of the three platform roots. A
 * rewrite that was eager here would turn an ordinary path into `~` and make the report wrong
 * instead of safe.
 */

/**
 * The three platform roots followed by exactly one account segment, each at a place a root can
 * actually begin.
 *
 * @llmNote The global flag is required, not incidental: a report names a path in nearly every
 * sentence, so `/home/ada/a and /Users/bo/b` has to become `~/a and ~/b` in one pass.
 *
 * @llmNote The lookbehind is what stops the global flag from rewriting a root that is INSIDE a path
 * it already rewrote. Without it, `/home/ada/home/bob/file` became `~~/file`: the scan matched
 * `/home/ada`, then matched `/home/bob` again and lost the directory names between them. A root
 * preceded by a word character, a backslash or a tilde is a directory that merely happens to be
 * called `home` or `Users` — `build/home/ada`, `~/home/ada` — and is left alone. A root preceded by
 * `/` still matches, because `file:///home/ada/x` is a real thing a report quotes.
 */
const HOME = /(?<![\w\\~])(?:(?:\/Users\/|\/home\/)[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/gi;

/**
 * The text with every home directory replaced by `~`.
 *
 * @throws TypeError when `text` is not a string — an absent field is `""`.
 */
export function toTilde(text: string): string {
  if (typeof text !== "string") {
    throw new TypeError('the rewriter reads text, never null — an absent field is ""');
  }
  return text.replace(HOME, "~");
}
