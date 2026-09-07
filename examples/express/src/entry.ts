// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createExpressApp } from "./app.js";
import { checkPort } from "./check-port.js";

const port = Number(process.env.PORT ?? 3000);
await checkPort(port);
const app = createExpressApp();
app.listen(port, () => console.log(`Express example listening on http://localhost:${port}`));
