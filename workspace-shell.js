(function () {
  'use strict';

  var body = document.body;
  if (!body || !body.hasAttribute('data-portal')) return;

  var isLeagueAdmin = body.getAttribute('data-portal') === 'LEAGUE_ADMIN';
  var workspace = document.getElementById(isLeagueAdmin ? 'laApp' : 'portalArea');
  if (!workspace) return;

  var navId = 'slfaWorkspaceNavigation';
  var lastSignature = '';
  var labels = {
    en: { navigation: 'Workspace navigation', hint: 'Jump to a section', dashboard: 'Dashboard', competition: 'Competition', match: 'Match operations', people: 'Clubs and players', media: 'Media and content', governance: 'Governance and reports', other: 'Other sections' },
    fr: { navigation: 'Navigation de l’espace', hint: 'Accéder à une rubrique', dashboard: 'Vue d’ensemble', competition: 'Compétitions', match: 'Opérations de match', people: 'Clubs et joueurs', media: 'Médias et contenu', governance: 'Gouvernance et rapports', other: 'Autres rubriques' },
    kri: { navigation: 'Navi-gation', hint: 'Go na wan seka', dashboard: 'Dashbɔd', competition: 'Kɔmpitishɔn', match: 'Mach dɛn', people: 'Klob ɛn pleya dɛn', media: 'Media ɛn kɔntɛnt', governance: 'Gɔvɛnans ɛn ripɔt dɛn', other: 'Oda seka dɛn' },
    ar: { navigation: 'التنقل داخل مساحة العمل', hint: 'انتقل إلى قسم', dashboard: 'نظرة عامة', competition: 'المسابقات', match: 'عمليات المباريات', people: 'الأندية واللاعبون', media: 'الإعلام والمحتوى', governance: 'الحوكمة والتقارير', other: 'أقسام أخرى' }
  };

  function currentLabels() {
    var lang = 'en';
    try { lang = localStorage.getItem('slfa_lang') || 'en'; } catch (e) {}
    return labels[lang] || labels.en;
  }

  function categoryFor(title) {
    var value = String(title || '').toLowerCase();
    if (/command centre|overview|dashboard|at a glance/.test(value)) return 'dashboard';
    if (/competition|league|season|division|promotion|relegation|cup|rule|standings|historical table|club movement/.test(value)) return 'competition';
    if (/match|fixture|referee|commissioner|team sheet|live result|official appointment|data operator/.test(value)) return 'match';
    if (/club|player|squad|team registration|team information/.test(value)) return 'people';
    if (/media|news|publication|content|announcement/.test(value)) return 'media';
    if (/integrity|audit|report|download|export|disciplin|case|privacy|security|account data/.test(value)) return 'governance';
    return 'other';
  }

  function slug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section';
  }

  function headings() {
    return Array.prototype.slice.call(workspace.querySelectorAll('h2')).filter(function (heading) {
      return heading.textContent.trim() && !heading.closest('#' + navId) && !heading.closest('#signIn');
    });
  }

  function ensureHeadingId(heading, index) {
    if (heading.id) return heading.id;
    var base = 'slfa-workspace-' + slug(heading.textContent);
    var candidate = base;
    var suffix = 2;
    while (document.getElementById(candidate) && document.getElementById(candidate) !== heading) {
      candidate = base + '-' + suffix;
      suffix += 1;
    }
    heading.id = candidate;
    heading.setAttribute('tabindex', '-1');
    return candidate;
  }

  function insertNav(nav) {
    if (isLeagueAdmin) {
      var accountCard = workspace.querySelector('.la-card');
      if (accountCard && accountCard.parentNode === workspace) {
        workspace.insertBefore(nav, accountCard.nextSibling);
      } else {
        workspace.insertBefore(nav, workspace.firstChild);
      }
      return;
    }
    var signedIn = document.getElementById('signedIn');
    if (signedIn && signedIn.parentNode === workspace) {
      workspace.insertBefore(nav, signedIn);
      return;
    }
    var roleTools = document.getElementById('roleTools');
    if (roleTools && roleTools.parentNode) {
      roleTools.parentNode.insertBefore(nav, roleTools);
      return;
    }
    workspace.insertBefore(nav, workspace.firstChild);
  }

  function buildNavigation() {
    var list = headings();
    if (list.length < 2) {
      var old = document.getElementById(navId);
      if (old) old.remove();
      lastSignature = '';
      return;
    }

    var signature = list.map(function (heading) {
      return (heading.id || '') + '|' + heading.textContent.trim();
    }).join('||');

    var existing = document.getElementById(navId);
    if (existing && signature === lastSignature) return;

    var text = currentLabels();
    var nav = document.createElement('nav');
    nav.className = 'slfa-workspace-nav';
    nav.id = navId;
    nav.setAttribute('aria-label', text.navigation);

    var details = document.createElement('details');
    var summary = document.createElement('summary');
    var title = document.createElement('span');
    title.textContent = text.navigation;
    var hint = document.createElement('span');
    hint.className = 'slfa-workspace-nav__hint';
    hint.textContent = text.hint;
    summary.appendChild(title);
    summary.appendChild(hint);
    details.appendChild(summary);

    var groups = document.createElement('div');
    groups.className = 'slfa-workspace-nav__groups';
    var order = ['dashboard', 'competition', 'match', 'people', 'media', 'governance', 'other'];
    var buckets = {};
    order.forEach(function (key) { buckets[key] = []; });

    list.forEach(function (heading, index) {
      var id = ensureHeadingId(heading, index);
      var category = categoryFor(heading.textContent);
      buckets[category].push({ id: id, label: heading.textContent.trim() });
    });

    var labelKeys = {
      dashboard: 'dashboard', competition: 'competition', match: 'match',
      people: 'people', media: 'media', governance: 'governance', other: 'other'
    };

    order.forEach(function (key) {
      if (!buckets[key].length) return;
      var group = document.createElement('section');
      group.className = 'slfa-workspace-nav__group';
      var heading = document.createElement('h3');
      heading.textContent = text[labelKeys[key]];
      group.appendChild(heading);
      var links = document.createElement('div');
      links.className = 'slfa-workspace-nav__links';
      buckets[key].forEach(function (item) {
        var link = document.createElement('a');
        link.href = '#' + item.id;
        link.textContent = item.label;
        link.addEventListener('click', function () { details.open = false; });
        links.appendChild(link);
      });
      group.appendChild(links);
      groups.appendChild(group);
    });

    details.appendChild(groups);
    nav.appendChild(details);

    if (window.slfaTranslateDOM) window.slfaTranslateDOM(nav);
    if (existing) existing.remove();
    insertNav(nav);
    lastSignature = signature;
  }

  buildNavigation();
  var observer = new MutationObserver(function () { buildNavigation(); });
  observer.observe(workspace, { childList: true, subtree: true, characterData: true });
  observer.observe(workspace, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('storage', function (event) {
    if (event.key === 'slfa_lang') buildNavigation();
  });
})();