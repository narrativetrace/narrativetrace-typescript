# @narrativetrace/react

React hooks and provider for capturing component and service traces — the trace is generated from your method and parameter names, so there's no logging boilerplate in your components.

## Install

```bash
pnpm add @narrativetrace/react @narrativetrace/core @narrativetrace/core-web @narrativetrace/proxy react
```

## Usage

Wrap your tree in `NarrativeTraceProvider`, trace a service with `useTraced`, and pull the captured tree out with `useTraceCapture`:

```tsx
import {
  NarrativeTraceProvider,
  useTraced,
  useTraceCapture,
} from "@narrativetrace/react";
import { CheckoutService } from "./checkout-service";

function Checkout() {
  const checkout = useTraced(() => new CheckoutService(), "CheckoutService");
  const { captureAndReset } = useTraceCapture();

  function onPlaceOrder() {
    checkout.placeOrder("C1", "P1", 2);
    const tree = captureAndReset();
    console.log(tree.roots);
  }

  return <button onClick={onPlaceOrder}>Place order</button>;
}

export function App() {
  return (
    <NarrativeTraceProvider level="detail">
      <Checkout />
    </NarrativeTraceProvider>
  );
}
```

`useNarrativeTrace()` returns the raw context, and `useTracedFetch()` returns a `fetch` that stamps `traceparent` on outgoing requests.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — React, browser, and shared-context safety notes.
