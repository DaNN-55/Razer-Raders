import assert from "node:assert/strict";
import test from "node:test";
import { createTaskWorkerSchedule } from "../src/lib/radar/task-worker-schedule.ts";

type ScheduledTask = { callback: () => void; delay: number; id: number };

function createFakeTimers() {
  let nextId = 1;
  const intervals: ScheduledTask[] = [];
  const timeouts: ScheduledTask[] = [];
  const cleared: number[] = [];
  return {
    cleared,
    intervals,
    timeouts,
    timers: {
      clearInterval: (id: number) => cleared.push(id),
      clearTimeout: (id: number) => cleared.push(id),
      setInterval: (callback: () => void, delay: number) => {
        const task = { callback, delay, id: nextId++ };
        intervals.push(task);
        return task.id;
      },
      setTimeout: (callback: () => void, delay: number) => {
        const task = { callback, delay, id: nextId++ };
        timeouts.push(task);
        return task.id;
      },
    },
  };
}

test("Worker 启动后每两小时采集，并在 CST 09:00 发布后继续安排下一日", async () => {
  const fake = createFakeTimers();
  const events: string[] = [];
  let now = new Date("2026-08-12T00:59:59.000Z");
  const schedule = createTaskWorkerSchedule({
    clock: () => now,
    collectionIntervalMs: 2 * 60 * 60 * 1000,
    collect: async () => { events.push("collect"); return "succeeded" as const; },
    publish: async () => { events.push("publish"); },
    timers: fake.timers,
  });

  await schedule.start();
  assert.deepEqual(events, ["collect"]);
  assert.deepEqual(fake.timeouts.map(({ delay }) => delay), [7_200_000, 1_000]);

  now = new Date("2026-08-12T01:00:00.000Z");
  fake.timeouts[1]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["collect", "publish"]);
  assert.deepEqual(fake.timeouts.map(({ delay }) => delay), [7_200_000, 1_000, 86_400_000]);

  fake.timeouts[0]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["collect", "publish", "collect"]);
  schedule.stop();
  assert.deepEqual(fake.cleared, [4, 3]);
});

test("Worker 重启于 CST 09:00 后会补发当天日报", async () => {
  const fake = createFakeTimers();
  const events: string[] = [];
  const schedule = createTaskWorkerSchedule({
    clock: () => new Date("2026-08-12T06:00:00.000Z"),
    collectionIntervalMs: 2 * 60 * 60 * 1000,
    collect: async () => { events.push("collect"); return "succeeded" as const; },
    publish: async () => { events.push("publish"); },
    timers: fake.timers,
  });

  await schedule.start();

  assert.deepEqual(events, ["collect", "publish"]);
  assert.deepEqual(fake.timeouts.map(({ delay }) => delay), [7_200_000, 68_400_000]);
});

test("定时任务遇到采集或发布异常会记录错误，并继续安排下一次执行", async () => {
  const fake = createFakeTimers();
  const errors: unknown[] = [];
  let now = new Date("2026-08-12T00:59:59.000Z");
  const schedule = createTaskWorkerSchedule({
    clock: () => now,
    collectionIntervalMs: 2 * 60 * 60 * 1000,
    collect: async () => { throw new Error("采集网络异常"); },
    onError: (error) => { errors.push(error); },
    publish: async () => { throw new Error("发布数据库异常"); },
    timers: fake.timers,
  });

  await schedule.start();
  assert.equal((errors[0] as Error)?.message, "采集网络异常");

  now = new Date("2026-08-12T01:00:00.000Z");
  fake.timeouts[1]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fake.timeouts.map(({ delay }) => delay), [7_200_000, 1_000, 86_400_000]);

  fake.timeouts[0]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors.map((error) => (error as Error).message), ["采集网络异常", "发布数据库异常", "采集网络异常"]);
});

test("Worker 在下一 Collection Cycle 读取新的采集间隔", async () => {
  const fake = createFakeTimers();
  const intervals = [120_000, 240_000];
  const schedule = createTaskWorkerSchedule({
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
    collectionIntervalMs: 60_000,
    collect: async () => "succeeded" as const,
    getCollectionIntervalMs: async () => intervals.shift() ?? 240_000,
    publish: async () => undefined,
    timers: fake.timers,
  });

  await schedule.start();
  assert.equal(fake.timeouts[0]?.delay, 120_000);
  fake.timeouts[0]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.timeouts[2]?.delay, 240_000);
});

test("Worker 停止后不会由已完成的发布回调重新登记定时器", async () => {
  const fake = createFakeTimers();
  let resolvePublish: (() => void) | undefined;
  const schedule = createTaskWorkerSchedule({
    clock: () => new Date("2026-08-12T00:59:59.000Z"),
    collectionIntervalMs: 60_000,
    collect: async () => "succeeded" as const,
    publish: async () => new Promise<void>((resolve) => { resolvePublish = resolve; }),
    timers: fake.timers,
  });

  await schedule.start();
  fake.timeouts[1]?.callback();
  await new Promise((resolve) => setImmediate(resolve));
  schedule.stop();
  resolvePublish?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.timeouts.length, 2);
});
