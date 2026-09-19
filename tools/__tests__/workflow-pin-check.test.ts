// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOrderViolations,
  findPinViolations,
  findWorkflowFiles,
} from "../workflow-pin-check.js";

describe("workflow-pin-check", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "workflow-pin-check-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("findWorkflowFiles", () => {
    it("finds every .yml/.yaml file directly under .github/workflows, sorted", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(join(root, ".github", "workflows", "b.yml"), "");
      writeFileSync(join(root, ".github", "workflows", "a.yaml"), "");
      writeFileSync(join(root, ".github", "workflows", "readme.md"), "");

      expect(findWorkflowFiles(root)).toEqual([
        join(root, ".github", "workflows", "a.yaml"),
        join(root, ".github", "workflows", "b.yml"),
      ]);
    });

    it("returns an empty list when there is no .github/workflows directory at all", () => {
      expect(findWorkflowFiles(root)).toEqual([]);
    });
  });

  describe("findPinViolations", () => {
    it("flags a checkout/setup-node/cache pin below its node24-era major", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        [
          "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
          "      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0",
          "      - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0",
          "",
        ].join("\n"),
      );

      const violations = findPinViolations(root);

      expect(violations).toEqual([
        {
          file: ".github/workflows/ci.yml",
          line: 1,
          action: "actions/checkout",
          major: 4,
          text: "- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
        },
        {
          file: ".github/workflows/ci.yml",
          line: 2,
          action: "actions/setup-node",
          major: 4,
          text: "- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0",
        },
        {
          file: ".github/workflows/ci.yml",
          line: 3,
          action: "actions/cache",
          major: 4,
          text: "- uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0",
        },
      ]);
    });

    it("passes a pin on or above the node24-era major", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        "      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0\n",
      );

      expect(findPinViolations(root)).toEqual([]);
    });

    it("flags a codeql-action SUBACTION pin (owner/repo/subaction) below its node24-era major", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "scorecard.yml"),
        "      - uses: github/codeql-action/upload-sarif@3ea06614dafe36dec890db3446326e0d40ce53d4 # v3.38.1\n",
      );

      expect(findPinViolations(root)).toEqual([
        {
          file: ".github/workflows/scorecard.yml",
          line: 1,
          action: "github/codeql-action/upload-sarif",
          major: 3,
          text: "- uses: github/codeql-action/upload-sarif@3ea06614dafe36dec890db3446326e0d40ce53d4 # v3.38.1",
        },
      ]);
    });

    it("passes a codeql-action subaction pin on or above the node24-era major", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "scorecard.yml"),
        "      - uses: github/codeql-action/upload-sarif@1c5b675653bb5c22dbe9b12b556ec555138e09fd # v4.38.1\n",
      );

      expect(findPinViolations(root)).toEqual([]);
    });

    it("never flags ossf/scorecard-action — a docker action, outside the node24-major map", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "scorecard.yml"),
        "      - uses: ossf/scorecard-action@2d1146689b8cda280b9bc96326124645441f03bc # v2.4.4\n",
      );

      expect(findPinViolations(root)).toEqual([]);
    });

    it("never flags an action outside the node24-major map, however low its pin", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        "      - uses: NuGet/login@8d196754b4036150537f80ac539e15c2f1028841 # v1\n",
      );

      expect(findPinViolations(root)).toEqual([]);
    });

    it("is clean when there is no .github/workflows directory at all", () => {
      expect(findPinViolations(root)).toEqual([]);
    });
  });

  describe("findOrderViolations", () => {
    it("flags actions/setup-node with no preceding corepack enable in the same job", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        [
          "jobs:",
          "  check:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0",
          "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
          "        with:",
          "          node-version: 22",
          "      - run: corepack enable",
          "      - run: pnpm install --frozen-lockfile",
          "",
        ].join("\n"),
      );

      expect(findOrderViolations(root)).toEqual([
        {
          file: ".github/workflows/ci.yml",
          line: 6,
          text: "- uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
        },
      ]);
    });

    it("passes when corepack enable precedes actions/setup-node in the same job", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        [
          "jobs:",
          "  check:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0",
          "      - run: corepack enable",
          "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
          "        with:",
          "          node-version: 22",
          "      - run: pnpm install --frozen-lockfile",
          "",
        ].join("\n"),
      );

      expect(findOrderViolations(root)).toEqual([]);
    });

    it("passes when pnpm/action-setup precedes actions/setup-node in the same job", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        [
          "jobs:",
          "  check:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.1.0",
          "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
          "",
        ].join("\n"),
      );

      expect(findOrderViolations(root)).toEqual([]);
    });

    it("does not carry pnpm-readiness across a job boundary", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "mutation.yml"),
        [
          "jobs:",
          "  incremental:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: corepack enable",
          "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
          "",
          "  full:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
          "      - run: corepack enable",
          "",
        ].join("\n"),
      );

      expect(findOrderViolations(root)).toEqual([
        {
          file: ".github/workflows/mutation.yml",
          line: 11,
          text: "- uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
        },
      ]);
    });

    it("never flags a job with no actions/setup-node step at all", () => {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "security.yml"),
        [
          "jobs:",
          "  secrets:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0",
          "      - run: sh scripts/gitleaks.sh full",
          "",
        ].join("\n"),
      );

      expect(findOrderViolations(root)).toEqual([]);
    });

    it("is clean when there is no .github/workflows directory at all", () => {
      expect(findOrderViolations(root)).toEqual([]);
    });
  });
});
