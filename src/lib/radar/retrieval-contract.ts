import type { Signal } from "../../components/radar-data.ts";
import type { BriefProvenance } from "./brief-contract.ts";

export type RadarRetrievalFilter = {
  from?: Date;
  limit: number;
  offset: number;
  query?: string;
  signalType?: string;
  subject?: string;
  to?: Date;
  topic?: string;
};

export type RetrievedRadarSignal = Pick<Signal, "builderValue" | "evidence" | "happened" | "id" | "priority" | "productOpportunity" | "risk" | "sectionCitations" | "state" | "summary" | "technicalBasis" | "title" | "topics" | "whyInBrief" | "whyNow"> & {
  publishedAt: string;
  provenance: BriefProvenance;
  signalType: string;
  subject: {
    canonicalIdentifier: string;
    title: string;
  };
};

export type RadarSignalDetail = Omit<RetrievedRadarSignal, "signalType" | "subject">;

export type RadarRetrieval = {
  availability: "empty" | "results";
  pagination: {
    hasMore: boolean;
    limit: number;
    offset: number;
  };
  results: readonly RetrievedRadarSignal[];
};

export type RadarRetrievalReader = {
  retrieve: (filter: RadarRetrievalFilter) => Promise<RadarRetrieval>;
  retrieveDetail: (signalId: string) => Promise<RadarSignalDetail | null>;
};
