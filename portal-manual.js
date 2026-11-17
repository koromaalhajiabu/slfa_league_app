/* Role-specific SLFA portal manuals. No Club Admin portal is defined here. */
(function () {
  'use strict';
  var role = String(document.body.dataset.portal || '').toUpperCase();
  var manuals = {
    DEVELOPER: {
      title: 'Technical Director User Manual',
      intro: 'This guide covers platform-level administration. Use these controls carefully: account, competition and application-wide changes can affect the whole SLFA League App.',
      sections: [
        ['Platform overview', ['Open the Technical Director portal and review the live totals for accounts, fixtures, clubs, fan reports and media posts.', 'Use Refresh overview to request the latest database counts. A dash means a count could not be read; it is not a zero.']],
        ['Competition directory management', ['Choose an existing competition to edit, or leave the selector on Create a new competition.', 'Enter the competition name, format, category and public description. Add a logo URL or repository path only when you have a valid asset.', 'Set display order and decide whether the competition should be published, then select Save competition.', 'Check the competition list and public League Centre after saving.']],
        ['Knockout cup bracket', ['Choose the cup competition, season and the fixture that represents the tie.', 'Enter the round name and tie number. If the winner progresses, choose the next-round tie and whether the winner enters as the home or away team.', 'Create the next-round fixture before linking a previous tie to it. Save the tie and verify the bracket.']],
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
        ['Clubs and seasons', ['To add a club, enter its official club name, choose its competition and optionally add a valid crest URL, then select Add club.', 'Create seasons with a clear season name and correct start and end dates. Check the season list after saving.', 'Avoid creating duplicate club or season records. Confirm spelling and competition first.']],
        ['Fixture planner', ['Choose the competition and season before entering the home team, away team, kick-off date/time and venue.', 'Check both team names and the date carefully, then select Add fixture.', 'Confirm the fixture appears in the relevant match lists.']],
        ['Import fixtures and results', ['Download the CSV template and follow its column structure exactly.', 'Ensure season, competition and club names match existing records.', 'Choose the CSV file and select Check file. Review the preview and resolve validation errors before selecting Import matches.', 'Do not import the same file twice.']],
        ['Results and match status', ['Choose the correct season and match, then enter the home and away scores.', 'Use Record result for a new result. Changing or reversing a confirmed result requires a reason and is logged.', 'Use Match status to mark a fixture scheduled, postponed, rescheduled or cancelled. Enter a clear reason where appropriate.', 'Verify the public table and match centre after an approved result.']],
        ['Referee assignments and approvals', ['Choose a fixture and the official, then select the match role and assign.', 'Review final scores submitted by referees before approval. Check the match and score against the official report.', 'Review submitted news and fan comments before approving or rejecting them.']],
        ['Club/player reviews and audit', ['Review club profile changes, player registrations and transfer requests in their respective queues.', 'Approve only complete, verified information. Use the audit log to review recorded changes.', 'Use privacy request and fan report areas according to SLFA policy.']],
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
  function close() { if (dialog.open) dialog.close(); }
  button.addEventListener('click', function () { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open','open'); });
  dialog.querySelector('.portal-manual-close').addEventListener('click', close);
  dialog.querySelector('.portal-manual-done').addEventListener('click', close);
  dialog.querySelector('.portal-manual-print').addEventListener('click', function () { window.print(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
})();