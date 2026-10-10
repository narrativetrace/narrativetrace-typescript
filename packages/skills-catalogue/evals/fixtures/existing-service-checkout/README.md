# existing-service-checkout

The narrativetrace-verify cases' fixture (Phase 7 milestone 3, this port): a billing service with a
checkout flow and NarrativeTrace already installed through the case's `checkout-install` setup.
Never copied into a trial (the harness skips a fixture's root README).

- `CheckoutService.checkout` runs `@acme/checkout-kit` — a vendored, PACKED dependency
  (`vendor/acme-checkout-kit-2.4.1.tgz`, minified, installed into `node_modules` like any other):
  issue the invoice, authorize, call every hook's `onPaid`, THEN settle — `CardSettlement.settle` is where `PaymentGateway.confirm` happens. The kit's
  README says hooks run "once the order's payment has gone through": the documentation is wrong
  about the code, and the code that shows it is a minified dependency, not the project's source
  (Java cross-port item 9: hide the cause outside the readable source). It was first shipped as a
  plain `vendor/checkout-kit/` directory; trial 1 (2026-10-10, haiku) read that one-liner and
  avoided the trap before tracing, so the kit now ships packed: its code exists only under
  `node_modules`. To change the kit, extract the tarball, edit, and `npm pack` it again. A receipt sent from an
  `onPaid` hook goes out BEFORE the payment is confirmed, and every test still passes.
  `test/checkout-flow.test.js` drives the path as `compose` wires it, every collaborator traced,
  so the structural trace shows the order: `NotificationService.send` before
  `PaymentGateway.confirm`.
- `feeFor` in `src/late-fees.js` is a pure function with its own unit test — the skip case's
  subject.

Cases: `narrativetrace-verify/verify-unintended-interaction`, `narrativetrace-verify/verify-skip`.
