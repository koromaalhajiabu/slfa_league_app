/* Premium Media Centre public renderer. Uses approved media_posts only. */
(function(){
  var db=window.slfaDb;
  var box=document.getElementById('videoList');
  var nav=document.querySelector('[data-tab="videos"]');
  if(!db||!box||!nav)return;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeUrl(v){try{var u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:'';}catch(e){return '';}}
  function embed(v){var u=safeUrl(v);if(!u)return '';try{var x=new URL(u),id='';if(x.hostname==='youtu.be')id=x.pathname.slice(1);else if(/youtube\.com$/.test(x.hostname)){id=x.searchParams.get('v')||((x.pathname.match(/\/embed\/([^/]+)/)||[])[1]);}if(id)return 'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id);if(/vimeo\.com$/.test(x.hostname)){id=x.pathname.split('/').filter(Boolean).pop();if(/^\d+$/.test(id))return 'https://player.vimeo.com/video/'+id;}}catch(e){}return '';}
  function mediaCard(p,type){
    var imgs=(Array.isArray(p.gallery_urls)?p.gallery_urls:[]).map(safeUrl).filter(Boolean);
    if(p.image_url&&safeUrl(p.image_url)&&imgs.indexOf(safeUrl(p.image_url))<0)imgs.unshift(safeUrl(p.image_url));
    var gallery=imgs.length?'<div class="pm-gallery">'+imgs.map(function(u){return '<a href="'+esc(u)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(u)+'" alt="'+esc(p.title)+'"></a>';}).join('')+'</div>':'';
    var emb=embed(p.video_url);
    var video=emb?'<div class="pm-video"><iframe src="'+esc(emb)+'" title="'+esc(p.title)+'" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>':(safeUrl(p.video_url)?'<a class="pm-watch" href="'+esc(safeUrl(p.video_url))+'" target="_blank" rel="noopener">Watch video</a>':'');
    var report=p.media_metadata&&p.media_metadata.report?'<div class="pm-report">'+esc(p.media_metadata.report)+'</div>':'';
    return '<article class="pm-card">'+(type==='VIDEO'||type==='INTERVIEW'?video:gallery||'<img loading="lazy" src="'+esc(safeUrl(p.image_url)||'')+'" alt="'+esc(p.title)+'">')+
      '<div class="pm-card-body"><span class="pm-tag">'+esc(type.replace('_',' '))+' · '+esc(p.published_at?new Date(p.published_at).toLocaleDateString():'')+'</span><h4>'+esc(p.title)+'</h4>'+
      (p.interviewee?'<p>Featuring '+esc(p.interviewee)+'</p>':'')+(p.body?'<p>'+esc(p.body)+'</p>':'')+report+(type==='VIDEO'||type==='INTERVIEW'?'':video)+'</div></article>';
  }
  function load(){
    box.innerHTML='<div class="pm-centre"><div class="pm-empty">Loading approved media…</div></div>';
    db.from('media_posts').select('id,title,category,body,image_url,video_url,published_at,league_id,match_id,media_type,gallery_urls,interviewee,media_metadata').eq('status','PUBLISHED').order('published_at',{ascending:false}).limit(80).then(function(r){
      if(r.error){
        return db.from('media_posts').select('id,title,category,body,image_url,video_url,published_at,league_id,match_id').eq('status','PUBLISHED').order('published_at',{ascending:false}).limit(80).then(function(old){
          if(old.error){box.innerHTML='<div class="pm-centre"><div class="pm-empty">Media is temporarily unavailable.</div></div>';return;}
          render(old.data||[]);
        });
      }
      render(r.data||[]);
    });
  }
  function render(rows){
    var chosen=localStorage.getItem('slfa_league')||'';
    if(chosen)rows=rows.filter(function(p){return !p.league_id||String(p.league_id)===chosen;});
    function typed(p){if(p.media_type)return p.media_type; if(p.category==='PHOTO')return 'GALLERY';if(p.category==='MATCH_REPORT')return 'MATCH_REPORT';return p.video_url?'VIDEO':'NEWS';}
    var groups={GALLERY:[],VIDEO:[],INTERVIEW:[],MATCH_REPORT:[]};
    rows.forEach(function(p){var t=typed(p);if(groups[t])groups[t].push(p);});
    function section(title,key){return '<section class="pm-section"><h3>'+title+'</h3>'+(groups[key].length?'<div class="pm-grid">'+groups[key].map(function(p){return mediaCard(p,key);}).join('')+'</div>':'<div class="pm-empty">No '+title.toLowerCase()+' published yet.</div>')+'</section>';}
    box.innerHTML='<div class="pm-centre"><header class="pm-hero"><small>SLFA · OFFICIAL FOOTBALL MEDIA</small><h2>Premium Media Centre</h2><p>Matchday photography, video highlights, player and coach interviews, and professional match reports.</p></header>'+
      section('Match photo galleries','GALLERY')+section('Video highlights','VIDEO')+section('Interviews','INTERVIEW')+section('Professional match reports','MATCH_REPORT')+'</div>';
  }
  nav.addEventListener('click',function(){window.setTimeout(load,120);});
  document.addEventListener('slfa:league-change',function(){if(!box.hidden)load();});
  window.addEventListener('online',function(){if(!box.hidden)load();});
})();
