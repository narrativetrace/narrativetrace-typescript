// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceProvider } from "@narrativetrace/react";
import { OrderForm } from "./order-form.js";

export function App() {
  return (
    <NarrativeTraceProvider>
      <h1>NestJS + React Trace Demo</h1>
      <OrderForm />
    </NarrativeTraceProvider>
  );
}
