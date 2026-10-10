// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { feedbackReport } from "../../src/feedback/feedback-report.js";
import { ghIssueCreateLine } from "../../src/feedback/gh-command-line.js";
import {
  ISSUE_FORM_MAX_LENGTH,
  issueFormUrl,
  TRUNCATION_MARKER,
} from "../../src/feedback/issue-form-url.js";
import {
  issueLabelsFor,
  issueTitleFor,
  PUBLIC_REPOSITORY_FORM,
  PUBLIC_REPOSITORY_SLUG,
  RUNTIME,
} from "../../src/feedback/public-repository.js";
import { completeReport } from "./reports.js";

const LONG = "x".repeat(6_000);

describe("where a report is filed", () => {
  test("is this runtime's own public repository, and this runtime's own form", () => {
    expect(PUBLIC_REPOSITORY_SLUG).toBe("narrativetrace/narrativetrace-typescript");
    expect(PUBLIC_REPOSITORY_FORM).toBe("narrativetrace-report.yml");
    expect(RUNTIME).toBe("typescript");
  });

  test("refuses to file another runtime's report into this tracker", () => {
    const foreign = feedbackReport({ ...completeReport(), runtime: "java" });

    expect(() => issueFormUrl(foreign)).toThrow(/narrativetrace-typescript/);
    expect(() => ghIssueCreateLine(foreign, "body.md")).toThrow(/file it through that runtime/);
  });

  test("labels the report the four ways triage sorts on, in a stable order", () => {
    expect(issueLabelsFor(completeReport())).toEqual([
      "from-agent",
      "runtime:typescript",
      "category:doctor",
      "lang:en",
    ]);
  });

  test("clips a label to the length the host itself refuses past, and only past it", () => {
    const report = feedbackReport({ ...completeReport(), language: LONG });

    for (const label of issueLabelsFor(report)) expect(label.length).toBeLessThanOrEqual(50);
    expect(
      issueLabelsFor(feedbackReport({ ...completeReport(), language: "x".repeat(45) })),
    ).toContain(`lang:${"x".repeat(45)}`);
  });

  /** The marker is what tells a reader the rest is in the body file, so its text is the contract. */
  test("ends a clipped field with the marker that names where the rest went", () => {
    const url = issueFormUrl(feedbackReport({ ...completeReport(), step: "s".repeat(500) }));

    expect(url).toContain(encodeURIComponent(TRUNCATION_MARKER).replace(/%20/g, "%20"));
    expect(TRUNCATION_MARKER).toBe(" … (continued in the pasted body)");
  });

  test("titles the issue by the category and the step it happened at", () => {
    expect(issueTitleFor(completeReport())).toBe("doctor: trap.redaction-proof");
  });
});

describe("the pre-filled issue-form URL", () => {
  test("names the form and pre-fills the short, searchable fields", () => {
    const url = issueFormUrl(completeReport());

    expect(url.startsWith(`https://github.com/${PUBLIC_REPOSITORY_SLUG}/issues/new?`)).toBe(true);
    expect(url).toContain(`template=${PUBLIC_REPOSITORY_FORM}`);
    expect(url).toContain("category=doctor");
    expect(url).toContain("runtime=typescript");
    expect(url).toContain("language=en");
    expect(url).toContain("step=trap.redaction-proof");
  });

  test("never carries the body, whose attachments are kilobytes", () => {
    const url = issueFormUrl(completeReport());

    expect(url).not.toContain("findings");
    expect(url).not.toContain("report=");
    expect(url).not.toContain("did=");
  });

  test("writes a space as %20, not as a plus a prefill reader would show", () => {
    const url = issueFormUrl(feedbackReport({ ...completeReport(), step: "step one two" }));

    expect(url).toContain("step=step%20one%20two");
    expect(url).not.toContain("+");
  });

  test("stays inside its own length budget however long the fields are", () => {
    const url = issueFormUrl(
      feedbackReport({
        ...completeReport(),
        install: LONG,
        step: LONG,
        language: LONG,
        agent: { product: LONG, model: LONG },
      }),
    );

    expect(url.length).toBeLessThanOrEqual(ISSUE_FORM_MAX_LENGTH);
    expect(url).toContain(encodeURIComponent(TRUNCATION_MARKER).replace(/%20/g, "%20"));
  });

  test("keeps every parameter present even after clipping, so no box opens unexplained", () => {
    const url = issueFormUrl(feedbackReport({ ...completeReport(), install: LONG, step: LONG }));
    const names = [...url.matchAll(/[?&]([^=&]+)=/g)].map((match) => match[1]);

    expect(names).toEqual([
      "template",
      "title",
      "labels",
      "runtime",
      "category",
      "install",
      "step",
      "language",
      "agent",
    ]);
  });
});

describe("the gh issue create line", () => {
  test("files the body from a FILE and names the repository and the form", () => {
    const line = ghIssueCreateLine(completeReport(), "narrativetrace-output/feedback/body.md");

    expect(line).toBe(
      `gh issue create --repo ${PUBLIC_REPOSITORY_SLUG} --template ${PUBLIC_REPOSITORY_FORM}` +
        " --title 'doctor: trap.redaction-proof'" +
        " --body-file narrativetrace-output/feedback/body.md" +
        " --label from-agent --label runtime:typescript --label category:doctor --label lang:en",
    );
  });

  test("single-quotes the title, so a step a project named cannot become a second command", () => {
    const report = feedbackReport({
      ...completeReport(),
      step: "it's broken; rm -rf /tmp/x",
    });

    const line = ghIssueCreateLine(report, "body.md");

    expect(line).toContain(`--title 'doctor: it'\\''s broken; rm -rf /tmp/x'`);
  });

  test("keeps the printed command on one line, whatever the step contained", () => {
    const report = feedbackReport({ ...completeReport(), step: "line one\nline two" });

    expect(ghIssueCreateLine(report, "body.md")).toContain("--title 'doctor: line one line two'");
  });

  test("collapses every run of whitespace, not only the first", () => {
    const report = feedbackReport({ ...completeReport(), step: "a \t b \n\n c" });

    expect(ghIssueCreateLine(report, "body.md")).toContain("--title 'doctor: a b c'");
  });

  test("takes the body path as the user will type it, without surrounding whitespace", () => {
    expect(ghIssueCreateLine(completeReport(), "  body.md  ")).toContain("--body-file body.md ");
  });

  test("has no line to print without a report about this runtime, whatever the path", () => {
    const foreign = feedbackReport({ ...completeReport(), runtime: "python" });

    expect(() => ghIssueCreateLine(foreign, "body.md")).toThrow(
      `this library files into narrativetrace/narrativetrace-typescript, and the report's runtime` +
        ` is "python" — file it through that runtime's own tooling`,
    );
  });

  test("has no line to print without a body file", () => {
    for (const absent of ["", "  ", null, 7]) {
      expect(() => ghIssueCreateLine(completeReport(), absent as unknown as string)).toThrow(
        "the gh line files the body from a FILE — there is no line without one",
      );
    }
  });
});
