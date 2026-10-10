// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export { frameworkCheck } from "./doctor/checks/framework-wiring.js";
export { DOCTOR_CHECKS, runDoctor } from "./doctor/doctor.js";
export { buildSnapshot } from "./doctor/environment.js";
export { renderHuman, renderJson } from "./doctor/render.js";
export type {
  DoctorCheck,
  DoctorReport,
  DoctorSnapshot,
  Env,
  Finding,
  FindingStatus,
  PackageJsonLike,
} from "./doctor/types.js";
export {
  type Attachments,
  attachmentsOf,
  attachmentsWithoutDoctorReport,
  hasDoctorReport,
  hasStructuralTrace,
} from "./feedback/feedback-attachments.js";
export {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  feedbackCategory,
} from "./feedback/feedback-category.js";
export {
  describeRefusal,
  drafted,
  draftFeedback,
  type FeedbackDraft,
} from "./feedback/feedback-drafter.js";
export {
  chooseTrace,
  DOCTOR_UNAVAILABLE,
  feedbackAttachments,
  INSTALL_UNKNOWN,
  installCoordinate,
  type TraceChoice,
} from "./feedback/feedback-gatherer.js";
export {
  feedbackDraftedJson,
  feedbackGhJson,
  feedbackGhUnavailableJson,
  feedbackRefusedJson,
  feedbackUrlJson,
} from "./feedback/feedback-json.js";
export {
  FEEDBACK_SUBDIRECTORY,
  type FeedbackFiles,
  feedbackFiles,
  OUTPUT_DIRECTORY_ENV,
} from "./feedback/feedback-paths.js";
export {
  PRIVACY_NOTE,
  renderFeedbackBody,
  renderFeedbackDraft,
} from "./feedback/feedback-render.js";
export {
  type AgentIdentity,
  describeAgent,
  type FeedbackReport,
  feedbackReport,
  type ProblemNarrative,
  problemNarrative,
  reportFields,
  UNKNOWN_AGENT,
} from "./feedback/feedback-report.js";
export { ghIssueCreateLine } from "./feedback/gh-command-line.js";
export { toTilde } from "./feedback/home-paths.js";
export {
  ISSUE_FORM_MAX_LENGTH,
  issueFormUrl,
  staysUnderBudget,
  TRUNCATION_MARKER,
} from "./feedback/issue-form-url.js";
export {
  issueLabelsFor,
  issueTitleFor,
  PUBLIC_REPOSITORY_FORM,
  PUBLIC_REPOSITORY_SLUG,
  RUNTIME,
  requireThisRuntime,
} from "./feedback/public-repository.js";
export { looksStructural } from "./feedback/structural-trace.js";
export {
  DOCTOR_REPORT_FIELD,
  describeViolation,
  rulesRefusing,
  type ValueFreeViolation,
  valueFreeViolations,
} from "./feedback/value-free-check.js";
export { VALUE_FREE_RULES, type ValueFreeRule, valueFreeRule } from "./feedback/value-free-rule.js";
export type {
  CheckBinding,
  Evidence,
  FrameworkRow,
  IntegrationModule,
  Marker,
  Wiring,
} from "./frameworks/framework-row.js";
export { NO_TIER_B_CASE } from "./frameworks/framework-row.js";
export {
  FRAMEWORK_ROWS,
  frameworkCheckIds,
  frameworkRowById,
} from "./frameworks/framework-table.js";
export type { Action, ActionKind } from "./init/action.js";
export {
  CARRIER_COORDINATE_NAME,
  type Carrier,
  type CarrierHome,
  type CarrierSearch,
  carrierBody,
  openCarrier,
  resolveCarrier,
} from "./init/carrier.js";
export {
  type AppliedAction,
  type AppliedStatus,
  type ExecutionReport,
  reportExitCode,
  reportHasRefusals,
} from "./init/execution-report.js";
export {
  type InitOptions,
  type InitScope,
  initOptions,
  type VendorChoice,
} from "./init/init-options.js";
export {
  type InitPlan,
  planExitCode,
  planHasRefusals,
  planIsEmpty,
  planRefusals,
} from "./init/init-plan.js";
export { planInstall } from "./init/init-planner.js";
export type { InstalledSkill, SkillPresence } from "./init/installed-skill.js";
export { applyPlan } from "./init/plan-executor.js";
export {
  type RenderOptions,
  renderPlan,
  renderPlanDiff,
  renderPlanJson,
  renderPlanText,
  renderReport,
  renderReportJson,
  renderReportText,
} from "./init/plan-renderer.js";
export {
  DEFAULT_OUTPUT_DIRECTORY,
  type ProjectState,
  type ProjectStateInput,
  projectState,
} from "./init/project-state.js";
export { readProjectState } from "./init/project-state-reader.js";
export { isSkillsInstalled, planRefresh } from "./init/refresh-planner.js";
export type { SkillCatalogue, SkillEntry, SkillFlavour } from "./init/skill-catalogue.js";
export { planUninstall } from "./init/uninstall-planner.js";
export { carrierVersionWarning } from "./init/version-guard.js";
export type { Version } from "./semver-lite.js";
export { compareVersions, parseVersion, satisfiesRange } from "./semver-lite.js";
