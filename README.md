# SLFA League App

A public-facing Sierra Leone football league information platform developed by **Koroma Leone Tech**.

The application is intended to support the Leone Rock Premier League and the Marampa Mines Women’s Premier League. It publishes competition information, club profiles, fixtures, confirmed results, match events, match reports, standings, player statistics, disciplinary information, news and media.

The SLFA League App is a public information product. It does not replace FIFA Connect or the SLFA’s existing football administration systems. Any FIFA Connect player data is supplied as an authorised export file and imported by authorised SLFA personnel; the app does not connect to or modify FIFA Connect.

## Responsibilities and access

- **Public users:** View published competition and match information.
- **Super Admin:** Maintain official competition and season information, club profiles, fixtures, match officials, records and rules; review authorised publications; and use the player import and player-photo tools.
- **Main Referee:** Control the assigned match clock and submit, correct or reverse the official final result through the referee result workflow.
- **Assistant Referees:** Record match events for fixtures to which they are actively assigned. They do not submit or change the final result.
- **Match Commissioner:** Complete and submit match-day inspection reports and supporting evidence for assigned fixtures. This role cannot control the match, submit results, record cards, select Man of the Match or administer suspensions.
- **Media Officer:** Prepare news and publication drafts. Publication approval remains with the Super Admin.
- **Disciplinary Officer:** Maintain disciplinary decisions and suspension records within the assigned permissions.
- **Developer — Koroma Leone Tech:** Manage technical platform administration, staff roles and accounts, and application maintenance/freeze controls. The Developer role is not a football administration role and does not submit results, manage league content, approve publications or import player records.

The database enforces the role boundaries. Official match results are written through the referee-only result functions; direct authenticated writes to the result table and score columns are disabled. Match events require an active on-field referee appointment.

## Public and staff interfaces

- Public app: https://koromaalhajiabu.github.io/slfa_league_app/
- Staff workspaces: Developer, Super Admin, Referee, Match Commissioner, Match Data Operator, Team Official / Club Representative, Media Officer and Disciplinary Officer.
- Public Digital Publications Centre: published competition regulations, circulars, notices and reports only.
- **Developer staff onboarding:** the Developer assigns a role (and a club for Team Officials) before the person registers. The secure Supabase invitation function sends the invitation email from the server side; the recipient verifies the email, sets a password and accepts the privacy notice and terms before signing in. Pending invitations show delivery and account-creation state; failed messages can be retried and invitations can be cancelled.
- **Fixture setup and import:** the Super Admin can create fixtures individually or validate and import a CSV schedule. Each fixture is linked to its competition, season and exact home/away club records. The database import is atomic and rejects clubs from another competition, duplicate fixtures and invalid records. This club linkage is required for the Club Representative portal and team-sheet workflow.
- **Club Representative / Team Official portal:** the `match_team_sheets` table stores each club’s official electronic starting XI and substitutes. A Team Official invitation is tied to a specific active club; the representative submits from the portal, can amend a returned sheet before approval, and cannot change a sheet after Super Admin approval.
- **Match Data Operator:** a separate assigned staff role for live goals, cards, substitutions, shots (on target, off target and blocked), goalkeeper saves, corners, fouls and offsides. The operator selects a player from the approved fixture line-up for each entry. The Super Admin appoints one operator to each fixture. The operator can create and reverse only their own events with an audited reason; they cannot control the clock, change the score or submit the official result. Public statistics are calculated from published event entries and explicitly distinguish unrecorded data from verified zero counts. The Main Referee retains those powers.
- **Public Match Centre player contributions:**
- **Player profile match log:** public player profiles show published match-by-match event contributions, including goals, assists, shots, saves and cards, with the linked fixture and event timeline. The profile distinguishes missing event entries from a confirmed absence of an appearance; it does not infer player ratings. each match detail page presents event-derived team totals and player contributions (goals, assists, shots, saves and cards) from published match events. If no event data is published, the interface states that statistics are unavailable instead of implying confirmed zeroes. It does not invent player ratings; figures are traceable to the published event log.
- **Super Admin Matchday Command & Compliance Centre:** one fixture-level control board that reconciles referee, assistant referee and Match Commissioner appointments; venue and kick-off readiness; both clubs’ submitted and approved team sheets; published lineups; referee photographed match records; human-verified OCR; Commissioner reports; event-player checks; result differences; outstanding reviews; and result-amendment history. It exports an operations CSV and produces a printable match dossier with time-limited private evidence links. The board is read-only for official scores and appointments: it never silently changes results or makes disciplinary decisions. Its checks are operational prompts, not official SLFA regulations.
- **Match Operations in-app alerts:** recipient-scoped alerts for Team Officials, assigned referees, Match Commissioners, Match Data Operators and Super Admins. The database scheduler runs every 15 minutes and creates deduplicated reminders for team-sheet deadlines, official appointments, overdue/returned reports, pending reviews and referee-score differences. Each signed-in user can see and mark read only their own alerts. Match Operations alerts are in-app; staff invitation emails are sent separately by Supabase Auth. Match alerts do not claim SMS or email delivery.
- **Referee photographed match-record submissions:** assigned Main and Assistant Referees can capture or select up to six match-sheet photographs, enter observations, and submit them privately to the Super Admin inbox. The Super Admin can review status, send correction notes and print/save a compiled PDF with the submitted images. This evidence workflow does not change public match scores.
- Referee score and event queues support local save-and-sync when connectivity is unavailable.
- **OCR limitation:** photographed reports can be machine-read with Tesseract.js English OCR. Handwriting, names, numbers and scores can be misread; extracted text is not treated as verified. The Super Admin must compare the original image and record corrected text before using it.

## Division league management

- Super Admins can configure separate division tiers per competition and season, including pyramid group, tier order, promotion places, relegation places and playoff places.
- The division manager records approved promotion, relegation, playoff and transfer decisions. Applying a movement validates the configured competition pyramid and tier direction before updating the club's current competition association.
- Club movement records retain the decision reason and timestamps. Existing match rows retain their original competition and season references; no existing competition or result is reclassified by the migration.
- Division settings and applied movement history are available to public readers; only the Super Admin can create or change settings and apply movements.

## Interface language support

The public League Centre and staff workspaces include English (default), Krio, French and Arabic interface wording. Shared translations are maintained in `i18n.js`; the selected language is saved on the user's device. The public and staff pages load the shared dictionary before their dynamic interface modules, and the service worker precaches the versioned language asset.

## Configuration

Project settings are in `config.js`. The browser uses the Supabase publishable key only; no service-role key belongs in the public repository.

Developed by **Koroma Leone Tech**.

## Engineering assurance and deployment readiness

- **Automated repository quality gate:** GitHub Actions checks required portals, critical governance modules, local HTML dependencies, service-worker precache coverage and browser JavaScript syntax.
- **Read-only security review:** supabase/audits/read-only-security-audit.sql inventories table RLS and grants, executable SECURITY DEFINER functions, exposed views, storage bucket visibility and match-operation record counts.
- **Production acceptance and pilot gates:** see [docs/production-readiness-gates.md](docs/production-readiness-gates.md) for the verified system position, remaining security findings and role-by-role acceptance tests.

Static repository checks do not replace authenticated browser tests, security review, backup restoration exercises or formal SLFA acceptance. The platform remains subject to a supervised pilot before production deployment.
