import type { QueryResultRow } from "pg";
import type { EvidenceDigest, EvidenceDigestArchive } from "./evidence-enrichment.ts";
import { getDatabasePool, withTransaction } from "./database.ts";

type DigestRow = QueryResultRow & {
  canonical_identifier: string;
  content_fingerprint: string;
  excerpts: string[];
  fetched_at: Date;
  source_kind: EvidenceDigest["sourceKind"];
  source_name: string;
  source_title: string;
  source_url: string;
};

function toDigest(row: DigestRow): EvidenceDigest {
  return {
    canonicalIdentifier: row.canonical_identifier,
    contentFingerprint: row.content_fingerprint,
    excerpts: row.excerpts,
    fetchedAt: row.fetched_at.toISOString(),
    sourceKind: row.source_kind,
    sourceName: row.source_name,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
  };
}

export const postgresEvidenceDigestArchive: EvidenceDigestArchive = {
  async findEvidenceDigest({ canonicalIdentifier, contentFingerprint, sourceKind, sourceUrl }) {
    const result = await getDatabasePool().query<DigestRow>(
      `SELECT canonical_identifier, source_kind, source_name, source_title, source_url, fetched_at, content_fingerprint, excerpts
      FROM evidence_digests
      WHERE canonical_identifier = $1 AND source_kind = $2 AND source_url = $3 AND content_fingerprint = $4`,
      [canonicalIdentifier, sourceKind, sourceUrl, contentFingerprint],
    );
    const row = result.rows[0];
    return row ? toDigest(row) : null;
  },

  async linkEvidenceDigest({ candidateCanonicalIdentifier, digest }) {
    await getDatabasePool().query(
      `INSERT INTO candidate_evidence_digests (candidate_id, digest_id)
      SELECT $1, id FROM evidence_digests
      WHERE canonical_identifier = $2 AND source_kind = $3 AND source_url = $4 AND content_fingerprint = $5
      ON CONFLICT DO NOTHING`,
      [candidateCanonicalIdentifier, digest.canonicalIdentifier, digest.sourceKind, digest.sourceUrl, digest.contentFingerprint],
    );
  },

  async saveEvidenceDigest({ candidateCanonicalIdentifier, digest }) {
    await withTransaction(async (client) => {
      const digestResult = await client.query<{ id: number }>(
        `INSERT INTO evidence_digests (
          canonical_identifier, source_kind, source_name, source_title, source_url, fetched_at, content_fingerprint, excerpts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (canonical_identifier, source_kind, source_url, content_fingerprint)
        DO UPDATE SET fetched_at = EXCLUDED.fetched_at
        RETURNING id`,
        [
          digest.canonicalIdentifier,
          digest.sourceKind,
          digest.sourceName,
          digest.sourceTitle,
          digest.sourceUrl,
          digest.fetchedAt,
          digest.contentFingerprint,
          JSON.stringify(digest.excerpts),
        ],
      );
      const digestId = digestResult.rows[0]?.id;
      if (digestId === undefined) throw new Error("无法保存 Evidence Digest。");
      await client.query(
        `INSERT INTO candidate_evidence_digests (candidate_id, digest_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING`,
        [candidateCanonicalIdentifier, digestId],
      );
    });
  },
};
