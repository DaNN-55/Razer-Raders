# Evidence-first Radar Pipeline

## Status

Proposed implementation specification, confirmed 2026-08-13.

## Problem

The current Radar can discover popular Candidates, but its available evidence for some sources is often only a repository or model name plus a URL. The assessment then repeats collection facts such as repeated appearance in the Observation Window. This explains why a Candidate was found, not what the project is, who it helps, or why a Builder should care.

AI Radar must treat attention as a discovery and ranking signal. It must use retained Primary Evidence to explain a project's concrete value. Absence of sufficient evidence is not a judgment that a project has no value.

## Goals

- Publish an evidence-backed Daily Brief that prioritizes useful, understandable projects over raw attention.
- Enrich Candidates from bounded official sources before creating a Grounded Assessment.
- Make enrichment, assessment, retry, exclusion, and publication states observable and recoverable.
- Let an instance administrator safely choose a local Ollama model or an already-credentialed compatible API runtime, and tune throughput without a Worker restart.
- Preserve published Brief Snapshots and make their Configuration Version, runtime, and format traceable. A visible Correction is the only permitted post-publication change.

## Non-goals

- A general web crawler, full-site crawl, title-similarity-based project merge, or automatic arbitrary-link fetching.
- Storing complete third-party pages or README files in the Radar Archive.
- Storing, returning, or editing API keys through the browser or Profile database.
- A permanent model-only rejection of a Candidate.
- Rewriting a published Brief Snapshot to conform to the new assessment format.

## Terminology

- **Discovery Evidence**: Secondary Evidence that a project has appeared or drawn attention, such as GitHub Trending or Show HN. It can establish attention, but not technical facts by itself.
- **Primary Evidence**: A bounded official README, model card, release, documentation, or administrator-registered official page that can substantiate project capabilities.
- **Evidence digest**: Retained title, canonical URL, source name, retrieval time, content fingerprint, and short extracted excerpt(s), not a complete third-party work.
- **Enrichment**: The background retrieval and extraction of Primary Evidence for a Candidate.
- **Assessment**: The model's bounded, cited explanation of a Candidate using retained evidence.

## Product behaviour

### Card content

Every new-format Signal Card uses the following order. Each section answers a different question and must not use collection frequency as its main explanation.

1. **一句话判断**: What the project is, who it helps, and the job it helps them complete.
2. **发生了什么**: A verified release, new capability, or material change. If no change is verified, say so explicitly.
3. **为什么值得关注**: The concrete Builder scenario, capability unlocked, or cost/risk reduced.
4. **它靠什么实现**: A plain-language technical path. Technical terms may follow as a short second sentence, not lead the explanation.
5. **风险与未知**: Evidence gaps, conflicts, limitations, and unverified claims.
6. **为什么它进入今日简报**: A visually weaker transparency section containing discovery recency, repeated collection, cross-source support, and ranking rationale.

The compact row uses the first section as its description. It must not repeat the detailed sections or say only that a project is popular.

### Evidence requirements for a publishable Candidate

A Candidate can enter `已评估待发布` only when it has:

- at least one Primary Evidence record;
- evidence-backed statements of what it is and at least one concrete use case;
- citations for `一句话判断`, `发生了什么`, `为什么值得关注`, and `它靠什么实现`; the compact one-line judgment may reuse citations from the detailed section it compresses;
- a non-empty risk or unknowns statement.

Conflicting Primary Evidence is retained. The assessment favors newer Primary Evidence, cites both where material, and names the conflict in `风险与未知`.

### Discovery and Primary Evidence boundaries

| Discovery source | Official enrichment allowed | Notes |
| --- | --- | --- |
| GitHub Trending | Repository description, README opening/function sections, registered GitHub Releases | GitHub repository identity is a stable identifier. |
| Hugging Face Trending | Model card summary, usage guidance, technical sections | Hugging Face model identity is a stable identifier. |
| Official Release Watchlist | The administrator-registered official page and its bounded extracted content | Each URL and allowed host remains subject to Fetch Gateway restrictions. |
| Show HN | Only an exact project link to a GitHub repository, Hugging Face model page, or registered Official Watchlist URL | Other Show HN links remain Discovery Evidence and enter `待补证`; no arbitrary-site fetch or title inference. |

Primary Evidence extraction must retain short, relevant excerpts only. Each excerpt must have a source URL and content fingerprint so unchanged material can be reused. Extract in this exact order and continue only when the earlier source is absent or does not answer the needed fact:

1. GitHub: repository description, then README opening/function sections, then registered Releases.
2. Hugging Face: model-card summary, then usage guidance, then technical sections.
3. Official Release Watchlist: page title, then bounded body summary.
4. Show HN: never contributes Primary Evidence directly; it may only resolve an exact allowed identity into one of the first three paths.

### Identity and merge rules

- Automatically merge evidence only when a stable canonical identifier proves the same Radar Subject (for example, the exact GitHub repository URL or Hugging Face model URL).
- Never merge based on similar titles, model guesses, or model output alone.
- Candidates that may concern the same subject without stable identity remain Related Signals.

## Candidate lifecycle and queue

### Persistent states

The system records each Candidate in one of the following visible states:

| State | Meaning | Re-entry condition |
| --- | --- | --- |
| `待补证` | Discovered but lacks required Primary Evidence. | New relevant discovery, new Primary Evidence, or admin re-evaluation. |
| `补证中` | A Worker holds a bounded enrichment job. | Completion, lease expiry, or retry. |
| `评估中` | Primary Evidence is available and a model job is in progress. | Completion, lease expiry, or retry. |
| `评估失败待重试` | Runtime or structured-output failure; retain the error. | Next eligible retry. |
| `评估延迟` | Three failed attempts; this is a runtime problem, not an evidence verdict. | New collection, new evidence, manual retry, or later scheduled retry. |
| `证据不足未入选` | Official evidence still cannot support the publication requirements. | New evidence, new discovery, or manual retry. |
| `已评估未入选` | Assessment is valid but lost the current Daily Brief ranking. | Later ranking cycle, new evidence, or new discovery. |
| `已评估待发布` | Quality gate passed and is eligible for the next Brief. | Next publication or reassessment trigger. |
| `已发布` | UI projection: the Candidate has been linked to a published Radar Signal. It is no longer an active Candidate-lifecycle state. | A later material change creates a new Candidate/Signal path. |

### Queue reliability

- Enrichment and assessment jobs are persisted in PostgreSQL.
- A Worker claims a job with a lease and idempotency key. Lease expiry makes an unfinished job eligible again after Worker restart, deployment, or runtime crash.
- Workers record attempts, last error, duration, evidence fingerprint, Configuration Version (the stored Radar Profile Version), and runtime identifier.
- One Candidate must not be concurrently assessed twice for the same evidence fingerprint and Configuration Version.
- A Candidate outside the seven-day Observation Window leaves Daily Brief competition but remains in the Radar Archive. It re-enters only on new discovery, new Primary Evidence, or an explicit administrator action.

### Throughput policy

- Run enrichment and assessment after each two-hour collection cycle; do not defer all work to 09:00.
- Default to processing at most five high-priority jobs per cycle for a local model, but make the limit configurable.
- Queue priority is: new Primary Evidence, cross-source support, repeated discovery, recency, then existing ranking signals.
- The configuration console displays pending counts by state, current-cycle completions, average job duration, retry counts, and an estimated drain time.
- Use content fingerprints and cached digests/assessments before increasing model capacity. Increase per-cycle limit, model concurrency, and time budget only within configured bounds.
- A future larger local model or compatible API may increase throughput; it does not change evidence or publication rules.

## Assessment and ranking

### Model authority

- The Model Runtime structures and cites evidence. It does not have permanent exclusion authority.
- Its result is one of: sufficient for ranking, insufficient evidence awaiting enrichment, or outside the configured Radar scope. All retain evidence and a reason.
- A model failure is distinct from insufficient evidence.
- Reassessment is triggered only by new/changed Primary Evidence, renewed discovery, explicit admin action, or a failed/expired attempt. Unchanged Candidates are not re-evaluated every two hours.
- Changing the selected runtime does not automatically reassess `已评估待发布` Candidates. It applies to unassessed and future Candidates. The administrator may explicitly request a re-evaluation of only the current `已评估待发布` set under the new Configuration Version; published Snapshots are never batch re-evaluated.

### Ranking and publication eligibility

Ranking has two layers:

1. **Eligibility**: Primary Evidence, complete cited assessment, actionable project explanation, and non-empty risk/unknowns.
2. **Order among eligible Candidates**: explainable Builder action value and evidence completeness first; discovery attention, recency, repeat collection, and cross-source support break ties.

`Builder Value` is a ranking signal only: `试用`, then `学习`, then `跟进`, then `跳过`. It never permanently removes a Candidate. `Product Opportunity` remains an independent analysis field and does not drive Daily Brief ranking.

All displayed ranking reasons must be human-readable and traceable, for example: “Primary README identifies a concrete workflow”, “two Primary Evidence records”, or “appeared across two collection cycles”. Do not expose a model-only opaque score as an explanation.

## Daily Brief

- At 09:00 China Standard Time, select at most 15 eligible Candidates and create one Daily Brief Snapshot that is immutable in normal operation.
- The public Brief renders five Signals per page and supports a maximum of three pages.
- Fewer than 15 eligible Candidates produce a shorter Brief; the system never fills a quota with insufficient-evidence Candidates.
- Candidates finishing after publication wait for the next publication day. The current snapshot is not batch rewritten.
- Existing snapshots remain readable and immutable in normal operation. A Correction Record is the sole exception: it visibly identifies the reason, time, and resulting assessment change. Snapshots created before this specification's format carry a visible `旧版评估格式` marker; new snapshots carry `证据补全版`.

## Radar Profile and administration

### Protected writes

- The public Brief and retrieval endpoints remain unauthenticated and read-only.
- Profile write operations require a deployment-provided `RADAR_ADMIN_TOKEN`.
- The browser stores the administrator session only for the active session. Server-side writes validate the token; no secret is returned to the client.

### Versioned non-secret Profile

Each successful configuration save creates an immutable Configuration Version (the persisted Radar Profile Version). It includes non-sensitive settings only:

- runtime choice: `ollama` or `compatible`;
- Ollama base URL and selected installed model;
- compatible API base URL and model name;
- enrichment/assessment per-cycle limit, model concurrency, and time budget;
- candidate inclusion/exclusion rules;
- Official Release Watchlist entries and allowed hosts;
- source enablement and collection/publication timings.

The Worker reads the enabled Profile at the beginning of each cycle. New settings affect newly claimed work; completed assessments and published snapshots retain their original Configuration Version/Runtime provenance. The administrator can roll back to a prior successful Configuration Version.

### Runtime discovery and validation

- For an Ollama Profile, the server queries the configured reachable Ollama service's `/api/tags`; it lists installed models but never installs or deletes models from the browser.
- Saving a Profile requires a real connectivity and model-existence check before the new version is enabled.
- For a compatible API, the UI may set base URL and model name. API credentials remain exclusively in deployment Secrets/environment. The UI shows only whether credentials are configured.
- The console must state that compatible API assessment sends retained evidence excerpts to the administrator-configured service. Ollama mode states that assessment runs on the configured local service.
- A failed Profile validation does not replace the current working Profile or interrupt currently leased jobs.

## Data and provenance

Add persistent records sufficient to answer:

- Which Discovery Evidence and Primary Evidence supported a Candidate?
- Which exact excerpt, fingerprint, and source URL supported each assessment claim?
- Which queue job, attempt, Configuration Version, runtime, and duration produced the assessment?
- Why was a Candidate eligible, not selected, delayed, or insufficiently evidenced?
- Which Configuration Version, ranking policy, runtime, and assessment format produced each Snapshot?

No complete third-party work is stored. Evidence content is treated as Untrusted Evidence and cannot expand fetching, issue instructions, or access credentials.

## Migration

- Do not rewrite existing published Brief Snapshots.
- Mark old snapshots as `旧版评估格式` from their existing provenance/version boundary.
- Move currently evaluating, un-published Candidates back to `待补证`, then process them under the new lifecycle.
- Preserve all existing discovery evidence and archive identifiers.

## Acceptance criteria

1. A GitHub Candidate with README evidence produces a plain-language one-sentence judgment, a project-value `为什么值得关注`, and citations; its collection frequency appears only in `为什么它进入今日简报`.
2. A Candidate with only Discovery Evidence is not published and is visibly `待补证` or `证据不足未入选`, without invented project capability.
3. A failed model call is recorded as retry/delay, not evidence insufficiency, and subsequent recovery can reassess it.
4. A Show HN arbitrary external link is not fetched. An exact GitHub/Hugging Face/registered Watchlist match may use its bounded official enrichment path.
5. A high-attention Candidate that lacks evidence remains archived, receives priority enrichment/reassessment, and is never permanently hidden solely by a model judgment.
6. A queue lease expiry after Worker restart makes the job eligible again. For one Candidate/evidence fingerprint/Configuration Version, atomic claim and persistence guarantee at most one active lease and at most one persisted assessment result; retries may execute at least once after a crash.
7. An eligible set of 16 Candidates produces a 15-Signal immutable Snapshot, shown as three pages of five. An eligible set of eight produces eight Signals without filler.
8. A Configuration Version change selects a verified installed Ollama model or configured compatible API for later jobs, while existing assessments and snapshots retain prior provenance. Re-evaluation is opt-in and limited to the current `已评估待发布` set.
9. Invalid admin token, unavailable Ollama service, missing selected model, unavailable compatible credentials, or failed connectivity cannot enable a new Configuration Version.
10. An administrator can roll back to a previous Configuration Version; the next Worker cycle uses it without restart.

## Delivery slices

1. **Evidence model and bounded enrichers**: store digests/fingerprints; GitHub README, Hugging Face model card, Watchlist extraction; Show HN exact-match bridge.
2. **Queue and lifecycle**: migrations, leases, retries, state read model, migration of un-published Candidates.
3. **Evidence-first assessment and ranking**: new structured contract/prompt, eligibility gate, transparent reasons, reuse on unchanged evidence.
4. **Daily Brief presentation**: new card sections, weak discovery explanation, 15-item/5-per-page pagination, old-format marker.
5. **Profile console completion**: protected writes, profile version/rollback, runtime discovery/testing, throughput controls, queue observability.

Each slice must include fixed-fixture unit tests, PostgreSQL integration tests for its persistence boundary, and a public API/UI test for user-visible state where applicable.
