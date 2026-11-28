# SLFA League App — Production Readiness and Acceptance Gates

**Prepared:** 27 November 2026  
**Developer:** Koroma Leone Tech  
**Repository:** [koromaalhajiabu/slfa_league_app](https://github.com/koromaalhajiabu/slfa_league_app)  
**Public demonstration:** https://koromaalhajiabu.github.io/slfa_league_app/

## Current verified position

The application is a public competition-information and match-operations platform. It is not a replacement for FIFA Connect, Noda Score or an SLFA registration system.

The current architecture includes separate public and staff workspaces, competition and season administration, division movement controls, electronic team sheets, referee match-record submissions, commissioner reports, matchday operational checks, integrity alerts, result-history controls and public publication workflows.

The current Supabase project was reachable and reported a healthy project status during this review. Public fan-data retrieval and deletion now require a versioned 256-bit browser token generated through the Web Crypto API; the old weak Math.random fallback has been removed from the browser flow. The related fan-data tables were empty when this control was deployed. The public schema contained **93 application tables**, with RLS enabled on all 93.

A final access-denial migration was applied on 27 November 2026. The same review also corrected the public past-season statistics RPC so that only match events with a non-null publication timestamp contribute to public scorers and assists. Verification confirmed that the RPC returns a JSON object and that both goal and assist queries apply the publication filter. No match data was present to expose during this test. Before that migration, 41 RLS-enabled tables had no policies and no direct table grants for `anon` or `authenticated`. The migration added one restrictive `USING (false) / WITH CHECK (false)` policy to each. This makes the intended API denial explicit and keeps those tables blocked if a permissive policy is added later. It did not insert, update or delete application records.

The following operational tables contained no records at the time of review:

| Operational record type | Rows |
|---|---:|
| Matches | 0 |
| Electronic team sheets | 0 |
| Referee match-record submissions | 0 |
| Match Commissioner reports | 0 |
| Integrity alerts | 0 |
| Integrity alert history | 0 |

This means the architecture and UI workflows exist, but the system has not yet demonstrated a complete end-to-end real-match operation.

## Security review findings still open

Supabase advisors returned these findings at the time of review:

| Finding | Count | Interpretation |
|---|---:|---|
| SECURITY DEFINER functions executable by anon | 10 | Review each function's purpose, validation and data exposure. Some are intentionally public, such as a public key or public competition statistics. |
| SECURITY DEFINER functions executable by authenticated users | 64 | Review each function's in-body role and ownership checks. An authenticated grant is not by itself proof of a vulnerability. |
| Leaked-password protection | 1 | Enable and verify in Supabase Auth settings. |
| Multiple permissive RLS policies | 29 | Review policy overlap; do not merge policies without preserving the intended role matrix. |
| Unindexed foreign keys | 85 | Prioritise hot paths and high-volume relations, then add indexes based on measured workload. |
| Unused indexes | 43 | Do not drop automatically; low-volume and new tables may not yet have usage statistics. |

The 41 RLS-without-policy informational findings were addressed by explicit restrictive deny policies and should no longer appear as no-policy findings. Re-run the advisors after this migration to verify the final counts.

**Do not blanket-revoke function execution.** The system relies on role-guarded `SECURITY DEFINER` functions for sensitive actions such as staff invitations, role assignment, result submission, team-sheet submission and approved division movement. Review definitions and their execution grants individually. Do not change a function until its legitimate callers and protections are documented.

Supabase's guidance explains that RLS policies and grants work together, and that `SECURITY DEFINER` functions run with their owner's privileges. See [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Supabase Advisors](https://supabase.com/docs/guides/observability/advisors).

## Required acceptance tests before production use

Use a dedicated staging project with synthetic accounts and fixtures. Do not create test matches or test player records in the live SLFA database.

| Test | Scenario | Expected result |
|---|---|---|
| AT-01 | Public visitor opens competition pages | Only approved public information is visible. |
| AT-02 | Team Official A signs in | Can submit only for the assigned active club and its own fixture. |
| AT-03 | Team Official A attempts another club's fixture | Database rejects the submission. |
| AT-04 | A team sheet is approved | The team official cannot silently change it; a formal return/correction process is required. |
| AT-05 | Main Referee submits a final score | Only the assigned active Main Referee can submit or amend the official result; amendments require a reason and history. |
| AT-06 | Assistant Referee or Match Data Operator attempts to submit a final score | Database rejects the action. |
| AT-07 | Assigned Match Commissioner submits a report | Report is private to the assigned commissioner and association reviewers until authorised publication, if publication is permitted. |
| AT-08 | OCR reads a photographed handwritten form | Extracted text remains unverified until a human checks the original image and saves the corrected text. |
| AT-09 | Super Admin opens the Matchday Command Centre | Missing reports, unresolved score differences and other exceptions are visible; the board does not itself change official records. |
| AT-10 | An authorised result amendment is made | Previous and new values, actor, time and reason are preserved. |
| AT-11 | A player is transferred between divisions | Only an eligible, approved movement can be applied; season history remains intact. |
| AT-12 | Two club users attempt cross-club access | Each can access only permitted records for their own club. |
| AT-13 | Staff account is suspended or role revoked | New privileged actions are denied; session/token revocation behaviour is verified. |
| AT-14 | Network disconnects during referee entry | Local pending entries are not lost; reconnection does not create duplicate submissions. |
| AT-15 | Backup is restored into an isolated project | Database and private evidence files are recoverable and cross-checked. |\n| AT-16 | A short, malformed or legacy fan-data token is submitted | The database rejects access and deletion; only the versioned cryptographic token format is accepted. |
| AT-17 | Referee or Match Commissioner submits accreditation evidence | The submission is owned by the signed-in official, the document remains private, and unrelated officials cannot read it. |
| AT-18 | Super Admin reviews accreditation | Verify/reject/expiry decisions are authorised, rejection requires a reason, and review history receives a decision record. |
| AT-19 | Team Official submits a fixture team sheet | Head Coach and Team Manager are mandatory, optional bench staff are persisted, and the names appear in the inbox, CSV and printable team sheet. |
| AT-20 | Team Official attempts the legacy team-sheet RPC | The database denies the legacy call; the secured bench-staff RPC is required. |

Record the tester, account role, fixture identifier, expected result, actual result, evidence and pass/fail status for every test. Do not use production personal data for this test cycle.

## Pilot exit criteria

A supervised pilot should begin only after the SLFA approves the scope and nominates accountable users. Recommended pilot gates:

1. SLFA approves the competition rules, role matrix, data classifications and official-record authority.
2. All critical security findings are reviewed and dispositioned; Auth leaked-password protection is enabled.
3. All acceptance tests AT-01 to AT-15 pass in staging, or every exception has a formally accepted mitigation.
4. Backup and restore is demonstrated, including private report photographs and publication files.
5. Staff receive role-specific training and a documented support/escalation route.
6. A pilot runbook defines match-day contacts, incident handling, report deadlines, data corrections and rollback.
7. SLFA signs off on data ownership, privacy, retention, hosting, support, maintenance and exit arrangements.

A 30–60 day supervised pilot is a reasonable proposed starting period. The SLFA should decide its duration and scope.

## Operational ownership and safeguards

- The SLFA should retain ownership and control of official competition data under a written agreement.
- Koroma Leone Tech provides the software and technical maintenance; it does not make footballing decisions or certify competition results.
- Only the designated SLFA authority should approve official results, disciplinary decisions and public releases.
- OCR is an assistance tool, not an authority. The original photograph and human verification remain the evidence standard.
- No integration with FIFA Connect or Noda Score should be claimed. Any future integration requires written authorisation, a documented interface and acceptance testing.
- No independent security audit or production certification is claimed by this document.

## Repeatable engineering checks

The repository includes a Node.js built-in test suite and GitHub Actions workflow. It checks required portal files, critical governance modules, local HTML dependencies, service-worker precache coverage and JavaScript syntax. These are static repository checks; they do not replace browser-based role tests, penetration testing, database permission tests or SLFA acceptance.

The read-only SQL review at `supabase/audits/read-only-security-audit.sql` provides repeatable visibility into RLS, direct grants, privileged functions, views, storage bucket visibility and current match-operation record counts.
