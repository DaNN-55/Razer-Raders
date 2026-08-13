import type { QueueStatistics } from "./task-queue.ts";

export function createQueueGetHandler(getStatistics: () => Promise<QueueStatistics>) {
  return async function GET() {
    return Response.json(await getStatistics());
  };
}
