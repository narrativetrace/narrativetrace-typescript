// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NarrativeTraceProvider } from "../src/provider.js";
import { useNarrativeTrace } from "../src/use-narrative-trace.js";
import { useTracedFetch } from "../src/use-traced-fetch.js";

afterEach(cleanup);

let lastHeaders: Headers | undefined;

beforeEach(() => {
  lastHeaders = undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    lastHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function FetchComponent() {
  const tracedFetch = useTracedFetch();
  useNarrativeTrace().enterMethod("Page", "click", []);
  tracedFetch("/api/test");
  const tp = lastHeaders?.get("traceparent") ?? "none";
  return <div data-testid="tp">{tp}</div>;
}

function FetchWithHeaders() {
  const tracedFetch = useTracedFetch();
  useNarrativeTrace().enterMethod("Page", "click", []);
  tracedFetch("/api/test", { headers: { "X-Custom": "value" } });
  const custom = lastHeaders?.get("X-Custom") ?? "none";
  const tp = lastHeaders?.get("traceparent") ?? "none";
  return (
    <div>
      <span data-testid="custom">{custom}</span>
      <span data-testid="tp">{tp}</span>
    </div>
  );
}

describe("useTracedFetch", () => {
  test("adds traceparent header", () => {
    render(
      <NarrativeTraceProvider>
        <FetchComponent />
      </NarrativeTraceProvider>,
    );
    const tp = screen.getByTestId("tp").textContent ?? "";
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  test("tracedFetch identity updates when context changes", () => {
    let fetchRef: typeof fetch | null = null;

    function Extractor() {
      const tracedFetch = useTracedFetch();
      fetchRef = tracedFetch;
      return <div data-testid="ok">ok</div>;
    }

    const { rerender } = render(
      <NarrativeTraceProvider level="detail">
        <Extractor />
      </NarrativeTraceProvider>,
    );
    const firstRef = fetchRef;

    rerender(
      <NarrativeTraceProvider level="overview">
        <Extractor />
      </NarrativeTraceProvider>,
    );
    expect(fetchRef).not.toBe(firstRef);
  });

  test("preserves existing headers", () => {
    render(
      <NarrativeTraceProvider>
        <FetchWithHeaders />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("custom").textContent).toBe("value");
    expect(screen.getByTestId("tp").textContent).toMatch(/^00-/);
  });

  test("preserves headers from Request input", () => {
    function FetchWithRequest() {
      const tracedFetch = useTracedFetch();
      useNarrativeTrace().enterMethod("Page", "click", []);
      tracedFetch(new Request("https://example.test/api", { headers: { "X-Custom": "value" } }));
      const custom = lastHeaders?.get("X-Custom") ?? "none";
      const tp = lastHeaders?.get("traceparent") ?? "none";
      return (
        <div>
          <span data-testid="req-custom">{custom}</span>
          <span data-testid="req-tp">{tp}</span>
        </div>
      );
    }

    render(
      <NarrativeTraceProvider>
        <FetchWithRequest />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("req-custom").textContent).toBe("value");
    expect(screen.getByTestId("req-tp").textContent).toMatch(/^00-/);
  });

  test("sends the open span's trace id and span id as the parent", () => {
    function Probe() {
      const ctx = useNarrativeTrace();
      const spanId = ctx.enterMethod("Page", "click", []);
      useTracedFetch()("/api/test");
      const expected = `00-${ctx.traceId()}-${spanId}-01`;
      return <div data-testid="match">{String(lastHeaders?.get("traceparent") === expected)}</div>;
    }
    render(
      <NarrativeTraceProvider>
        <Probe />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("match").textContent).toBe("true");
  });

  test("an untraced fetch between two interactions does not continue the first trace", () => {
    function Probe() {
      const ctx = useNarrativeTrace();
      ctx.enterMethod("Page", "clickA", []);
      const traceA = ctx.traceId();
      ctx.exitMethodWithReturn("null");
      useTracedFetch()("/api/test");
      const sent = lastHeaders?.has("traceparent");
      ctx.enterMethod("Page", "clickB", []);
      return <div data-testid="r">{`${sent}/${ctx.traceId() !== traceA}`}</div>;
    }
    render(
      <NarrativeTraceProvider>
        <Probe />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("r").textContent).toBe("false/true");
  });
});
