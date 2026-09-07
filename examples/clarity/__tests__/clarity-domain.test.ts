// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  type AvailabilityChecker,
  DefaultAvailabilityChecker,
  DefaultBookingManager,
  DefaultDataProcessor,
  DefaultGuestRepository,
  DefaultPaymentGateway,
  DefaultReservationService,
} from "../src/index.js";

test("confirmReservation books the first available room and authorizes its nightly price", () => {
  const authorized: number[] = [];
  const service = new DefaultReservationService(new DefaultAvailabilityChecker(), {
    authorizePayment: (_id, amount) => {
      authorized.push(amount);
      return true;
    },
  });

  const first = service.confirmReservation("G-1001", "deluxe", "2025-06-15", "2025-06-18");
  const second = service.confirmReservation("G-1002", "suite", "2025-07-01", "2025-07-05");

  expect(first).toStrictEqual({
    reservationId: "RES-0001",
    guestId: "G-1001",
    roomNumber: "301",
    checkIn: "2025-06-15",
    checkOut: "2025-06-18",
  });
  expect(second.reservationId).toBe("RES-0002");
  expect(authorized).toStrictEqual([189.0, 189.0]);
});

test("confirmReservation fails when no room of the category is available", () => {
  const nothing: AvailabilityChecker = { findAvailableRooms: () => [] };
  const service = new DefaultReservationService(nothing, new DefaultPaymentGateway());
  expect(() => service.confirmReservation("G-1", "penthouse", "2025-01-01", "2025-01-02")).toThrow(
    "No penthouse room available",
  );
});

test("the adequately and poorly named tiers still do their (small) jobs", () => {
  expect(new DefaultBookingManager().handleBooking("Jane Smith", "suite", "d1", "d2")).toBe(
    "Booking confirmed for Jane Smith (suite) d1 to d2",
  );
  expect(new DefaultDataProcessor().execute("room-data", 42)).toBe("processed:room-data:42");
});

test("the guest repository mixes lookup, rendering and email — the cohesion scenario", () => {
  const repository = new DefaultGuestRepository();
  expect(repository.findGuestById("G-1001").fullName).toBe("Jane Smith");
  expect(repository.renderReport()).toContain("Guest Report");
  expect(repository.dispatchEmail("G-1001", "Your reservation is confirmed")).toBe(true);
});
