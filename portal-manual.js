/* Role-specific SLFA portal manuals. No Club Admin portal is defined here. */
(function () {
  'use strict';
  var role = String(document.body.dataset.portal || '').toUpperCase();
  // Match Commissioners share the Referee authentication portal but have a separate workspace and manual.
  if (role === 'REFEREE') {
    var portalHeading = document.querySelector('.portal-head h1');
    if (portalHeading && /match commissioner/i.test(portalHeading.textContent || '')) role = 'MATCH_COMMISSIONER';
  }
  var manuals = {
    DEVELOPER: {
      title: 'Technical Director User Manual',
      intro: 'This guide covers platform-level administration, developer access, security controls and application-wide maintenance.',
      sections: [
        ['Platform overview', ['Open the Technical Director portal and review the live totals for accounts, fixtures, clubs, fan reports and media posts.', 'Use Refresh overview to request the latest database counts. A dash means a count could not be read; it is not a zero.']],
        ['Accounts and role assignments', ['For a new assignment, enter the person’s full name and email address. The email is the unique account identifier.', 'Select a JPG, PNG or WebP profile photo no larger than 4 MB if a photo is required.', 'Choose only an approved role and save the assignment. Check Pending role assignments and All accounts and roles afterwards.', 'Review role changes, account status and audit information. Suspend or delete accounts only with proper authorization.']],
        ['League pause and whole-app freeze', ['Pause league operations only when league-specific operations must stop. Resume them when authorized.', 'Freeze the entire app only for a genuine platform maintenance or security reason. This blocks staff portal access for non-developer roles.', 'Before freezing, communicate the reason to relevant administrators. Unfreeze as soon as the issue is resolved.', 'A league pause and an application freeze are different controls.']],
        ['Security and good practice', ['Never share your password or leave an administrative session open on a shared device.', 'Verify names, email addresses, competition details and intended role before saving.', 'Use audit records to review administrative changes. Do not use a test account to alter live competition information.']]
      ]
    },
    SUPER_ADMIN: {
      title: 'Super Admin User Manual',
      intro: 'Use this portal to manage approved league operations and public information. Confirm the competition and season before making changes.',
      sections: [
        ['Command Centre', ['Review the operational totals for competitions, seasons, fixtures/results, clubs, squad records and fan reports.', 'Use Refresh overview when you need updated counts. Unavailable counts can indicate permissions or connectivity issues.']],
        ['Competition directory management', ['Open Competition directory management to create or maintain competitions and leagues, including the authorised men’s and women’s competitions and any approved cup tournaments.', 'Choose an existing competition to edit, or leave the selector on Create a new competition.', 'Enter the official competition name, format, category and public description. Add a valid logo URL or repository path only when an approved asset is available.', 'Set the display order and choose whether the competition should be published in the public League Centre, then select Save competition.', 'After saving, confirm the competition appears correctly in the directory. Check its name, category, publication status and ordering before proceeding to clubs, seasons and fixtures.']],
        ['Knockout cup bracket', ['Open Knockout cup bracket to configure the authorised cup tournament ties and progression.', 'Choose the cup competition, season and the fixture that represents the tie. Enter the round name and tie number.', 'If the winner progresses, choose the next-round tie and whether the winner enters as the home or away team. Create the next-round fixture first in Fixture planner.', 'Save the tie and verify it appears in the bracket. After the match is officially completed, select the official winner and use Confirm winner and advance. Check the linked next-round fixture afterwards.', 'The bracket supports single-match ties. Confirm any competition-specific tie rules before recording a winner.']],
        ['Clubs and seasons', ['To add a club, enter its official club name, choose its competition and optionally add a valid crest URL, then select Add club.', 'Create seasons with a clear season name and correct start and end dates. Check the season list after saving.', 'Avoid creating duplicate club or season records. Confirm spelling and competition first.']],
        ['Historical league standings', ['Choose the league competition and a past season. The current season cannot be selected because its table is calculated from match results.', 'For bulk entry, download the historical standings CSV template, enter one row per club, choose the file and select Check CSV. Correct every reported issue before selecting Import standings.', 'For manual entry, select Load table. Existing saved rows are loaded for editing; if no table exists, the current active clubs are offered as a starting list. Type the final position, played, wins, draws, losses, goals for, goals against and points. Add or remove club rows as needed.', 'Played must equal wins plus draws plus losses. Each club and position must appear only once. Points are entered as the official final points, including any deductions.', 'Saving replaces only the historical table for the selected league and past season. It does not change match fixtures, match scores or the current live table. The published table can be viewed on the public League Pages by selecting its season.']],
        ['Fixture planner', ['Choose the competition and season before entering the home team, away team, kick-off date/time and venue.', 'Check both team names and the date carefully, then select Add fixture.', 'Confirm the fixture appears in the relevant match lists.']],
        ['Import fixtures and results', ['Download the CSV template and follow its column structure exactly.', 'Ensure season, competition and club names match existing records.', 'Choose the CSV file and select Check file. Review the preview and resolve validation errors before selecting Import matches.', 'Do not import the same file twice.']],
        ['Results and match status', ['Choose the correct season and match, then enter the home and away scores.', 'Use Record result for a new result. Changing or reversing a confirmed result requires a reason and is logged.', 'Use Match status to mark a fixture scheduled, postponed, rescheduled or cancelled. Enter a clear reason where appropriate.', 'Verify the public table and match centre after an approved result.']],
        ['Referee assignments and approvals', ['Choose a fixture and the official, then select the match role and assign.', 'Review final scores submitted by referees before approval. Check the match and score against the official report.', 'Review submitted news and fan comments before approving or rejecting them.']],
        ['Club/player reviews and audit', ['Review club profile changes, player registrations and transfer requests in their respective queues.', 'Approve only complete, verified information. Use the audit log to review recorded changes.', 'Review fan reports according to SLFA policy.']],
        ['Downloads and backups', ['Download match/results, standings or suspension CSV files for authorized reporting.', 'Use Full backup (JSON) only when a complete data export is required and store it securely.', 'Exports are recorded. Never share exported personal or operational data without authorization.']]
      ]
    },
    REFEREE: {
      title: 'Referee User Manual',
      intro: 'This portal is for officials assigned to matches. Only work on a fixture assigned to your signed-in account.',
      sections: [
        ['Choose your match', ['Open My matches and select the assigned fixture from the list.', 'If no fixture appears, confirm you are signed in with the correct account and ask the Super Admin to verify the assignment.']],
        ['Start and manage match time', ['Select the correct match before using any match controls.', 'Use Start match when play begins. Use the half-time and second-half controls at the appropriate points.', 'Update the current minute when required and verify the displayed match clock/status.']],
        ['Record match events', ['Choose the team, enter the player name and match minute, then select Goal, Yellow card, Red card or Substitution.', 'For a goal, enter the assist player only when applicable.', 'For a substitution, enter the player coming off as well as the player coming on.', 'Review the event list and score after recording. Correct errors promptly using the approved process.']],
        ['Submit the final score', ['At full time, verify the goals recorded for both teams against the official match record.', 'Select End and save final score and confirm the displayed score for approval.', 'A submitted score may be awaiting Super Admin approval before it is treated as confirmed. Do not submit until checked.']],
        ['Change or reverse a result', ['These actions affect an already submitted final score. Use them only when an authorized correction is required.', 'Provide a clear reason when prompted. Changes and reversals are logged.', 'If unsure, contact the Super Admin before proceeding.']],
        ['Man of the Match', ['Choose the match and select the eligible player from the Man of the Match list.', 'Check the player and fixture carefully before saving the award.']],
        ['Offline use and synchronization', ['Match events and final scores may be queued on this device when the internet is unavailable.', 'Keep the portal open and return to a reliable connection. The app attempts to sync queued items automatically.', 'Wait for a successful sync message before assuming the server has received the report. Avoid repeated submissions.']]
      ]
    },
    MEDIA_OFFICER: {
      title: 'Media Officer User Manual',
      intro: 'Use this portal to prepare news, announcements, match reports and fan polls for the public League Centre.',
      sections: [
        ['Create a news post', ['Choose a category: News, Press release, Match report or Announcement.', 'For a match report, optionally link the completed match. Select the relevant competition, or leave All leagues for general news.', 'Enter a clear headline and write the story. Add a photo or video URL only if it is valid and approved for publication.', 'Review spelling, names, dates and links before saving.']],
        ['Save a draft or submit', ['Choose Save draft to keep work in progress. Drafts are not public.', 'Choose Submit for approval when the post is ready. A Super Admin reviews it before it appears in the public News Centre.', 'Check My posts to see each item and its status. If a draft needs approval, use Submit for approval there.']],
        ['Create a fan poll', ['Enter a neutral, clear question and at least two answer options. A third and fourth option are optional.', 'Select Publish poll and confirm that the question and options appear in the poll list.', 'Use Close poll when voting should stop. Reopen poll only when authorized and appropriate.']],
        ['Editorial standards', ['Use verified information and accurate competition, club, player and match names.', 'Obtain permission for photographs, video and personal information before submission.', 'Do not present an unapproved draft as an official SLFA announcement.', 'Correct errors through the appropriate review process and follow SLFA media policy.']]
      ]
    },
    MATCH_COMMISSIONER: {
      title: 'Match Commissioner User Manual',
      intro: 'This workspace is for the Match Commissioner assigned to a fixture. It records match-day oversight and the official post-match report. It does not control the referee clock or replace the referee result submission.',
      sections: [
        ['Open your assigned fixture', ['Sign in using the account appointed by the Super Admin. The workspace lists only fixtures assigned to your account as Match Commissioner.', 'Select the correct fixture and verify the home and away clubs, venue, kick-off time and match status before entering information.', 'If a fixture is missing or assigned incorrectly, contact the Super Admin. Do not use another official’s account.']],
        ['Pre-match inspection', ['Inspect the pitch and playing surface, dressing rooms, facilities, security arrangements and spectator-management preparations.', 'Record the arrival and readiness of both teams and the appointed match officials.', 'Enter factual pre-match coordination notes. Record deficiencies clearly, including who was notified and what action was taken.', 'Do not mark an arrangement as satisfactory unless you have checked it.']],
        ['Monitor the match', ['Observe the conduct of teams, officials and spectators throughout the fixture.', 'Record interruptions, delays, unusual occurrences, misconduct and possible breaches of competition regulations.', 'For each incident, record the approximate time, location, people involved, what you directly observed and any immediate action taken.', 'Distinguish direct observations from information reported to you by another person. Avoid assumptions or emotional language.']],
        ['Photographic evidence and OCR', ['Attach clear JPG, PNG or WEBP photographs relevant to the report. Each image must be no larger than 8 MB.', 'Use the evidence list to open your private uploaded images. Access links are temporary and should not be shared publicly.', 'OCR may extract text from uploaded photographs. Treat extracted text as a draft only: verify every name, shirt number, score and incident against the original image.', 'Do not rely on OCR as proof or submit unreadable, unrelated or unauthorised personal images.']],
        ['Save and submit the official report', ['Complete the relevant fields: pitch and facilities, security, team and officials’ arrival, pre-match notes, crowd behaviour, interruptions, match conduct, incidents, post-match summary and recommendations.', 'Use Save draft when information is incomplete or you need to return later. Drafts are not a submitted official report.', 'Before submission, review the selected fixture and every entry. A post-match summary or incident details is required before submission.', 'Select Submit report only when the report is accurate and ready for official review. Confirm that the status changes to SUBMITTED and that the report appears in your history.']],
        ['Review status and corrections', ['Use report history to check draft, submitted and reviewed records and any review notes.', 'A report marked REVIEWED is locked. Contact the Super Admin if a correction is necessary; do not create a duplicate report to bypass the lock.', 'Keep supporting records and follow SLFA competition and safeguarding procedures. Never publish confidential incident details yourself.']],
        ['Role boundaries and troubleshooting', ['You do not start, pause or end the match, control the official match clock, record the official final result or approve your own report.', 'If saving or uploading fails, check your internet connection, retry once, and confirm the report history before submitting again.', 'If the wrong fixture, missing appointment or access-denied message appears, stop and ask the Super Admin to verify the assignment and account status.']]
      ]
    },
    TEAM_OFFICIAL: {
      title: 'Team Official / Club Representative User Manual',
      intro: 'Use this club-scoped workspace to submit your club’s official electronic team sheet for an upcoming assigned fixture. You can only submit for the club linked to your approved account.',
      sections: [
        ['Account and club access', ['Sign in with the account invited and activated by the SLFA Technical Director. Your account must be active and assigned to the correct club.', 'Check the club name displayed in Club workspace. If it is wrong or missing, do not submit; contact the Super Admin to correct the assignment.', 'The portal only displays eligible upcoming fixtures involving your assigned club. It does not give access to another club’s squad or submissions.']],
        ['Select the correct fixture', ['Choose the upcoming fixture from the fixture selector and verify both teams, date, kick-off time and venue.', 'Check the displayed submission deadline. Team sheets close 20 minutes before kick-off.', 'If the fixture details are incorrect or the fixture is missing, contact the Super Admin rather than selecting a different match.']],
        ['Prepare the electronic team sheet', ['Choose only active, approved players registered to your club for the fixture season.', 'Select the starting XI and substitutes in the appropriate fields. Check player names and shirt numbers against the club’s official squad records.', 'Enter the required bench staff details, including the Head Coach and Team Manager, where the form provides those fields.', 'Check the formation and player positions if requested. Ensure the selected starting team and substitutes do not contain duplicate players.', 'Review the completed sheet carefully before submission. A team sheet is an official match record.']],
        ['Submit and track the sheet', ['Submit before the displayed deadline. Wait for the confirmation message; do not assume a tap succeeded if the page is still processing.', 'Open My team-sheet submissions to check the fixture, submission time and current review status.', 'If the sheet is returned for correction, read the review note, make the permitted changes and resubmit using the same fixture record.', 'An approved team sheet is locked. Contact the Super Admin through the official channel if a correction is required after approval.']],
        ['Late, unavailable or ineligible players', ['Do not select a player who is not registered and approved for your club and the applicable season.', 'Do not bypass a closed submission window or attempt to alter an approved sheet.', 'If a player’s registration, eligibility or availability is disputed, contact the Super Admin and follow the competition regulations.']],
        ['Good practice and troubleshooting', ['Submit only information authorised by your club. Keep player and staff information confidential.', 'Use a stable internet connection and keep the portal open until a success message appears.', 'If the fixture list is empty, verify your club assignment and ask the Super Admin to check the fixture and season setup.', 'If a submission appears to have failed, check My team-sheet submissions before trying again to avoid duplicates.']]
      ]
    },
    MATCH_DATA_OPERATOR: {
      title: 'Match Data Operator User Manual',
      intro: 'The Match Data Operator records live match events for fixtures specifically assigned by the Super Admin. The Main Referee retains control of the match clock and official result.',
      sections: [
        ['Sign in and select an appointment', ['Sign in with your active Match Data Operator account.', 'Open My appointed fixtures and select only a fixture assigned to you. If no fixture appears, ask the Super Admin to verify the appointment.', 'Confirm the home and away teams, kick-off time, venue and match status before recording events.']],
        ['Understand your authority', ['You may record live goals, cards, substitutions and the additional event types enabled in the event form, such as shots, saves, corners, fouls and offsides.', 'You cannot start, pause or end the match, change the referee’s match clock, submit the official final score or alter a confirmed result.', 'The Main Referee is responsible for match timing and the official result. Do not use another official’s login or attempt to perform referee-only actions.']],
        ['Check the official line-ups', ['When you open a fixture, the system loads the approved team line-ups.', 'Select the correct team and player from the line-up. Player and assist selections are checked against the published match line-up.', 'If a player is missing or the wrong line-up is displayed, stop and contact the referee or Super Admin through the approved match-day channel. Do not invent a player entry.']],
        ['Record a live event', ['Choose the assigned fixture and open Record a live event.', 'Select the event type, team, eligible player and match minute as requested by the form. Add an assist, player coming off or player coming on only where relevant.', 'For cards and substitutions, confirm the player and team carefully. For goals, verify the scorer and assist before saving.', 'Review the event timeline after saving. Check that the event appears once and is associated with the correct team and minute.', 'Use factual, consistent event details. If an event is not certain, verify it with the match officials before entry.']],
        ['Correct an event', ['You may reverse only an event that you personally entered, while the match is live, and only by supplying the audit reason requested by the system.', 'Check the event identity and reason before confirming a reversal. A reversal is an audited correction, not a way to erase an inconvenient record.', 'For an event entered by another official, a closed match or a correction outside your authority, refer the matter to the Super Admin.']],
        ['Offline queue and synchronization', ['If connectivity is interrupted, eligible event entries may be held in the device’s local pending queue.', 'Check the queue status and keep the same signed-in device available. Reconnect to a reliable network and allow the app to synchronize pending entries.', 'Wait for the system to confirm synchronization before assuming the server has received the events.', 'Do not clear browser storage, uninstall the app or repeatedly submit the same event while a queue is pending. This may cause loss or duplication of unsynchronized work.']],
        ['End-of-match checks and troubleshooting', ['Compare the event timeline with the match officials’ observations and report discrepancies to the Main Referee.', 'Do not calculate or submit the official final result on behalf of the referee.', 'If the wrong fixture is shown, line-ups fail to load or an event is rejected, stop entering data and contact the Super Admin.', 'Before leaving the match, confirm that the pending queue is empty or that every remaining item has a clear synchronization status.']]
      ]
    },
    DISCIPLINARY_OFFICER: {
      title: 'Disciplinary Officer User Manual',
      intro: 'Use this portal to record disciplinary decisions and manage suspension rules. Enter only verified decisions made through the authorized process.',
      sections: [
        ['Review suspensions', ['Open the Suspensions list to review current disciplinary records.', 'Check the player, competition and remaining suspension details before taking further action.']],
        ['Record a decision', ['Choose the correct player and decision type: Note, Protest, Official ruling, Fine or Match ban.', 'For a fine, enter the fine amount. For a match ban, enter the number of matches.', 'Link a related match when relevant and enter a clear reason or ruling.', 'Choose whether the decision should appear on the public player profile in accordance with SLFA policy.', 'Select Record decision and verify that the new record appears in the list.']],
        ['Configure disciplinary rules', ['Set the yellow-card accumulation threshold and the number of matches for the resulting ban.', 'Set the suspension length for a straight red card.', 'Check every value against the current competition regulations before saving rules.', 'Do not change rules during a competition without the appropriate authorization.']],
        ['Accuracy, privacy and corrections', ['Confirm the player identity and supporting match record before saving.', 'Use clear, factual language. Avoid publishing confidential case details.', 'If a decision is incorrect, follow the official correction or appeal process and retain the proper record.']]
      ]
    }
  };
  var manual = manuals[role];
  if (!manual) return;
  var style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = 'portal-manual.css?v=1'; document.head.appendChild(style);
  var button = document.createElement('button');
  button.type = 'button'; button.className = 'portal-manual-trigger'; button.innerHTML = '<span aria-hidden="true">▤</span> User manual';
  button.setAttribute('aria-haspopup','dialog');
  var header = document.querySelector('.portal-head');
  if (header) header.appendChild(button);
  var dialog = document.createElement('dialog');
  dialog.className = 'portal-manual-dialog';
  dialog.setAttribute('aria-labelledby','portalManualTitle');
  var sections = manual.sections.map(function (section, index) {
    return '<details class="portal-manual-section"' + (index === 0 ? ' open' : '') + '><summary>' + section[0] + '</summary><ol>' +
      section[1].map(function (item) { return '<li>' + item.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</li>'; }).join('') +
      '</ol></details>';
  }).join('');
  dialog.innerHTML = '<div class="portal-manual-top"><div><p class="portal-manual-eyebrow">THE SLFA LEAGUE APP · HELP CENTRE</p><h2 id="portalManualTitle">' + manual.title + '</h2></div><button type="button" class="portal-manual-close" aria-label="Close manual">×</button></div>' +
    '<p class="portal-manual-intro">' + manual.intro + '</p><div class="portal-manual-sections">' + sections + '</div>' +
    '<div class="portal-manual-actions"><button type="button" class="secondary portal-manual-print">Print / Save as PDF</button><button type="button" class="primary portal-manual-done">Close manual</button></div>';
  document.body.appendChild(dialog);
  // Apply the selected language immediately to the late-mounted manual content.
  if (window.slfaTranslateDOM) { window.slfaTranslateDOM(button); window.slfaTranslateDOM(dialog); }
  function close() { if (dialog.open) dialog.close(); }
  button.addEventListener('click', function () { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open','open'); });
  dialog.querySelector('.portal-manual-close').addEventListener('click', close);
  dialog.querySelector('.portal-manual-done').addEventListener('click', close);
  dialog.querySelector('.portal-manual-print').addEventListener('click', function () { window.print(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
})();