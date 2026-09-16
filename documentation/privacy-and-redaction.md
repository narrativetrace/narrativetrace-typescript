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
| Structural `.nt` (`renderStructural`/`renderStructuralDocument`) | Not applicable — it carries no values to redact in the first place |

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
   *(since 0.1.3)*
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

**A custom `toString()` is trusted only for a realm platform intrinsic** —
`Date`, `URL`, `RegExp`, a boxed `BigInt`, or a typed array (owner ruling,
2026-09-12, the "trusted-leaf" carve-out). *(since 0.1.3)*
Every other object — a plain class, a record-shaped value, a field-less
"leaf" with nothing visible to introspect — is *always* introspected
field-by-field instead, whatever its `toString()` would have printed. The
identity check is `Object.getPrototypeOf(value) === Date.prototype` (and the
same for each of the other intrinsics above) — **never** `constructor.name`
or any other name-based test: a user class can freely name itself `Date`
without ever touching the real `Date.prototype`, and a subclass's instances
carry the *subclass's* prototype one level up, not the base intrinsic's, so
neither a same-named lookalike nor a subclass of a platform type is ever
trusted merely by association. `Error` is deliberately excluded from this
list even though it is a realm intrinsic too: unlike `Date`'s opaque
timestamp or a typed array's numeric buffer, `Error.prototype.toString()`
interpolates `message` — free text the caller supplies at construction
(`new Error(user.password)`) — exactly the shape a deny-listed field exists
to catch, so an `Error` value is field-walked like any other object.
*(since 0.1.3)*

**`Date` is trusted the same way, but renders via `toISOString()`, never
`toString()`** *(since 0.1.3)*: `Date.prototype.toString()` bakes
the host's locale and timezone NAME into the string (e.g. `"Tue Jan 01 2024
01:00:00 GMT+0100 (Central European Standard Time)"`), so the identical
instant renders as two different, non-reproducible strings on two machines —
or on the same machine at a different `TZ`. `toISOString()` is UTC and
carries neither axis: one instant, one string, everywhere, which is what a
trace artifact meant to be diffed or approved across machines requires. An
invalid `Date` (`new Date(NaN)`) still renders as the literal `Invalid Date`
— `toISOString()` throws for it, so this is checked and returned directly,
never routed through the typed error marker below.

This narrows a shorter-lived intermediate rule from 2026-09-11 ("trust
`toString()` for any leaf — any object with no own enumerable field at all")
that this port shipped for less than a day: on this platform, "no own
enumerable field" was never actually proof of "nothing to hide" the way it
sounds — a true `#private` class field, a closure variable, or a
module-level `WeakMap` keyed by `this` are all invisible to `Object.keys`
yet freely readable from inside the class's own `toString()`, so a
same-named or same-shaped impostor of a trusted type could still leak
through it. Restricting trust to the small, closed set of intrinsics this
library ships alongside — never an arbitrary user class, leaf or not —
closes that hole outright. The 2026-09-11 rule itself closed an earlier,
narrower one still: the original rule ("trust `toString()` unless one of
*this object's own* fields is a redaction target") missed a `toString()`
that interpolates a **nested** object's own curated text (`Order.toString()`
printing `this.customer`, itself a `Customer` hiding a redacted field) —
the redacted field's name or annotation never appeared on `Order` itself, so
the own-field check found nothing to catch and the nested secret rendered
in full. The same rule applies to a Map **key**: a key that is itself an
object goes through the identical redaction-aware rendering a value does,
never a raw, unconditional `toString()`. *(since 0.1.3)*

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
return `null`. *(since 0.1.3)* A throw degrades to the typed error marker for that one part,
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
- **The structural `.nt` artifact has no runtime values at all.** *(since 0.1.3)* Names,
  call hierarchy and outcome kinds only — zero prompt-injection surface, and
  that is a property of the renderer, not a policy someone could forget to
  apply. Its `scenario:` header is covered by that: one invocation of a
  `createNarrativeTest(...).each(cases)` row is titled `<test name> #<index>`,
  never the label a template interpolated its arguments into (see
  [Structural Trace Format](structural-trace-format.md)). What the artifact
  is *called* — its filename, and the test title itself — is a different
  question; see the non-guarantee below.
- **The trace/run phrase carries no data of its own.** *(since 0.1.3)*
  `bold elk soars` is derived deterministically from a trace or run id
  (`humanName()`, three fixed word tables) — it is not, and never reads,
  anything the traced code produced, so it is safe to print, log, or paste
  into a bug report on its own. It never reaches the structural `.nt`
  artifact, an approved/received trace, an artifact filename, or the
  manifest's per-scenario keys — see
  [Configuration Guide § The run has a name](configuration-guide.md#the-run-has-a-name).

## Non-guarantees

- **No "zero overhead" claim.** Tracing does work, and work costs
  something — see the [README's Performance section](../README.md#performance).
- **No private-field tracing, but also no interface requirement.**
  `#private` class fields cannot be intercepted by a `Proxy` at all — a
  JavaScript language limitation. There is no
  interface to implement first; every method reachable through property
  lookup — declared on the object itself or inherited from its prototype
  chain — is visible to `traceObject()`.
- **No redaction of test names.** *(since 0.1.3)* The structural artifact's `scenario:`
  header and filename are derived from the test's own title (and, for a
  `.each` invocation, the interpolated label baked into the filename only —
  see [Structural Trace Format](structural-trace-format.md)) — text the
  developer wrote, not a captured value, so none of the redaction machinery
  above ever runs on it. A test title or `.each` label that embeds a secret
  (`test("logs in as ${password}", ...)`) puts that secret in the filename
  and the committed `.approved.nt`'s path — keep secrets out of test titles
  and `.each` name templates, the same rule as any other test framework.
- **No zero-code, "wrap an app you didn't write" path.** Instrumentation on
  this platform is always explicit, so scoping is always by explicit
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
