import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else out.push(absolute);
  }
  return out;
}

function localPath(reference, fromFile) {
  const value = String(reference || '').trim();
  if (!value || value.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) return null;
  if (/^(?:data:|blob:|javascript:|mailto:|tel:)/i.test(value)) return null;

  let pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  try { pathname = decodeURIComponent(pathname); } catch { /* keep original path */ }

  const absolute = pathname.startsWith('/')
    ? path.resolve(ROOT, pathname.replace(/^\/+/, ''))
    : path.resolve(path.dirname(fromFile), pathname);

  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Local reference escapes repository: ${reference} in ${path.relative(ROOT, fromFile)}`);
  }
  return absolute;
}

function attributes(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return out;
}

function assertLocalFile(reference, sourceFile) {
  const target = localPath(reference, sourceFile);
  if (!target) return;
  const resolved = fs.existsSync(target)
    ? target
    : (reference.endsWith('/') && fs.existsSync(path.join(target, 'index.html')) ? path.join(target, 'index.html') : null);
  assert.ok(resolved, `Missing local dependency "${reference}" referenced by ${path.relative(ROOT, sourceFile)}`);
}

const files = walk(ROOT);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const jsFiles = files.filter(file => file.endsWith('.js'));

test('required public and staff portals exist', () => {
  const required = [
    'index.html',
    'developer.html',
    'super-admin.html',
    'referee.html',
    'team-official.html',
    'match-data-operator.html',
    'media.html',
    'disciplinary.html',
    'league-admin.html'
  ];
  for (const file of required) assert.ok(fs.existsSync(path.join(ROOT, file)), `Missing portal: ${file}`);
});

test('critical competition-governance modules exist and load in the Super Admin workspace', () => {
  const page = fs.readFileSync(path.join(ROOT, 'super-admin.html'), 'utf8');
  const requiredModules = [
    'division-management.js',
    'competition-operations.js',
    'match-ops-notifications.js',
    'super-admin-referee-match-records.js',
    'super-admin-team-sheets.js',
    'national-integrity.js'
  ];
  for (const module of requiredModules) {
    assert.ok(fs.existsSync(path.join(ROOT, module)), `Missing governance module: ${module}`);
    assert.ok(page.includes(module), `Super Admin workspace does not load ${module}`);
  }
});

test('all local HTML script, stylesheet, icon and media references resolve', () => {
  const missing = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const tags = [
      ...html.matchAll(/<(?:script|img|source|iframe|audio|video)\b[^>]*>/gi),
      ...html.matchAll(/<link\b[^>]*>/gi)
    ];
    for (const match of tags) {
      const attrs = attributes(match[0]);
      const tag = match[0].slice(1).split(/[\s>]/, 1)[0].toLowerCase();
      let reference = attrs.src;
      if (tag === 'link') {
        const rel = (attrs.rel || '').toLowerCase();
        if (!/(?:stylesheet|icon|manifest|preload|modulepreload)/.test(rel)) continue;
        reference = attrs.href;
      }
      if (!reference) continue;
      try { assertLocalFile(reference, file); }
      catch (error) { missing.push(error.message); }
    }

    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attributes(match[0]).href;
      if (href && /\.(?:html|pdf)(?:[?#]|$)/i.test(href)) {
        try { assertLocalFile(href, file); }
        catch (error) { missing.push(error.message); }
      }
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('service-worker precache includes the critical Super Admin workflow modules', () => {
  const swPath = path.join(ROOT, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const shell = sw.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shell, 'Could not locate the service-worker SHELL asset list');
  const cached = new Set([...shell[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1].split(/[?#]/, 1)[0].replace(/^\.\//, '')));
  for (const file of [
    'competition-operations.js',
    'match-ops-notifications.js',
    'super-admin-referee-match-records.js',
    'super-admin-team-sheets.js',
    'national-integrity.js',
    'division-management.js'
  ]) {
    assert.ok(cached.has(file), `Service worker does not precache ${file}`);
  }
});

test('browser JavaScript files pass Node syntax parsing', () => {
  const failures = [];
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${path.relative(ROOT, file)}\n${result.stderr || result.stdout}`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('public browser configuration does not contain server-side Supabase secrets', () => {
  const configPath = path.join(ROOT, 'config.js');
  const config = fs.readFileSync(configPath, 'utf8');
  assert.doesNotMatch(config, /sb_secret_[A-Za-z0-9_-]{16,}/i, 'A Supabase secret key appears in config.js');
  assert.doesNotMatch(config, /postgres(?:ql)?:\/\/[^\s'"\x60]+/i, 'A database connection string appears in config.js');
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+['"]/i, 'A service-role key assignment appears in config.js');
});


test('fan-data access uses a cryptographically random versioned browser token', () => {
  const tokenPath = path.join(ROOT, 'voter-key.js');
  const tokenSource = fs.readFileSync(tokenPath, 'utf8');
  assert.match(tokenSource, /cryptoApi\.getRandomValues/);
  assert.match(tokenSource, /new Uint8Array\(32\)/);
  assert.match(tokenSource, /v2_/);
  assert.doesNotMatch(tokenSource, /Math\.random|randomUUID/);

  for (const page of ['help.html', 'my-data.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(html.includes('voter-key.js?v=1'), page + ' must load the shared secure token helper');
    assert.ok(html.includes('slfaGetVoterKey'), page + ' must use the shared secure token helper');
  }

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('voter-key.js?v=1'), 'Service worker must precache the token helper');
  assert.ok(sw.includes('slfa-app-v307'), 'Service worker cache version must be advanced');
});

test('public past-season statistics are limited to published events', () => {
  const migration = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20261127110133_published_only_season_player_statistics.sql'),
    'utf8'
  );
  const filters = migration.match(/e\.published_at\s+IS\s+NOT\s+NULL/gi) || [];
  assert.equal(filters.length, 2, 'Both goal and assist aggregations must filter unpublished events');
});

test('structured navigation assets load across every staff workspace', () => {
  const publicPage = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(publicPage.includes('workspace-shell.css?v=1'), 'Public League Centre must load the structured layout stylesheet');

  const staffPages = [
    'developer.html',
    'super-admin.html',
    'referee.html',
    'team-official.html',
    'match-data-operator.html',
    'media.html',
    'disciplinary.html',
    'league-admin.html'
  ];
  for (const pageName of staffPages) {
    const page = fs.readFileSync(path.join(ROOT, pageName), 'utf8');
    assert.ok(page.includes('workspace-shell.css?v=1'), pageName + ' must load the shared workspace stylesheet');
    assert.ok(page.includes('workspace-shell.js?v=1'), pageName + ' must load role-aware section navigation');
  }

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('workspace-shell.css?v=1'), 'Service worker must cache the workspace stylesheet');
  assert.ok(sw.includes('workspace-shell.js?v=1'), 'Service worker must cache the workspace navigation script');
  assert.ok(sw.includes('slfa-app-v307'), 'Service worker cache must be advanced for the interface refresh');
});


test('official standings have one canonical public destination', () => {
  const leaguePages = fs.readFileSync(path.join(ROOT, 'league-pages.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.doesNotMatch(leaguePages, /LEAGUE TABLE|tableHtml|slfaLpTableSeason/,
    'Competition profiles must not render a second standings table or season selector');
  assert.match(leaguePages, /id="slfaLpViewTable"/,
    'Competition profiles must provide a shortcut to the official Table panel');
  assert.match(leaguePages, /tableTab\.click\(\)/,
    'The shortcut must open the canonical Table tab');
  assert.match(index, /data-tab="table"/,
    'The public navigation must retain the dedicated Table tab');
  assert.match(index, /id="tableBody"/,
    'The dedicated Table panel must retain its single standings table body');
  assert.match(leaguePages, /Home pts.*Away pts.*Last 5/,
    'Competition profiles should retain the unique home/away and recent-form insights');
});

test('official table shortcut is translated in all supported app languages', () => {
  const dictionary = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  assert.match(dictionary, /View official table/);
  assert.match(dictionary, /Voir le classement officiel/);
  assert.match(dictionary, /Luk di ɔfisyal tebul/);
  assert.match(dictionary, /عرض الجدول الرسمي/);
});


test('Krio translations load across public and all staff portals', () => {
  const pages = [
    'index.html', 'developer.html', 'super-admin.html', 'referee.html',
    'team-official.html', 'match-data-operator.html', 'media.html',
    'disciplinary.html', 'league-admin.html', 'help.html', 'privacy.html',
    'my-data.html', 'reset-password.html'
  ];
  for (const pageName of pages) {
    const page = fs.readFileSync(path.join(ROOT, pageName), 'utf8');
    assert.match(page, /i18n\.js\?v=\d+/, pageName + ' must load a versioned shared language dictionary');
  }

  const leagueAdmin = fs.readFileSync(path.join(ROOT, 'league-admin.html'), 'utf8');
  assert.ok(/i18n\.js\?v=\d+/.test(leagueAdmin) && leagueAdmin.indexOf('i18n.js') < leagueAdmin.indexOf('league-admin.js'),
    'League Administrator must load translations before its dynamic interface');

  const dictionary = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  for (const phrase of [
    'National Football Intelligence & Integrity Centre',
    'Division Leagues & Promotion / Relegation',
    'No referee match records have been submitted yet.',
    'Pitch condition',
    'Your assigned matches are ready. Choose the fixture and submit clear photographs.',
    'Signed in as',
    'Create fixture',
    'View official table'
  ]) {
    assert.ok(dictionary.includes(phrase), 'Missing Krio dictionary key: ' + phrase);
  }
  assert.match(dictionary, /National Football Intelligence & Integrity Centre[\s\S]*?Nashɔnəl Futbɔl Infomeshɔn/);
  assert.match(dictionary, /No referee match records have been submitted yet\.[\s\S]*?Nɔ gɛt referee mach rikɔd/);

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('i18n.js?v=22'), 'Service worker must precache the expanded language dictionary');
  assert.ok(sw.includes('slfa-app-v307'), 'Service worker cache must be advanced for the Krio update');
});


test('supporter-first home screen and quick standings preview are present', () => {
  const home = fs.readFileSync(path.join(ROOT, 'home-dashboard.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'home-dashboard.css'), 'utf8');
  assert.ok(home.indexOf('id="slfaSupporterDashboard"') < home.indexOf('aria-label="Featured match"'),
    'Followed clubs and players should appear before the featured match on the home screen');
  assert.match(home, /data-slfa-open-tab="teams"/);
  assert.match(home, /data-slfa-open-tab="players"/);
  assert.match(home, /id="slfaQuickStandings"/);
  assert.match(home, /data-slfa-open-table/);
  assert.match(home, /db\.from\('league_standings'\)/);
  assert.match(home, /db\.rpc\('season_table'/);
  assert.match(home, /slice\(0,chosen\?5:3\)/);
  assert.match(css, /\.slfa-home-quick-table/);
  assert.match(css, /\.slfa-supporter-actions/);
});

test('Match Centre includes a swipeable seven-day date strip', () => {
  const matches = fs.readFileSync(path.join(ROOT, 'match-centre.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'match-centre.css'), 'utf8');
  assert.match(matches, /dateStripItems/);
  assert.match(matches, /data-mc-day/);
  assert.match(matches, /dateScope\.filter/);
  assert.match(matches, /chosenDate=b\.getAttribute\('data-mc-day'\)/);
  assert.match(matches, /id="mcDate"/, 'Keep the precise date picker as an alternative');
  assert.match(css, /\.slfa-mc-date-strip/);
  assert.match(css, /overflow-x:auto/);
});

test('new supporter and match browsing controls are translated in all supported languages', () => {
  const dictionary = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  for (const phrase of [
    'No clubs followed yet. Save a club with the star in Teams.', 'No players followed yet. Save players from the Players directory.', 'Upcoming fixtures involving your followed clubs will appear here.' , 'Browse by date', 'All dates', 'Your followed teams',
    'Followed clubs & players', 'Quick table preview', 'View full official table'
  ]) assert.ok(dictionary.includes(phrase), 'Missing translation key: ' + phrase);
  assert.match(dictionary, /Object\.assign\(DICT\.kri,[\s\S]*?Browse by date/);
  assert.match(dictionary, /Object\.assign\(DICT\.fr,[\s\S]*?Browse by date/);
  assert.match(dictionary, /Object\.assign\(DICT\.ar,[\s\S]*?Browse by date/);
});


test('Krio language preference is normalized and translation runtime uses cached phrase lookups', () => {
  const dictionary = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  assert.match(dictionary, /if \(v === 'krio'\) v = 'kri'/);
  assert.match(dictionary, /var exactLookup = Object\.create\(null\)/);
  assert.match(dictionary, /var phraseRules = \[\]/);
  assert.match(dictionary, /regex: new RegExp\(key\.replace/);
  assert.doesNotMatch(dictionary, /characterData:\s*true/,
    'The translation observer must not repeatedly process its own text-node updates');
  assert.match(dictionary, /Object\.assign\(DICT\.kri,[\s\S]*?'Browse by date'/);
});

test('public data loads on demand instead of fetching hidden tabs at startup', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public.js'), 'utf8');
  assert.match(app, /function loadPublicTab\(name, force\)/);
  assert.match(app, /else if \(name === 'players'\) loadPlayers\(\)/);
  assert.match(app, /else if \(name === 'news'\) loadNews\(\)/);
  assert.match(app, /else if \(name === 'videos'\) loadVideos\(\)/);
  assert.match(app, /if \(activePublicTab === 'matches'\) loadLive\(\)/);
  assert.doesNotMatch(app, /loadMatches\(\);loadLive\(\);loadMatchDay\(\);loadTable\(\);loadTeams\(\);loadPlayers\(\);loadNews\(\);loadVideos\(\)/);
  assert.match(app, /setInterval\(function\(\)\{if\(document\.visibilityState !== 'hidden'\)refreshAll\(\);\}, 180000\)/);
});

test('Leagues panel data is fetched only when the panel is opened', () => {
  const pages = fs.readFileSync(path.join(ROOT, 'league-pages.js'), 'utf8');
  assert.match(pages, /function refreshIfVisible\(\)/);
  assert.doesNotMatch(pages, /\.then\(function\(\) \{ loading = false; \}\);\n  load\(\);/,
    'League Pages must not issue its multi-query load on initial home screen startup');
});
