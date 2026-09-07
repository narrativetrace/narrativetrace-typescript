// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export {
  type AbbreviationTier,
  abbreviationScore,
  classifyAbbreviation,
} from "./abbreviation-dictionary.js";
export { analyzeClarity, type ClarityIssue, type ClarityResult } from "./clarity-analyzer.js";
export {
  type ClarityCliOptions,
  type ClarityFormat,
  parseClarityArgs,
  runClarityCli,
} from "./clarity-cli.js";
export { type ClarityGateThresholds, evaluateClarityGate } from "./clarity-gate.js";
export { exportClarityJson, exportClarityJsonReport } from "./clarity-json-export.js";
export {
  renderClarityReport,
  renderClaritySuiteReport,
  type ScenarioResult,
} from "./clarity-report-renderer.js";
export { scoreClassName } from "./class-name-scorer.js";
export { scoreCohesion } from "./cohesion-scorer.js";
export { hasNoun, isValidCollocation } from "./collocation-dictionary.js";
export {
  abbreviationExpansion,
  type DomainVocabulary,
  domainVocabulary,
  emptyVocabulary,
  isAcceptedAbbreviation,
  isDomainNoun,
  isDomainVerb,
  isEmptyVocabulary,
} from "./domain-vocabulary.js";
export { classifyToken, type TokenTier, tokenTierScore } from "./generic-token-detector.js";
export { tokenize } from "./identifier-tokenizer.js";
export { scoreMethodName } from "./method-name-scorer.js";
export { analyzeMorphology, type PartOfSpeech } from "./morphology-analyzer.js";
export { scoreParameterName } from "./parameter-name-scorer.js";
export {
  classifyRoleSuffix,
  expectedVerbsForRole,
  type RoleSuffixCategory,
} from "./role-suffix-dictionary.js";
export { type StructuralInput, scoreStructural } from "./structural-scorer.js";
export {
  classifyVerb,
  type VerbCategory,
  verbCategoryMembers,
  verbDictionaryMetrics,
} from "./verb-dictionary.js";
