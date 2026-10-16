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
  let fishCtx=null,fishCanvas=null,fish=[],suspended=true,raf=0,lastPaint=0;
  let w=0,h=0,dpr=1,frame=0;
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
        <span class="network-core-ring"></span><b>KG</b><small>昆冈众创</small>
      </div>`+centers.map(nodeHub).join('')+teams.map(nodeTeam).join('');
    let lines=`<circle cx="500" cy="311" r="118" class="network-orbit"/><circle cx="500" cy="311" r="230" class="network-orbit faint"/>`;
    for(const c of centers)lines+=svgLine(layout.root,layout.hubs[c],'hub');
    lines+=svgLine(layout.root,layout.deps['执行委'],'prime');
    for(const t of teams){if(t.dept==='执行委')continue;lines+=svgLine(layout.hubs[t.center],layout.deps[t.dept],'normal');}
    $('networkLines').innerHTML=lines;
    $('networkMobile').innerHTML=`
      <div class="mobile-network-core"><b>KG</b><div><strong>昆冈众创</strong><span>ORGANIZATION CORE</span></div></div>
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
  function resizeFish(){
    if(!fishCanvas||!fishCtx)return;
    const rect=fishCanvas.getBoundingClientRect();
    w=Math.max(1,Math.round(rect.width));h=Math.max(1,Math.round(rect.height));
    dpr=Math.min(window.devicePixelRatio||1,1.4);
    fishCanvas.width=Math.floor(w*dpr);fishCanvas.height=Math.floor(h*dpr);
    fishCtx.setTransform(dpr,0,0,dpr,0,0);
    const limit=(window.innerWidth<650)?8:14;
    fish=Array.from({length:limit},(_,i)=>spawn(i,true));
  }
  function spawn(i,scatter){
    const dir=i%4===0?-1:1;
    return {x:scatter?Math.random()*w:(dir>0?-48:w+48),y:(.10+Math.random()*.8)*h,
      dir,size:(window.innerWidth<650?11:14)+Math.random()*(window.innerWidth<650?15:23),
      speed:(.24+Math.random()*.34)*(window.innerWidth<650?.78:1),phase:Math.random()*6.28,
      hue:i%4===0?195:184,opacity:.25+Math.random()*.27};
  }
  function drawFish(t){
    if(!fishCtx)return;
    const ctx=fishCtx;
    ctx.clearRect(0,0,w,h);
    const motion=!reduce.matches&&!document.body.classList.contains('fx-off');
    const secs=motion?t/1000:0;
    // Restrained ocean beams behind the relationship graph.
    const beam=ctx.createLinearGradient(0,0,w,h);
    beam.addColorStop(0,'rgba(35,180,230,.032)');beam.addColorStop(.5,'rgba(0,55,120,0)');beam.addColorStop(1,'rgba(10,180,235,.025)');
    ctx.fillStyle=beam;ctx.fillRect(0,0,w,h);
    for(let i=0;i<fish.length;i++){
      const f=fish[i];
      const swimming=secs*.85+f.phase;
      const tail=Math.sin(swimming*4.1)*.26;
      if(motion){
        f.x+=f.speed*f.dir;
        f.y+=Math.sin(swimming*.7)*.11;
        if((f.dir>0&&f.x>w+70)||(f.dir<0&&f.x< -70))fish[i]=spawn(i,false);
      }
      ctx.save();ctx.translate(f.x,f.y);ctx.scale(f.dir,1);
      ctx.rotate(Math.sin(swimming*.45)*.10);
      const scale=f.size/22;ctx.scale(scale,scale);
      ctx.shadowBlur=18;ctx.shadowColor=`hsla(${f.hue},100%,73%,.58)`;
      ctx.strokeStyle=`hsla(${f.hue},100%,81%,${f.opacity+.22})`;
      ctx.fillStyle=`hsla(${f.hue},100%,63%,${f.opacity*.46})`;
      ctx.lineWidth=1.3;
      // Torpedo-shaped fish body, animated caudal fin, dorsal + pectoral fins.
      ctx.beginPath();ctx.moveTo(13,0);ctx.bezierCurveTo(3,-6,-11,-7,-19,0);ctx.bezierCurveTo(-11,7,3,6,13,0);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.save();ctx.translate(-19,0);ctx.rotate(tail);
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-10,-11,-14,-9);ctx.lineTo(-10,0);ctx.lineTo(-14,9);ctx.quadraticCurveTo(-9,11,0,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(-7,-10);ctx.lineTo(4,-4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-3,4);ctx.lineTo(-8,10);ctx.lineTo(5,3);ctx.stroke();
      ctx.fillStyle='rgba(225,255,255,.70)';ctx.shadowBlur=0;ctx.beginPath();ctx.arc(8,-1,1.1,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  function fishTick(now){
    if(suspended)return;
    if(now-lastPaint>32){lastPaint=now;drawFish(now);}
    raf=requestAnimationFrame(fishTick);
  }
  function startFish(){
    suspended=false;
    if(!fishCanvas||!fishCtx)return;
    resizeFish();lastPaint=0;
    if(raf)cancelAnimationFrame(raf);
    if(reduce.matches||document.body.classList.contains('fx-off')){drawFish(1000);return;}
    raf=requestAnimationFrame(fishTick);
  }
  function stopFish(){
    suspended=true;
    if(raf)cancelAnimationFrame(raf);
    raf=0;
    if(fishCtx)fishCtx.clearRect(0,0,w,h);
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
    window.addEventListener('resize',()=>{if(!suspended)resizeFish();},{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)stopFish();
      else if(drawer.classList.contains('open'))startFish();
    });
  }
  function open(activeIndex){init();sync(activeIndex);startFish();}
  function close(){stopFish();}
  window.KG_NETWORK={init,open,close,sync,highlightCenter,debug:()=>({ready,suspended,fishCount:fish.length,activeIndex:index})};
})();
