// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "config.output-env";
const VALID_VALUES = new Set(["true", "false"]);

/** `NARRATIVETRACE_OUTPUT`, if set, must be exactly `"true"` or `"false"` (case-insensitive). */
export const checkOutputEnv: DoctorCheck = (snapshot) => {
  const raw = snapshot.env.NARRATIVETRACE_OUTPUT;
  if (raw === undefined) {
    return pass(
      ID,
      "NARRATIVETRACE_OUTPUT is not set — output stays on its default (on)",
      DOC.whereSettingsComeFrom,
    );
  }
  if (VALID_VALUES.has(raw.toLowerCase())) {
    return pass(ID, `NARRATIVETRACE_OUTPUT=${raw}`, DOC.whereSettingsComeFrom);
  }
  return fail(
    ID,
    `NARRATIVETRACE_OUTPUT is set to '${raw}', which is neither "true" nor "false"`,
    "Set NARRATIVETRACE_OUTPUT=true or NARRATIVETRACE_OUTPUT=false (or unset it) — any other value is read as a truthy string, most likely turning output on when you meant to turn it off.",
    DOC.whereSettingsComeFrom,
  );
};
