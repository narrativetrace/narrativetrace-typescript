// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "trap.parameter-arg0";
const ARG_PLACEHOLDER = /\barg0\b/;
const FIX =
  'Pass parameter names explicitly: traceObject(target, context, { methodName: ["paramA", "paramB"] }) — required for classes you do not own, or when a build tool strips them.';

/**
 * Parameter names of classes you don't own (or a build that strips them) are lost at compile
 * time and render as `arg0`, `arg1`, ... Doctor reads already-rendered output, if any exists, and
 * flags the tell-tale placeholder rather than guessing from source.
 */
export const checkParameterArg0: DoctorCheck = (snapshot) => {
  if (snapshot.outputFiles.size === 0) {
    const message = "no rendered output found yet — run your tests or app once to check this";
    return pass(ID, message, DOC.manualParameterNames);
  }
  const offender = [...snapshot.outputFiles].find(([, content]) => ARG_PLACEHOLDER.test(content));
  if (!offender) {
    const message = "rendered output carries real parameter names — no arg0 placeholders found";
    return pass(ID, message, DOC.manualParameterNames);
  }
  const [path] = offender;
  const message = `rendered output shows arg0-style placeholders (first seen in ${path}) — parameter names were not captured`;
  return fail(ID, message, FIX, DOC.manualParameterNames);
};
