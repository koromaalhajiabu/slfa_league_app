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
- Staff workspaces: Developer, Super Admin, Referee, Match Commissioner, Media Officer and Disciplinary Officer.
- Public Digital Publications Centre: published competition regulations, circulars, notices and reports only.
- **Super Admin Matchday Operations & Compliance Board:** read-only fixture-readiness checks for official appointments and venues, team-sheet filing, post-match result/report follow-ups, result-amendment history and CSV export. These checks are operational prompts, not official SLFA regulations.
- **Referee photographed match-record submissions:** assigned Main and Assistant Referees can capture or select up to six match-sheet photographs, enter observations, and submit them privately to the Super Admin inbox. The Super Admin can review status, send correction notes and print/save a compiled PDF with the submitted images. This evidence workflow does not change public match scores.
- Referee score and event queues support local save-and-sync when connectivity is unavailable.

## Configuration

Project settings are in `config.js`. The browser uses the Supabase publishable key only; no service-role key belongs in the public repository.

Developed by **Koroma Leone Tech**.
