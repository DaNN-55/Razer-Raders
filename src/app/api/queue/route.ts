import { createQueueGetHandler } from "@/lib/radar/task-queue-route";
import { postgresCandidateTaskArchive } from "@/lib/radar/task-queue";

export const GET = createQueueGetHandler(() => postgresCandidateTaskArchive.getStatistics({ cycleStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }));
