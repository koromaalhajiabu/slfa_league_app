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
      'Loading matches…': 'Chargement des matchs…',
      'Admin': 'Admin',
      'All': 'Tous',
      'All active competitions': 'Toutes les compétitions actives',
      'All competitions': 'Toutes les compétitions',
      'All leagues': 'Toutes les ligues',
      'CLUB': 'CLUB',
      'COMPETITION DIRECTORY': 'RÉPERTOIRE DES COMPÉTITIONS',
      'Choose league': 'Choisir la ligue',
      'Close player profile': 'Fermer le profil du joueur',
      'Club': 'Club',
      'Clubs': 'Clubs',
      'Competition information is displayed from records published in the SLFA League App.': 'Les informations sur les compétitions proviennent des données publiées dans l’application de la Ligue SLFA.',
      'Completed matches': 'Matchs terminés',
      'Current suspensions': 'Suspensions en cours',
      'Date': 'Date',
      'Email': 'E-mail',
      'Explore competitions, clubs, standings and match information.': 'Découvrez les compétitions, les clubs, le classement et les informations sur les matchs.',
      'FOOTBALL AT A GLANCE': 'LE FOOTBALL EN UN COUP D’ŒIL',
      'Featured match': 'Match à la une',
      'Find registered first-team players across the participating clubs.': 'Trouvez les joueurs de première équipe inscrits dans les clubs participants.',
      'Fixtures, live scores and completed results': 'Matchs à venir, scores en direct et résultats',
      'Follow the league leaders across goals, assists, clean sheets and match awards.': 'Suivez les meilleurs buteurs, passeurs, gardiens et joueurs récompensés.',
      'Football at a glance': 'Le football en un coup d’œil',
      'Forgot password?': 'Mot de passe oublié ?',
      'League Pages': 'Pages des ligues',
      'League information': 'Informations sur la ligue',
      'League sections': 'Sections de la ligue',
      'Loading assist statistics…': 'Chargement des statistiques de passes décisives…',
      'Loading goal statistics…': 'Chargement des statistiques de buts…',
      'Loading goalkeeper statistics…': 'Chargement des statistiques des gardiens…',
      'Loading leaders…': 'Chargement des meilleurs…',
      'Loading match awards…': 'Chargement des récompenses de match…',
      'Loading news and announcements…': 'Chargement des actualités et annonces…',
      'Loading suspensions…': 'Chargement des suspensions…',
      'Loading the table…': 'Chargement du classement…',
      'Loading videos…': 'Chargement des vidéos…',
      'Match Centre': 'Centre des matchs',
      'Match day': 'Jour de match',
      'Match filters': 'Filtres des matchs',
      'News & Announcements': 'Actualités et annonces',
      'No match has been published for this competition yet.': 'Aucun match n’a encore été publié pour cette compétition.',
      'No matches found': 'Aucun match trouvé',
      'No players match your search': 'Aucun joueur ne correspond à votre recherche',
      'No public competitions are currently listed.': 'Aucune compétition publique n’est répertoriée pour le moment.',
      'Official league updates, match reports, press releases and competition announcements.': 'Mises à jour officielles de la ligue, comptes rendus de match, communiqués et annonces de compétitions.',
      'Other': 'Autres',
      'POSITION': 'POSITION',
      'Password': 'Mot de passe',
      'Player Directory': 'Répertoire des joueurs',
      'Player Statistics Centre': 'Centre des statistiques des joueurs',
      'Privacy and terms': 'Confidentialité et conditions',
      'Pts': 'Pts',
      'Refresh match information': 'Actualiser les informations des matchs',
      'Reset': 'Réinitialiser',
      'SEARCH PLAYERS': 'RECHERCHER DES JOUEURS',
      'SIERRA LEONE FOOTBALL ASSOCIATION': 'FÉDÉRATION SIERRA-LÉONAISE DE FOOTBALL',
      'Scores and match details reflect information currently published in the app.': 'Les scores et détails des matchs reflètent les informations actuellement publiées dans l’application.',
      'Search headlines and stories…': 'Rechercher des titres et des articles…',
      'Search player or club…': 'Rechercher un joueur ou un club…',
      'Searchable player directory': 'Répertoire des joueurs consultable',
      'Staff sign-in': 'Connexion du personnel',
      'Statistics are displayed from published league records. Rankings may change as verified match information is updated.': 'Les statistiques proviennent des données publiées de la ligue. Le classement peut changer lorsque les informations vérifiées des matchs sont mises à jour.',
      'THE LATEST FROM SIERRA LEONE FOOTBALL': 'DERNIÈRES NOUVELLES DU FOOTBALL SIERRA-LÉONAIS',
      'THE PLAYERS BEHIND THE GAME': 'LES JOUEURS DERRIÈRE LE JEU',
      'THE SLFA LEAGUE APP': 'L’APPLICATION DE LA LIGUE SLFA',
      'Teams will appear here once they are added.': 'Les équipes apparaîtront ici une fois ajoutées.',
      'Try another date, club or match filter.': 'Essayez une autre date, un autre club ou un autre filtre de match.',
      'Try another name, club or position, or reset the filters.': 'Essayez un autre nom, club ou poste, ou réinitialisez les filtres.',
      'Upcoming fixtures': 'Matchs à venir',
      '↻ Refresh': '↻ Actualiser',
      'Today’s matches': 'Matchs du jour',
      'No matches today. Next up': 'Aucun match aujourd’hui. Prochains matchs',
      'Not started': 'Pas encore commencé',
      'Live now': 'En direct',
      'Venue to be confirmed': 'Lieu à confirmer',
      'players found': 'joueurs trouvés',
      'Selected competition': 'Compétition sélectionnée'
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
      'Loading matches…': 'De lod di mach dɛn…',
      'Admin': 'Admin',
      'All': 'Ɔl',
      'All active competitions': 'Ɔl di kɔmpitishɔn dɛn we de wok',
      'All competitions': 'Ɔl di kɔmpitishɔn',
      'All leagues': 'Ɔl di lig dɛn',
      'CLUB': 'KLOB',
      'COMPETITION DIRECTORY': 'LIST WETIN DI KƆMPITISHƆN DƐN',
      'Choose league': 'Pik lig',
      'Close player profile': 'Klos di prɔfayl bɔt di pleya',
      'Club': 'Klob',
      'Clubs': 'Klob dɛn',
      'Competition information is displayed from records published in the SLFA League App.': 'Infomeshɔn bɔt di kɔmpitishɔn dɛn de sho we dɛn publish na di SLFA League App.',
      'Completed matches': 'Mach dɛn we don',
      'Current suspensions': 'Pleya dɛn we dɔn ban nɔw',
      'Date': 'Dɛt',
      'Email': 'Imel',
      'Explore competitions, clubs, standings and match information.': 'Luk di kɔmpitishɔn, klob, tebul ɛn infomeshɔn bɔt di mach dɛn.',
      'FOOTBALL AT A GLANCE': 'FUTBOL WE YU FƆ SƐE FAST',
      'Featured match': 'Mach we dɛn pik',
      'Find registered first-team players across the participating clubs.': 'Faynd di rijista fɔs tim pleya dɛn we de na di klob dɛn.',
      'Fixtures, live scores and completed results': 'Mach dɛn we de kam, skɔ we de go lɛ ɛn di rizɔlt dɛn',
      'Follow the league leaders across goals, assists, clean sheets and match awards.': 'Fala di tɔp pleya dɛn na gɔl, asist, klin shit ɛn di jɔb dɛn.',
      'Football at a glance': 'Futbol we yu fɔ si sɛf fast',
      'Forgot password?': 'Yu fɔgɛt yu paswɔd?',
      'League Pages': 'Pej dɛn bɔt di lig',
      'League information': 'Infomeshɔn bɔt di lig',
      'League sections': 'Pat dɛn bɔt di lig',
      'Loading assist statistics…': 'De lod di asist statistik…',
      'Loading goal statistics…': 'De lod di gɔl statistik…',
      'Loading goalkeeper statistics…': 'De lod di gɔlkipa statistik…',
      'Loading leaders…': 'De lod di tɔp pleya dɛn…',
      'Loading match awards…': 'De lod di jɔb dɛn…',
      'Loading news and announcements…': 'De lod nyuz ɛn anawsmɛnt dɛn…',
      'Loading suspensions…': 'De lod di ban dɛn…',
      'Loading the table…': 'De lod di tebul…',
      'Loading videos…': 'De lod di vidio dɛn…',
      'Match Centre': 'Mach Sɛntə',
      'Match day': 'Dei we mach de',
      'Match filters': 'Fɔlta dɛn fɔ mach',
      'News & Announcements': 'Nyuz ɛn anawsmɛnt dɛn',
      'No match has been published for this competition yet.': 'Dɛn nɔ publish mach fɔ dis kɔmpitishɔn yet.',
      'No matches found': 'Dɛn nɔ fɛn ɛni mach',
      'No players match your search': 'Nɔbɔdi pleya nɔ fit yu sɛt',
      'No public competitions are currently listed.': 'Nɔ get ɛni pɔblik kɔmpitishɔn we dɛn list nɔw.',
      'Official league updates, match reports, press releases and competition announcements.': 'Ɔfishal apdet bɔt di lig, ripɔt bɔt di mach dɛn, prɛs rilis ɛn anawsmɛnt bɔt di kɔmpitishɔn dɛn.',
      'Other': 'Ɔda wan dɛn',
      'POSITION': 'PɔZIshɔn',
      'Password': 'Paswɔd',
      'Player Directory': 'List bɔt di pleya dɛn',
      'Player Statistics Centre': 'Sɛntə fɔ pleya statistik',
      'Privacy and terms': 'Prɛvɛsi ɛn tɛmz',
      'Pts': 'Pɔynt',
      'Refresh match information': 'Frɛsh di mach infomeshɔn',
      'Reset': 'Rist',
      'SEARCH PLAYERS': 'SɛtS PLEYA DƐN',
      'SIERRA LEONE FOOTBALL ASSOCIATION': 'SIERRA LEONE FUTBOL ASOSIESHƆN',
      'Scores and match details reflect information currently published in the app.': 'Skɔ ɛn di detel dɛn bɔt di mach de sho infomeshɔn we dɛn publish na di app nɔw.',
      'Search headlines and stories…': 'Sɛtʃ ɛni nyuz ɛn stori dɛn…',
      'Search player or club…': 'Sɛtʃ pleya ɔ klob…',
      'Searchable player directory': 'List bɔt di pleya dɛn we yu go fɛn',
      'Staff sign-in': 'Staff sign-in',
      'Statistics are displayed from published league records. Rankings may change as verified match information is updated.': 'Statistik de sho frɔm di publish rikɔd bɔt di lig. Di ranki fit chenj we dɛn apdet di mach infomeshɔn we dɛn chɛk.',
      'THE LATEST FROM SIERRA LEONE FOOTBALL': 'DI LATEST NYUZ FROM SIERRA LEONE FUTBOL',
      'THE PLAYERS BEHIND THE GAME': 'DI PLEYA DƐN WEY DE BEHIND DI GEM',
      'THE SLFA LEAGUE APP': 'DI SLFA LIG APP',
      'Teams will appear here once they are added.': 'Tim dɛn go sho ɛia we dɛn ad dɛn.',
      'Try another date, club or match filter.': 'Tray ɔda dɛt, klob ɔ mach fɔlta.',
      'Try another name, club or position, or reset the filters.': 'Tray ɔda nem, klob ɔ pozishɔn, ɔ rist di fɔlta dɛn.',
      'Upcoming fixtures': 'Mach dɛn we de kam',
      '↻ Refresh': '↻ Frɛsh',
      'Today’s matches': 'Mach dɛn fɔ tide',
      'No matches today. Next up': 'Nɔ get mach tide. Di nɛks wan dɛn',
      'Not started': 'Nɔ bin start',
      'Live now': 'Di mach de go nɔw',
      'Venue to be confirmed': 'Di ples nɔ dɛn tɔk yet',
      'players found': 'pleya dɛn we dɛn fɛn',
      'Selected competition': 'Di kɔmpitishɔn we yu pik'
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
      'Loading matches…': 'جارٍ تحميل المباريات…',
      'Admin': 'الإدارة',
      'All': 'الكل',
      'All active competitions': 'جميع المسابقات النشطة',
      'All competitions': 'جميع المسابقات',
      'All leagues': 'جميع الدوريات',
      'CLUB': 'النادي',
      'COMPETITION DIRECTORY': 'دليل المسابقات',
      'Choose league': 'اختر الدوري',
      'Close player profile': 'إغلاق ملف اللاعب',
      'Club': 'النادي',
      'Clubs': 'الأندية',
      'Competition information is displayed from records published in the SLFA League App.': 'تُعرض معلومات المسابقات من السجلات المنشورة في تطبيق دوري SLFA.',
      'Completed matches': 'المباريات المنتهية',
      'Current suspensions': 'الإيقافات الحالية',
      'Date': 'التاريخ',
      'Email': 'البريد الإلكتروني',
      'Explore competitions, clubs, standings and match information.': 'استكشف المسابقات والأندية وجدول الترتيب ومعلومات المباريات.',
      'FOOTBALL AT A GLANCE': 'كرة القدم في لمحة',
      'Featured match': 'المباراة المميزة',
      'Find registered first-team players across the participating clubs.': 'ابحث عن لاعبي الفريق الأول المسجلين في الأندية المشاركة.',
      'Fixtures, live scores and completed results': 'المباريات القادمة والنتائج المباشرة والنتائج المنتهية',
      'Follow the league leaders across goals, assists, clean sheets and match awards.': 'تابع المتصدرين في الأهداف والتمريرات الحاسمة والشباك النظيفة وجوائز المباريات.',
      'Football at a glance': 'كرة القدم في لمحة',
      'Forgot password?': 'نسيت كلمة المرور؟',
      'League Pages': 'صفحات الدوريات',
      'League information': 'معلومات الدوري',
      'League sections': 'أقسام الدوري',
      'Loading assist statistics…': 'جارٍ تحميل إحصاءات التمريرات الحاسمة…',
      'Loading goal statistics…': 'جارٍ تحميل إحصاءات الأهداف…',
      'Loading goalkeeper statistics…': 'جارٍ تحميل إحصاءات حراس المرمى…',
      'Loading leaders…': 'جارٍ تحميل المتصدرين…',
      'Loading match awards…': 'جارٍ تحميل جوائز المباريات…',
      'Loading news and announcements…': 'جارٍ تحميل الأخبار والإعلانات…',
      'Loading suspensions…': 'جارٍ تحميل الإيقافات…',
      'Loading the table…': 'جارٍ تحميل جدول الترتيب…',
      'Loading videos…': 'جارٍ تحميل الفيديوهات…',
      'Match Centre': 'مركز المباريات',
      'Match day': 'يوم المباراة',
      'Match filters': 'مرشحات المباريات',
      'News & Announcements': 'الأخبار والإعلانات',
      'No match has been published for this competition yet.': 'لم يُنشر أي مباراة لهذه المسابقة بعد.',
      'No matches found': 'لم يتم العثور على مباريات',
      'No players match your search': 'لا يوجد لاعبون يطابقون بحثك',
      'No public competitions are currently listed.': 'لا توجد مسابقات عامة مدرجة حاليًا.',
      'Official league updates, match reports, press releases and competition announcements.': 'التحديثات الرسمية للدوري وتقارير المباريات والبيانات الصحفية وإعلانات المسابقات.',
      'Other': 'أخرى',
      'POSITION': 'المركز',
      'Password': 'كلمة المرور',
      'Player Directory': 'دليل اللاعبين',
      'Player Statistics Centre': 'مركز إحصاءات اللاعبين',
      'Privacy and terms': 'الخصوصية والشروط',
      'Pts': 'النقاط',
      'Refresh match information': 'تحديث معلومات المباريات',
      'Reset': 'إعادة ضبط',
      'SEARCH PLAYERS': 'ابحث عن لاعبين',
      'SIERRA LEONE FOOTBALL ASSOCIATION': 'اتحاد كرة القدم في سيراليون',
      'Scores and match details reflect information currently published in the app.': 'تعكس النتائج وتفاصيل المباريات المعلومات المنشورة حاليًا في التطبيق.',
      'Search headlines and stories…': 'ابحث في العناوين والقصص…',
      'Search player or club…': 'ابحث عن لاعب أو نادٍ…',
      'Searchable player directory': 'دليل اللاعبين القابل للبحث',
      'Staff sign-in': 'تسجيل دخول الموظفين',
      'Statistics are displayed from published league records. Rankings may change as verified match information is updated.': 'تُعرض الإحصاءات من سجلات الدوري المنشورة. قد تتغير الترتيبات عند تحديث معلومات المباريات الموثّقة.',
      'THE LATEST FROM SIERRA LEONE FOOTBALL': 'آخر الأخبار من كرة القدم في سيراليون',
      'THE PLAYERS BEHIND THE GAME': 'اللاعبون وراء اللعبة',
      'THE SLFA LEAGUE APP': 'تطبيق دوري SLFA',
      'Teams will appear here once they are added.': 'ستظهر الفرق هنا بعد إضافتها.',
      'Try another date, club or match filter.': 'جرّب تاريخًا أو نادياً أو فلتراً آخر للمباريات.',
      'Try another name, club or position, or reset the filters.': 'جرّب اسماً أو نادياً أو مركزاً آخر، أو أعد ضبط المرشحات.',
      'Upcoming fixtures': 'المباريات القادمة',
      '↻ Refresh': '↻ تحديث',
      'Today’s matches': 'مباريات اليوم',
      'No matches today. Next up': 'لا توجد مباريات اليوم. القادمة',
      'Not started': 'لم تبدأ بعد',
      'Live now': 'مباشر الآن',
      'Venue to be confirmed': 'الملعب لم يُحدد بعد',
      'players found': 'لاعبًا',
      'Selected competition': 'المسابقة المختارة'
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
