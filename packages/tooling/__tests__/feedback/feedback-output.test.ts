// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { feedbackCategory } from "../../src/feedback/feedback-category.js";
import { draftFeedback } from "../../src/feedback/feedback-drafter.js";
import {
  feedbackDraftedJson,
  feedbackGhJson,
  feedbackGhUnavailableJson,
  feedbackRefusedJson,
  feedbackUrlJson,
} from "../../src/feedback/feedback-json.js";
import { feedbackFiles, OUTPUT_DIRECTORY_ENV } from "../../src/feedback/feedback-paths.js";
import { renderFeedbackBody } from "../../src/feedback/feedback-render.js";
import { feedbackReport, UNKNOWN_AGENT } from "../../src/feedback/feedback-report.js";
import { ISSUE_FORM_MAX_LENGTH, issueFormUrl } from "../../src/feedback/issue-form-url.js";
import { completeReport } from "./reports.js";

/**
 * What the verb's two outputs are, as text and as an envelope — and the two edges of the URL's own
 * length budget.
 *
 * INTENT: these are read by an agent rather than a person, so the shape is the contract. Every
 * envelope carries its exit code so neither reader has to infer it from the other's.
 */
describe("the two output paths", () => {
  test("land under the project's own output directory", () => {
    expect(feedbackFiles({})).toEqual({
      directory: "narrativetrace-output/feedback",
      draftFile: "narrativetrace-output/feedback/feedback-draft.md",
      bodyFile: "narrativetrace-output/feedback/feedback-body.md",
    });
  });

  test("follow the same environment variable the doctor's own snapshot builder reads", () => {
    expect(feedbackFiles({ [OUTPUT_DIRECTORY_ENV]: "traces" }).bodyFile).toBe(
      "traces/feedback/feedback-body.md",
    );
  });
});

describe("the --json envelopes", () => {
  const files = feedbackFiles({});

  test("a drafted report carries its facts, its files and exit 0", () => {
    const envelope = JSON.parse(
      feedbackDraftedJson(completeReport(), files.draftFile, files.bodyFile, "no trace"),
    );

    expect(envelope).toEqual({
      verb: "draft",
      status: "drafted",
      runtime: "typescript",
      category: "doctor",
      install: "@narrativetrace/core@0.2.0, @narrativetrace/vitest@0.2.0",
      step: "trap.redaction-proof",
      language: "en",
      agent: "example-cli / example-model",
      draftFile: files.draftFile,
      bodyFile: files.bodyFile,
      traceNote: "no trace",
      exitCode: 0,
    });
  });

  test("a refusal names the channel it came from, every violation, and exit 2", () => {
    const draft = draftFeedback(feedbackReport({ ...completeReport(), step: "ada@example.com" }));
    if (draft.status !== "refused") throw new Error("expected a refusal");

    const envelope = JSON.parse(feedbackRefusedJson("url", draft));

    expect(envelope.verb).toBe("url");
    expect(envelope.status).toBe("refused");
    expect(envelope.exitCode).toBe(2);
    expect(envelope.violations).toEqual([
      { field: "step", rule: "vf.email", reason: expect.any(String) },
    ]);
  });

  test("the url and gh envelopes both name the file the body landed in", () => {
    expect(JSON.parse(feedbackUrlJson("https://example.test/new", files.bodyFile))).toEqual({
      verb: "url",
      status: "ready",
      url: "https://example.test/new",
      bodyFile: files.bodyFile,
      exitCode: 0,
    });
    expect(JSON.parse(feedbackGhJson("gh issue create", files.bodyFile))).toEqual({
      verb: "gh",
      status: "ready",
      command: "gh issue create",
      bodyFile: files.bodyFile,
      exitCode: 0,
    });
  });

  test("an unavailable gh channel is a fact with exit 1, not an error", () => {
    expect(JSON.parse(feedbackGhUnavailableJson("gh is not signed in"))).toEqual({
      verb: "gh",
      status: "unavailable",
      reason: "gh is not signed in",
      exitCode: 1,
    });
  });

  test("every envelope ends in one newline, like the doctor's own JSON", () => {
    for (const envelope of [
      feedbackUrlJson("u", "b"),
      feedbackGhJson("c", "b"),
      feedbackGhUnavailableJson("r"),
    ]) {
      expect(envelope.endsWith("}\n")).toBe(true);
      expect(envelope.endsWith("}\n\n")).toBe(false);
    }
  });
});

describe("the rendered body", () => {
  test("says the agent did not report itself, rather than printing an empty field", () => {
    const anonymous = feedbackReport({ ...completeReport(), agent: UNKNOWN_AGENT });

    expect(renderFeedbackBody(anonymous)).toContain("- agent: not reported");
  });
});

describe("the issue-form URL's length budget", () => {
  test("shrinks the per-field ceiling until the whole URL fits", () => {
    const url = issueFormUrl(feedbackReport({ ...completeReport(), step: "x".repeat(5_000) }));

    expect(url.length).toBeLessThanOrEqual(ISSUE_FORM_MAX_LENGTH);
    expect(url).toContain("step=");
  });

  /**
   * Both found by the adversarial pass's own line of questioning, and both real: a step comes from
   * a project, so an unpaired surrogate is reachable input, and `encodeURIComponent` THROWS on one.
   * The second is the same failure arrived at from the clipping side — slicing by code unit cut an
   * astral pair in half and left exactly that lone surrogate behind.
   */
  test("folds a lone surrogate instead of throwing, so the channel stays a link", () => {
    const report = feedbackReport({
      ...completeReport(),
      step: `step ${String.fromCharCode(0xd800)}`,
    });

    const url = issueFormUrl(report);

    expect(url).toContain(encodeURIComponent("�"));
  });

  /**
   * The single `x` is load-bearing. An astral character is two code units, so a run of them alone
   * is cut on a pair boundary by any even ceiling and a code-unit slice looks correct; one BMP
   * character in front makes every pair straddle an odd offset, which is where the split happens.
   */
  test("clips by code point, so a long run of emoji is never cut mid-pair", () => {
    const report = feedbackReport({ ...completeReport(), step: `x${"🙂".repeat(900)}` });

    const url = issueFormUrl(report);

    expect(url.length).toBeLessThanOrEqual(ISSUE_FORM_MAX_LENGTH);
    expect(url).not.toContain(encodeURIComponent("�"));
  });

  test("still builds for a category that needs no doctor report", () => {
    const library = feedbackReport({ ...completeReport(), category: feedbackCategory("library") });

    expect(issueFormUrl(library)).toContain("category=library");
  });
});
