// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";
import type { Guest } from "./domain.js";

/** Tier 4 — cohesion mismatch: a repository that also renders reports and sends email. */
export interface GuestRepository {
  findGuestById(guestId: string): Guest;
  renderReport(): string;
  dispatchEmail(guestId: string, message: string): boolean;
}

export class DefaultGuestRepository implements GuestRepository {
  @traced("guestId")
  findGuestById(guestId: string): Guest {
    return { guestId, fullName: "Jane Smith", email: "jane@example.com" };
  }

  renderReport(): string {
    return "<html><body>Guest Report</body></html>";
  }

  @traced("guestId", "message")
  dispatchEmail(_guestId: string, _message: string): boolean {
    return true;
  }
}
