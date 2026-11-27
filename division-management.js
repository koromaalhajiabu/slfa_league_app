/* Super Admin division tiers, promotion/relegation rules and club movement workflow. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var root = document.getElementById('divisionManagement');
  if (!db || !root) return;

  var leagues = [], seasons = [], clubs = [];
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function note(id, message) { var el=$(id); if(el) el.textContent=message||''; }
  function optionRows(rows, id, label) {
    return rows.map(function(x){return '<option value="'+esc(x[id])+'">'+esc(x[label])+'</option>';}).join('');
  }
  function loadBase() {
    return Promise.all([
      db.from('leagues').select('id,name,is_active').order('sort_order'),
      db.from('seasons').select('id,name,is_current').order('start_date',{ascending:false})
    ]).then(function(r){
      if(r[0].error) throw r[0].error;
      if(r[1].error) throw r[1].error;
      leagues=r[0].data||[]; seasons=r[1].data||[];
      var leagueOptions='<option value="">Choose competition…</option>'+optionRows(leagues,'id','name');
      var seasonOptions='<option value="">Choose season…</option>'+optionRows(seasons,'id','name');
      $('divLeague').innerHTML=leagueOptions;
      $('divSeason').innerHTML=seasonOptions;
      $('moveSeason').innerHTML=seasonOptions;
      $('moveFrom').innerHTML=leagueOptions;
      $('moveTo').innerHTML=leagueOptions;
      $('moveClub').innerHTML='<option value="">Choose source competition first…</option>';
      loadSettings();
      loadMovements();
    });
  }
  function loadSettings() {
    var leagueId=$('divLeague').value, seasonId=$('divSeason').value;
    if(!leagueId||!seasonId){note('divisionStatus','Choose a competition and season to view its division settings.');return;}
    db.from('league_division_settings').select('*').eq('league_id',Number(leagueId)).eq('season_id',Number(seasonId)).maybeSingle().then(function(r){
      if(r.error){note('divisionStatus','Could not load division settings: '+r.error.message);return;}
      var x=r.data||{};
      $('divTier').value=x.tier_code||'PREMIER';
      $('divRank').value=x.tier_rank||1;
      $('divGroup').value=x.pyramid_group||'MEN';
      $('divPromote').value=x.promotion_spots==null?0:x.promotion_spots;
      $('divRelegate').value=x.relegation_spots==null?0:x.relegation_spots;
      $('divPlayoff').value=x.playoff_spots==null?0:x.playoff_spots;
      $('divPromotePlayoff').checked=!!x.promotion_playoff;
      $('divRelegatePlayoff').checked=!!x.relegation_playoff;
      $('divNotes').value=x.notes||'';
      note('divisionStatus',r.data?'Division settings loaded.':'No division settings saved for this competition and season yet.');
    });
  }
  function loadClubs() {
    var leagueId=$('moveFrom').value;
    $('moveClub').innerHTML='<option value="">Loading clubs…</option>';
    if(!leagueId){$('moveClub').innerHTML='<option value="">Choose source competition first…</option>';return;}
    db.from('league_clubs').select('id,club_name').eq('league_id',Number(leagueId)).eq('is_active',true).order('club_name').then(function(r){
      if(r.error){note('movementStatus','Could not load clubs: '+r.error.message);return;}
      clubs=r.data||[];
      $('moveClub').innerHTML='<option value="">Choose club…</option>'+clubs.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.club_name)+'</option>';}).join('');
    });
  }
  function applyMovement(id, button) {
    if(button) button.disabled=true;
    db.rpc('admin_apply_league_movement',{p_movement_id:Number(id)}).then(function(r){
      if(r.error) throw r.error;
      note('movementStatus','Approved club movement applied successfully. Historical match records remain attached to their original competition.');
      loadClubs();loadMovements();
    }).catch(function(e){
      if(button) button.disabled=false;
      note('movementStatus','Movement was not applied: '+(e.message||'Unknown error.'));
    });
  }
  function loadMovements() {
    Promise.all([
      db.from('league_movement_records').select('id,season_id,club_id,from_league_id,to_league_id,movement_type,decision_status,reason,created_at').order('created_at',{ascending:false}).limit(30),
      db.from('league_clubs').select('id,club_name')
    ]).then(function(all){
      if(all[0].error){note('movementStatus','Movement history could not be loaded: '+all[0].error.message);return;}
      var rows=all[0].data||[], clubRows=all[1].data||[];
      var leagueName=function(id){var l=leagues.find(function(x){return String(x.id)===String(id);});return l?l.name:'Competition '+id;};
      var clubName=function(id){var c=clubRows.find(function(x){return String(x.id)===String(id);});return c?c.club_name:'Club '+id;};
      $('movementList').innerHTML=rows.length?'<div class="scroll"><table class="table"><thead><tr><th>Club</th><th>Movement</th><th>From</th><th>To</th><th>Status</th><th>Reason</th><th>Action</th></tr></thead><tbody>'+rows.map(function(x){
        return '<tr><td>'+esc(clubName(x.club_id))+'</td><td>'+esc(x.movement_type)+'</td><td>'+esc(leagueName(x.from_league_id))+'</td><td>'+esc(leagueName(x.to_league_id))+'</td><td>'+esc(x.decision_status)+'</td><td>'+esc(x.reason)+'</td><td>'+(x.decision_status==='APPROVED'?'<button type="button" class="secondary" data-apply-movement="'+esc(x.id)+'">Apply</button>':'—')+'</td></tr>';
      }).join('')+'</tbody></table></div>':'<p>No club movements recorded for this system yet.</p>';
      $('movementList').querySelectorAll('[data-apply-movement]').forEach(function(button){
        button.addEventListener('click',function(){applyMovement(button.getAttribute('data-apply-movement'),button);});
      });
    });
  }
  function createEmptyCompetitionTemplates() {
    var button=$('createCompetitionTemplates');
    if(!button) return;
    button.addEventListener('click',function(){
      var season=seasons.find(function(x){return x.is_current;})||seasons[0];
      if(!season){note('competitionTemplateStatus','Create a season first. No templates were added.');return;}
      var templates=[
        {name:"Men's Division One",type:'LEAGUE',gender:'MEN',sort:10,tier:'DIVISION_1',rank:2,group:'MEN'},
        {name:"Men's Division Two",type:'LEAGUE',gender:'MEN',sort:11,tier:'DIVISION_2',rank:3,group:'MEN'},
        {name:"Men's Division Three",type:'LEAGUE',gender:'MEN',sort:12,tier:'DIVISION_3',rank:4,group:'MEN'},
        {name:"Women's Division One",type:'LEAGUE',gender:'WOMEN',sort:20,tier:'DIVISION_1',rank:2,group:'WOMEN'},
        {name:"Women's Division Two",type:'LEAGUE',gender:'WOMEN',sort:21,tier:'DIVISION_2',rank:3,group:'WOMEN'},
        {name:'Regional League',type:'LEAGUE',gender:'OPEN',sort:30,tier:'REGIONAL',rank:1,group:'REGIONAL'},
        {name:'District League',type:'LEAGUE',gender:'OPEN',sort:31,tier:'REGIONAL',rank:2,group:'REGIONAL'},
        {name:'National Youth League U17',type:'YOUTH',gender:'OPEN',sort:40,tier:'YOUTH',rank:1,group:'YOUTH'},
        {name:'National Youth League U20',type:'YOUTH',gender:'OPEN',sort:41,tier:'YOUTH',rank:2,group:'YOUTH'}
      ];
      button.disabled=true;
      note('competitionTemplateStatus','Creating unpublished competition shells and linking their empty tier settings…');
      templates.reduce(function(chain,t){
        return chain.then(function(){
          var existing=leagues.find(function(l){return String(l.name).toLowerCase()===t.name.toLowerCase();});
          var idPromise=existing?Promise.resolve(existing.id):db.rpc('admin_upsert_competition',{
            p_id:null,p_name:t.name,p_type:t.type,p_gender:t.gender,
            p_description:null,p_logo_url:null,p_sort_order:t.sort,p_is_active:false,
            p_season_id:null,p_start_date:null,p_end_date:null,p_venue:null,p_format_details:null
          }).then(function(r){if(r.error)throw r.error;return r.data;});
          return idPromise.then(function(id){
            return db.from('league_division_settings').upsert({
              league_id:Number(id),season_id:Number(season.id),tier_code:t.tier,tier_rank:t.rank,
              pyramid_group:t.group,promotion_spots:0,relegation_spots:0,playoff_spots:0,
              promotion_playoff:false,relegation_playoff:false,movement_policy:'MANUAL_APPROVAL',
              notes:'Empty setup template. League administrators must enter and obtain approval for official clubs, format, dates, venues and promotion/relegation rules.',
              updated_at:new Date().toISOString()
            },{onConflict:'league_id,season_id'});
          }).then(function(r){if(r.error)throw r.error;});
        });
      },Promise.resolve()).then(function(){
        note('competitionTemplateStatus','Empty competition templates are ready. They remain unpublished and have no clubs, fixtures, scores or promotion/relegation places. Administrators can now complete each profile and publish only after approval.');
        return loadBase();
      }).catch(function(e){
        note('competitionTemplateStatus','Template setup stopped safely: '+(e.message||'Unknown error')+'. Refresh the list and retry; existing records are not duplicated.');
      }).then(function(){button.disabled=false;});
    });
  }
  $('divLeague').addEventListener('change',loadSettings);
  $('divSeason').addEventListener('change',loadSettings);
  $('moveFrom').addEventListener('change',loadClubs);
  $('divSave').addEventListener('click',function(){
    var leagueId=Number($('divLeague').value),seasonId=Number($('divSeason').value);
    var rank=Number($('divRank').value),promote=Number($('divPromote').value),relegate=Number($('divRelegate').value),playoff=Number($('divPlayoff').value);
    if(!leagueId||!seasonId){note('divisionStatus','Choose both a competition and a season.');return;}
    if(!Number.isInteger(rank)||rank<1||rank>20){note('divisionStatus','Tier rank must be a whole number from 1 to 20.');return;}
    if([promote,relegate,playoff].some(function(n){return !Number.isInteger(n)||n<0||n>30;})){note('divisionStatus','Movement places must be whole numbers from 0 to 30.');return;}
    $('divSave').disabled=true;
    db.from('league_division_settings').upsert({
      league_id:leagueId,season_id:seasonId,tier_code:$('divTier').value,tier_rank:rank,
      pyramid_group:$('divGroup').value,promotion_spots:promote,relegation_spots:relegate,
      playoff_spots:playoff,promotion_playoff:$('divPromotePlayoff').checked,
      relegation_playoff:$('divRelegatePlayoff').checked,notes:$('divNotes').value.trim()||null,
      updated_at:new Date().toISOString()
    },{onConflict:'league_id,season_id'}).then(function(r){
      $('divSave').disabled=false;
      note('divisionStatus',r.error?'Could not save division settings: '+r.error.message:'Division and movement rules saved.');
    }).catch(function(e){$('divSave').disabled=false;note('divisionStatus',e.message||'Save failed.');});
  });
  $('movementSave').addEventListener('click',function(){
    var seasonId=Number($('moveSeason').value),clubId=$('moveClub').value;
    var fromId=Number($('moveFrom').value),toId=Number($('moveTo').value),reason=$('moveReason').value.trim();
    if(!seasonId||!clubId||!fromId||!toId){note('movementStatus','Choose the season, club, source and destination competitions.');return;}
    if(fromId===toId){note('movementStatus','Source and destination competitions must be different.');return;}
    if(reason.length<5){note('movementStatus','Enter the official decision reason (at least 5 characters).');return;}
    $('movementSave').disabled=true;
    db.from('league_movement_records').insert({
      season_id:seasonId,club_id:clubId,from_league_id:fromId,to_league_id:toId,
      movement_type:$('moveType').value,decision_status:'APPROVED',reason:reason
    }).select('id').single().then(function(r){
      if(r.error) throw r.error;
      return db.rpc('admin_apply_league_movement',{p_movement_id:r.data.id});
    }).then(function(r){
      $('movementSave').disabled=false;
      if(r.error){note('movementStatus','Decision recorded as approved but not applied: '+r.error.message+' You can review the record before retrying.');loadMovements();return;}
      note('Club movement applied. Its club profile now belongs to the destination competition; previous match records remain attached to their original competition.');
      $('moveReason').value='';loadClubs();loadMovements();
    }).catch(function(e){$('movementSave').disabled=false;note('movementStatus','Movement could not be completed: '+(e.message||'Unknown error.'));loadMovements();});
  });
  createEmptyCompetitionTemplates();
  loadBase().catch(function(e){note('divisionStatus','Division management could not load: '+(e.message||'Database unavailable.'));});
})();
