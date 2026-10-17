/* Kungang / interactive department relationship map and menu-only luminous fish. */
(()=>{
  'use strict';
  const source=window.KG_DATA||{};
  const teams=source.teams||[];
  const centers=['组织建设中心','项目孵化中心','新闻宣传中心','科创宣讲中心'];
  const layout={
    root:[500,311],
    hubs:{'组织建设中心':[317,225],'项目孵化中心':[331,422],'新闻宣传中心':[683,225],'科创宣讲中心':[683,425]},
    deps:{'执行委':[500,92],'党支部':[117,126],'团支部':[105,272],'办公室':[206,346],
      '孵化部':[131,486],'项目部':[398,552],'采编部':[856,128],'设计部':[896,274],
      '联络部':[605,548],'宣讲部':[876,501]}
  };
  const $=id=>document.getElementById(id);
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let index=0,chosenCenter='全部',ready=false,renderId=0;
  let fishCtx=null,fishCanvas=null,fish=[],suspended=true,fishTimer=0;
  let w=0,h=0;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');

  function nodeTeam(t,i){
    const [x,y]=layout.deps[t.dept]||[500,300];
    return `<button type="button" class="network-node network-department${i===index?' selected':''}" data-team="${i}" data-preview-team="${i}" style="--nx:${x/10}%;--ny:${y/6.10}%" aria-label="进入${esc(t.dept)}，${t.ids.length}位成员">
      <small>${String(t.no).padStart(2,'0')}</small><strong>${esc(t.dept)}</strong><i></i>
    </button>`;
  }
  function nodeHub(c){
    const [x,y]=layout.hubs[c];
    return `<button type="button" class="network-node network-hub" data-center="${esc(c)}" style="--nx:${x/10}%;--ny:${y/6.10}%" aria-label="筛选${esc(c)}">
      <span>✦</span><strong>${esc(c)}</strong>
    </button>`;
  }
  function svgLine(a,b,kind='normal'){
    return `<path class="link-${kind}" d="M${a[0]},${a[1]} C${a[0]+(b[0]-a[0])*.48},${a[1]} ${a[0]+(b[0]-a[0])*.54},${b[1]} ${b[0]},${b[1]}"/>`;
  }
  function renderMap(){
    if(!$('networkNodes'))return;
    $('networkNodes').innerHTML=`<div class="network-node network-core" style="--nx:50%;--ny:${layout.root[1]/6.10}%" aria-label="昆冈众创">
        <span class="network-core-ring"></span><img class="network-core-logo" src="assets/kungang-icon.png" alt="" draggable="false"><small>昆冈众创</small>
      </div>`+centers.map(nodeHub).join('')+teams.map(nodeTeam).join('');
    let lines=`<circle cx="500" cy="311" r="118" class="network-orbit"/><circle cx="500" cy="311" r="230" class="network-orbit faint"/>`;
    for(const c of centers)lines+=svgLine(layout.root,layout.hubs[c],'hub');
    lines+=svgLine(layout.root,layout.deps['执行委'],'prime');
    for(const t of teams){if(t.dept==='执行委')continue;lines+=svgLine(layout.hubs[t.center],layout.deps[t.dept],'normal');}
    $('networkLines').innerHTML=lines;
    $('networkMobile').innerHTML=`
      <div class="mobile-network-core"><img class="mobile-network-logo" src="assets/kungang-icon.png" alt="" draggable="false"><div><strong>昆冈众创</strong><span>ORGANIZATION CORE</span></div></div>
      <div class="mobile-network-link" aria-hidden="true"></div>
      <div class="mobile-network-exec">${mobileTeam(teams[0],0)}</div>
      <div class="mobile-network-clusters">${centers.map((c,i)=>{
        const members=teams.map((t,ti)=>({...t,ti})).filter(t=>t.center===c);
        return `<section class="mobile-cluster" data-cluster-center="${esc(c)}">
          <button class="mobile-cluster-title" type="button" data-center="${esc(c)}"><span class="cluster-index">0${i+1}</span><strong>${esc(c)}</strong><span aria-hidden="true">⌄</span></button>
          <div class="mobile-cluster-teams">${members.map(t=>mobileTeam(t,t.ti)).join('')}</div>
        </section>`;
      }).join('')}</div>`;
    sync(index);
  }
  function mobileTeam(t,i){
    return `<button class="mobile-network-team${i===index?' selected':''}" type="button" data-team="${i}" data-preview-team="${i}"><span class="tiny-orb"></span>${esc(t.dept)}<small>${t.ids.length}人</small></button>`;
  }
  function sync(i=0){
    index=Math.max(0,Math.min(teams.length-1,Number(i)||0));
    if(!ready)return;
    document.querySelectorAll('#drawer [data-preview-team]').forEach(b=>{
      const on=Number(b.dataset.previewTeam)===index;
      b.classList.toggle('selected',on);
      if(b.hasAttribute('aria-pressed'))b.setAttribute('aria-pressed',String(on));
    });
    const t=teams[index];
    const no=String(t.no).padStart(2,'0');
    $('networkPreviewNo').textContent=`FILE / ${no}`;
    $('networkPreviewEmblem').textContent=no;
    $('networkPreviewName').textContent=t.dept;
    $('networkPreviewCenter').textContent=t.center;
    $('networkPreviewMeta').textContent=`${t.ids.length} 位成员 · ${t.pages.length} 组档案`;
    chosenCenter=t.center;
    highlightCenter(chosenCenter);
  }
  function highlightCenter(c){
    document.querySelectorAll('#drawer .network-hub,#drawer .mobile-cluster').forEach(el=>{
      const name=el.dataset.center || el.dataset.clusterCenter;
      el.classList.toggle('related',name===c);
    });
  }
  // Low-power menu-only fish: 3 on phones, 5 on desktop, 8-10 redraws/sec.
  // No per-frame shadows, gradients or permanent requestAnimationFrame loop.
  function resizeFish(){
    if(!fishCanvas||!fishCtx)return;
    const rect=fishCanvas.getBoundingClientRect();
    w=Math.max(1,Math.round(rect.width)); h=Math.max(1,Math.round(rect.height));
    // Limit the backing store, especially on 3x-DPR phones and wide desktops.
    const scale=Math.min(1,960/w,760/h);
    fishCanvas.width=Math.max(1,Math.ceil(w*scale));
    fishCanvas.height=Math.max(1,Math.ceil(h*scale));
    fishCtx.setTransform(scale,0,0,scale,0,0);
    const limit=window.innerWidth<650?3:5;
    fish=Array.from({length:limit},(_,i)=>spawn(i,true));
  }
  function spawn(i,scatter){
    const dir=i%3===0?-1:1;
    return {
      x:scatter?Math.random()*w:(dir>0?-38:w+38),
      y:(.11+Math.random()*.74)*h,
      dir,
      size:(window.innerWidth<650?13:17)+Math.random()*10,
      speed:(window.innerWidth<650?11:17)+Math.random()*11,
      phase:Math.random()*6.28,
      opacity:.34+Math.random()*.18
    };
  }
  function drawFish(now,advance){
    if(!fishCtx||!w||!h)return;
    const ctx=fishCtx;
    ctx.clearRect(0,0,w,h);
    const t=now/1000;
    for(let i=0;i<fish.length;i++){
      let f=fish[i];
      if(advance){
        f.x+=f.speed*(window.innerWidth<650?.13:.11)*f.dir;
        f.y+=Math.sin(t*.7+f.phase)*.11;
        if((f.dir>0&&f.x>w+48)||(f.dir<0&&f.x< -48))f=fish[i]=spawn(i,false);
      }
      ctx.save();
      ctx.translate(f.x,f.y);
      ctx.scale(f.dir*f.size/22,f.size/22);
      ctx.rotate(Math.sin(t*.35+f.phase)*.045);
      // Two inexpensive crisp strokes give a neon-fish impression.
      ctx.lineWidth=2;
      ctx.strokeStyle=`rgba(66,222,255,${f.opacity*.52})`;
      ctx.beginPath();
      ctx.moveTo(14,0);ctx.quadraticCurveTo(0,-7,-18,0);ctx.quadraticCurveTo(0,7,14,0);
      ctx.moveTo(-18,0);ctx.lineTo(-30,-9);ctx.lineTo(-27,0);ctx.lineTo(-30,9);ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle=`rgba(176,255,255,${f.opacity+.25})`;
      ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(10,0);ctx.quadraticCurveTo(-1,-5,-14,0);ctx.quadraticCurveTo(-1,5,10,0);ctx.stroke();
      ctx.restore();
    }
  }
  function stopFish(){
    suspended=true;
    if(fishTimer){clearTimeout(fishTimer);fishTimer=0;}
    if(fishCtx)fishCtx.clearRect(0,0,w,h);
  }
  function fishTick(){
    if(suspended||document.hidden)return;
    drawFish(performance.now(),true);
    fishTimer=setTimeout(fishTick,window.innerWidth<650?135:110);
  }
  function startFish(){
    stopFish();
    if(!fishCtx||!fishCanvas||document.hidden)return;
    resizeFish();
    suspended=false;
    if(reduce.matches || document.body.classList.contains('fx-off')){
      drawFish(0,false);
      return;
    }
    fishTick();
  }
  function refreshMotion(){
    const drawer=$('drawer');
    if(drawer?.classList.contains('open'))startFish();
    else stopFish();
  }
  function init(){
    if(ready||!teams.length||!$('networkNodes'))return;
    fishCanvas=$('menuFishCanvas');fishCtx=fishCanvas?.getContext('2d');
    ready=true;renderMap();
    const drawer=$('drawer');
    // Preview is updated by keyboard focus/hover; activating a unit navigates to it.
    drawer.addEventListener('pointerover',e=>{
      if(e.pointerType==='touch')return;
      const btn=e.target.closest('[data-preview-team]');
      if(btn)sync(btn.dataset.previewTeam);
    });
    drawer.addEventListener('focusin',e=>{
      const btn=e.target.closest('[data-preview-team]');
      if(btn)sync(btn.dataset.previewTeam);
    });
    $('networkEnter').addEventListener('click',()=>{
      const button=$('networkNodes').querySelector(`[data-team="${index}"]`);
      if(button)button.click();
    });
    window.addEventListener('resize',()=>{if(!suspended)startFish();},{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)stopFish();
      else if(drawer.classList.contains('open'))startFish();
    });
    if(reduce.addEventListener)reduce.addEventListener('change',refreshMotion);
  }
  function open(activeIndex){init();sync(activeIndex);startFish();}
  function close(){stopFish();}
  window.KG_NETWORK={init,open,close,sync,highlightCenter,refreshMotion,debug:()=>({ready,suspended,fishCount:fish.length,activeIndex:index,timerActive:!!fishTimer,backingSize:fishCanvas?[fishCanvas.width,fishCanvas.height]:null})};
})();
