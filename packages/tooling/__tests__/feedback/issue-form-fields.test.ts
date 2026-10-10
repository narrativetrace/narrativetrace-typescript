// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FEEDBACK_CATEGORIES } from "../../src/feedback/feedback-category.js";
import { issueFormUrl } from "../../src/feedback/issue-form-url.js";
import { PUBLIC_REPOSITORY_FORM } from "../../src/feedback/public-repository.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";
import { completeReport } from "./reports.js";

/**
 * The issue form and the URL that pre-fills it, held together.
 *
 * INTENT: the host documents a form field's `id` as "the canonical identifier for the field in URL
 * query parameter prefills" — and silently ignores a parameter naming an id the form does not have.
 * So a renamed field does not fail anywhere: it produces a form that opens with half its boxes
 * empty, and nobody finds out until a reporter fills them in by hand. This test is the only thing
 * that notices.
 *
 * @llmNote The form is read as TEXT rather than parsed as YAML, because this package declares zero
 * dependencies and the question is a flat one: which ids does the file declare. If the question
 * ever becomes structural (which validations, which options, in which order), the test moves to a
 * package that may have a YAML parser rather than growing a parser here.
 *
 * @llmNote The form file is declared as an input of this package's `test` and `coverage` tasks in
 * `turbo.json`, through `$TURBO_ROOT$`. Without that, editing only the form leaves this test cached
 * and UNRUN inside `check` — the repo-reading-test hole every port in the family has had, and the
 * declaration was probed by changing the file's content rather than assumed.
 */

const FORM = join(REPO_ROOT, ".github/ISSUE_TEMPLATE", PUBLIC_REPOSITORY_FORM);

/** Parameters the URL carries that are the host's own, not form field ids. */
const RESERVED = ["template", "title", "labels"];

function form(): string {
  return readFileSync(FORM, "utf8");
}

function declaredIds(): string[] {
  return [...form().matchAll(/^\s*id: (\S+)$/gm)].map((match) => match[1] as string);
}

function preFilledParameters(): string[] {
  return [...issueFormUrl(completeReport()).matchAll(/[?&]([^=&]+)=/g)]
    .map((match) => match[1] as string)
    .filter((name) => !RESERVED.includes(name));
}

describe.skipIf(!REPO_ROOT_REACHABLE)("the issue form and the URL that pre-fills it", () => {
  test("the form is where the URL says it is", () => {
    expect(() => form(), `${FORM} must exist — the URL names it in every report`).not.toThrow();
  });

  test("every field the URL pre-fills is a field the form declares", () => {
    const ids = declaredIds();

    for (const parameter of preFilledParameters()) {
      expect(
        ids,
        `a parameter naming an id the form does not have is silently ignored by the host`,
      ).toContain(parameter);
    }
  });

  test("every field a report can fill is on the form", () => {
    expect(declaredIds()).toEqual([
      "category",
      "runtime",
      "install",
      "step",
      "did",
      "happened",
      "expected",
      "language",
      "agent",
      "report",
      "reviewed",
    ]);
  });

  test("the dropdown offers exactly the categories the verb accepts", () => {
    const text = form();

    for (const category of FEEDBACK_CATEGORIES) {
      expect(text, `the dropdown must offer ${category.id}`).toContain(`- ${category.id}`);
    }
  });

  test("the form carries the from-agent label and a required attestation", () => {
    const text = form();

    expect(text).toContain("- from-agent");
    expect(text).toContain("no values from my traces");
    expect(text).toContain("required: true");
  });

  test("the form tells a reporter that filing is public, for somebody who arrived without the verb", () => {
    expect(form()).toContain("This issue is public");
  });

  test("the form never asks for an artifact that carries values", () => {
    expect(form()).toContain("Never paste a rendered narrative, a log file or a source file");
  });

  test("the form names the body file this runtime's verb actually writes", () => {
    expect(form()).toContain("narrativetrace-output/feedback/feedback-body.md");
  });

  /**
   * The agent field is free TEXT rather than a vendor dropdown: the set of agent products is open,
   * a dropdown goes stale, and every vendor name in a shipped file is a publish-gate exception
   * reviewed forever. So the category — a closed set the verb owns — is the form's only dropdown.
   *
   * @llmNote Asserted as "one dropdown, and it is the category" rather than by listing the vendor
   * names that must not appear. A test naming them would itself be a file that names them, and this
   * repository's own publish trace gate refuses one.
   */
  test("the category is the form's only dropdown, so no field enumerates vendors", () => {
    const dropdowns = [...form().matchAll(/^\s*- type: dropdown\n\s*id: (\S+)$/gm)].map(
      (match) => match[1],
    );

    expect(dropdowns).toEqual(["category"]);
  });
});
