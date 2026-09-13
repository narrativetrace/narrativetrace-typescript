// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "config.trace-object-keys";

// The valid nested shape is `methods: { methodName: { params: [...], ... } }` — a per-method
// config OBJECT. The trap is skipping the method-config level and putting the param array
// straight under a method name (`methods: { methodName: [...] }`), which now throws naming the
// accepted per-method keys rather than the silent no-op it used to be. `[^{}]*` stops the match at
// the first nested `{`, so the legitimate form (an object, not an array, under the method name)
// never matches here.
const OLD_SHAPE = /\bmethods\s*:\s*\{[^{}]*:\s*\[/;

/**
 * `traceObject`'s options used to silently no-op when a per-method entry skipped straight to an
 * array instead of the `{ params: [...] }` object (now throws, naming the accepted keys) — a
 * source file still shaped that way needs the method-config object added back, not just an
 * upgrade.
 */
export const checkTraceObjectKeys: DoctorCheck = (snapshot) => {
  const offender = [...snapshot.sourceFiles].find(([, content]) => OLD_SHAPE.test(content));
  if (offender) {
    const [path] = offender;
    return fail(
      ID,
      `${path} calls traceObject(...) with a method entry that skips the per-method config object`,
      "Nest the parameter names under params: traceObject(target, context, { methods: { methodName: { params: [...] } } }) — a bare array under the method name throws.",
      DOC.proxyOptions,
    );
  }
  return pass(
    ID,
    "no traceObject(...) call uses the old { methods: { ... } } option shape",
    DOC.proxyOptions,
  );
};
