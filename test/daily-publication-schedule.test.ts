import assert from "node:assert/strict";
import test from "node:test";
import { createDailyPublicationSchedule } from "../src/lib/radar/daily-publication-schedule.ts";

test("固定时钟以 CST 09:00 和 17:00 作为两个日报发布边界", () => {
  const beforeNine = createDailyPublicationSchedule(() => new Date("2026-08-12T00:59:59.000Z"));
  assert.equal(beforeNine.getDuePublicationDay(), null);
  assert.equal(beforeNine.getNextPublicationAt().toISOString(), "2026-08-12T01:00:00.000Z");

  const atNine = createDailyPublicationSchedule(() => new Date("2026-08-12T01:00:00.000Z"));
  assert.deepEqual(atNine.getDuePublication(), { day: "2026-08-12", slot: "morning" });
  assert.equal(atNine.getDuePublicationDay(), "2026-08-12");
  assert.equal(atNine.getNextPublicationAt().toISOString(), "2026-08-12T09:00:00.000Z");

  const atFive = createDailyPublicationSchedule(() => new Date("2026-08-12T09:00:00.000Z"));
  assert.deepEqual(atFive.getDuePublications(), [
    { day: "2026-08-12", slot: "morning" },
    { day: "2026-08-12", slot: "afternoon" },
  ]);
  assert.deepEqual(atFive.getDuePublication(), { day: "2026-08-12", slot: "afternoon" });
  assert.equal(atFive.getNextPublicationAt().toISOString(), "2026-08-13T01:00:00.000Z");
});

test("重启后的当日午后仍指向同一个 CST 发布日", () => {
  const restartedAfterNine = createDailyPublicationSchedule(() => new Date("2026-08-12T06:30:00.000Z"));

  assert.equal(restartedAfterNine.getDuePublicationDay(), "2026-08-12");
});
