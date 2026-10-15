// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Every skill the catalogue ships — what a fresh session's init event must list. Its own module so
 * a test can compare it with the catalogue without running the grader, which exits the process.
 */
export const EXPECTED_SKILLS = [
  "add-narrative-tracing",
  "add-narrativetrace-clarity",
  "narrativetrace-doctor",
  "narrativetrace-feedback",
  "narrativetrace-verify",
  "narrativetrace-debug",
  "narrativetrace-explain",
];
