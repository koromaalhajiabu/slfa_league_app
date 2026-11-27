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
  function loadMovements() {
    db.from('league_movement_records').select('id,season_id,club_id,from_league_id,to_league_id,movement_type,decision_status,reason,created_at').order('created_at',{ascending:false}).limit(30).then(function(r){
      if(r.error){note('movementStatus','Movement history could not be loaded: '+r.error.message);return;}
      var rows=r.data||[];
      var leagueName=function(id){var l=leagues.find(function(x){return String(x.id)===String(id);});return l?l.name:'Competition '+id;};
      var clubName=function(id){var c=clubs.find(function(x){return String(x.id)===String(id);});return c?c.club_name:'Club '+id;};
      $('movementList').innerHTML=rows.length?'<div class="scroll"><table class="table"><thead><tr><th>Club</th><th>Movement</th><th>From</th><th>To</th><th>Status</th><th>Reason</th></tr></thead><tbody>'+rows.map(function(x){
        return '<tr><td>'+esc(clubName(x.club_id))+'</td><td>'+esc(x.movement_type)+'</td><td>'+esc(leagueName(x.from_league_id))+'</td><td>'+esc(leagueName(x.to_league_id))+'</td><td>'+esc(x.decision_status)+'</td><td>'+esc(x.reason)+'</td></tr>';
      }).join('')+'</tbody></table></div>':'<p>No club movements recorded for this system yet.</p>';
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
  loadBase().catch(function(e){note('divisionStatus','Division management could not load: '+(e.message||'Database unavailable.'));});
})();
