// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { BoundedEventBuffer } from "../src/bounded-event-buffer.js";
import { methodSignature } from "../src/method-signature.js";
import type { TraceEvent } from "../src/trace-event.js";

function enter(handle: number): TraceEvent {
  return {
    type: "enter",
    handle,
    parentHandle: null,
    timestamp: 100 + handle,
    signature: methodSignature("A", `m${handle}`, []),
  };
}

describe("BoundedEventBuffer", () => {
  test("starts with size zero", () => {
    const buffer = new BoundedEventBuffer(8);
    expect(buffer.size).toBe(0);
  });

  test("put increments size", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    expect(buffer.size).toBe(1);
    buffer.put(enter(1));
    expect(buffer.size).toBe(2);
  });

  test("drain delivers events to consumer", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.put(enter(1));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(0), enter(1)]);
  });

  test("overwrites oldest when full", () => {
    const buffer = new BoundedEventBuffer(3);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    buffer.put(enter(3));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(1), enter(2), enter(3)]);
  });

  test("drain only delivers events since last drain", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.drain(() => {});
    buffer.put(enter(1));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(1)]);
  });

  test("sheds unread events when write laps read", () => {
    const buffer = new BoundedEventBuffer(2);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    buffer.put(enter(3));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(2), enter(3)]);
  });

  test("size caps at capacity when overfilled", () => {
    const buffer = new BoundedEventBuffer(3);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    buffer.put(enter(3));
    buffer.put(enter(4));
    expect(buffer.size).toBe(3);
  });

  test("drain resets size to zero", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.drain(() => {});
    expect(buffer.size).toBe(0);
  });

  test("rejects capacity less than one", () => {
    expect(() => new BoundedEventBuffer(0)).toThrow("capacity must be a positive integer");
    expect(() => new BoundedEventBuffer(-1)).toThrow("capacity must be a positive integer");
  });

  test("rejects non-integer capacity", () => {
    expect(() => new BoundedEventBuffer(3.5)).toThrow("capacity must be a positive integer");
  });

  test("fillLevel returns zero for empty buffer", () => {
    const buffer = new BoundedEventBuffer(8);
    expect(buffer.fillLevel).toBe(0);
  });

  test("fillLevel reflects current fill ratio", () => {
    const buffer = new BoundedEventBuffer(4);
    buffer.put(enter(0));
    buffer.put(enter(1));
    expect(buffer.fillLevel).toBe(0.5);
  });

  test("fillLevel caps at 1.0 when overfilled", () => {
    const buffer = new BoundedEventBuffer(2);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    buffer.put(enter(3));
    expect(buffer.fillLevel).toBe(1.0);
  });

  test("fillLevel drops to zero after drain", () => {
    const buffer = new BoundedEventBuffer(4);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    buffer.put(enter(3));
    buffer.drain(() => {});
    expect(buffer.fillLevel).toBe(0);
  });

  test("drain returns count of events drained", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.put(enter(2));
    const count = buffer.drain(() => {});
    expect(count).toBe(3);
  });

  test("drain with limit drains at most limit events", () => {
    const buffer = new BoundedEventBuffer(8);
    for (let i = 0; i < 5; i++) buffer.put(enter(i));
    const drained: TraceEvent[] = [];
    const count = buffer.drain((e) => drained.push(e), 3);
    expect(count).toBe(3);
    expect(drained).toEqual([enter(0), enter(1), enter(2)]);
  });

  test("drain with limit leaves remaining events in buffer", () => {
    const buffer = new BoundedEventBuffer(8);
    for (let i = 0; i < 5; i++) buffer.put(enter(i));
    buffer.drain(() => {}, 3);
    expect(buffer.size).toBe(2);
    const remaining: TraceEvent[] = [];
    buffer.drain((e) => remaining.push(e));
    expect(remaining).toEqual([enter(3), enter(4)]);
  });

  test("drain without limit drains all events", () => {
    const buffer = new BoundedEventBuffer(8);
    for (let i = 0; i < 5; i++) buffer.put(enter(i));
    const drained: TraceEvent[] = [];
    const count = buffer.drain((e) => drained.push(e));
    expect(count).toBe(5);
    expect(buffer.size).toBe(0);
    expect(drained).toHaveLength(5);
  });

  test("clear resets buffer completely", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.put(enter(1));
    buffer.clear();
    expect(buffer.size).toBe(0);
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([]);
  });

  test("allocates nothing until the first event is buffered", () => {
    const buffer = new BoundedEventBuffer(1024);
    expect(buffer.allocatedCapacity).toBe(0);
  });

  test("the first event allocates the whole ring at the configured capacity", () => {
    const buffer = new BoundedEventBuffer(1024);
    buffer.put(enter(0));
    expect(buffer.allocatedCapacity).toBe(1024);
  });

  test("the ring never reallocates, however many events pass through it", () => {
    // The fixed-size contract: filling it, lapping it three times over and draining it never move
    // the allocation off the configured size in either direction.
    const buffer = new BoundedEventBuffer(8);
    for (let i = 0; i < 4; i++) buffer.put(enter(i));
    expect(buffer.allocatedCapacity).toBe(8);
    for (let i = 4; i < 24; i++) buffer.put(enter(i));
    expect(buffer.allocatedCapacity).toBe(8);
    buffer.drain(() => {});
    expect(buffer.allocatedCapacity).toBe(8);
  });

  test("clear empties the ring without releasing it", () => {
    const buffer = new BoundedEventBuffer(8);
    buffer.put(enter(0));
    buffer.clear();
    expect(buffer.allocatedCapacity).toBe(8);
    expect(buffer.size).toBe(0);
  });

  test("preserves buffered order up to the capacity", () => {
    const buffer = new BoundedEventBuffer(64);
    for (let i = 0; i < 10; i++) buffer.put(enter(i));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(enter));
  });

  test("preserves order for a live window that wraps the end of the ring", () => {
    // Drain first so the live window starts mid-array and the next writes wrap past index 0:
    // reads follow absolute positions, so the wrap must not scramble the order.
    const buffer = new BoundedEventBuffer(4);
    for (let i = 0; i < 4; i++) buffer.put(enter(i));
    buffer.drain(() => {}, 2);
    for (let i = 4; i < 7; i++) buffer.put(enter(i));
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(3), enter(4), enter(5), enter(6)]);
  });

  test("filling the ring exactly to capacity is not loss", () => {
    const buffer = new BoundedEventBuffer(10);
    for (let i = 0; i < 10; i++) buffer.put(enter(i));
    expect(buffer.overflowCount).toBe(0);
  });

  test("counts each event lost to overwriting at the cap", () => {
    const buffer = new BoundedEventBuffer(4);
    for (let i = 0; i < 6; i++) buffer.put(enter(i));
    expect(buffer.overflowCount).toBe(2);
  });

  test("overflow count survives a clear so total loss stays observable", () => {
    const buffer = new BoundedEventBuffer(2);
    for (let i = 0; i < 5; i++) buffer.put(enter(i));
    buffer.clear();
    expect(buffer.overflowCount).toBe(3);
  });

  test("fill level reads against the configured capacity from the first event", () => {
    // The allocation IS the capacity, so a tenth-full ring reads 0.1 — the drain modes keyed off
    // this number mean the same thing at every moment of the buffer's life.
    const buffer = new BoundedEventBuffer(100);
    for (let i = 0; i < 10; i++) buffer.put(enter(i));
    expect(buffer.fillLevel).toBe(0.1);
    expect(buffer.allocatedCapacity).toBe(100);
  });

  test("accepts a capacity of one", () => {
    const buffer = new BoundedEventBuffer(1);
    buffer.put(enter(0));
    buffer.put(enter(1));

    expect(buffer.allocatedCapacity).toBe(1);
    expect(buffer.size).toBe(1);
    expect(buffer.overflowCount).toBe(1);
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(1)]);
  });

  test("events buffered after a full drain are not counted as loss", () => {
    // Loss is about unread events, not lifetime writes: a drained ring is empty however far its
    // write position has advanced, so recycling it sheds nothing.
    const buffer = new BoundedEventBuffer(4);
    for (let i = 0; i < 4; i++) buffer.put(enter(i));
    buffer.drain(() => {});

    for (let i = 4; i < 6; i++) buffer.put(enter(i));

    expect(buffer.overflowCount).toBe(0);
    expect(buffer.allocatedCapacity).toBe(4);
    const drained: TraceEvent[] = [];
    buffer.drain((e) => drained.push(e));
    expect(drained).toEqual([enter(4), enter(5)]);
  });

  test("drain with negative limit leaves buffer unchanged", () => {
    const buffer = new BoundedEventBuffer(4);
    buffer.put(enter(0));
    buffer.put(enter(1));

    const drained: TraceEvent[] = [];
    const count = buffer.drain((event) => drained.push(event), -1);

    expect(count).toBe(0);
    expect(drained).toEqual([]);
    expect(buffer.size).toBe(2);

    const remaining: TraceEvent[] = [];
    buffer.drain((event) => remaining.push(event));
    expect(remaining).toEqual([enter(0), enter(1)]);
  });
});
