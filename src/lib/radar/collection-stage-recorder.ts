import type { CollectionCycleResult } from "./assessment-pipeline.ts";
import type { PublicationArchive } from "./brief-publication.ts";
import { getCstDay } from "./daily-publication-schedule.ts";

export async function recordCollectionCycle(input: {
  archive: PublicationArchive;
  clock: () => Date;
  result: CollectionCycleResult;
}) {
  const { archive, clock, result } = input;
  await archive.recordPipelineStage({
    collectionRunId: result.runId,
    detail: result.status === "failed" ? result.errorMessage : `保留 ${result.candidateCount} 个 Candidate。`,
    publicationDay: getCstDay(clock()),
    stage: "collection",
    status: result.status,
  });
}
