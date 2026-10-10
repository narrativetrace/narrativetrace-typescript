The doctor reports `trap.redaction-proof` on this project — "no test asserts [REDACTED]" — but the
project is configured correctly. `test/payment-service-redaction.test.js` passes and does assert the
marker: it asserts it through the library's own public constant, `RedactionPolicy.MARKER`, instead
of spelling the text out. I think the check itself is wrong.

Please use the `narrativetrace-feedback` skill to report that to the maintainers.
