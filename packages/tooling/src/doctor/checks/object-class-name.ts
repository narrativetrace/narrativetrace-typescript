// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot } from "../types.js";
import { applicationSource, type CodeFile } from "./application-source.js";

const ID = "trap.object-class-name";
const TRACE_OBJECT_CALL = /\btraceObject\s*\(/g;
const LITERAL_ARGUMENT = /^\s*\{/;
const IDENTIFIER_ARGUMENT = /^\s*([A-Za-z_$][\w$]*)\s*[,)]/;
const RENDERED_OBJECT_SPAN = /(?:^|[\s`#*])Object\.[A-Za-z_$][\w$]*\(/m;
const MAX_CALL_LENGTH = 5000;
const FIX =
  "Trace an instance of a class (traceObject(new CheckoutService(), ctx)) or pass { className: 'CheckoutService' } — the runtime names spans after the object's constructor, and a plain object's is Object.";

/** The text of a call's argument list, from just after its `(` to the matching `)`. */
function callArguments(code: string, afterParen: number): string {
  let depth = 1;
  const end = Math.min(code.length, afterParen + MAX_CALL_LENGTH);
  for (let i = afterParen; i < end; i++) {
    const ch = code[i];
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return code.slice(afterParen, i);
  }
  return code.slice(afterParen, end);
}

function declaredAsLiteral(code: string, name: string): boolean {
  const escaped = name.replace(/\$/g, "\\$");
  return new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*(?::[^=\\n]*)?=\\s*\\{`).test(code);
}

function tracesLiteralWithoutName({ code }: CodeFile): boolean {
  for (const call of code.matchAll(TRACE_OBJECT_CALL)) {
    const args = callArguments(code, call.index + call[0].length);
    if (/\bclassName\b/.test(args)) continue;
    const variable = IDENTIFIER_ARGUMENT.exec(args)?.[1];
    if (LITERAL_ARGUMENT.test(args) || (variable && declaredAsLiteral(code, variable))) return true;
  }
  return false;
}

function renderedObjectSpan(snapshot: DoctorSnapshot): string | undefined {
  return [...snapshot.outputFiles].find(([, content]) => RENDERED_OBJECT_SPAN.test(content))?.[0];
}

/**
 * A traced plain object narrates as `Object.<method>`: the runtime names spans after the target's
 * constructor, and an object literal's is `Object`. Source is read for a literal (inline or via a
 * variable declared as one) traced without `className`; rendered output, when it exists, is read
 * for the span it produced.
 */
export const checkObjectClassName: DoctorCheck = (snapshot) => {
  const offender = applicationSource(snapshot).find(tracesLiteralWithoutName);
  if (offender) {
    const message = `${offender.path} traces a plain object with no className — its spans read Object.<method>`;
    return fail(ID, message, FIX, DOC.objectClassName);
  }
  const rendered = renderedObjectSpan(snapshot);
  if (rendered) {
    const message = `rendered output shows an Object.<method> span (first seen in ${rendered}) — a traced object's class name was not set`;
    return fail(ID, message, FIX, DOC.objectClassName);
  }
  return pass(ID, "no plain object is traced without a className", DOC.objectClassName);
};
