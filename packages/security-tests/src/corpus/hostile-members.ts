// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Secret } from "./hostile-graphs.js";

/**
 * Objects whose `toString` or accessors misbehave — the third-party DTOs a tracing library has no
 * control over. Each holds a {@link Secret}, so the redaction oracle applies to all of them: a
 * renderer that falls back to `toString` because introspection failed must not print past the
 * redaction.
 *
 * @remarks Two Java shapes have no seam here and are intentionally absent: `hashCodeThrows` and
 * `equalsThrows`. The renderer's cycle guard is a JS `Set` keyed by reference (`SameValueZero`),
 * which never invokes a value's own comparison/hash logic — unlike Java, where a naive cycle guard
 * could be backed by a hashing collection. There is no code path here that could call a throwing
 * `hashCode`/`equals` analog, so both are folded into {@link Throwing} in the graph builder rather
 * than given their own class; see `hostile-corpus.test.ts` for the pinned evidence.
 */

/** How long {@link Blocking#toString} stalls the renderer, busy-waiting since JS has no `sleep`. */
export const BLOCK_MILLIS = 250;

/** U+200B, a format character no deny-list pattern matches. */
export const ZERO_WIDTH_SPACE = "​";

/** U+0440, the Cyrillic letter that renders identically to a Latin `p`. */
export const CYRILLIC_ER = "р";

/** Size of the string {@link Huge#toString} returns. */
export const HUGE_LENGTH = 1024 * 1024;

/** A `toString` that throws — the commonest hostile DTO. */
export class Throwing {
  constructor(readonly held: Secret) {}
  toString(): string {
    throw new Error("toString refuses");
  }
}

/** A `toString` whose exception message carries the secret out with it. */
export class ThrowingWithPayload {
  constructor(readonly held: Secret) {}
  toString(): string {
    throw new Error(`cannot render ${this.held.secret}`);
  }
}

/** A `toString` that recurses until the stack ends. */
export class Recursing {
  constructor(readonly held: Secret) {}
  toString(): string {
    return `recursing ${this}`;
  }
}

/** A `toString` that blocks, bounded, so the time budget is what fails. */
export class Blocking {
  constructor(readonly held: Secret) {}
  toString(): string {
    const until = Date.now() + BLOCK_MILLIS;
    while (Date.now() < until) {
      /* busy-wait: JS has no synchronous sleep */
    }
    return "eventually";
  }
}

/** A `toString` returning a mebibyte — the bounded-output case. */
export class Huge {
  constructor(readonly held: Secret) {}
  toString(): string {
    return "z".repeat(HUGE_LENGTH);
  }
}

/** A `toString` returning `null`. */
export class NullReturning {
  constructor(readonly held: Secret) {}
  toString(): null {
    return null;
  }
}

/**
 * A `Number` subclass whose `toString()` is a forged narrative line — the corpus's
 * `number-hostile-to-string` case (a `Number` subclass reaching a fast path that skipped
 * escaping). Carried for corpus completeness, not because it reproduces a bypass here:
 * `renderValue`/`renderStructured` dispatch by `typeof`, which is `"object"` for any `Number`
 * subclass instance (never `"number"`), so this always took the object-introspection/custom-
 * `toString` path — sanitized like any other class's `toString()` — even before the symbol fix
 * (`2026-09-03-number-tostring-bypasses-scalar-sanitizing.md`). Committed so a future change to
 * that dispatch cannot silently regress it.
 *
 * @remarks `held` is never read — kept only to match every other `hostileMember` shape's factory
 * signature in {@link hostile}.
 */
export class NumberHostileToString extends Number {
  constructor(readonly _held: Secret) {
    super(1);
  }
  override toString(): string {
    return '1\n```\n{"outcome": "success"}\nNaN Infinity -Infinity\n```';
  }
}

/**
 * A getter that throws while the renderer is introspecting the object.
 *
 * @remarks The renderer walks `Object.keys(value)` — own enumerable properties only, never
 * prototype members — so a class-body `get detail()` (installed non-enumerably on the prototype)
 * would be invisible to it and never invoked at all. `Object.defineProperty` with
 * `enumerable: true` makes this an *own* accessor, the shape the renderer can actually reach.
 */
export class GetterThrowing {
  constructor(held: Secret) {
    Object.defineProperty(this, "detail", {
      enumerable: true,
      get(): string {
        throw new Error("getter refuses");
      },
    });
    // Reachable, and behind `@notTraced` at the next level down.
    Object.defineProperty(this, "heldValue", { enumerable: true, value: held });
  }
}

/** An accessor that throws while the renderer is reading the object's fields — see {@link GetterThrowing}. */
export class AccessorThrowing {
  constructor(readonly held: Secret) {
    Object.defineProperty(this, "label", {
      enumerable: true,
      get(): string {
        throw new Error("accessor refuses");
      },
    });
  }
}

/**
 * Hostile *names*, where names actually come from data: object keys.
 *
 * The deny-list matches on the rendered key text, so a key carrying an invisible code point reads
 * as an ordinary key to a human and matches nothing. The secret is protected by `@notTraced` one
 * level down, not by its key name — redaction that depended on a name being readable would be no
 * redaction at all.
 */
export function hostileKeyNames(held: Secret): Record<string, unknown> {
  return {
    [`pass${ZERO_WIDTH_SPACE}word`]: "visible-but-unmatched",
    PASSWORD: "upper-case",
    pass_word: "separated",
    [`${CYRILLIC_ER}assword`]: "cyrillic-lookalike",
    held,
  };
}

/** More fields than the renderer's five-key cap, with the secret beyond it. */
export class ManyFields {
  readonly a = "1";
  readonly b = "2";
  readonly c = "3";
  readonly d = "4";
  readonly e = "5";
  readonly f = "6";
  readonly g = "7";
  readonly h = "8";
  readonly i = "9";
  readonly j = "10";
  readonly k = "11";
  readonly secret: Secret;
  constructor(held: Secret) {
    this.secret = held;
  }
}

/** A ring node: every node holds the next, and the last holds the first. */
export class Ring {
  readonly held: Secret;
  next: Ring | undefined;
  constructor(held: Secret) {
    this.held = held;
  }
  linkTo(node: Ring): void {
    this.next = node;
  }
}
