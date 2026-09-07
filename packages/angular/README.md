# @narrativetrace/angular

Angular integration for NarrativeTrace: a single `provideNarrativeTrace()` call wires up the DI context, an HTTP interceptor, and optional per-navigation capture.

## Install

```bash
pnpm add @narrativetrace/angular @narrativetrace/core-web @narrativetrace/proxy @angular/core @angular/common @angular/router
```

## Usage

Add `provideNarrativeTrace()` to your application providers, then register each service you want traced with `provideTraced()`:

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNarrativeTrace, provideTraced } from "@narrativetrace/angular";
import type { TraceTree } from "@narrativetrace/core-web";
import { AppComponent } from "./app.component";
import { CheckoutService } from "./checkout.service";

bootstrapApplication(AppComponent, {
  providers: [
    provideNarrativeTrace({
      captureOnNavigation: true,
      onTraceCapture: (trace: TraceTree) => console.log(trace.roots),
    }),
    provideTraced(CheckoutService),
  ],
});
```

`provideNarrativeTrace()` also installs `traceInterceptor` so outgoing `HttpClient` requests carry the trace context. `TraceCaptureService` and the `NARRATIVE_CONTEXT` token are exported for capturing traces manually.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — Angular DI tracing, the HTTP interceptor, and shared-context safety notes.
