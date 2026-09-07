// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export { type AliasIndex, aliasIndex } from "./alias-index.js";
export { type BoundedContext, boundedContext } from "./bounded-context.js";
export {
  contextOfClass,
  resolveContext,
  type SourcePathLookup,
  UNASSIGNED_CONTEXT,
} from "./context-resolver.js";
export {
  GLOSSARY_ABBREVIATIONS_SCHEMA_VERSION,
  GLOSSARY_SCHEMA_VERSION,
  type Glossary,
  glossary,
} from "./glossary.js";
export { harvestStatic, harvestTraces } from "./glossary-harvester.js";
export { readGlossaryJson } from "./glossary-json-reader.js";
export { writeGlossaryJson } from "./glossary-json-writer.js";
export { renderGlossaryMarkdown } from "./glossary-markdown-renderer.js";
export { type MergeResult, mergeHarvest } from "./glossary-merger.js";
export {
  type GlossaryHarvestArtifacts,
  type GlossaryHarvestRequest,
  type HarvestMode,
  runGlossaryHarvest,
} from "./glossary-suite-harvest.js";
export {
  type GlossaryTerm,
  type GlossaryTermInput,
  glossaryTerm,
} from "./glossary-term.js";
export {
  type GlossaryTranslator,
  glossaryTranslator,
  type TranslatedPhrase,
} from "./glossary-translator.js";
export { renderGlossaryUsageReport } from "./glossary-usage-report.js";
export {
  GLOSSARY_FILE,
  glossaryVocabulary,
  readProjectVocabulary,
  type VocabularyFileReader,
} from "./glossary-vocabulary.js";
export { type HarvestCandidate, harvestCandidate } from "./harvest-candidate.js";
export {
  NON_CANONICAL_TERM,
  nonCanonicalTermIssues,
} from "./non-canonical-term-issues.js";
export { suggestRename } from "./rename-suggester.js";
export {
  SCAFFOLDING_LOCALES,
  type ScaffoldingBundle,
  scaffoldingBundle,
} from "./scaffolding-bundle.js";
export { type SynonymAlias, synonymAlias } from "./synonym-alias.js";
export { isTermKind, TERM_KINDS, type TermKind } from "./term-kind.js";
export {
  classCandidate,
  exceptionCandidate,
  methodCandidates,
  normalizePhrase,
  parameterCandidate,
  type TermCandidate,
} from "./term-normalizer.js";
export { isTermStatus, TERM_STATUSES, type TermStatus } from "./term-status.js";
export {
  type CallOutcome,
  readTraceExport,
  type TranslatableCall,
  type TranslatableParameter,
  type TranslatableTrace,
} from "./trace-export-reader.js";
export {
  runTraceTranslation,
  type StoredTrace,
  type TraceTranslationArtifacts,
  type TraceTranslationRunRequest,
  type TranslatedFile,
} from "./trace-translation-run.js";
export {
  renderTranslatedTrace,
  type TraceTranslationRequest,
  type TranslatedTrace,
  type TranslationGap,
} from "./trace-translation-view.js";
export { formatVocabularySummary } from "./vocabulary-summary.js";
export {
  type VocabularyViolation,
  vocabularyViolation,
} from "./vocabulary-violation.js";
export { collectViolations } from "./vocabulary-violations.js";
