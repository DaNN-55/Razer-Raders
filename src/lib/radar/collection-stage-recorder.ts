import type { CollectionCycleResult } from "./assessment-pipeline.ts";
import type { PublicationArchive } from "./brief-publication.ts";
import { getCstDay } from "./daily-publication-schedule.ts";

export async function recordCollectionCycle(input: {
  archive: PublicationArchive;
  clock: () => Date;
  result: CollectionCycleResult;
}) {
  const { archive, clock, result } = input;
  const detail = result.status === "failed"
    ? result.errorMessage
    : result.warnings?.length
      ? `保留 ${result.candidateCount} 个 Candidate；部分条目失败：${result.warnings.join("；")}`
      : `保留 ${result.candidateCount} 个 Candidate。`;
  await archive.recordPipelineStage({
    collectionRunId: result.runId,
    detail,
    publicationDay: getCstDay(clock()),
    stage: "collection",
    status: result.status,
  });
}
