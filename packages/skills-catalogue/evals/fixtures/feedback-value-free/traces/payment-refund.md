---
type: trace
scenario: refunds a payment
entry_point: PaymentService.refund
duration_ms: 0.6967499999999802
trace_id: 48c9eddcc4c849c68359472d770ec982
trace_name: wide prong warns
method_count: 1
error_count: 0
---

- `PaymentService.refund(customerId: "C-1234", reference: "ghp_NTCANARY0001")` → `"REF-C-1234"` — 0.7ms #1
