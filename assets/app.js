/* KunGang 2026 | Local interactive squad catalogue, no external libraries. */
(() => {
  'use strict';
  const source = window.KG_DATA || {};
  const records = source.records || [];
  const teams = source.teams || [];
  const roman = source.roman || {};
  if (!records.length || !teams.length) return;
  const byId = new Map(records.map(p => [Number(p.id),p]));
  const centers = [...new Set(teams.map(t=>t.center))];
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '不详').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = (n,z=2) => String(n).padStart(z,'0');
  const silhouettes = `<svg class="silhouette" viewBox="0 0 40 66" aria-hidden="true"><circle cx="20" cy="10.5" r="6.8"/><path d="M13.8 25c2.1-2.3 10.9-2.3 13 0 2.6 2.8 3.4 11 6.2 19l-4.2 1.3-3.6-10.7.4 12 2.1 13.3-6 1.5-2.3-11.5-2.7 11.5-6.2-1.3 2-13.8.7-11.2-3.7 10.4-4.1-1.7c2.2-9 5.1-17.7 8.4-18.5Z"/></svg>`;
  const teamEnglish={
    '执行委':'EXECUTIVE SQUAD','党支部':'PARTY BRANCH','团支部':'YOUTH BRANCH','办公室':'OFFICE SQUAD',
    '孵化部':'INCUBATION SQUAD','项目部':'PROJECT SQUAD','采编部':'EDITORIAL SQUAD',
    '设计部':'DESIGN SQUAD','联络部':'LIAISON SQUAD','宣讲部':'OUTREACH SQUAD'
  };
  let teamIndex=0;
  let page=0;
  let view='team';
  let personId=null;
  let searchText='';
  let centerFilter='全部';
  let savedFocus=null;
  let gesture=null;
  let playChange;
  let posterMode='members';
  let posterLoadToken=0;
  let posterRenderedSrc='';
  let groupRenderedSrc='';
  let transitionToken=0;
  let transitionHoldTimer=0;
  let transitionHideTimer=0;
  let lastTeamPageKey='';

  function leadScore(role=''){
    let score=0;
    if(/主任|书记|负责人/.test(role)) score=Math.max(score,100);
    if(/副主任|副书记/.test(role)) score=Math.max(score,88);
    if(/部长|总监/.test(role)) score=Math.max(score,76);
    if(/副部长|副总监/.test(role)) score=Math.max(score,68);
    if(/组长|队长/.test(role)) score=Math.max(score,60);
    if(/干事/.test(role)) score=Math.max(score,20);
    return score;
  }
  function cSlotIndex(placements){
    let best=0,bestScore=Infinity;
    placements.forEach((v,i)=>{
      const score=Math.abs((v.x??50)-50)*2 - (v.z??0)*3 + Math.abs(v.a??0)*.4 + Math.abs((v.y??20)-16);
      if(score<bestScore){best=i;bestScore=score;}
    });
    return best;
  }
  function arrangeForCenter(people, placements){
    if(people.length<=1)return people;
    let leaderIndex=-1,leaderScoreValue=0;
    people.forEach((p,i)=>{
      const s=leadScore(p.role||'');
      if(s>leaderScoreValue){leaderScoreValue=s;leaderIndex=i;}
    });
    if(leaderIndex<0||leaderScoreValue===0)return people;
    const centerIndex=cSlotIndex(placements);
    if(leaderIndex===centerIndex)return people;
    const ordered=people.slice();
    const [lead]=ordered.splice(leaderIndex,1);
    ordered.splice(centerIndex,0,lead);
    return ordered;
  }
  let ambientFxState=null;

  function ensureAmbientFx(){
    const ambient=document.querySelector('.ambient');
    if(!ambient||ambient.querySelector('.ambient-tech-layer'))return;
    const layer=document.createElement('div');
    layer.className='ambient-tech-layer';
    const field=document.createElement('div');
    field.className='diamond-field';
    const placements=[
      [7,14,28,0,16],[18,62,42,-6,18],[24,30,18,5,15],[31,78,54,-3,22],[39,12,36,8,20],[46,54,22,-5,17],
      [55,84,26,7,19],[63,36,46,-9,23],[71,18,22,3,16],[79,68,34,-7,21],[86,49,24,4,18],[90,88,32,-4,20]
    ];
    placements.forEach((item,index)=>{
      const el=document.createElement('span');
      el.className='ambient-diamond';
      el.style.setProperty('--left',item[0]+'%');
      el.style.setProperty('--top',item[1]+'%');
      el.style.setProperty('--size',item[2]+'px');
      el.style.setProperty('--tilt',item[3]+'deg');
      el.style.setProperty('--floatDur',(item[4]+(index%3)*2)+'s');
      el.style.setProperty('--delay',(-index*.9)+'s');
      el.style.setProperty('--drift',((index%2?1:-1)*(8+index%4*2))+'px');
      field.appendChild(el);
    });
    const canvas=document.createElement('canvas');
    canvas.className='ambient-canvas';
    canvas.setAttribute('aria-hidden','true');
    layer.append(field,canvas);
    ambient.appendChild(layer);
    initAmbientCanvas(canvas);
  }

  function initAmbientCanvas(canvas){
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
    const state={canvas,ctx,particles:[],w:0,h:0,dpr:1,raf:0};
    ambientFxState=state;

    function respawn(p,scatter=false){
      p.x=scatter?Math.random()*state.w:(Math.random()*state.w);
      p.y=scatter?Math.random()*state.h:(state.h+10+Math.random()*state.h*.2);
      p.vx=(Math.random()-.5)*.34;
      p.vy=-(.22+Math.random()*.58);
      p.size=.7+Math.random()*1.9;
      p.alpha=.18+Math.random()*.52;
      p.phase=Math.random()*Math.PI*2;
    }

    function resizeAmbientCanvas(){
      const rect=canvas.getBoundingClientRect();
      state.w=Math.max(1,Math.round(rect.width||canvas.parentElement?.clientWidth||window.innerWidth));
      state.h=Math.max(1,Math.round(rect.height||canvas.parentElement?.clientHeight||window.innerHeight));
      state.dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(state.w*state.dpr);
      canvas.height=Math.round(state.h*state.dpr);
      ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
      const count=Math.max(28,Math.min(64,Math.round((state.w*state.h)/30000)));
      state.particles=Array.from({length:count},()=>{const p={};respawn(p,true);return p;});
    }

    function drawFrame(ts){
      const disabled=document.body.classList.contains('fx-off')||reduce.matches;
      ctx.clearRect(0,0,state.w,state.h);
      if(!disabled){
        for(let i=0;i<state.particles.length;i++){
          const p=state.particles[i];
          p.x+=p.vx+Math.sin((ts*0.0004)+p.phase)*0.12;
          p.y+=p.vy;
          if(p.y<-18||p.x<-18||p.x>state.w+18)respawn(p,false);
        }
        ctx.lineWidth=1;
        for(let i=0;i<state.particles.length;i++){
          const a=state.particles[i];
          for(let j=i+1;j<state.particles.length;j++){
            const b=state.particles[j];
            const dx=a.x-b.x,dy=a.y-b.y;
            const dist=Math.hypot(dx,dy);
            if(dist<108){
              ctx.strokeStyle=`rgba(113,247,250,${((1-dist/108)*0.08).toFixed(3)})`;
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            }
          }
        }
        for(const p of state.particles){
          const glow=p.size*5;
          ctx.fillStyle=`rgba(178,252,255,${p.alpha.toFixed(3)})`;
          ctx.shadowBlur=glow;
          ctx.shadowColor='rgba(89,241,255,.55)';
          ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
        }
        ctx.shadowBlur=0;
      }
      state.raf=requestAnimationFrame(drawFrame);
    }

    resizeAmbientCanvas();
    state.raf=requestAnimationFrame(drawFrame);
    window.addEventListener('resize',resizeAmbientCanvas,{passive:true});
  }

  function currentTeam(){return teams[teamIndex];}
  function teamPeople(){return currentTeam().ids.map(id=>byId.get(id)).filter(Boolean);}
  function pagePeople(){return teamPeople().slice(page*5,page*5+5);}
  function activePerson(){return byId.get(personId) || teamPeople()[0];}
  function teamOf(person){return teams.findIndex(t=>t.key===`${person.center}|${person.dept}`);}
  function setHash(hash){if(location.hash !== hash) location.hash = hash;}
  function pulse(){
    const stage=$('stage');stage.classList.remove('switching');void stage.offsetWidth;stage.classList.add('switching');
    clearTimeout(playChange);playChange=setTimeout(()=>stage.classList.remove('switching'),480);
  }
  function selectTeam(index, options={}){
    if(!teams[index])return;
    teamIndex=index;page=0;personId=null;view='team';render();pulse();
    if(options.hash!==false)setHash(`#team-${pad(index+1)}-p1`);
    if(options.scroll!==false)scrollOnMobile();
  }
  function selectPerson(id, options={}){
    const p=byId.get(Number(id));if(!p)return;
    teamIndex=teamOf(p);if(teamIndex<0)return;
    personId=Number(p.id);page=Math.floor(teamPeople().findIndex(e=>e.id===p.id)/5);view='profile';render();pulse();
    if(options.hash!==false)setHash(`#member-${pad(p.id,3)}`);
    if(options.scroll!==false)scrollOnMobile();
  }
  function toGroup(options={}){
    view='team';render();pulse();
    if(options.hash!==false)setHash(`#team-${pad(teamIndex+1)}-p${page+1}`);
  }
  function pageShift(amount, options={}){
    const total=currentTeam().pages.length;
    if(total<=1)return;
    page=(page+amount+total)%total;
    if(view==='profile')personId=pagePeople()[0]?.id||personId;
    render();pulse();
    if(options.hash!==false)setHash(view==='team'?`#team-${pad(teamIndex+1)}-p${page+1}`:`#member-${pad(personId,3)}`);
  }
  function selectPage(index, options={}){
    const total=currentTeam().pages.length;
    const next=Math.max(0,Math.min(total-1,Number(index)||0));
    if(next===page && !options.force)return;
    page=next;
    if(view==='profile')personId=pagePeople()[0]?.id||personId;
    render();pulse();
    if(options.hash!==false)setHash(view==='team'?`#team-${pad(teamIndex+1)}-p${page+1}`:`#member-${pad(personId,3)}`);
  }
  function personShift(amount){
    if(view==='team'){pageShift(amount);return;}
    const people=teamPeople();const i=people.findIndex(p=>p.id===personId);
    const next=people[(i+amount+people.length)%people.length];if(next)selectPerson(next.id,{scroll:false});
  }
  function scrollOnMobile(){if(window.innerWidth<=800)window.scrollTo({top:$('topHeader').getBoundingClientRect().top+window.scrollY-8,behavior:'smooth'});}

  function renderNav(){
    $('teamNav').innerHTML=teams.map((team,i)=>{
      const p=byId.get(team.ids[0]);const active=teamIndex===i;
      return `<button type="button" class="team-btn ${active?'active':''}" data-team="${i}" aria-pressed="${active}" aria-label="${escape(team.dept)}，${team.ids.length}位成员">
        <span class="team-thumb"><img src="${p.mini}" loading="lazy" alt=""></span>
        <span class="team-copy"><b>${escape(team.center==='执行委'?'执行委':team.dept)} <i>»»</i></b><strong><em>${pad(team.no)}</em> ${escape(teamEnglish[team.dept]||'SQUAD')}</strong></span>
        <span class="slash-strip" aria-hidden="true">▰▰▰</span><span class="bg-num" aria-hidden="true">${pad(team.no)}</span>
      </button>`;
    }).join('');
    const selected=$('teamNav').querySelector('.active');
    if(selected && window.innerWidth>1050){selected.scrollIntoView({behavior:'auto',block:'nearest',inline:'nearest'});}
  }
  function renderTop(){
    const t=currentTeam();
    $('currentTeamName').textContent=t.dept;
    const members=pagePeople();const parts=[];
    for(let i=0;i<5;i++){
      const p=members[i];const seq=page*5+i+1;
      if(p){
        parts.push(`<button type="button" class="top-slot ${view==='profile'&&p.id===personId?'selected':''}" data-person="${p.id}" aria-label="队员${seq} ${escape(p.name)}" aria-pressed="${view==='profile'&&p.id===personId}">${silhouettes}<span>${pad(seq)}</span></button>`);
      }else parts.push(`<span class="top-slot ghost" aria-hidden="true">${silhouettes}<span>${pad(seq)}</span></span>`);
    }
    $('slotStrip').innerHTML=parts.join('');
    const one=t.pages.length===1;
    $('pagePrev').disabled=one;$('pageNext').disabled=one;
    $('pagePrev').title='上一组队员';$('pageNext').title='下一组队员';
  }
  function getGroupImage(team=currentTeam(),pageIndex=page){
    return `assets/group/t${pad(team.no)}p${pageIndex+1}.webp`;
  }
  function getPosterImage(team=currentTeam(),pageIndex=page){
    return team?.pages?.[pageIndex]?.image || getGroupImage(team,pageIndex);
  }
  function updatePosterMode(){
    const stage=$('stage');
    stage.dataset.posterMode=posterMode;
    const groupMode=posterMode==='group';
    const a=$('modeGroup'), b=$('modeMembers');
    if(a){
      a.classList.toggle('active', groupMode);
      a.setAttribute('aria-pressed',String(groupMode));
    }
    if(b){
      b.classList.toggle('active', !groupMode);
      b.setAttribute('aria-pressed',String(!groupMode));
    }
  }
  function changePosterMode(next){
    if(next!=='group' && next!=='members')return;
    posterMode=next;
    updatePosterMode();
    pulse();
  }
  function clearTeamTransitionTimers(){
    clearTimeout(transitionHoldTimer);
    clearTimeout(transitionHideTimer);
  }
  function closeTeamTransition(immediate=false){
    clearTeamTransitionTimers();
    const overlay=$('teamTransition');
    if(!overlay)return;
    if(immediate){
      // Invalidate any pending async image loader before it can restore an old poster.
      transitionToken++;
      overlay.classList.remove('open','closing');
      overlay.setAttribute('aria-hidden','true');
      return;
    }
    overlay.classList.remove('open');
    overlay.classList.add('closing');
    transitionHideTimer=setTimeout(()=>{
      if(overlay.classList.contains('closing')){
        overlay.classList.remove('open','closing');
        overlay.setAttribute('aria-hidden','true');
      }
    },520);
  }
  function showTeamTransition(){
    if(view!=='team')return;
    const team=currentTeam();
    if(!team)return;
    const key=`${team.no}-${page}`;
    if(key===lastTeamPageKey)return;
    lastTeamPageKey=key;
    clearTeamTransitionTimers();
    const token=++transitionToken;
    const overlay=$('teamTransition');
    const image=$('teamTransitionImage');
    if(!overlay||!image)return;

    const posterPath=getPosterImage(team,page);
    const groupPath=getGroupImage(team,page);
    // A stale overlay from a previous route must never obscure the new page.
    overlay.classList.remove('open','closing');
    overlay.setAttribute('aria-hidden','true');

    let finished=false;
    const watchdog=setTimeout(()=>{
      if(!finished && token===transitionToken)tryAsset(groupPath,false);
    },4500);
    function valid(){
      return token===transitionToken && view==='team' && `${currentTeam().no}-${page}`===key;
    }
    function display(path){
      if(!valid())return;
      finished=true;
      clearTimeout(watchdog);
      image.src=path;
      image.alt=`${team.dept}第${page+1}页部门海报`;
      // Restart entrance keyframes when rapidly moving between two departments.
      overlay.classList.remove('open','closing');
      void overlay.offsetWidth;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      transitionHoldTimer=setTimeout(()=>{
        if(valid())closeTeamTransition(false);
      },1000);
    }
    function tryAsset(path, canFallback){
      if(finished||!valid())return;
      const loader=new Image();
      loader.decoding='async';
      loader.onload=()=>{
        if(finished||!valid())return;
        if(loader.naturalWidth>0 && loader.naturalHeight>0){
          display(path);
        }else{
          fail();
        }
      };
      loader.onerror=fail;
      function fail(){
        if(finished||!valid())return;
        if(canFallback && groupPath!==path){
          tryAsset(groupPath,false);
        }else{
          finished=true;
          clearTimeout(watchdog);
          // No blank full-screen overlay if both poster and fallback fail.
          overlay.classList.remove('open','closing');
          overlay.setAttribute('aria-hidden','true');
        }
      }
      loader.src=path;
    }
    tryAsset(posterPath,true);
  }
  function preloadAdjacentPoster(){
    const team=currentTeam();
    if(!team || team.pages.length<2)return;
    const next=team.pages[(page+1)%team.pages.length];
    if(next?.image){const p=new Image();p.decoding='async';p.src=next.image;}
  }
  function renderGroupImage(){
    // A department portrait is the default view; posters appear only in full-screen transitions.
    const token=++posterLoadToken;
    const img=$('groupPhoto');
    const team=currentTeam();
    const photo=getGroupImage(team,page);
    const poster=getPosterImage(team,page);
    const pre=new Image();
    pre.onload=()=>{
      if(token!==posterLoadToken)return;
      img.src=photo;groupRenderedSrc=photo;posterRenderedSrc=poster;
      img.alt=`${team.dept}第${page+1}页部门合照`;
    };
    pre.onerror=()=>{
      if(token!==posterLoadToken)return;
      const fallback=new Image();
      fallback.onload=()=>{
        if(token!==posterLoadToken)return;
        img.src=poster;groupRenderedSrc=poster;posterRenderedSrc=poster;
        img.alt=`${team.dept}第${page+1}页人员展示图`;
      };
      fallback.onerror=()=>{
        if(token!==posterLoadToken)return;
        img.removeAttribute('src');groupRenderedSrc='';posterRenderedSrc='';
        img.alt='';
      };
      fallback.src=poster;
    };
    pre.src=photo;
    preloadAdjacentPoster();
  }

  function renderGroup(){
    const t=currentTeam();const ps=pagePeople();
    $('groupDept').textContent=t.dept;
    $('groupCenter').textContent=t.center;
    $('groupNumber').textContent=pad(t.no);
    $('groupCount').textContent=pad(t.ids.length);
    $('groupPage').textContent=`${pad(page+1)} / ${pad(t.pages.length)}`;
    const image=getPosterImage(t,page);
    $('posterPips').hidden=t.pages.length<=1;
    $('posterPips').innerHTML=t.pages.map((_,i)=>`<button type="button" class="poster-pip ${i===page?'active':''}" data-page="${i}" aria-label="切换到第${i+1}页" aria-pressed="${i===page}"><span>${pad(i+1)}</span></button>`).join('');
    updatePosterMode();
    renderGroupImage();
    // Staggered selectable portraits: separate cutouts preserve each supplied member's image.
    // Slots establish back/front layers rather than a uniform picture grid.
    const positions = {
      1: [{x:49,y:13,s:1.14,a:0,z:4}],
      2: [{x:33,y:14,s:1.12,a:-6,z:4},{x:67,y:14,s:1.12,a:6,z:4}],
      3: [{x:20,y:24,s:.98,a:-9,z:2},{x:50,y:6,s:1.17,a:0,z:4},{x:80,y:21,s:1.02,a:8,z:3}],
      4: [{x:14,y:24,s:.93,a:-9,z:2},{x:38,y:6,s:1.10,a:-3,z:3},{x:67,y:10,s:1.14,a:5,z:4},{x:88,y:30,s:.91,a:10,z:2}],
      5: [{x:18,y:26,s:.92,a:-10,z:4},{x:32,y:2,s:1.04,a:-5,z:2},{x:52,y:22,s:1.21,a:0,z:5},{x:73,y:0,s:1.07,a:7,z:2},{x:82,y:26,s:.91,a:11,z:4}]
    };
    const placements=positions[ps.length]||positions[5];
    const arranged=arrangeForCenter(ps, placements);
    $('groupCharacters').classList.toggle('duo-formation',ps.length===2);
    $('groupCharacters').innerHTML=arranged.map((p,i)=>{
      const v=placements[i];
      const seq=page*5+i+1;
      return `<button class="formation-person fighter-${i+1}" data-person="${p.id}" type="button"
        aria-label="${escape(p.name)}，${escape(p.role)}，查看人物档案"
        title="${escape(p.name)} · ${escape(p.role)}"
        style="--fx:${v.x}%;--fy:${v.y}%;--fs:${v.s};--fr:${v.a}deg;--fz:${v.z};--fd:${i*85}ms">
        <span class="fighter-energy" aria-hidden="true"></span>
        <span class="fighter-portrait"><img src="${escape(p.focus||p.image)}" alt="" loading="eager" draggable="false"></span>
        <span class="fighter-caption"><small>${pad(seq)} // ${escape(p.role)}</small><b>${escape(p.name)}</b></span>
        <span class="fighter-target" aria-hidden="true">＋</span>
      </button>`;
    }).join('');
    // Member name tags are accessible buttons, matching the labels around the reference montage.
    $('groupNotes').innerHTML=arranged.map((p,i)=>{
      const x=ps.length===1?50:(10+i*(80/Math.max(1,ps.length-1)));
      return `<button type="button" class="group-name-note" style="--x:${x}%" data-person="${p.id}" aria-label="查看${escape(p.name)}档案"><b>${escape(p.name)}</b><span>${escape(roman[p.name]||'MEMBER '+pad(p.id,3))}</span></button>`;
    }).join('');
    const count=new Map();for(const p of teamPeople())count.set(p.role,(count.get(p.role)||0)+1);
    const entries=[...count.entries()].sort((a,b)=>b[1]-a[1]);
    $('groupPositions').innerHTML=entries.map(([role,n])=>`<span>${escape(role)} <b>${pad(n)}</b></span>`).join('');
    $('openFirstProfile').textContent='';
    $('openFirstProfile').innerHTML='<span>查看队员档案</span><b>❯❯</b>';
    $('openFirstProfile').disabled=!ps.length;
    $('stageHeading').textContent='SQUAD PROFILE';
  }
  function renderProfile(){
    const p=activePerson();
    $('personRoman').textContent=roman[p.name]||`MEMBER ${pad(p.id,3)}`;
    $('personName').textContent=p.name;
    $('personRole').textContent=p.role;
    $('personRole').title=p.role;
    $('profileScene').classList.toggle('is-long-role',p.role.length>=11);
    $('personDept').textContent=p.dept;
    $('hudSerial').textContent=`KG / ${pad(p.id,3)}`;
    $('personArt').src=p.focus||p.image;
    $('personArt').alt=`${p.name}的彩色人物大图`;
    $('personQ').src=p.mini;
    $('personQ').alt=`${p.name}的Q版头像`;
    const facts=[['所属中心',p.center],['年级专业',p.grade],['学号',p.studentId],['宿舍号',p.dorm],['手机号',p.phone],['出生日期',p.birth],['星座',p.zodiac]];
    $('factsCard').innerHTML=facts.map(([k,v])=>`<div class="fact-row"><span>${escape(k)}</span><strong>${escape(v||'不详')}</strong></div>`).join('');
    $('stageHeading').textContent='PERSONNEL PROFILE';
    document.title=`${p.name} | ${p.dept} | 昆冈众创`;
  }
  function renderBottom(){
    const ps=pagePeople();
    $('memberCards').innerHTML=ps.map((p,i)=>`<button type="button" class="member-card ${view==='profile'&&p.id===personId?'active':''}" data-person="${p.id}" aria-pressed="${view==='profile'&&p.id===personId}">
      <span class="member-photo"><img src="${p.mini}" loading="lazy" alt=""></span><span class="member-card-copy"><small>隊員 ${pad(page*5+i+1)}</small><b>${escape(p.name)}</b><span>${escape(p.role)}</span></span><span class="card-angled" aria-hidden="true">❯</span>
    </button>`).join('');
    const box=$('otherJobs');
    if(view==='profile'){
      const p=activePerson();const others=records.filter(other=>other.name===p.name && other.id!==p.id);
      box.hidden=!others.length;
      box.innerHTML=others.length?`<span class="other-label">其他任职 / RELATED FILES</span>${others.map(other=>`<button type="button" data-person="${other.id}">${escape(other.dept)} · ${escape(other.role)} ↗</button>`).join('')}`:'';
    }else{box.hidden=true;box.textContent='';}
  }
  function fitMobileStage(){
    const stage=$('stage');
    if(!stage)return;
    if(window.innerWidth>760){stage.style.removeProperty('--mobile-stage-height');return;}
    const scene=view==='team' ? $('teamScene') : $('profileScene');
    const target=view==='team' ? scene.querySelector('.team-cta') : scene.querySelector('.profile-actions');
    const concept=view==='team' ? scene.querySelector('.team-concept') : scene.querySelector('.facts-card');
    const lower=Math.max(target?.getBoundingClientRect().bottom||0,concept?.getBoundingClientRect().bottom||0);
    const desired=Math.ceil(Math.max(view==='team'?785:890,lower-stage.getBoundingClientRect().top+36));
    stage.style.setProperty('--mobile-stage-height',desired+'px');
  }
  function render(){
    if(!currentTeam())return;
    const teamVisible=view==='team';
    $('teamScene').hidden=!teamVisible;
    $('profileScene').hidden=teamVisible;
    $('stage').dataset.view=view;
    $('appShell').dataset.view=view;
    renderNav();renderTop();
    window.KG_NETWORK?.sync(teamIndex);
    if(teamVisible){
      renderGroup();
      document.title=`${currentTeam().dept} | 昆冈众创`;
      showTeamTransition();
    }else{
      closeTeamTransition(true);
      lastTeamPageKey='';
      renderProfile();
    }
    renderBottom();
    requestAnimationFrame(fitMobileStage);
  }

  function makeFilters(){
    const options=['全部',...centers];
    $('filterList').innerHTML=options.map(c=>`<button class="filter-choice ${centerFilter===c?'active':''}" type="button" data-center="${escape(c)}" aria-pressed="${centerFilter===c}">${escape(c)}</button>`).join('');
  }
  function renderResults(){
    const q=searchText.toLowerCase().trim();
    const matched=records.filter(p=>{
      if(centerFilter!=='全部'&&p.center!==centerFilter)return false;
      if(!q)return true;
      return [p.name,p.center,p.dept,p.role,p.grade,p.studentId,roman[p.name],p.zodiac].join(' ').toLowerCase().includes(q);
    });
    $('searchResultCount').textContent=`${pad(matched.length)} RECORDS`;
    $('searchResults').innerHTML=matched.length?matched.map(p=>`<button class="result-card" type="button" data-person="${p.id}"><img src="${p.mini}" loading="lazy" alt=""><span class="result-copy"><b>${escape(p.name)}</b><small>${escape(p.center)} / ${escape(p.dept)}</small><span>${escape(p.role)}</span></span><em>KG ${pad(p.id,3)}</em></button>`).join(''):'<p class="empty-result">没有匹配的成员</p>';
  }
  function openDrawer(){
    savedFocus=document.activeElement;
    const drawer=$('drawer');
    drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');
    centerFilter='全部';searchText='';$('searchInput').value='';makeFilters();renderResults();
    document.body.classList.add('overlay-active');
    window.KG_NETWORK?.open(teamIndex);
    // Do not focus search on opening: QQ would open the keyboard and obscure the relationship map.
    $('closeMenu').focus({preventScroll:true});
  }
  function closeDrawer(){
    $('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');
    document.body.classList.remove('overlay-active');
    window.KG_NETWORK?.close();
    if(savedFocus?.focus)savedFocus.focus({preventScroll:true});
  }
  function openLightbox(mode='auto'){
    if(mode==='poster' || view==='team'){
      const t=currentTeam();
      const img=(mode==='poster'?posterRenderedSrc:groupRenderedSrc)||groupRenderedSrc||posterRenderedSrc||getGroupImage(t,page);
      $('lightboxImage').src=img;
      $('lightboxName').textContent=`${t.dept} · ${mode==='poster'?'部门海报':'部门合照'}`;
      $('lightboxRole').textContent=`${t.center} / 第 ${page+1} 页 / ${pagePeople().map(p=>p.name).join('、')}`;
    }else{
      const p=activePerson();$('lightboxImage').src=p.image;
      $('lightboxName').textContent=p.name;$('lightboxRole').textContent=`${p.center} / ${p.dept} / ${p.role}`;
    }
    $('lightbox').classList.toggle('poster-open',mode==='poster'||view==='team');
    $('lightbox').classList.add('open');$('lightbox').setAttribute('aria-hidden','false');document.body.classList.add('overlay-active');$('closeLightbox').focus();
  }
  function closeLightbox(){
    $('lightbox').classList.remove('open','poster-open');$('lightbox').setAttribute('aria-hidden','true');document.body.classList.remove('overlay-active');
    if(view==='team')$('pageNext').focus(); else $('openPortrait').focus();
  }
  function readLocation(){
    const memberMatch=location.hash.match(/^#member-(\d+)$/i);
    if(memberMatch && byId.has(Number(memberMatch[1]))){selectPerson(Number(memberMatch[1]),{hash:false,scroll:false});return;}
    const groupMatch=location.hash.match(/^#team-(\d+)(?:-p(\d+))?$/i);
    if(groupMatch){
      const index=Number(groupMatch[1])-1;
      if(teams[index]){
        teamIndex=index;page=Math.max(0,Math.min(teams[index].pages.length-1,Number(groupMatch[2]||1)-1));
        personId=null;view='team';render();return;
      }
    }
    const path=location.pathname.match(/agent-(\d+)\.html$/i);
    if(path && byId.has(Number(path[1]))){selectPerson(Number(path[1]),{hash:false,scroll:false});return;}
    teamIndex=0;page=0;personId=null;view='team';render();
  }
  function init(){
    ensureAmbientFx();
    window.KG_NETWORK?.init();
    readLocation();makeFilters();renderResults();
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-team],[data-person],[data-center],[data-page],[data-poster-mode]');
      if(!btn)return;
      if(btn.dataset.person){e.preventDefault();if($('drawer').classList.contains('open'))closeDrawer();selectPerson(Number(btn.dataset.person));return;}
      if(btn.dataset.team!==undefined){
        const inMenu=Boolean(btn.closest('#drawer'));
        selectTeam(Number(btn.dataset.team),{scroll:!inMenu});
        if(inMenu)closeDrawer();
        return;
      }
      if(btn.dataset.page!==undefined){selectPage(Number(btn.dataset.page));return;}
      if(btn.dataset.posterMode!==undefined){changePosterMode(btn.dataset.posterMode);return;}
      if(btn.dataset.center!==undefined){centerFilter=btn.dataset.center;makeFilters();renderResults();window.KG_NETWORK?.highlightCenter(centerFilter);}
    });
    $('pagePrev').addEventListener('click',()=>pageShift(-1));
    $('pageNext').addEventListener('click',()=>pageShift(1));
    $('openFirstProfile').addEventListener('click',()=>{const p=pagePeople()[0];if(p)selectPerson(p.id);});
    // Group members are selectable; the image beneath them remains non-interactive.
    $('backToGroup').addEventListener('click',()=>toGroup());
    $('personPrev').addEventListener('click',()=>personShift(-1));
    $('personNext').addEventListener('click',()=>personShift(1));
    $('openMenu').addEventListener('click',openDrawer);$('openMobileMenu').addEventListener('click',openDrawer);
    $('closeMenu').addEventListener('click',closeDrawer);
    // Accessible animation switch, independent of content/navigation state.
    $('fxToggle').addEventListener('click',()=>{
      const disabled=document.body.classList.toggle('fx-off');
      $('fxToggle').setAttribute('aria-pressed',String(!disabled));
      $('fxToggle').querySelector('b').textContent=disabled?'OFF':'ON';
    });
    // Low-impact pointer parallax for the tactical radar surface.
    if(window.matchMedia('(prefers-reduced-motion: no-preference)').matches){
      $('stage').addEventListener('pointermove',event=>{
        if(event.pointerType==='touch')return;
        const rect=$('stage').getBoundingClientRect();
        const dx=(event.clientX-rect.left)/rect.width-.5;
        const dy=(event.clientY-rect.top)/rect.height-.5;
        $('stage').style.setProperty('--mouse-x',(dx*13).toFixed(1)+'px');
        $('stage').style.setProperty('--mouse-y',(dy*9).toFixed(1)+'px');
      });
      $('stage').addEventListener('pointerleave',()=>{
        $('stage').style.setProperty('--mouse-x','0px');
        $('stage').style.setProperty('--mouse-y','0px');
      });
    }
    $('searchInput').addEventListener('input',e=>{searchText=e.target.value;renderResults();});
    $('clearSearch').addEventListener('click',()=>{searchText='';$('searchInput').value='';renderResults();$('searchInput').focus();});
    $('openPortrait').addEventListener('click',openLightbox);
    $('closeLightbox').addEventListener('click',closeLightbox);
    $('lightbox').addEventListener('click',e=>{if(e.target===$('lightbox'))closeLightbox();});
    $('drawer').addEventListener('click',e=>{if(e.target===$('drawer'))closeDrawer();});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if($('lightbox').classList.contains('open'))closeLightbox();
        else if($('drawer').classList.contains('open'))closeDrawer();
        return;
      }
      if($('lightbox').classList.contains('open')||$('drawer').classList.contains('open'))return;
      if(e.target.closest('input,textarea,select,[contenteditable]'))return;
      if(e.key==='ArrowRight'){e.preventDefault();if(view==='team')pageShift(1);else personShift(1);}
      if(e.key==='ArrowLeft'){e.preventDefault();if(view==='team')pageShift(-1);else personShift(-1);}
      if(e.key.toLowerCase()==='t'){e.preventDefault();toGroup();}
      if(e.key==='/'){e.preventDefault();openDrawer();}
    });
    window.addEventListener('hashchange',readLocation);
    window.addEventListener('resize',()=>requestAnimationFrame(fitMobileStage),{passive:true});
    const stage=$('stage');
    stage.addEventListener('touchstart',e=>{if(e.touches.length===1)gesture={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
    stage.addEventListener('touchend',e=>{if(!gesture||!e.changedTouches.length)return;
      const dx=e.changedTouches[0].clientX-gesture.x,dy=e.changedTouches[0].clientY-gesture.y;
      if(Math.abs(dx)>95 && Math.abs(dx)>Math.abs(dy)*1.7)personShift(dx<0?1:-1);gesture=null;
    },{passive:true});
    // Expose deterministic read-only state for local functional QA.
    window.KG_DEBUG=()=>({view,teamIndex,page,personId,team:currentTeam().dept,mini:pagePeople().map(p=>p.mini),art:activePerson()?.image});
  }
  init();
})();
