// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NarrativeTraceProvider } from "../src/provider.js";
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
  tracedFetch("/api/test");
  const tp = lastHeaders?.get("traceparent") ?? "none";
  return <div data-testid="tp">{tp}</div>;
}

function FetchWithHeaders() {
  const tracedFetch = useTracedFetch();
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
});
