# @narrativetrace/react-router

Captures a fresh NarrativeTrace tree on every React Router navigation, so each route change gives you one self-contained trace.

## Install

```bash
pnpm add @narrativetrace/react-router @narrativetrace/react react react-router-dom
```

## Usage

Render a component inside your router that calls `useNavigationCapture`. Each time the pathname changes it captures the accumulated trace, hands it to your callback, and resets the context:

```tsx
import { NarrativeTraceProvider } from "@narrativetrace/react";
import { useNavigationCapture } from "@narrativetrace/react-router";
import type { TraceTree } from "@narrativetrace/core";
import { BrowserRouter } from "react-router-dom";

function NavigationTracer() {
  useNavigationCapture((tree: TraceTree) => {
    console.log("captured on navigation", tree.roots);
  });
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <NarrativeTraceProvider>
        <NavigationTracer />
        {/* routes */}
      </NarrativeTraceProvider>
    </BrowserRouter>
  );
}
```

The callback is optional — omit it to simply reset the trace on each navigation. `useNavigationCapture` must be used within a `NarrativeTraceProvider` and a React Router context.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — React Router navigation capture and shared-context safety notes.
