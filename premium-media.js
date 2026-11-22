/* Premium Media Centre: published galleries, highlights, interviews, reports and engagement. */
(function(){
  var db=window.slfaDb,box=document.getElementById('videoList'),nav=document.querySelector('[data-tab="videos"]');
  if(!db||!box||!nav)return;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safe(v){try{var u=new URL(v);return u.protocol==='https:'?u.href:'';}catch(e){return '';}}
  function embed(v){var u=safe(v);if(!u)return '';try{var x=new URL(u),id='';if(x.hostname==='youtu.be')id=x.pathname.slice(1);else if(/(^|\.)youtube\.com$/.test(x.hostname))id=x.searchParams.get('v')||((x.pathname.match(/\/embed\/([^/]+)/)||[])[1]);if(id)return 'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id);if(/(^|\.)vimeo\.com$/.test(x.hostname)){id=x.pathname.split('/').filter(Boolean).pop();if(/^\d+$/.test(id))return 'https://player.vimeo.com/video/'+id;}}catch(e){}return '';}
  var sessionKey='';
  try{sessionKey=localStorage.getItem('slfa_media_session')||'';if(!sessionKey){sessionKey=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now().toString(16)+'-'+Math.random().toString(16).slice(2)+'-'+Math.random().toString(16).slice(2));localStorage.setItem('slfa_media_session',sessionKey);}}catch(e){sessionKey=Date.now().toString(16)+'-'+Math.random().toString(16).slice(2)+'-'+Math.random().toString(16).slice(2);}
  function track(id,type){if(!db||!sessionKey)return;db.from('media_engagement').insert({media_post_id:id,event_type:type,session_key:sessionKey}).then(function(){});}
  function shareUrl(p){return location.href.split('#')[0]+'#media-'+encodeURIComponent(p.id);}
  function reportMarkup(p){
    var r=p.media_metadata&&p.media_metadata.report;if(!r)return '';
    if(typeof r==='string')return '<div class="pm-report">'+esc(r)+'</div>';
    var labels=[['summary','Match summary'],['key_moments','Key moments'],['lineups','Recorded team line-ups'],['player_of_the_match','Player of the match'],['manager_comments','Manager comments'],['analysis','Post-match analysis']];
    return '<div class="pm-report">'+labels.filter(function(x){return r[x[0]];}).map(function(x){return '<section><strong>'+x[1]+'</strong><p>'+esc(r[x[0]])+'</p></section>';}).join('')+'</div>';
  }
  function videoMarkup(p){
    var u=safe(p.video_url);if(!u)return '';
    if(/\.(mp4|webm|mov)(\?|$)/i.test(u))return '<video class="pm-video-file" controls playsinline preload="metadata" data-media-video="'+esc(p.id)+'"><source src="'+esc(u)+'"></video>';
    var em=embed(u);
    if(em)return '<div class="pm-video"><iframe src="'+esc(em)+'" title="'+esc(p.title)+'" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><a class="pm-watch" href="'+esc(u)+'" target="_blank" rel="noopener" data-video-click="'+esc(p.id)+'">Open video on source platform</a>';
    return '<a class="pm-watch" href="'+esc(u)+'" target="_blank" rel="noopener" data-video-click="'+esc(p.id)+'">Watch video</a>';
  }
  function card(p,type){
    var imgs=(Array.isArray(p.gallery_urls)?p.gallery_urls:[]).map(safe).filter(Boolean);if(p.image_url&&safe(p.image_url)&&imgs.indexOf(safe(p.image_url))<0)imgs.unshift(safe(p.image_url));
    var gallery=imgs.length?'<div class="pm-gallery">'+imgs.map(function(u){return '<a href="'+esc(u)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(u)+'" alt="'+esc(p.title)+' photograph"></a>';}).join('')+'</div>':'';
    var v=videoMarkup(p),match=p.match_details;
    var fixture=match?'<div class="pm-fixture">'+esc(match.home_team)+' '+(match.home_score==null?'v':' '+match.home_score+'–'+match.away_score+' ')+esc(match.away_team)+'<small>'+esc(p.competition_name||'Competition')+' · '+esc(match.match_date?new Date(match.match_date).toLocaleDateString():'')+(match.venue?' · '+esc(match.venue):'')+'</small></div>':'';
    var share='<div class="pm-share"><button type="button" data-share="'+esc(p.id)+'">Share</button><a target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(p.title+' '+shareUrl(p))+'" data-share="'+esc(p.id)+'">WhatsApp</a><a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl(p))+'" data-share="'+esc(p.id)+'">Facebook</a></div>';
    var body='<div class="pm-card-body"><span class="pm-tag">'+esc(type.replace('_',' '))+' · '+esc(p.published_at?new Date(p.published_at).toLocaleDateString():'')+'</span><h4>'+esc(p.title)+'</h4>'+fixture+(p.interviewee?'<p>Featuring '+esc(p.interviewee)+'</p>':'')+(p.body?'<p>'+esc(p.body)+'</p>':'')+reportMarkup(p)+(type==='VIDEO'||type==='INTERVIEW'?v:'')+share+'</div>';
    var visual=type==='VIDEO'||type==='INTERVIEW'?v:(gallery||(safe(p.image_url)?'<img loading="lazy" src="'+esc(safe(p.image_url))+'" alt="'+esc(p.title)+'">':''));
    return '<article class="pm-card" id="media-'+esc(p.id)+'" data-media-id="'+esc(p.id)+'">'+visual+body+'</article>';
  }
  function wireCards(rows){
    if('IntersectionObserver' in window){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){track(entry.target.dataset.mediaId,'IMPRESSION');observer.unobserve(entry.target);}});},{threshold:.25});rows.forEach(function(p){var el=document.getElementById('media-'+p.id);if(el)observer.observe(el);});}else rows.forEach(function(p){track(p.id,'IMPRESSION');});
    box.querySelectorAll('[data-media-video]').forEach(function(v){v.addEventListener('play',function(){track(v.dataset.mediaVideo,'VIDEO_PLAY');},{once:true});});
    box.querySelectorAll('[data-video-click]').forEach(function(a){a.addEventListener('click',function(){track(a.dataset.videoClick,'VIDEO_CLICK');});});
    box.querySelectorAll('[data-share]').forEach(function(b){b.addEventListener('click',function(){var id=b.dataset.share,p=rows.find(function(x){return String(x.id)===String(id);});if(!p)return;track(id,'SHARE');if(b.tagName==='A')return;var u=shareUrl(p);if(navigator.share){navigator.share({title:p.title,text:p.body||'SLFA Media Centre',url:u}).catch(function(){});}else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){b.textContent='Link copied';}).catch(function(){window.prompt('Copy this media link',u);});}else window.prompt('Copy this media link',u);});});
  }
  function load(){
    box.innerHTML='<div class="pm-centre"><div class="pm-empty">Loading approved media…</div></div>';
    db.from('media_posts').select('id,title,category,body,image_url,video_url,published_at,league_id,match_id,media_type,gallery_urls,interviewee,media_metadata').eq('status','PUBLISHED').order('published_at',{ascending:false}).limit(100).then(function(r){
      if(r.error){box.innerHTML='<div class="pm-centre"><div class="pm-empty">Media is temporarily unavailable. Please try again.</div></div>';return;}
      var rows=r.data||[],league='';try{league=localStorage.getItem('slfa_league')||'';}catch(e){}
      if(league)rows=rows.filter(function(p){return !p.league_id||String(p.league_id)===league;});
      var ids=rows.map(function(p){return p.match_id;}).filter(Boolean);
      var matchQuery=ids.length?db.from('matches').select('id,home_team,away_team,home_score,away_score,match_date,venue,league_id').in('id',ids):Promise.resolve({data:[]});
      Promise.all([matchQuery,db.from('leagues').select('id,name')]).then(function(all){
        var matches={},leagues={};(all[0].data||[]).forEach(function(m){matches[String(m.id)]=m;});(all[1].data||[]).forEach(function(l){leagues[String(l.id)]=l.name;});
        rows.forEach(function(p){p.match_details=matches[String(p.match_id)]||null;p.competition_name=leagues[String(p.league_id)]||'';});render(rows);
      });
    });
  }
  function render(rows){
    var groups={GALLERY:[],VIDEO:[],INTERVIEW:[],MATCH_REPORT:[]};
    rows.forEach(function(p){var t=p.media_type||(p.category==='PHOTO'?'GALLERY':p.category==='MATCH_REPORT'?'MATCH_REPORT':p.video_url?'VIDEO':'NEWS');if(groups[t])groups[t].push(p);});
    function section(title,key){return '<section class="pm-section"><h3>'+title+'</h3>'+(groups[key].length?'<div class="pm-grid">'+groups[key].map(function(p){return card(p,key);}).join('')+'</div>':'<div class="pm-empty">No '+title.toLowerCase()+' published yet.</div>')+'</section>';}
    box.innerHTML='<div class="pm-centre"><header class="pm-hero"><small>SLFA · OFFICIAL FOOTBALL MEDIA</small><h2>Premium Media Centre</h2><p>Matchday photography, video highlights, player and coach interviews, and professional match reports.</p></header>'+section('Match photo galleries','GALLERY')+section('Video highlights','VIDEO')+section('Interviews','INTERVIEW')+section('Professional match reports','MATCH_REPORT')+'</div>';
    wireCards(rows);
    if(location.hash&&location.hash.indexOf('#media-')===0){var target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(target)setTimeout(function(){target.scrollIntoView({behavior:'smooth',block:'start'});},180);}
  }
  window.slfaPremiumMediaLoad=load;
  nav.addEventListener('click',function(){window.setTimeout(load,120);});
  if(location.hash&&location.hash.indexOf('#media-')===0)nav.click();
  document.addEventListener('slfa:league-change',function(){if(!box.hidden)load();});
  window.addEventListener('online',function(){if(!box.hidden)load();});
})();
