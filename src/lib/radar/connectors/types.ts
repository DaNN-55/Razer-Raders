export type ConnectorId = "github-trending" | "hugging-face-trending" | "show-hn" | "official-watchlist";

export type SignalType = "tool" | "model" | "concept" | "project" | "trend";

export type SourceEvidence = {
  canonicalIdentifier: string;
  collectedAt: string;
  connectorId: ConnectorId;
  sourceName: string;
  sourceUrl: string;
  trust: "untrusted";
};

export type Candidate = {
  canonicalIdentifier: string;
  collectedAt: string;
  connectorId: ConnectorId;
  evidence: readonly SourceEvidence[];
  signalType: SignalType;
  title: string;
  url: string;
};

export type CollectionResult = {
  candidates: readonly Candidate[];
  collectedAt: string;
  connectorId: ConnectorId;
  connectorVersion: string;
  warnings: readonly string[];
};
