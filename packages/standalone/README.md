# @narrativetrace/standalone

Single-file NarrativeTrace for plain JavaScript pages — no TypeScript, no bundler, no `node_modules` at runtime. One file contains `@narrativetrace/core-web` + `@narrativetrace/proxy` + `@narrativetrace/browser`, and loading it registers the Web Crypto id generator, so nothing else needs to be imported.

| File | Shape | Load it with |
|---|---|---|
| `dist/narrativetrace.js` | ES module | `<script type="module">` / `import … from "./narrativetrace.js"` |
| `dist/narrativetrace.global.js` | classic script, defines `window.NarrativeTrace` | `<script src="narrativetrace.global.js">` |
| `dist/narrativetrace.d.ts` | self-contained type declarations | TypeScript users of the ES module |

Both bundles are minified (~50 KiB, budget 64 KiB enforced by tests), ship source maps, and contain no Node built-ins.

## Install

```bash
pnpm add @narrativetrace/standalone
```

Copy the file you need out of `node_modules/@narrativetrace/standalone/dist/` next to your page (or serve it from there). The `unpkg` / `jsdelivr` fields point at the classic-script build, so once published a CDN URL works too.

## Usage — classic script (any page, ES5-style code included)

```html
<script src="narrativetrace.global.js"></script>
<script>
  var NT = window.NarrativeTrace;

  function Cart() { this.items = []; }
  Cart.prototype.add = function (sku, qty) { this.items.push({ sku: sku, qty: qty }); return this.items.length; };

  var ctx = new NT.SyncNarrativeContext(new NT.NarrativeTraceConfig());
  var cart = NT.traceObject(new Cart(), ctx, { add: ["sku", "qty"] }); // parameter names: JS keeps none at runtime

  cart.add("P1", 2);

  var tree = ctx.captureTrace();
  document.getElementById("trace").textContent = NT.renderIndentedText(tree); // in the page
  NT.renderToConsole(tree);                                                    // in DevTools
  NT.postToCollector(tree, { scenario: "cart" }, "/traces");                   // to a collector
</script>
```

## Usage — ES module (no bundler)

```html
<script type="module">
  import { NarrativeTraceConfig, SyncNarrativeContext, traceObject, renderIndentedText } from "./narrativetrace.js";
  // same API as above
</script>
```

## When to use the regular packages instead

If your app already has a bundler (Vite, esbuild, webpack) or runs on Node, depend on `@narrativetrace/core-web` (browser) / `@narrativetrace/core-node` (Node) plus `@narrativetrace/proxy` and friends: smaller graphs, tree-shaking, and per-package versioning. This package exists for the "drop a script tag in a page" case.

## Learn more

- Runnable page: [`examples/script-tag`](../../examples/script-tag) — `pnpm run example:script-tag`
- [Installation guide](../../documentation/installation-guide.md)
- [Framework integration guide](../../documentation/framework-integration-guide.md) (browser section)
