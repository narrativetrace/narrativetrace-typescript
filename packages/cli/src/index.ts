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
export type { Version } from "./semver-lite.js";
export { compareVersions, parseVersion, satisfiesRange } from "./semver-lite.js";
