// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { registerWebCryptoIdGenerator } from "./register-id-generator.js";

// The Web Crypto generator now lives in core, which resolves it on its own when no shim
// registered one (so a module shared between server and client rendering still works).
// Importing this package registers it explicitly, which stays meaningful: it pins the
// browser generator regardless of what else the bundle later registers.
registerWebCryptoIdGenerator();

export * from "@narrativetrace/core";
export {
  type BrowserContextOptions,
  createBrowserNarrativeContext,
  DEFAULT_BROWSER_BUFFER_CAPACITY,
} from "./browser-context.js";
export {
  applyBrowserIdentity,
  resolveSessionId,
  SESSION_STORAGE_KEY,
} from "./browser-session.js";
