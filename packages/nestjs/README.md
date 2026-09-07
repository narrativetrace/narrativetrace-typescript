# @narrativetrace/nestjs

NestJS module that auto-proxies your providers so every service call is captured, with a per-request context and a completion hook carrying the captured trace tree.

## Install

```bash
pnpm add @narrativetrace/nestjs @narrativetrace/core @narrativetrace/core-node @narrativetrace/observability @nestjs/common @nestjs/core reflect-metadata rxjs
```

`@narrativetrace/core`, `@narrativetrace/core-node`, `@narrativetrace/observability`, `@nestjs/common` (>=10), `@nestjs/core` (>=10), `reflect-metadata`, and `rxjs` are peer dependencies.

## Usage

```ts
import { AutoProxyModule, NoAutoProxy } from "@narrativetrace/nestjs";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "orders-api",
      level: "detail",
      // A real pipeline (e.g. wired to pino/winston/otel) — without it, traces are captured but not exported.
      pipeline,
      // Providers to leave untraced.
      exclude: [HealthController],
      // Fires after each request with the captured tree, HTTP status, and duration.
      onRequestComplete: (ctx, { statusCode, durationMs, tree }) => {
        console.log(statusCode, durationMs, tree);
      },
    }),
  ],
  providers: [OrderService],
})
export class AppModule {}

// Opt a single provider out of auto-proxying:
@NoAutoProxy()
export class LegacyService {}
```

`AutoProxyModule` is global and exports `NarrativeStorage`, the per-request context holder. Use the `@NoAutoProxy()` decorator to skip individual providers.

The interceptor also runs each request through `LogContext.run` (`@narrativetrace/observability`), the same MDC-equivalent used by the Express and Hono middleware — a logger call made anywhere during the request (e.g. via `LogContext.getAll()` or a pino/winston mixin) picks up `trace_id`, `nt.http.method`, `nt.http.route`, `nt.client.ip`, and any resolved identity fields.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — Express, Hono, browser, and AsyncLocalStorage integration paths.
