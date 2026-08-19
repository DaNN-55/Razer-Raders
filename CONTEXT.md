# Razer-Raders

Razer-Raders is free, self-hostable open-source software that provides an AI Radar for independent developers and AI product builders deciding which AI developments to try, learn from, follow, or turn into products.

## Language

**Radar Signal**:
A deduplicated, ranked development in the AI ecosystem, such as a tool launch, model release, open-source project, concept, or trend. One signal may be supported by many sources.
_Avoid_: Post, link, news item

**AI Radar**:
The evidence-backed discovery and assessment capability provided by Razer-Raders.
_Avoid_: Razer-Raders, raw feed

**Source Evidence**:
A source record that substantiates a Radar Signal, including its origin, publication time, and observable discussion or adoption data.
_Avoid_: Signal, duplicate

**Builder**:
An independent developer or AI product builder who uses AI Radar to decide what to try, learn from, follow, or develop into a product.
_Avoid_: General user, reader

**Observation Window**:
The rolling seven-day period in which AI Radar collects, merges, and evaluates Radar Signals.
_Avoid_: Daily feed, archive

**Daily Brief**:
A compact, incremental view that shows a Builder only high-value signals newly surfaced since their previous viewing, plus a small number still accelerating within the Observation Window.
_Avoid_: Raw feed, weekly dump

**Signal State**:
The current reason a Radar Signal appears in a Daily Brief: New, Accelerating, or Important Update.
_Avoid_: Category, score

**Source Connector**:
A configured ingestion path that collects Source Evidence from one external source. The MVP connectors are GitHub Trending, Hugging Face Trending, and Hacker News Show HN.
_Avoid_: Source, scraper

**Radar Shortlist**:
The five to ten Radar Signals selected for a Daily Brief after merging and ranking the signals in the Observation Window.
_Avoid_: Feed, all results

**Builder Value**:
The recommended action for a Builder toward a Radar Signal: Try, Learn, Follow, or Skip.
_Avoid_: Product opportunity, verdict

**Product Opportunity**:
The separate assessment of whether a Radar Signal suggests a product opportunity: None, Validate, or Explore.
_Avoid_: Builder value, recommendation

**Grounded Assessment**:
An AI-generated assessment whose factual statements and recommendations are traceable to retained Source Evidence; unsupported claims are marked as uncertain.
_Avoid_: AI summary, opinion

**Selection Reason**:
A concise, observable explanation of why a Radar Signal belongs in the Radar Shortlist, such as rapid growth, cross-source evidence, or immediate usability.
_Avoid_: Marketing claim, score

**Signal Card**:
The standard presentation of a Radar Signal: what happened, why it matters now, problem solved, technical basis, evidence, Builder Value, Product Opportunity, and risks or unknowns.
_Avoid_: Article, post

**Language Policy**:
AI Radar presents its interface and Grounded Assessments in Chinese while preserving the original-language source titles, links, and technical terms.
_Avoid_: Translation preference

**Signal Type**:
The primary subject category of a Radar Signal: Tool, Model, Concept, Project, or Trend.
_Avoid_: Openness, source type

**Openness**:
The availability status of a Radar Signal or its subject: Open Source, Open Weights, Proprietary, or Unknown.
_Avoid_: Signal type, license

**Topic Tag**:
A thematic label used to filter and rank Radar Signals, such as Agents and Automation, Models and Inference, Developer Tools, Creative Tools, Data and Infrastructure, Research, or Enterprise Applications.
_Avoid_: Signal type, source

**Collection Cycle**:
One of the two daily collection windows at 09:00 or 17:00 China Standard Time in which Source Connectors collect new Source Evidence before the corresponding Brief Snapshot.
_Avoid_: Daily Brief, Observation Window

**Publication Time**:
The daily 09:00 and 17:00 China Standard Time windows when AI Radar automatically publishes the morning and afternoon Brief Snapshots.
_Avoid_: Collection Cycle, user notification time

**Correction**:
A transparent revision to a published Grounded Assessment that identifies and corrects an error or material change in its evidence.
_Avoid_: Silent edit, retraction

**Radar Archive**:
The searchable historical record of normalized Radar Signals, score snapshots, source links, and necessary source excerpts. It does not store complete third-party works.
_Avoid_: Observation Window, raw scrape

**Radar Subject**:
The enduring identified thing being tracked, such as a product, model, repository, organization, or named idea. Multiple Radar Signals may belong to one Radar Subject.
_Avoid_: Radar Signal, source post

**Primary Evidence**:
Source Evidence from the subject's official release, documentation, repository, model card, or paper. It is preferred for factual and technical claims.
_Avoid_: Community discussion, social proof

**Secondary Evidence**:
Source Evidence from a third-party discussion or aggregation. It may establish attention, adoption, or feedback, but does not alone establish technical facts.
_Avoid_: Primary Evidence, technical proof

**Quality Gate**:
The threshold a Radar Signal must meet to enter a Daily Brief. A Daily Brief may contain fewer than five signals when too few meet the threshold.
_Avoid_: Quota, completeness

**Priority Tier**:
The user-visible priority assigned after internal ranking: High Priority, Worth Watching, or Continue Watching.
_Avoid_: Numeric score, certainty

**Opportunity Thesis**:
The evidence-backed explanation for a Product Opportunity that identifies the target user, unmet job or pain, alternatives and differentiation, and a smallest validation entry point.
_Avoid_: Idea, feature list

**Important Update**:
A new Radar Signal about an existing Radar Subject that reports a material release or capability change, a verifiable adoption or performance inflection, or new authoritative evidence that changes the prior assessment.
_Avoid_: More discussion, routine mention

**Trend Watch**:
A Daily Brief assessment of an emerging industry direction, supported by at least three independent Radar Subjects in the Observation Window and preferably evidence from two Source Connectors. At most two Trend Watches appear in one Daily Brief.
_Avoid_: Popular project, prediction

**Topic Filter**:
A Builder-controlled filter over Topic Tags that narrows the Radar Signals they view without changing the MVP's global ranking.
_Avoid_: Personal ranking, Source Connector

**Signal Feedback**:
A Builder's response to a Signal Card: Save, Not Relevant, or Report an Error. MVP feedback informs later evaluation but does not personalize the global ranking.
_Avoid_: Ranking, Correction

**Public Brief**:
A Daily Brief that any visitor can read without an account. A device may locally record which signals its visitor has read.
_Avoid_: Personal dashboard, account

**Mobile Reading Experience**:
The responsive Web presentation of Public Briefs and Radar Archive material for phone browsers, preserving the same core information and actions while adapting hierarchy and disclosure. It is not a separate mobile product, native application, or full mobile administration console.
_Avoid_: Native app, separate mobile product, mobile administration console

**Compact Navigation Shell**:
The responsive application shell used at viewport widths through 1120px: a sticky three-item top navigation and an accessible, modal filter drawer. It replaces the desktop sidebar without removing Public Brief actions.
_Avoid_: Incomplete tablet layout, separate mobile application

**Archive View State**:
The active Radar Archive query, result page, selected historical Signal, and its return context. It is reflected in the URL so a visitor can use browser navigation and return without losing their research context.
_Avoid_: Ephemeral search, Daily Brief selection

**Correction Record**:
The time, reason, and resulting change associated with a Correction displayed on the affected Signal Card.
_Avoid_: Silent edit, revision history

**Self-Hosted Instance**:
A deployment of AI Radar operated by its own user from the public source repository, with its own collection scope and credentials.
_Avoid_: Public Brief, SaaS account

**Reference Instance**:
The publicly accessible, default-configured deployment maintained as the canonical demonstration of AI Radar.
_Avoid_: Self-Hosted Instance, SaaS account

**Radar Profile**:
The single collection configuration for a Self-Hosted Instance. It specifies enabled Source Connectors, topic inclusion and exclusion rules, Topic Tags, and output language; the two daily collection windows are fixed product behavior.
_Avoid_: User account, Daily Brief

**Hosted Multi-Tenant Platform**:
A future deployment model in which separately authenticated users each own an isolated Radar Profile, collection history, credentials, and Connector Health. It is outside the current Self-Hosted Instance scope.
_Avoid_: Self-Hosted Instance, shared profile

**Model Runtime**:
The language-model endpoint selected by a deployment to generate Grounded Assessments. A Self-Hosted Instance may use a local open model or its operator's own external API credentials.
_Avoid_: Built-in paid service, Source Connector

**Zero Telemetry**:
The policy that a Self-Hosted Instance does not send its usage data, collected evidence, prompts, or model outputs to a central service by default.
_Avoid_: Anonymous tracking, required analytics

**Candidate**:
A possible Radar Signal discovered by a Source Connector before topic filtering, evidence enrichment, merging, and ranking.
_Avoid_: Radar Signal, Source Evidence

**Source Credential**:
An optional token supplied by a Self-Hosted Instance operator to raise a Source Connector's permitted capacity. It remains in that instance's environment and is never sent to a central service.
_Avoid_: Required account, Model Runtime credential

**Candidate Filter**:
The Radar Profile rules that retain or exclude Candidates before evaluation, including topic keywords, Topic Tags, and source-specific constraints.
_Avoid_: Ranking, generic web search

**Connector Health**:
The visible freshness and operating state of a Source Connector, including its most recent successful collection and any degradation or rate-limit condition.
_Avoid_: Signal State, availability claim

**Brief Coverage Summary**:
The public, compact Connector Health disclosure captured when a Daily Brief is published. It shows aggregate coverage by default and allows the reader to reveal each source's publication-time state, without exposing operational diagnostics or later live status.
_Avoid_: Operational Health Console, availability claim

**Operational Health Console**:
A future, operator-only view for diagnosing Connector Health through run history, failure reasons, affected output, and authorized retry actions.
_Avoid_: Brief Coverage Summary, public status page

**Connector Contract**:
The versioned source-code interface through which a Source Connector produces normalized Source Evidence. New Connectors are added through reviewed source changes, not downloaded as runtime plugins.
_Avoid_: Runtime plugin, web scraper

**Untrusted Evidence**:
External Source Evidence treated only as data. Its contents cannot issue instructions to the system, access credentials, or expand fetching beyond allowed domains and size limits.
_Avoid_: Agent instruction, trusted input

**Assessment Workflow**:
The background retrieval-and-generation workflow that enriches, evaluates, and writes a Grounded Assessment for a Radar Signal. It is not a user-facing chat feature in MVP.
_Avoid_: Chatbot, raw feed

**Publication Validation**:
The automated Quality Gate that verifies an assessment has all required Signal Card fields, linked evidence for factual claims, separated inference, accessible links, and explicit unknowns before publication.
_Avoid_: Manual review, formatting check

**Metric Snapshot**:
A timestamped observation of an externally reported attention or adoption metric, such as stars, forks, votes, comments, likes, or downloads. Snapshots support calculated growth rather than subjective claims of acceleration.
_Avoid_: Current metric, Priority Tier

**Canonical Identifier**:
A stable source-specific identifier, such as an official URL, GitHub owner and repository, Hugging Face namespace and model, or paper DOI, used to merge evidence deterministically.
_Avoid_: Similar title, model guess

**Related Signal**:
A Radar Signal that may concern the same Radar Subject as another but lacks sufficient Canonical Identifier evidence for an automatic merge.
_Avoid_: Duplicate, merged signal

**Error Report**:
A report that identifies a potential problem in a Signal Card. A Reference Instance opens a prefilled public GitHub Issue; a Self-Hosted Instance records it for that instance's administrator without central reporting.
_Avoid_: Correction, telemetry

**Radar Retrieval**:
The read-only application interface that retrieves Radar Archive material by time, topic, Signal Type, or Radar Subject and returns its supporting Source Evidence. A future chat interface may call it; MVP does not expose chat.
_Avoid_: Chatbot, unrestricted web search

**Brief Snapshot**:
The stable Daily Brief published at Publication Time. Later Candidates are considered for the next brief; only Corrections change a published snapshot and each change has a Correction Record.
_Avoid_: Live feed, mutable daily page

**Section Citation**:
A source link displayed beside the factual section of a Signal Card that it supports.
_Avoid_: Link dump, card-level citation

**Profile Configuration Console**:
The Web administration view for the one Radar Profile in a Self-Hosted Instance. It is separate from Public Brief browsing.
_Avoid_: Public settings page, multi-profile manager

**Instance Administrator**:
The person holding the deployment-supplied administrator credential that authorizes changes in a Self-Hosted Instance's Profile Configuration Console.
_Avoid_: Public visitor, application user

**Profile Configuration**:
The non-sensitive, persisted settings of a Radar Profile, including Connector choices, Candidate Filters, and language. The two daily collection and publication windows are fixed product behavior; the remaining settings are editable in the Profile Configuration Console and exportable or importable.
_Avoid_: Source Credential, Model Runtime credential

**Configuration Version**:
The immutable recorded revision of a Profile Configuration. A validated revision applies from the next Collection Cycle without altering earlier archive records or Brief Snapshots.
_Avoid_: Correction Record, draft setting

**Connector Test**:
An administrator-triggered, non-publishing check that validates a Source Connector against the active or proposed Profile Configuration.
_Avoid_: Collection Cycle, Daily Brief

**Assessment Pipeline**:
The deterministic sequence that produces a Brief Snapshot: collection, candidate filtering, metric snapshots, primary-evidence enrichment, normalization and merging, ranking, structured assessment, Publication Validation, and publication.
_Avoid_: Autonomous agent loop, one-shot summary

**Task Worker**:
The single background process in a Self-Hosted Instance that runs the Assessment Pipeline, scheduling, bounded retries, and task history. It is separate from the Web service.
_Avoid_: Web request handler, multiple scheduler replicas

**Assessment Delay**:
The visible condition in which a Candidate cannot be assessed because its configured Model Runtime has not succeeded after bounded retries. It does not cause an implicit switch to another model.
_Avoid_: Silent fallback, published assessment

**Ranking Policy**:
The versioned, code-reviewed internal weighting of novelty, growth, corroboration, Builder relevance, and actionability used to rank eligible Radar Signals. A Radar Profile changes candidate scope, not these weights, in MVP.
_Avoid_: User score slider, Priority Tier

**Local Runtime**:
A Model Runtime executed on the deployment host through Ollama, requiring no mandatory paid model API.
_Avoid_: Built-in cloud model, Source Connector

**Compatible Runtime**:
A deployment-configured external Model Runtime exposed through an OpenAI-compatible Chat Completions endpoint and its operator-supplied credentials.
_Avoid_: Required provider, agent tool

**Acceleration**:
A source-relative increase in the observed Metric Snapshots for a Radar Signal that also meets a source-specific minimum absolute growth threshold.
_Avoid_: Raw metric comparison, more mentions

**Lightweight Evaluation**:
The deterministic filtering, merging, and basic metric ranking of all Candidates before expensive evidence enrichment and assessment.
_Avoid_: Grounded Assessment, final selection

**Deep Evaluation**:
The Primary Evidence enrichment and Grounded Assessment applied only to Candidates most likely to clear the Quality Gate.
_Avoid_: Full crawl, first-pass filter

**Saved Signal**:
A Radar Signal marked as saved in a visitor's current device. It is queryable in the Radar Archive but is not synchronized or used to personalize MVP ranking.
_Avoid_: Account bookmark, global signal state

**Content Override**:
A manual action to edit, pin, suppress, or otherwise change an automatically generated signal assessment or its placement. Content Overrides are not available in MVP.
_Avoid_: Correction, Profile Configuration

**Dogfooding Window**:
The initial 14-day validation period in which Razer-Raders produces Daily Briefs, their shortlists are manually checked, and useful, false-positive, and missed signals are recorded to improve the system.
_Avoid_: Production launch, telemetry

**Web Service**:
The TypeScript and Next.js application that serves Public Briefs, Signal Cards, the Radar Archive, Connector Health, and the protected Profile Configuration Console.
_Avoid_: Task Worker, Model Runtime

**Pipeline Provenance**:
The recorded Configuration Version, Ranking Policy version, model identifier, and Assessment Pipeline version that produced a Grounded Assessment.
_Avoid_: Current configuration, mutable history

**Fixture**:
A fixed, representative source input used to verify Source Connector parsing without depending on a live external service.
_Avoid_: Production evidence, snapshot test

**Assessment Schema**:
The machine-validated structured form of a Grounded Assessment, including its required Signal Card fields and factual-claim evidence links.
_Avoid_: Prompt format, free text

**Local Backup**:
An operator-controlled PostgreSQL backup and restore artifact stored outside the running database volume and never uploaded by default.
_Avoid_: Central archive, telemetry

**Archive Q&A**:
The first planned post-MVP chat capability: read-only questions over Radar Retrieval that return cited Radar Signals and Source Evidence without external actions or Profile changes.
_Avoid_: Autonomous agent, unsupported chat

**Reference Instance Policy**:
The Reference Instance is a voluntarily operated demonstration and quality benchmark that reports its code version, Configuration Version, and Connector Health without an availability guarantee. It is never required for a Self-Hosted Instance to work.
_Avoid_: Hosted-service SLA, mandatory central service

**Compliant Collection**:
Collection that prefers official APIs, RSS, or Atom and only parses explicitly registered public HTML pages while respecting applicable terms, robots rules, rate limits, and access controls. It never bypasses authentication, paywalls, CAPTCHAs, or anti-bot controls.
_Avoid_: Unrestricted scraping, access circumvention

**Fetch Gateway**:
The sole bounded outbound-fetching service used by Source Connectors and evidence enrichment. It validates every URL and redirect against registered public domains and enforces transport, response-type, size, and timeout limits.
_Avoid_: Direct request, unrestricted network access

**Redacted Evidence**:
Source Evidence in which detected probable credentials or access tokens are replaced before storage, model input, or presentation, with an indication that redaction occurred while preserving the source link.
_Avoid_: Original secret, sanitized source

**Lexical Retrieval**:
The MVP implementation of Radar Retrieval using PostgreSQL structured filters and full-text matching over the Radar Archive.
_Avoid_: Semantic Index, unrestricted search

**Semantic Index**:
An optional, derived vector index over eligible archived text for semantic retrieval. It is created later through an operator-selected Embedding model and a background backfill without rewriting Brief Snapshots.
_Avoid_: Radar Archive, source of truth

**Hybrid Retrieval**:
The future retrieval strategy that combines Lexical Retrieval and Semantic Index results behind the unchanged Radar Retrieval interface.
_Avoid_: Replacement archive, chat response
