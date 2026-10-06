// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "trap.llms-before-you-start";
const PLAIN_JS = /\.js$/;
const ESM_IMPORT = /^\s*import\s/m;
const FIX =
  "Run `npm pkg set type=module` before `npm add` — without it, Node throws SyntaxError: Cannot use import statement outside a module (pnpm/yarn default to it and never hit this).";

/**
 * `llms.txt`'s first "before you start" trap: a plain `.js` file using `import` syntax with no
 * `"type": "module"` in `package.json` throws `SyntaxError: Cannot use import statement outside a
 * module` the moment Node loads it — npm's default (unlike pnpm/yarn) does not set this for you.
 */
export const checkLlmsBeforeYouStart: DoctorCheck = (snapshot) => {
  if (snapshot.rootPackageJson?.type === "module") {
    return pass(ID, 'package.json declares "type": "module"', DOC.sixtySecondsNewProject);
  }
  const offender = [...snapshot.sourceFiles].find(
    ([path, content]) => PLAIN_JS.test(path) && ESM_IMPORT.test(content),
  );
  if (!offender) {
    const message = 'no plain .js file uses ESM import syntax without "type": "module"';
    return pass(ID, message, DOC.sixtySecondsNewProject);
  }
  const [path] = offender;
  const message = `${path} uses ESM import syntax but package.json has no "type": "module"`;
  return fail(ID, message, FIX, DOC.sixtySecondsNewProject);
};
