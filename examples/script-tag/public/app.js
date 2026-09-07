// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Plain JavaScript — no TypeScript, no bundler, no modules, no build step.
//
// index.html loads two classic <script> tags in order:
//   1. /narrativetrace.global.js  → defines window.NarrativeTrace (the standalone bundle)
//   2. /app.js                    → this file
//
// Everything NarrativeTrace needs is on that one global; loading the bundle already registered
// the browser (Web Crypto) id generator, so there is nothing to configure.

(function () {
  "use strict";

  var NT = window.NarrativeTrace;

  // ---- The application code being traced: an ES5-style "class". ----------------------------
  // NarrativeTrace does not care how objects are built — constructor functions, classes, or
  // object literals all work, because tracing happens through an ES Proxy around the instance.
  function ShoppingCart() {
    this.items = [];
  }
  ShoppingCart.prototype.add = function (sku, qty) {
    this.items.push({ sku: sku, qty: qty });
    return this.items.length;
  };
  ShoppingCart.prototype.checkout = function (coupon) {
    if (coupon === "EXPIRED") throw new Error("Coupon expired");
    return { total: 42, items: this.items.length };
  };

  // ---- One traced run. -------------------------------------------------------------------
  function runTracedCheckout() {
    // A fresh context per run: each click shows exactly this scenario, nothing accumulates.
    var ctx = new NT.SyncNarrativeContext(new NT.NarrativeTraceConfig());
    // traceObject wraps the cart in a Proxy. JavaScript keeps no parameter names at runtime,
    // so they are declared here — the trace then reads add(sku: "P1", qty: 2).
    var cart = NT.traceObject(new ShoppingCart(), ctx, {
      add: ["sku", "qty"],
      checkout: ["coupon"],
    });

    cart.add("P1", 2);
    cart.add("P2", 1);
    cart.checkout("SPRING");
    try {
      cart.checkout("EXPIRED");
    } catch (e) {
      // The failure is the point: it appears in the trace as ✗ Error: Coupon expired.
      // The proxy re-throws exactly what the untraced cart threw — tracing never swallows errors.
    }
    return ctx.captureTrace();
  }

  // ---- Report the collector outcome in one readable line. --------------------------------
  // postToCollector resolves with the Response for ANY status and rejects only on network
  // failure, so "rejected" and "unavailable" are reported differently.
  function describeCollectorOutcome(promise) {
    return promise.then(
      function (response) {
        return response.ok
          ? "Trace posted to collector (HTTP " + response.status + ")"
          : "Collector rejected the trace (HTTP " + response.status + ")";
      },
      function (error) {
        var reason = error instanceof Error ? error.message : String(error);
        return "Collector unavailable — trace shown above (" + reason + ")";
      },
    );
  }

  // ---- Wire the page. -----------------------------------------------------------------
  function mount(root) {
    var button = document.createElement("button");
    button.setAttribute("data-testid", "run");
    button.textContent = "Run traced checkout";

    var trace = document.createElement("pre");
    trace.setAttribute("data-testid", "trace");

    var status = document.createElement("p");
    status.setAttribute("data-testid", "status");

    button.addEventListener("click", function () {
      var tree = runTracedCheckout();
      NT.renderToConsole(tree); // DevTools console, one console.group per call with children
      trace.textContent = NT.renderIndentedText(tree); // in the page
      describeCollectorOutcome(
        NT.postToCollector(tree, { scenario: "script-tag cart" }, "/traces"),
      ).then(function (text) {
        status.textContent = text;
      });
    });

    root.appendChild(button);
    root.appendChild(trace);
    root.appendChild(status);
  }

  mount(document.getElementById("app"));
})();
