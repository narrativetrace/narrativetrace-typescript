// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-date-iso-rendering: a Date renders as its UTC toISOString(), never toString()'s
// locale/timezone-dependent form, and an invalid Date renders as the literal "Invalid Date"
// rather than throwing or degrading to the typed error marker.
import { renderValue } from "@narrativetrace/core";

const valid = new Date(0);
const isoMatches = renderValue(valid) === valid.toISOString();
const toStringDiffers = renderValue(valid) !== valid.toString();
const invalidIsLiteral = renderValue(new Date(Number.NaN)) === "Invalid Date";

console.log(isoMatches && toStringDiffers && invalidIsLiteral ? "iso-8601" : "wrong");
