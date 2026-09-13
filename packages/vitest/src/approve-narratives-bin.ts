#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { runApproveNarratives } from "./approve-narratives-cli.js";

const DEFAULT_APPROVED_DIR = "narratives";

const root = process.argv[2] ?? process.env.NARRATIVETRACE_APPROVED_DIR ?? DEFAULT_APPROVED_DIR;

runApproveNarratives(root);
