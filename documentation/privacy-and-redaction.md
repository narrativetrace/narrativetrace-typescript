# Privacy and redaction

This library runs inside your process and writes files your team will
share — test artifacts, CI output, production log lines. This page is the
row-by-row version of that contract: what redacts, where it does and does
not reach, and what NarrativeTrace guarantees versus what it does not claim
at all. Verified line-by-line against the code on 2026-09-02, not inferred from the docs.

## Redaction, surface by surface

| Surface | Can disable built-in redaction? |
|---|---|
| `traceObject()` (proxy) — the one capture path every integration below is built on | No |
| Vitest fixture (`createNarrativeTest`/`narrativeTest`) | No |
| Express / Hono / NestJS middleware | No |
| Angular / React integrations | No |
| A custom call to `renderValue()`/`renderStructured()` your own code makes directly | Yes — only by passing `{ redactionPolicy: RedactionPolicy.DISABLED }` explicitly, and even then `@notTraced`/`static notTraced` still redact (see below) |
| `@notTraced` / `static notTraced` | Not applicable — it is the thing doing the redacting, and it always wins, on every surface, including a `RedactionPolicy.DISABLED` renderer |

Verified against the code, not inferred: `traceObject()` — the single
capture path every shipped integration (`express`, `hono`, `nestjs`,
`angular`, `react`, `vitest`, …) is built on — never threads a
`redactionPolicy` option through from the caller. The `redactionPolicy`
option exists only on the low-level rendering functions
(`renderValue`/`renderStructured` in `@narrativetrace/core`), which none of
the shipped integrations expose a way to override. The only way to reach
`RedactionPolicy.DISABLED` is application code calling those functions
directly — a deliberate, reviewable act in your own source, never a
configuration flag or environment variable a deploy can flip.

## What redacts, and what outranks what

Three independent mechanisms apply to every captured/rendered value:

1. **`@notTraced(i)`** on a method parameter — the *caller*
   (`traceObject`'s value-map builder) substitutes the `[REDACTED]` marker
   before a narration/error template ever resolves, so the template
   resolver never holds the secret for this surface.
2. **`static notTraced = [...]`** on a class — field-name redaction for
   object introspection and for `{param.property}` template paths. This
   check is independent of which `RedactionPolicy` is active: the "was this
   member explicitly annotated" answer is computed from the class itself,
   then combined as `annotated || nameMatchesDenyList`, so an explicit
   annotation redacts even under a policy that has every name pattern and
   value-shape check turned off.
3. **The name-based deny-list** (`RedactionPolicy.DEFAULT`) — a case- and
   accent-insensitive substring match against field names (`password`,
   `secret`, `token`, `apikey`, `cvv`, `ssn`, `authorization`, `credential`,
   `cardnumber`, `jwt`, `cookie`, `sessionid`, `accountnumber`,
   `routingnumber`, `pan`, `iban`, and their `snake_case` spellings), plus a
   second, independent check on the *shape* of the value itself — a JWT
   (`eyJ…`), a Luhn-valid card number, or a `Set-Cookie`-shaped string — so
   an unnamed value (a list item, a map value) or a bearer token under an
   unrecognized name is still caught. The default vocabulary is
   **multilingual and always on** (the family standard, shared with the
   other NarrativeTrace runtimes): Spanish (`contraseña`, `tarjeta`,
   `cédula`, `claveAcceso`, `rut`, `cuit`, `dni`), Portuguese (`senha`,
   `cartão`, `cpf`, `cnpj`), French (`motDePasse`, `carteBancaire`, `nir`)
   and Chinese (`密码`, `身份证`, plus the pinyin `mima`/`shenfenzheng`) sit
   beside the English patterns, with no locale to select — accented and
   unaccented spellings fold to one pattern. `"companyName"`/`"panelId"` do
   not match `pan` — the ten patterns most prone to false positives (`pan`,
   `iban`, `rut`, `cuit`, `dni`, `senha`, `cpf`, `cnpj`, `nir`, `mima`)
   match on identifier-token boundaries, not bare substring, so
   `truthValue`, `circuitBreaker`, `chosenHash` and `semiMajorAxis` stay
   visible while `rutCliente` and `senhaUsuario` are hidden.

A **curated `toString()`** is normally trusted as written — but a class that
declares any `static notTraced` field is introspected field-by-field
instead, so the annotation is honored over whatever that `toString()` would
have printed. Template resolution does not get a shortcut around this
either: it was audited to make sure it never falls back to a value's raw
`toString()` when the safe rendering happened to omit the marker for an
unrelated reason (truncation at the field/depth cap) — every non-scalar
placeholder value goes through the same field-redacting renderer the rest of
the trace uses, unconditionally.

Redaction also **survives nesting** — a redacted member inside an array, a
`Set`, a `Map`, a plain object, several of those stacked, and a
self-referential cycle are all pinned by test
(`redacted-value-containment.test.ts`). And it **wins over a narration
template that names it**: `{param.property}` in `@narrated`/`@onError`
resolves a path to a redacted member as `[REDACTED]`, never the literal
value — pinned end-to-end through the real capture path, including the
"whole-object placeholder, default field dump" shape specifically (no
custom `toString()` on the object at all).

Full detail and worked examples:
[Decorators Guide § `@notTraced`](decorators-guide.md#nottraced).

## Guarantees

- **Tracing failures are isolated from host execution.** Capture is
  best-effort by construction: any failure while resolving names, rendering
  parameters, or entering a span degrades to an untraced call rather than
  ever blocking or failing the business method (`trace-object.ts`'s own
  "no-poison contract"). A throwing custom `toString()`, a throwing getter
  named in a template, or a full buffer never changes what your method
  returns or throws.
- **Every shipped integration honors redaction.** See the table above — no
  integration exposes a way around it.
- **The buffered analysis path may shed events, but it always reports
  loss.** It never blocks the caller and never grows past its bound (a
  fixed-size ring, `8,192` events by default in the Vitest fixture, higher
  in a long-lived process — see
  [Configuration Guide § 8](configuration-guide.md#8-event-pipeline-buffering-bufferedeventconsumer)).
  A capture that lost events prints the count and what to raise the
  capacity to, in its own footer.

## Non-guarantees

- **No "zero overhead" claim.** Tracing does work, and work costs
  something — see the [README's Performance section](../README.md#performance).
- **No private-field tracing, but also no interface requirement.**
  `#private` class fields cannot be intercepted by a `Proxy` at all — a
  JavaScript language limitation. Unlike a JVM dynamic proxy, there is no
  interface to implement first; every method reachable through property
  lookup — declared on the object itself or inherited from its prototype
  chain — is visible to `traceObject()`.
- **No structural, value-free artifact yet.** Some other NarrativeTrace
  runtimes also ship a `.nt`-style artifact with no runtime values at all, for
  handing to an AI tool with zero prompt-injection surface by construction.
  This runtime has not built that yet — see
  [What to Commit](what-to-commit.md#why-there-is-no-approvednt-row-here-yet).
  Until it exists, every generated artifact in this runtime carries real
  captured values and should be treated accordingly.
- **No zero-code, "wrap an app you didn't write" path.** There is no
  Java-agent equivalent on this platform, so scoping is always by explicit
  call site or class annotation — see
  [Choosing an Integration § Platform ceilings](choosing-an-integration.md#platform-ceilings).

## What this page does not cover

What happens when NarrativeTrace stacks with another library also wrapping
the same object — a DI container, another `Proxy`, a contract library. In
short: NarrativeTrace narrates business-boundary crossings only, and which
wrapper sits "outer" never changes the redacted values, the business result,
or the exception that reaches the narrative — see the
[README FAQ](../README.md#how-does-narrativetrace-interact-with-other-libraries-that-wrap-methods-aop-proxies-contract-libraries)
for the full coexistence contract.
