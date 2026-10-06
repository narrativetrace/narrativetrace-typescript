// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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
