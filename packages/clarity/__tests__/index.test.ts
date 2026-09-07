// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  abbreviationScore,
  analyzeClarity,
  analyzeMorphology,
  classifyAbbreviation,
  classifyRoleSuffix,
  classifyToken,
  classifyVerb,
  expectedVerbsForRole,
  exportClarityJson,
  exportClarityJsonReport,
  hasNoun,
  isValidCollocation,
  renderClarityReport,
  scoreClassName,
  scoreCohesion,
  scoreMethodName,
  scoreParameterName,
  scoreStructural,
  tokenize,
  tokenTierScore,
} from "../src/index.js";

test("barrel exports are accessible", () => {
  expect(typeof tokenize).toBe("function");
  expect(typeof analyzeClarity).toBe("function");
  expect(typeof renderClarityReport).toBe("function");
  expect(typeof exportClarityJson).toBe("function");
  expect(typeof exportClarityJsonReport).toBe("function");
  expect(typeof classifyToken).toBe("function");
  expect(typeof tokenTierScore).toBe("function");
  expect(typeof classifyAbbreviation).toBe("function");
  expect(typeof abbreviationScore).toBe("function");
  expect(typeof analyzeMorphology).toBe("function");
  expect(typeof hasNoun).toBe("function");
  expect(typeof isValidCollocation).toBe("function");
  expect(typeof classifyRoleSuffix).toBe("function");
  expect(typeof expectedVerbsForRole).toBe("function");
  expect(typeof classifyVerb).toBe("function");
  expect(typeof scoreClassName).toBe("function");
  expect(typeof scoreMethodName).toBe("function");
  expect(typeof scoreParameterName).toBe("function");
  expect(typeof scoreCohesion).toBe("function");
  expect(typeof scoreStructural).toBe("function");
});
