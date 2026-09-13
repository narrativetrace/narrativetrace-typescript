// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-redaction-default: a parameter named "password" is redacted at capture, unconditionally,
// even with no annotation.
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

class AuthService {
  login(username, password) {
    return "ok";
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
traceObject(new AuthService(), context, { login: ["username", "password"] }).login(
  "alice",
  "hunter2",
);
const tree = context.captureTrace();
const params = tree.roots[0]?.signature.parameters ?? [];
const password = params.find((p) => p.name === "password");
console.log(password?.renderedValue ?? "<no password parameter captured>");
