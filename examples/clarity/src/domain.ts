// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Hotel-reservation domain of the clarity example (port of Java `narrativetrace-examples/clarity`).
 * Dates are ISO `YYYY-MM-DD` strings — the demo is about naming, not calendars.
 */
export type Room = {
  readonly roomNumber: string;
  readonly category: string;
  readonly pricePerNight: number;
};

export type Guest = {
  readonly guestId: string;
  readonly fullName: string;
  readonly email: string;
};

export type DateRange = {
  readonly start: string;
  readonly end: string;
};

export type Reservation = {
  readonly reservationId: string;
  readonly guestId: string;
  readonly roomNumber: string;
  readonly checkIn: string;
  readonly checkOut: string;
};
