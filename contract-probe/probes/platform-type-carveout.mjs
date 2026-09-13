// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-platform-type-carveout: a platform type (URL here) keeps its own toString(), never
// field-walked, however few or many own enumerable fields it happens to have. Date is
// deliberately NOT used as the vehicle here since 2026-09-13: it is trusted the same way but
// renders via toISOString(), not toString() — see probed-date-iso-rendering.
import { renderValue } from "@narrativetrace/core";

const value = new URL("https://example.com/a?b=1");
console.log(renderValue(value) === value.toString() ? "own-tostring-used" : "field-walked");
