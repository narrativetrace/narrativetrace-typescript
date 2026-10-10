# existing-service-checkout-currency

The narrativetrace-debug case's fixture (Phase 7 milestone 3, this port): a billing service that
charges a customer's card in the card's currency, NarrativeTrace installed through the case's
`checkout-install` setup. Never copied into a trial (the harness skips a fixture's root README).

The defect (Java cross-port item 6): `RateTableConverter.convert` rounds to WHOLE francs before
moving to cents — `Math.round((amountCents / 100) * rate) * 100` — so the ticket's 45.99 EUR at
0.93 is charged CHF 43.00 (4300), not 42.77 (4277). Every test is green as shipped: they convert
whole-unit amounts, where the two orders of rounding agree. The defect is visible only as a VALUE
at one boundary — `RateTableConverter.convert(amountCents: 4599, from: "EUR", to: "CHF") → 4300`,
with its child `DailyRates.rateFor` returning the right 0.93 — and the structural trace is the
same before and after the fix.

Near misses the grader refuses: a fix downstream (rounding the charge in `CheckoutService` or the
gateway) leaves the converter's value wrong; a route around the span (computing the charge
without the converter) moves the structural trace.

Case: `narrativetrace-debug/debug-value-divergence`.
