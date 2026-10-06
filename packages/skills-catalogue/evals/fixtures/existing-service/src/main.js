// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InvoiceService } from "./invoice-service.js";

const service = new InvoiceService();
console.log(service.issueInvoice("C1", 4200, "EUR"));
