// Language choice for fans: English (default), Krio or French.
// The text on the page is English. A dictionary swaps whole, exact labels only,
// so names, scores and news stay as they were published.
(function () {
  var DICT = {
    fr: {
      'The SLFA League App': 'L’application de la Ligue SLFA',
      'Sierra Leone Football Association': 'Fédération sierra-léonaise de football',
      'League Centre': 'Centre de la Ligue',
      'Get alerts': 'Recevoir les alertes',
      'Share': 'Partager',
      'Matches': 'Matchs',
      'Leagues': 'Ligues',
      'Language': 'Langue',
      'Light mode': 'Mode clair',
      'Dark mode': 'Mode sombre',
      'Table': 'Classement',
      'Teams': 'Équipes',
      'Players': 'Joueurs',
      'News': 'Actualités',
      'Videos': 'Vidéos',
      'Predict': 'Pronostics',
      'Live': 'En direct',
      'Upcoming': 'À venir',
      'Full time': 'Fin du match',
      'Standings': 'Classement',
      'Results': 'Résultats',
      'Fixtures': 'Matchs à venir',
      'Squad': 'Effectif',
      'Announcements': 'Annonces',
      'Share club ↗': 'Partager le club ↗',
      'Share ↗': 'Partager ↗',
      'Add to calendar': 'Ajouter au calendrier',
      'Match details': 'Détails du match',
      'Match stats': 'Statistiques du match',
      'Match timeline': 'Chronologie du match',
      'Published line-ups': 'Compositions publiées',
      'Fan comments': 'Commentaires des supporters',
      'Send for approval': 'Envoyer pour approbation',
      'Predict the score': 'Pronostiquez le score',
      'Save prediction': 'Sauvegarder mon pronostic',
      'Change prediction': 'Changer mon pronostic',
      'Leaderboard': 'Classement des pronostics',
      'Right result scores 1 point. Exact score scores 3 points.': 'Bon résultat : 1 point. Score exact : 3 points.',
      'Your name (shown on the leaderboard)': 'Votre nom (affiché dans le classement)',
      'Search updates': 'Rechercher',
      'Category': 'Catégorie',
      'Sign in': 'Se connecter',
      'Sign out': 'Se déconnecter',
      'Create account': 'Créer un compte',
      'Install app': 'Installer l’application',
      'Refresh': 'Actualiser',
      'Loading…': 'Chargement…',
      'Loading matches…': 'Chargement des matchs…'
    },
    kri: {
      'The SLFA League App': 'Di SLFA League App',
      'Sierra Leone Football Association': 'Sierra Leone Football Association',
      'League Centre': 'Di Lig Sɛntә',
      'Get alerts': 'Get alɛt dɛn',
      'Share': 'Shɛa',
      'Matches': 'Mach dɛn',
      'Leagues': 'Ligɛ dɛn',
      'Language': 'Lanwej',
      'Light mode': 'Layt mod',
      'Dark mode': 'Dak mod',
      'Table': 'Tebul',
      'Teams': 'Tim dɛn',
      'Players': 'Pleya dɛn',
      'News': 'Nyuz',
      'Videos': 'Vidio dɛn',
      'Predict': 'Gis di Skɔ',
      'Live': 'Di mach de go',
      'Upcoming': 'Di mach dɛn we de kam',
      'Full time': 'Di mach don',
      'Standings': 'Di pozishɔn dɛn',
      'Results': 'Di rizɔt dɛn',
      'Fixtures': 'Di mach dɛn we de kam',
      'Squad': 'Di tim pipul',
      'Announcements': 'Anawmɛnt dɛn',
      'Share club ↗': 'Shɛa di tim ↗',
      'Share ↗': 'Shɛa ↗',
      'Add to calendar': 'Put am insay kalenda',
      'Match details': 'Di mach dɛtɛl dɛn',
      'Match stats': 'Di mach nɔmba dɛn',
      'Match timeline': 'Di mach tɛm',
      'Published line-ups': 'Di tim lɛk dɛn',
      'Fan comments': 'Wetin di fan dɛn tɔk',
      'Send for approval': 'Sɛnd fɔ apruv',
      'Predict the score': 'Gis di skɔ',
      'Save prediction': 'Sev yu gis',
      'Change prediction': 'Chenj yu gis',
      'Leaderboard': 'Di bɛst gisɛ dɛn',
      'Right result scores 1 point. Exact score scores 3 points.': 'If yu gɛt di rizɔt rait, yu gɛt 1 pɔynt. If yu gɛt di skɔ rait, yu gɛt 3 pɔynt.',
      'Your name (shown on the leaderboard)': 'Yu nem (we de sho na di bɛst gisɛ dɛn)',
      'Search updates': 'Sɛch',
      'Category': 'Kayɛgori',
      'Sign in': 'Sayn in',
      'Sign out': 'Kɔmɔt',
      'Create account': 'Mek akawnt',
      'Install app': 'Insɔl di app',
      'Refresh': 'Frɛsh',
      'Loading…': 'De lod…',
      'Loading matches…': 'De lod di mach dɛn…'
    },
    ar: {
      'The SLFA League App': 'تطبيق دوري SLFA',
      'Sierra Leone Football Association': 'اتحاد كرة القدم في سيراليون',
      'League Centre': 'مركز الدوري',
      'Get alerts': 'تلقي التنبيهات',
      'Share': 'مشاركة',
      'Matches': 'المباريات',
      'Leagues': 'الدوريات',
      'Language': 'اللغة',
      'Light mode': 'الوضع الفاتح',
      'Dark mode': 'الوضع الداكن',
      'Table': 'جدول الترتيب',
      'Teams': 'الفرق',
      'Players': 'اللاعبون',
      'News': 'الأخبار',
      'Videos': 'الفيديوهات',
      'Predict': 'التوقعات',
      'Live': 'مباشر',
      'Upcoming': 'القادمة',
      'Full time': 'نهاية المباراة',
      'Standings': 'الترتيب',
      'Results': 'النتائج',
      'Fixtures': 'المباريات القادمة',
      'Squad': 'التشكيلة',
      'Announcements': 'الإعلانات',
      'Share club ↗': 'مشاركة النادي ↗',
      'Share ↗': 'مشاركة ↗',
      'Add to calendar': 'إضافة إلى التقويم',
      'Match details': 'تفاصيل المباراة',
      'Match stats': 'إحصاءات المباراة',
      'Match timeline': 'سير المباراة',
      'Published line-ups': 'التشكيلات المنشورة',
      'Fan comments': 'تعليقات الجماهير',
      'Send for approval': 'إرسال للموافقة',
      'Predict the score': 'توقّع النتيجة',
      'Save prediction': 'حفظ توقعي',
      'Change prediction': 'تغيير توقعي',
      'Leaderboard': 'ترتيب التوقعات',
      'Right result scores 1 point. Exact score scores 3 points.': 'النتيجة الصحيحة تمنح نقطة واحدة. النتيجة الدقيقة تمنح 3 نقاط.',
      'Your name (shown on the leaderboard)': 'اسمك (يظهر في الترتيب)',
      'Search updates': 'بحث',
      'Category': 'الفئة',
      'Sign in': 'تسجيل الدخول',
      'Sign out': 'تسجيل الخروج',
      'Create account': 'إنشاء حساب',
      'Install app': 'تثبيت التطبيق',
      'Refresh': 'تحديث',
      'Loading…': 'جارٍ التحميل…',
      'Loading matches…': 'جارٍ تحميل المباريات…'
    }
  };
  var LABELS = { en: 'English', kri: 'Krio', fr: 'Français', ar: 'العربية' };

  function lang() {
    try { var v = localStorage.getItem('slfa_lang'); return DICT[v] || v === 'en' ? v : 'en'; } catch (e) { return 'en'; }
  }
  var current = lang();
  var table = DICT[current] || null;

  function translateText(root) {
    if (!table) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var key = node.nodeValue.trim();
      if (table[key]) node.nodeValue = node.nodeValue.replace(key, table[key]);
    });
  }

  function translateAttrs(root) {
    if (!table) return;
    root.querySelectorAll('[aria-label],[placeholder],[title]').forEach(function (el) {
      ['aria-label', 'placeholder', 'title'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && table[v]) el.setAttribute(a, table[v]);
      });
    });
  }

  function setupPicker() {
    var sel = document.getElementById('langSelect');
    if (!sel) return;
    sel.innerHTML = Object.keys(LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' + LABELS[k] + '</option>';
    }).join('');
    sel.addEventListener('change', function () {
      try { localStorage.setItem('slfa_lang', sel.value); } catch (e) {}
      if (window.slfaTrack) window.slfaTrack('language_' + sel.value);
      location.reload();
    });
  }

  // Arabic reads right to left; the page layout follows the direction.
  if (current === 'ar') { document.documentElement.setAttribute('lang', 'ar'); document.documentElement.setAttribute('dir', 'rtl'); }
  else if (current !== 'en') document.documentElement.lang = current === 'kri' ? 'en' : 'fr';

  var pending = false;
  function run() {
    if (!table) return;
    observer.disconnect();
    translateText(document.body);
    translateAttrs(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; run(); }, 50);
  });

  // Light or dark: remembered on this device. Dark is the default.
  function setupTheme() {
    var btn = document.getElementById('themeToggle'); if (!btn) return;
    function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }
    function paint() {
      var light = isLight();
      btn.textContent = light ? (table ? table['Dark mode'] : 'Dark mode') : (table ? table['Light mode'] : 'Light mode');
      btn.setAttribute('aria-pressed', light ? 'true' : 'false');
    }
    btn.addEventListener('click', function () {
      var next = isLight() ? 'dark' : 'light';
      if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('slfa_theme', next); } catch (e) {}
      if (window.slfaTrack) window.slfaTrack('theme_' + next);
      paint();
    });
    paint();
  }

  function start() { setupPicker(); setupTheme(); run(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
