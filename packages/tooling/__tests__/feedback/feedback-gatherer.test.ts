// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  chooseTrace,
  DOCTOR_UNAVAILABLE,
  feedbackAttachments,
  INSTALL_UNKNOWN,
  installCoordinate,
} from "../../src/feedback/feedback-gatherer.js";
import { snapshot, withFiles, withPackages } from "../fixture.js";
import { DOCTOR_JSON, STRUCTURAL_TRACE } from "./reports.js";

/** A rendered narrative saved under a `.nt` name — not a structural trace by grammar at all. */
const RENDERED = `scenario: Order is placed

- OrderService.placeOrder(customerId: "C-1234") → "ORD-9001" — 1ms
`;

/**
 * A trace the GRAMMAR accepts and the RULES refuse: the scenario header comes from a test name, and
 * a test name can say anything. This is the only shape that reaches the "breaks <rules>" branch —
 * a rendered narrative is refused one step earlier, by the grammar.
 */
const STRUCTURAL_WITH_AN_ADDRESS = `scenario: ada@example.com places an order

- OrderService.placeOrder(customerId, total)
`;

/**
 * What the verb can learn about a project without being told: which NarrativeTrace it resolved, and
 * which structural trace is safe to attach.
 */
describe("the install coordinate", () => {
  test("is every NarrativeTrace package the project resolved, in name order", () => {
    const state = snapshot({
      installedPackages: withPackages({
        vitest: { name: "vitest", version: "3.2.7" },
        "@narrativetrace/vitest": { name: "@narrativetrace/vitest", version: "0.2.0" },
        "@narrativetrace/core": { name: "@narrativetrace/core", version: "0.2.0" },
      }),
    });

    expect(installCoordinate(state)).toBe(
      "@narrativetrace/core@0.2.0, @narrativetrace/vitest@0.2.0",
    );
  });

  test("says so plainly when the project resolved none of ours", () => {
    expect(installCoordinate(snapshot())).toBe(INSTALL_UNKNOWN);
  });

  test("names a package whose own version is missing rather than dropping it", () => {
    const state = snapshot({
      installedPackages: withPackages({ "@narrativetrace/core": { name: "@narrativetrace/core" } }),
    });

    expect(installCoordinate(state)).toBe("@narrativetrace/core@unknown version");
  });
});

describe("choosing a structural trace to attach", () => {
  test("takes the first attachable .nt in path order, so two runs choose the same one", () => {
    const state = snapshot({
      outputFiles: withFiles({
        "narrativetrace-output/structural/b.nt": STRUCTURAL_TRACE,
        "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE.replace("placeOrder", "settle"),
      }),
    });

    expect(chooseTrace(state, "").content).toContain("settle");
  });

  test("reads the approved-trace directory as well as the output directory", () => {
    const state = snapshot({
      approvedDirFiles: withFiles({ "narratives/order.approved.nt": STRUCTURAL_TRACE }),
    });

    expect(chooseTrace(state, "").content).toBe(STRUCTURAL_TRACE);
  });

  test("skips a .nt that is not a structural trace, and says which and why", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/notes.nt": "just some notes" }),
    });

    const choice = chooseTrace(state, "");

    expect(choice.content).toBe("");
    expect(choice.reason).toBe(
      "no attachable structural trace: narrativetrace-output/notes.nt is not a structural trace",
    );
  });

  test("skips a .nt the value-free rules refuse, and names the rules", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/named.nt": STRUCTURAL_WITH_AN_ADDRESS }),
    });

    expect(chooseTrace(state, "").reason).toBe(
      "no attachable structural trace: narrativetrace-output/named.nt breaks vf.email",
    );
  });

  test("skips a rendered narrative wearing the .nt name on the grammar, one step earlier", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/rendered.nt": RENDERED }),
    });

    expect(chooseTrace(state, "").reason).toBe(
      "no attachable structural trace: narrativetrace-output/rendered.nt is not a structural trace",
    );
  });

  test("says there was nothing to choose from, rather than attaching nothing silently", () => {
    expect(chooseTrace(snapshot(), "").reason).toBe(
      "no structural trace was found under this project's output",
    );
  });

  /** A file that is not a `.nt` is not a candidate at all, however structural its content. */
  test("ignores a structural trace saved under any other extension", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/structural/a.txt": STRUCTURAL_TRACE }),
    });

    expect(chooseTrace(state, "").reason).toBe(
      "no structural trace was found under this project's output",
    );
  });

  test("treats a whitespace-only preference as no preference", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE }),
    });

    expect(chooseTrace(state, "   ").content).toBe(STRUCTURAL_TRACE);
    expect(chooseTrace(state, "   ").reason).toBe("");
  });

  test("a chosen trace reports no reason, so a caller cannot print one", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE }),
    });

    expect(chooseTrace(state, "a.nt")).toEqual({ content: STRUCTURAL_TRACE, reason: "" });
  });

  test("names every rule a candidate breaks, not only the first", () => {
    const twice = "scenario: ada@example.com ran it under /Users/ada/work/\n\n- A.b(c)\n";
    const state = snapshot({ outputFiles: withFiles({ "narrativetrace-output/x.nt": twice }) });

    expect(chooseTrace(state, "").reason).toBe(
      "no attachable structural trace: narrativetrace-output/x.nt breaks vf.email, vf.home-path",
    );
  });

  test("honours a path suffix the user named", () => {
    const state = snapshot({
      outputFiles: withFiles({
        "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE.replace("placeOrder", "settle"),
        "narrativetrace-output/structural/b.nt": STRUCTURAL_TRACE,
      }),
    });

    expect(chooseTrace(state, "b.nt").content).toBe(STRUCTURAL_TRACE);
  });

  test("says a named trace was not found, instead of quietly choosing another", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE }),
    });

    expect(chooseTrace(state, "b.nt").reason).toBe(
      "b.nt was not found under this project's output",
    );
  });

  test("says why a named trace could not be attached, instead of choosing another", () => {
    const state = snapshot({
      outputFiles: withFiles({
        "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE,
        "narrativetrace-output/structural/b.nt": STRUCTURAL_WITH_AN_ADDRESS,
      }),
    });

    expect(chooseTrace(state, "b.nt").reason).toBe("b.nt breaks vf.email");
  });
});

describe("the attachment set a project yields", () => {
  test("carries the doctor's JSON and the chosen trace", () => {
    const state = snapshot({
      outputFiles: withFiles({ "narrativetrace-output/structural/a.nt": STRUCTURAL_TRACE }),
    });

    const attachments = feedbackAttachments(state, DOCTOR_JSON, "");

    expect(attachments.doctorReport).toBe(DOCTOR_JSON);
    expect(attachments.structuralTrace).toBe(STRUCTURAL_TRACE);
  });

  test("records why there is no doctor report when the doctor could not run", () => {
    const attachments = feedbackAttachments(snapshot(), "", "");

    expect(attachments.doctorReport).toBe("");
    expect(attachments.doctorUnavailable).toBe(DOCTOR_UNAVAILABLE);
    expect(attachments.structuralTrace).toBe("");
  });

  test("reads a whitespace-only doctor report as none at all", () => {
    expect(feedbackAttachments(snapshot(), "   ", "").doctorUnavailable).toBe(DOCTOR_UNAVAILABLE);
  });
});
