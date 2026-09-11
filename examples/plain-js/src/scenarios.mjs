// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  renderIndentedText,
  renderProse,
} from "@narrativetrace/core-node";
import { renderMermaidSequence } from "@narrativetrace/diagrams";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryCatalogService } from "./catalog-service.mjs";
import { DefaultLendingService } from "./lending-service.mjs";
import { InMemoryMemberService } from "./member-service.mjs";

/**
 * The book-lending scenarios as a plain-JavaScript consumer sees the API: no decorators, no
 * TypeScript — `traceObject` with a `paramNames` map is the whole integration.
 *
 * @typedef {import("@narrativetrace/core-node").NarrativeContext} NarrativeContext
 * @typedef {import("@narrativetrace/core-node").TraceTree} TraceTree
 * @typedef {import("@narrativetrace/core-node").EventConsumer} EventConsumer
 * @typedef {{ readonly context: NarrativeContext, readonly print: (text: string) => void, readonly capture: (title: string, tree: TraceTree) => void }} ScenarioContext
 * @typedef {{ readonly title: string, readonly wiring: string, readonly run: (ctx: ScenarioContext) => Promise<void> }} Scenario
 */

/**
 * @param {EventConsumer | null} [listener] live listener on the pipeline's inline path
 * @returns {NarrativeContext}
 */
export function createDemoContext(listener = null) {
  const pipeline = new DualPathPipeline(listener, new BufferedEventConsumer());
  return new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
}

/**
 * @param {NarrativeContext} context
 * @param {() => Date} [today]
 * @returns {DefaultLendingService}
 */
export function createTracedLendingService(context, today) {
  const catalog = traceObject(
    new InMemoryCatalogService(),
    context,
    { findBook: ["isbn"] },
    { className: "CatalogService" },
  );
  const members = traceObject(
    new InMemoryMemberService(),
    context,
    { lookupMember: ["memberId", "cardNumber"] },
    { className: "MemberService" },
  );
  return traceObject(
    new DefaultLendingService(catalog, members, today),
    context,
    { borrowBook: ["memberId", "isbn"] },
    { className: "LendingService" },
  );
}

/**
 * @param {ScenarioContext} ctx
 * @param {string} title
 * @param {string} body
 */
function section(ctx, title, body) {
  ctx.print(`\n--- ${title} ---\n`);
  ctx.print(body);
}

/** @type {Scenario} */
const successfulBorrow = {
  title: "Scenario 1: Successful Book Borrow",
  wiring:
    "Wiring: plain JavaScript, no decorators — traceObject(impl, context, paramNames, { className })\n" +
    "around CatalogService, MemberService and LendingService; the paramNames map is what names\n" +
    "isbn and memberId in the trace. cardNumber is a fixed verification token named by the same\n" +
    'map, redacted by RedactionPolicy\'s always-on NAME deny-list matching "cardNumber" — no\n' +
    "@notTraced decorator needed, and none is available to this JavaScript consumer.",
  run: async (ctx) => {
    const receipt = createTracedLendingService(ctx.context).borrowBook(
      "M-001",
      "978-0-13-468599-1",
    );
    ctx.print(`Received: ${JSON.stringify(receipt)}`);
    const tree = ctx.context.captureTrace();
    ctx.capture(successfulBorrow.title, tree);
    section(ctx, "Trace tree", renderIndentedText(tree));
    section(ctx, "Prose", renderProse(tree));
    section(ctx, "Mermaid", renderMermaidSequence(tree));
  },
};

/** @type {Scenario} */
const bookUnavailable = {
  title: "Scenario 2: Book Unavailable",
  wiring:
    "Wiring: the same three proxies after context.reset(). BookUnavailableError is thrown by\n" +
    "LendingService itself and the proxy records it on the way out — there is no error-handling\n" +
    "code in this path, and nothing to keep in sync when it changes.",
  run: async (ctx) => {
    try {
      createTracedLendingService(ctx.context).borrowBook("M-001", "978-0-13-235088-4");
    } catch {
      // expected — the proxy already recorded the throw
    }
    const tree = ctx.context.captureTrace();
    ctx.capture(bookUnavailable.title, tree);
    section(ctx, "Trace tree", renderIndentedText(tree));
    section(ctx, "Prose", renderProse(tree));
  },
};

/** @type {readonly Scenario[]} */
export const scenarios = [successfulBorrow, bookUnavailable];
