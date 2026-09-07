// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  analyzeClarity,
  renderClarityReport,
  renderClaritySuiteReport,
} from "@narrativetrace/clarity";
import { renderIndentedText, type TraceTree } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { DefaultAvailabilityChecker } from "./availability-checker.js";
import { DefaultBookingManager } from "./booking-manager.js";
import { DefaultDataProcessor } from "./data-processor.js";
import { DefaultGuestRepository } from "./guest-repository.js";
import { DefaultPaymentGateway } from "./payment-gateway.js";
import { DefaultReservationService } from "./reservation-service.js";
import type { NarrativeContext, Scenario, ScenarioContext } from "./scenario.js";

/**
 * Java's `ClarityDemoExample`: four scenarios over the hotel domain, one naming-quality tier each,
 * then a report over the four captured trees. Wiring is identical across the four — the variable
 * under test is naming, not configuration.
 */

const SAME_WIRING =
  "Wiring: no decorators beyond @traced for parameter names — traceObject(impl, context, undefined,\n" +
  "{ className }) around each service, on a DualPathPipeline whose inline listener is the live\n" +
  "stream. All four scenarios are wired identically; only the naming quality changes.";

function trace<T extends object>(context: NarrativeContext, target: T, className: string): T {
  return traceObject(target, context, undefined, { className });
}

function printTree(ctx: ScenarioContext, title: string, trees: Map<string, TraceTree>): void {
  const tree = ctx.context.captureTrace();
  trees.set(title, tree);
  ctx.capture(title, tree);
  ctx.print("\n--- Trace tree ---\n");
  ctx.print(renderIndentedText(tree));
}

function bookRoom(context: NarrativeContext): void {
  const reservations = trace(
    context,
    new DefaultReservationService(
      trace(context, new DefaultAvailabilityChecker(), "AvailabilityChecker"),
      trace(context, new DefaultPaymentGateway(), "PaymentGateway"),
    ),
    "ReservationService",
  );
  reservations.confirmReservation("G-1001", "deluxe", "2025-06-15", "2025-06-18");
}

function useRepository(context: NarrativeContext): void {
  const guests = trace(context, new DefaultGuestRepository(), "GuestRepository");
  guests.findGuestById("G-1001");
  guests.renderReport();
  guests.dispatchEmail("G-1001", "Your reservation is confirmed");
}

const BANNER = "========================================";

function printReport(ctx: ScenarioContext, trees: Map<string, TraceTree>): void {
  ctx.print(`\n${BANNER}\n         CLARITY ANALYSIS REPORT\n${BANNER}\n`);
  if (trees.size === 0) {
    ctx.print("  No scenarios captured yet — run the four scenarios above first.");
    return;
  }
  const results = [...trees].map(([scenario, tree]) => ({
    scenario,
    result: analyzeClarity(tree),
  }));
  ctx.print(renderClarityReport(results));
  ctx.print(`\n${renderClaritySuiteReport(results)}`);
}

interface Tier {
  readonly title: string;
  readonly wiring: string;
  readonly act: (context: NarrativeContext) => void;
}

function bookViaManager(context: NarrativeContext): void {
  const manager = trace(context, new DefaultBookingManager(), "BookingManager");
  manager.handleBooking("Jane Smith", "suite", "2025-07-01", "2025-07-05");
}

function processLegacyData(context: NarrativeContext): void {
  trace(context, new DefaultDataProcessor(), "DataProcessor").execute("room-data", 42);
}

const TIERS: readonly Tier[] = [
  {
    title: "Scenario 1: Guest Books a Room (Excellent Naming)",
    wiring: SAME_WIRING,
    act: bookRoom,
  },
  {
    title: "Scenario 2: Booking via Manager (Adequate Naming)",
    wiring:
      "Wiring: the same proxy setup after context.reset() — one traced interface this time.\n" +
      "Nothing in the configuration changed between scenarios; the names did.",
    act: bookViaManager,
  },
  {
    title: "Scenario 3: Legacy Data Processing (Poor Naming)",
    wiring:
      "Wiring: the same proxy setup again. A tracer can only report what the code calls itself,\n" +
      "so generic names in, generic trace out — no configuration rescues this one.",
    act: processLegacyData,
  },
  {
    title: "Scenario 4: Guest Repository (Cohesion Mismatch)",
    wiring:
      "Wiring: the same proxy setup, one repository interface. Cohesion is judged afterwards from\n" +
      "the captured tree, so the unrelated calls below are all the analyzer has to go on.",
    act: useRepository,
  },
];

function tierScenario(tier: Tier, trees: Map<string, TraceTree>): Scenario {
  return {
    title: tier.title,
    wiring: tier.wiring,
    run: async (ctx) => {
      tier.act(ctx.context);
      printTree(ctx, tier.title, trees);
    },
  };
}

function reportScenario(trees: Map<string, TraceTree>): Scenario {
  return {
    title: "Clarity Analysis Report",
    wiring:
      "Wiring: the four trees captured above are passed to analyzeClarity, and\n" +
      "renderClarityReport / renderClaritySuiteReport print the per-scenario table and the suite\n" +
      "summary. The analysis reads captured traces — no extra instrumentation, no second run.",
    run: async (ctx) => printReport(ctx, trees),
  };
}

/** Builds a fresh registry: the report scenario reads the trees the first four captured. */
export function createClarityScenarios(): readonly Scenario[] {
  const trees = new Map<string, TraceTree>();
  return [...TIERS.map((tier) => tierScenario(tier, trees)), reportScenario(trees)];
}

export const scenarios: readonly Scenario[] = createClarityScenarios();
