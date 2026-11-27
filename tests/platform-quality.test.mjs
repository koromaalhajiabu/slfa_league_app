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
  assert.ok(sw.includes('slfa-app-v300'), 'Service worker cache version must be advanced');
});

test('public past-season statistics are limited to published events', () => {
  const migration = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20261127110133_published_only_season_player_statistics.sql'),
    'utf8'
  );
  const filters = migration.match(/e\.published_at\s+IS\s+NOT\s+NULL/gi) || [];
  assert.equal(filters.length, 2, 'Both goal and assist aggregations must filter unpublished events');
});
