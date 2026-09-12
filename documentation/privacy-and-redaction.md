# Privacy and redaction

This library runs inside your process and writes files your team will
share — test artifacts, CI output, production log lines. This page is the
row-by-row version of that contract: what redacts, where it does and does
not reach, and what NarrativeTrace guarantees versus what it does not claim
at all. Verified line-by-line against the code on 2026-09-02, not inferred from the docs.

## Redaction, surface by surface

| Surface | Can disable built-in redaction? |
|---|---|
| `traceObject()` (proxy) — the capture path `express`, `hono`, `angular` and `react` are built on | No |
| `AutoProxyModule` (`@narrativetrace/nestjs`) — its own separate, prototype-mutating capture path, *not* built on `traceObject()` (see note below) | No |
| Vitest fixture (`createNarrativeTest`/`narrativeTest`) | No |
| A custom call to `renderValue()`/`renderStructured()` your own code makes directly | Yes — only by passing `{ redactionPolicy: RedactionPolicy.DISABLED }` explicitly, and even then `@notTraced`/`static notTraced` still redact (see below) |
| `@notTraced` / `static notTraced` | Not applicable — it is the thing doing the redacting, and it always wins, on every surface, including a `RedactionPolicy.DISABLED` renderer |

Verified against the code, not inferred: `traceObject()` is the capture
path `express`, `hono`, `angular` and `react` are built on — it never
threads a `redactionPolicy` option through from the caller. The Vitest
fixture (`createNarrativeTest`/`narrativeTest`) is listed as its own row
above because it is a distinct entry point — a `NarrativeContext` provider,
not a capture path in its own right — so its redaction guarantee is
whichever capture mechanism the test wraps with inside it (typically
`traceObject()`, sometimes `AutoProxyModule` in a NestJS test), never a
third behavior of its own. **`@narrativetrace/nestjs`'s `AutoProxyModule` is
a separate,
hand-rolled capture path (`wrapPrototypeMethods`), not a wrapper over
`traceObject()`** — it mutates each auto-wrapped provider's prototype
directly rather than proxying an instance, because NestJS needs every
instance a DI container creates traced, not one object wrapped by hand. The
two paths share the `@notTraced` decorator's storage (moved into
`@narrativetrace/core` for exactly this reason) but not its captured
parameter *names*: `wrapPrototypeMethods` has no decorator/reflection
metadata to recover a real parameter name from a raw prototype method, so
every parameter renders as `arg0`, `arg1`, … there, a name the always-on
NAME deny-list can never match. **This is a structural limitation, not a
bug to be fixed later:** JavaScript does not expose parameter names at
runtime without `@traced`-style metadata the auto-wrap path does not have.
`@notTraced(i)` (redaction by index) and value-shape masking (a JWT, a
Luhn-valid card number, a national-ID checksum or structural rule, a
`Set-Cookie` string — independent of name) still protect a NestJS
auto-wrapped parameter; the name-based axis alone cannot.
The `redactionPolicy` option exists only on the low-level rendering
functions (`renderValue`/`renderStructured` in `@narrativetrace/core`),
which none of the shipped integrations expose a way to override. The only
way to reach `RedactionPolicy.DISABLED` is application code calling those
functions directly — a deliberate, reviewable act in your own source, never
a configuration flag or environment variable a deploy can flip.

## What redacts, and what outranks what

Three independent mechanisms apply to every captured/rendered value:

1. **`@notTraced(i)`** on a method parameter, by index — under
   `traceObject()`, the *caller* (its value-map builder) substitutes the
   `[REDACTED]` marker before a narration/error template ever resolves, so
   the template resolver never holds the secret for this surface. Under
   NestJS's `AutoProxyModule` there is no narration/template surface to
   protect (that integration does not read `@narrated`/`@onError`), but the
   same decorator still redacts the captured argument itself, reading the
   same storage `traceObject()` reads (see the surface-by-surface note
   above).
2. **`static notTraced = [...]`** on a class — field-name redaction for
   object introspection and for `{param.property}` template paths. This
   check is independent of which `RedactionPolicy` is active: the "was this
   member explicitly annotated" answer is computed from the class itself,
   then combined as `annotated || nameMatchesDenyList`, so an explicit
   annotation redacts even under a policy that has every name pattern and
   value-shape check turned off.
3. **The name-based deny-list** (`RedactionPolicy.DEFAULT`) — a case- and
   accent-insensitive substring match against field **and parameter**
   names (`password`, `secret`, `token`, `apikey`, `cvv`, `ssn`,
   `authorization`, `credential`, `cardnumber`, `jwt`, `cookie`,
   `sessionid`, `accountnumber`, `routingnumber`, `passphrase`, `bearer`,
   `accesskey`, `socialsecurity`, `taxid`, `pan`, `iban`, and their
   `snake_case` spellings), plus a second, independent check on the *shape*
   of the value itself — a JWT (`eyJ…`), a Luhn-valid card number, a
   `Set-Cookie`-shaped string, or a national-ID checksum or structural
   rule (Chilean RUT, Brazilian CPF/CNPJ, Spanish DNI/NIE, French NIR,
   Chinese resident id, or a dashed US Social Security number
   `AAA-GG-SSSS` — the one scheme with no checksum, so the SSA's own
   never-issued area/group/serial ranges stand in for one) — so an
   unnamed value (a list item, a map value) or a bearer token under an
   unrecognized name is still caught.
   **The parameter half of this axis applies under `traceObject()` only**
   — a parameter merely *named* like a secret (`paymentToken`, `password`)
   is redacted with no decorator anywhere, exactly like a field name is.
   Under NestJS's `AutoProxyModule` every parameter is captured as `arg0`,
   `arg1`, … (see the surface-by-surface note above), so this half of the
   axis cannot reach it — only `@notTraced` and the value-shape check can,
   there. The default vocabulary is **multilingual and always on** (the
   family standard, shared with the other NarrativeTrace runtimes): Spanish
   (`contraseña`, `tarjeta`, `cédula`, `claveAcceso`, `rut`, `cuit`, `dni`),
   Portuguese (`senha`, `cartão`, `cpf`, `cnpj`), French (`motDePasse`,
   `carteBancaire`, `nir`), German (`passwort`, `kennwort`) and Chinese
   (`密码`, `身份证`, plus the pinyin `mima`/`shenfenzheng`) sit beside the
   English patterns, with no locale to select — accented and unaccented
   spellings fold to one pattern. `"companyName"`/`"panelId"` do not match
   `pan` — the patterns most prone to false positives (`pan`, `iban`, `otp`,
   `rut`, `cuit`, `dni`, `senha`, `cpf`, `cnpj`, `nir`, `mima`) match on
   identifier-token boundaries, not bare substring, so `truthValue`,
   `circuitBreaker`, `chosenHash`, `semiMajorAxis` and `carbonFootprintId`
   stay visible while `rutCliente`, `senhaUsuario` and `otpCode` are
   hidden.

**A custom `toString()` is trusted only for a leaf** — an object with no own
field at all, so there is nothing field introspection could show instead
(family invariant, 2026-09-11; this port's design already matched .NET's).
*(since 0.1.3, unreleased)*
The moment an object has even one own field, it is *always* introspected
field-by-field, whatever its `toString()` would have printed — not merely
when that field is itself annotated or deny-listed. This is narrower than it
sounds like it needs to be, and deliberately so: the earlier, narrower rule
("trust `toString()` unless one of *this object's own* fields is a
redaction target") missed the shape a 2026-09-11 security fix closes — a
`toString()` that interpolates a **nested** object's own curated text
(`Order.toString()` printing `this.customer`, itself a `Customer` hiding a
redacted field) never puts the redacted field's name or annotation on
`Order` itself, so the own-field check found nothing to catch and the
nested secret rendered in full. Trusting `toString()` only for leaves closes
that whole class of bypass at once, at any nesting depth, rather than
chasing each new interpolation shape as its own bug. The same rule applies
to a Map **key**: a key that is itself an object goes through the identical
redaction-aware rendering a value does, never a raw, unconditional
`toString()`. *(since 0.1.3, unreleased)*

`narrativeSummary()` is curated text the author wrote specifically for the
trace, and still outranks both toString-trust and field introspection — but
it is not exempt from the value-shape scan (a JWT/PAN/SSN/national-ID/
`Set-Cookie` shape is redacted even inside curated text), and a
`narrativeSummary()` that throws no longer falls through to toString/field
introspection: the whole value degrades to the typed error marker instead
(see below), because falling through is exactly how a summary written to
hide a secret could reintroduce it through the class's ordinary fields the
moment the summary itself misbehaves.

Template resolution does not get a shortcut around any of this either: it
was audited to make sure it never falls back to a value's raw `toString()`
when the safe rendering happened to omit the marker for an unrelated reason
(truncation at the field/depth cap) — every non-scalar placeholder value
goes through the same field-redacting renderer the rest of the trace uses,
unconditionally.

## Errors while rendering

A member this library invokes while rendering a value — `narrativeSummary()`,
a leaf's `toString()`, or a field getter — can throw, or (`toString()` only)
return `null`. *(since 0.1.3, unreleased)* A throw degrades to the typed error marker for that one part,
`<error: ConstructorName>` (e.g. `<error: TypeError>`; a thrown non-`Error`
value shows its `typeof`, e.g. `<error: string>`) — **never the exception's
`message`**, which can carry the exact value the member was refusing to
render. A throwing field getter degrades only that one field; every sibling
field still renders normally. A `toString()` returning `null` (not a throw)
shows the bare `<ConstructorName>` marker instead, since nothing threw.

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
