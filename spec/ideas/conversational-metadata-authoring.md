---
format: https://specscore.md/idea-specification
status: Approved
---

# Idea: Conversational Semantic Metadata Authoring

**Status:** Approved
**Date:** 2026-06-04
**Owner:** alex
**Promotes To:** —
**Supersedes:** —
**Related Ideas:** —

## Problem Statement
How might we let a user (and an AI assisting them) describe their data's meaning in plain language — "in table U, column PC is the user's primary currency" — and reliably capture it as structured, validatable datatug entity/table/column metadata that downstream tooling can reuse?

## Context
The `datatug` plugin in `ai-plugin` today ships only CLI-wrapper skills (`datatug-init`, `datatug-validate`, `datatug-projects`, `datatug-datasets`, `datatug-queries`, `datatug-scan`, `datatug-serve`, `datatug-install`). They expose what the CLI can already do; none of them help a user *define the meaning* of their data.

The datatug data model, however, already has the bones for semantic metadata:
- `entities/<Name>/<Name>.entity.json` is a first-class artifact. The Go model (`datatug-core/pkg/datatug/entities.go`) defines `Entity{ Fields, Tables }`, `EntityField{ id, type, title, isKeyField, NamePatterns }`, and `EntityFieldRef{ Entity, Field }`.
- A recordset column already carries `Meta *EntityFieldRef` (`recordset_def.go`), so "column → entity field" is representable for recordsets.
- `EntityField.Type` must be one of `KnownTypes` (String, Money, Integer, GUID, …), and an entity can `extends` an external semantic definition (e.g. `Country` extends an ISO country def in `datatug-meta-iso`).

The gap is the **authoring surface**: there is no CLI verb to create or mutate entities, link a table to an entity, or map a column to an entity field. `scan` only ingests live-DB schema; `show`/`validate` only read. So the meaning a user holds in their head has no structured path into the project — except hand-editing JSON.

This Idea was triggered by the request to add a second class of skills (beyond CLI wrappers) that let users — and AI — define and refine the semantics of their datasets conversationally, seeded by DB scan and refined over a project's lifetime.

## Recommended Direction
Build a **conversational semantic-authoring layer as new CLI verbs wrapped by new skills**, inside the existing single `datatug` plugin, marking the older wrapper skills with a `cli-` prefix.

The flow: a user says "in table U, column PC is the primary currency for a user." A skill translates that intent into a small set of deterministic CLI calls — ensure a `User` entity exists, link table `U` as its records storage, define a `primaryCurrency` field of an appropriate type, and map column `PC` to `User.primaryCurrency`. The CLI owns the writes and validation; the skill owns the natural-language → intent translation and disambiguation (e.g. asking which table when "U" is ambiguous). A companion **read-back** skill renders the current semantic picture so owners, analysts, and AI can review and refine it.

The table/column → entity/field linkage is stored in a **dedicated mapping artifact**, kept separate from both the scanned schema and the entity definitions. This third layer (physical schema · semantic model · linkage) means `datatug scan` can refresh physical schema freely without ever clobbering semantic intent, and the entity model stays free of physical-storage detail. The mapping is the authoritative source for table↔entity and column↔field links. Mapping rules may be **explicit** (one named column → one field) or **pattern-based** — glob/regex selectors over table *and* column names, e.g. any column matching `*currency*` → `Currency.ID`, or `*user*.user_status` → `User.Status`. This builds directly on the model's existing `EntityField.NamePatterns` (regexp/exact + case-sensitivity), generalized with a table/collection selector; a precedence model resolves columns that several rules match: an **explicit mapping always wins**, and overlapping patterns are then ordered by specificity (table-qualified before global). Its concrete schema is deliberately left to the design/spec phase and is expected to be richer than any shorthand illustration (e.g. an entity stored across multiple tables, fully qualified keys, per-column transforms) — the skills' real authoring needs should drive that shape, and through it the CLI verb surface.

The mapping is the single source of truth at write time. To keep reads fast for users and AI, datatug may **materialize a derived copy** of the resolved links onto the affected entities — clearly marked generated and never hand-edited — with `datatug validate` enforcing that the copy matches the mapping, plus a regenerate step that rebuilds it (detect *and* fix, not just detect).

We choose CLI-verbs-first over direct JSON file-writing because it keeps a stable, validatable contract (consistent with every existing skill), avoids skills drifting from on-disk schema changes, and makes the same authoring operations available outside the AI. We choose a single plugin over a two-plugin split because Claude Code plugin-to-plugin dependency support is unproven and the `cli-` prefix already gives clean grouping at zero risk.

Crucially, this is **AI-assisted, not AI-only, and scan-seeded**: a DB scan produces the initial draft (column `NamePatterns` already hint at field mapping), and the AI proposes refinements that a human confirms. Ownership shifts over the project lifetime from project owner toward analysts, with AI assisting both throughout.

## Alternatives Considered
- **Files-now, CLI-later** — skills write project JSON directly in the MVP, with `datatug validate` as a safety net, and graduate to CLI verbs later. Ships faster, but bakes schema knowledge into prompts, has no reusable contract, and was explicitly rejected in favor of a clean CLI surface from the start.
- **Pure free-text notes** — capture meaning as prose in entity `README.md` files. Trivial to build, but produces nothing structured or downstream-consumable; it just moves the problem.
- **Auto-only inference from scan** — derive all semantics from schema + name heuristics with no conversation. Useful as a *seed* (and retained as one), but rejected as the whole approach: intent like "PC means the user's *primary* currency" is not recoverable from schema alone and needs human/AI dialogue.
- **Stamping the link on the scanned column, or on the entity definition** — rejected. The scanned-column path is clobbered by `datatug scan`; the entity-definition path mixes physical-storage detail into the semantic model. A dedicated mapping artifact keeps physical schema, semantics, and their linkage cleanly separated and scan-safe.

## MVP Scope
A two-to-three-week spike that nails one job: **turn a plain-language statement about a table/column's meaning into validated entity + field + column-mapping metadata, and read it back.** Concretely — a minimal set of `datatug` authoring verbs (create/update entity, define field, link table, map column→field), one skill that wraps them via NL translation, and one read-back skill. Demoed end-to-end on the chinook demo project with the "User / table U / column PC = primary currency" example (or its chinook analogue), including at least one explicit mapping and one wildcard rule (explicit-always-wins precedence), and the entity's derived copy regenerated and validated. No downstream consumption.

## Not Doing (and Why)
- Downstream query enrichment (country flags, live exchange rates in results) — high-value but a separate Feature that depends on a join/render surface that doesn't exist yet.
- Two-plugin split with a meta→cli dependency — deferred; Claude Code cross-plugin dependency support is unverified and the `cli-` prefix achieves grouping without that risk.
- Direct JSON file-writing as the authoring path — rejected in favor of CLI verbs that own writes and validation.
- Fully autonomous, no-confirmation metadata generation — scan seeds and AI suggests, but a human confirms in the MVP.
- Migrating the existing `docs/ideas/` artifact into `spec/ideas/` — out of scope; only this Idea is bootstrapped under `spec/ideas/`.

## Key Assumptions to Validate
| Tier | Assumption | How to validate |
|------|------------|-----------------|
| Must-be-true | A **dedicated mapping artifact** (table→entity, column→field), separate from scanned schema and entity defs, is the right home — it survives `datatug scan` and avoids stamping intent onto regenerated files. (Confirmed the alternatives are worse: scanned `DbColumnProps`/`ColumnModel` has no entity-ref field, and `Entity.Tables` links only at table granularity.) | Define the artifact's schema and on-disk layout; confirm its keys are **qualified by database/catalog/schema** (not bare table names) so identically-named tables don't collide; run a scan→author→re-scan cycle and confirm the mapping persists. |
| Must-be-true | A "currency code" semantic type is expressible. | Check `KnownTypes` and the `extends` mechanism; decide between a new known type, a String + namePattern, or an `extends` to an ISO currency def in `datatug-meta-iso`. |
| Must-be-true | The minimal authoring operations can be exposed as clean, composable CLI verbs in `datatug-cli`. | Draft the verb surface (`entity add`, `entity field set`, `entity link-table`, `column set-meta`, read-back) and prototype against the demo project. |
| Should-be-true | NL → intent translation is reliable enough that owners and analysts trust it (entity/table/column resolution + disambiguation). | Build the skill against the chinook demo; measure how often it resolves vs. needs to ask. |
| Should-be-true | Renaming existing skills to the `datatug-` prefix is acceptable (DataTug plugin v0.0.2, low install base). | Confirm with maintainer; document as a one-time breaking rename. |
| Should-be-true | Precedence resolves overlaps predictably — explicit mappings always win; overlapping patterns order by specificity (table-qualified before global). | Prototype the pattern-vs-pattern specificity ordering against deliberately overlapping rules on the demo project. |
| Should-be-true | A derived copy of resolved links can be materialized onto entities for fast reads and kept consistent with the authoritative mapping. | Prototype generate-from-mapping + a `datatug validate` check that flags drift, plus a regenerate step; confirm the copy is marked generated so it is never hand-edited. |
| Might-be-true | Scan-derived `NamePatterns` can auto-suggest field mappings well enough to make the seeded draft genuinely useful. | Run scan on a demo DB and inspect how many columns get plausible field suggestions. |

## SpecScore Integration
- **New Features this would create:** (1) entity/semantic **authoring CLI verbs** in `datatug-cli`; (2) an **NL semantic-authoring skill** in `ai-plugin` that wraps them; (3) a **read-back skill** that renders current semantic metadata.
- **Existing Features affected:** existing CLI-wrapper skills (`datatug-` prefix rename); `scan` (becomes the seed source for initial drafts); the datatug-core data model (a **new dedicated mapping artifact** + its schema/validation, rather than altering scanned-column or entity structures).
- **Dependencies:** sequencing is deliberate — this skills Idea is defined **first** and is the source of truth for designing the CLI verb surface. A CLI Idea/Feature is then derived from it in `datatug-cli` (already spec-managed) and implemented; the skills Features (here in `ai-plugin`) are built on top once the verbs land.

## Open Questions
- What is the on-disk layout and scoping of the dedicated mapping artifact (one per database? one per project?), and how are its keys qualified (database/catalog/schema + table) so identically-named tables don't collide?
- The mapping is the source of truth and entities carry a **derived copy** (validated by `datatug validate`). Residual: when/how the copy regenerates, how it is marked generated so it is never hand-edited, and whether recordset-column `Meta` and `Entity.Tables` become derived from the mapping or deprecated (so there are not two competing pattern/link systems).
- What is the exact CLI verb surface and naming (`entity` vs `entities`, subcommand shapes)?
- How is a "currency code" represented — new known type, namePattern-constrained String, or `extends` to an ISO currency definition?
- Should `ai-plugin` itself be brought under specscore management (`specscore init`) so these Idea/Feature artifacts lint, or remain a plain repo?

---
*This document follows the https://specscore.md/idea-specification*
