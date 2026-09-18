const DIMENSION_OPTIONS = [
  ["creation", "Creation / Entrepreneurship"], ["technical", "Technical Capability"],
  ["execution", "Execution"], ["financial", "Financial Progress"], ["leadership", "Leadership / Influence"],
  ["independence", "Independence"], ["sustainability", "Sustainability"], ["relationships", "Relationships / Social Capital"],
  ["academic", "Academic Standing"], ["optionality", "Optionality / Network"],
];

let currentRange = "1M";
let lastHistory = [];
let lastPoints = [];

// ---------- Auth ----------
async function checkSession() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) { showApp(); await refreshAll(); } else showLogin();
  } catch { showLogin(); }
}
function showLogin() { document.getElementById("login-screen").hidden=false; document.getElementById("app-screen").hidden=true; }
function showApp() { document.getElementById("login-screen").hidden=true; document.getElementById("app-screen").hidden=false; }

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const password=document.getElementById("login-password").value;
  const errorEl=document.getElementById("login-error"); errorEl.hidden=true;
  try {
    const res=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
    let data={}; try { data=await res.json(); } catch {}
    if(res.ok){showApp();await refreshAll();}
    else {errorEl.textContent=res.status===401?"Incorrect passphrase.":(data.error||`Server error (${res.status}).`);errorEl.hidden=false;}
  } catch { errorEl.textContent="Unable to reach the server."; errorEl.hidden=false; }
});

document.getElementById("logout-btn").addEventListener("click",async()=>{await fetch("/api/logout",{method:"POST"});showLogin();});

// ---------- State / trajectory ----------
async function refreshAll(){ await Promise.all([loadState(),loadEvents()]); }
async function loadState(){
  const res=await fetch("/api/state",{cache:"no-store"}); if(!res.ok)return;
  const data=await res.json(); lastHistory=data.history||[]; lastPoints=data.points||[];
  document.getElementById("trajectory-number").textContent=Number(data.trajectory).toFixed(3);
  const changeEl=document.getElementById("trajectory-change");
  if(data.changePct===null){changeEl.textContent="—";changeEl.className="hero-change";}
  else {const sign=data.changePct>=0?"▲":"▼";changeEl.textContent=`${sign} ${Math.abs(data.changePct).toFixed(1)}%`;changeEl.className="hero-change "+(data.changePct>=0?"up":"down");}
  document.getElementById("threshold-readout").textContent=`threshold ${Number(data.threshold).toFixed(3)}`;
  document.getElementById("trend-readout").textContent=`trend ${computeTrend(lastHistory)}`;
  renderDimensions(data.dimensions); renderTrajectoryChart(lastHistory);
}
function computeTrend(history){
  if(history.length<3)return "insufficient history";
  const recent=history.slice(-Math.min(7,history.length));
  const delta=recent[recent.length-1].trajectory-recent[0].trajectory;
  return delta>0.003?"rising":delta<-0.003?"falling":"flat";
}

// ---------- Native SVG chart ----------
function rangeHours(label){return {"1H":1,"1D":24,"1W":168,"1M":720,"1Y":8760,"ALL":Infinity}[label]??720;}
function selectPoints(points,label){
  if(!points.length)return [];
  const last=new Date(points[points.length-1].recorded_at).getTime();
  const hours=rangeHours(label);
  if(!Number.isFinite(hours))return points.slice();
  return points.filter(p=>(last-new Date(p.recorded_at).getTime())<=hours*3600000);
}
function selectHistory(history,label){
  if(!history.length)return [];
  const last=new Date(history[history.length-1].date+'T23:59:59Z').getTime();
  const hours=rangeHours(label);
  if(!Number.isFinite(hours))return history.slice();
  return history.filter(h=>(last-new Date(h.date+'T23:59:59Z').getTime())<=hours*3600000);
}
function dayKey(iso){const d=new Date(iso);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
function aggregatePoints(points,label){
  if(points.length<=1 || ['1H','1D','1W'].includes(label)) return points.slice();
  const bucketDays=label==='1M'?1:label==='1Y'?7:14;
  const originMs=new Date(points[0].recorded_at).setUTCHours(0,0,0,0);
  const buckets=new Map();
  for(const p of points){
    const t=new Date(p.recorded_at).getTime();
    const bucket=Math.floor((t-originMs)/86400000/bucketDays);
    if(!buckets.has(bucket))buckets.set(bucket,[]);
    buckets.get(bucket).push(p);
  }
  const out=[];
  for(const group of buckets.values()){
    const first=group[0], last=group[group.length-1];
    const avg=group.reduce((sum,x)=>sum+Number(x.trajectory),0)/group.length;
    const threshold=group.reduce((sum,x)=>sum+Number(x.threshold),0)/group.length;
    const strongest=group.reduce((best,x)=>Math.abs(Number(x.event_impact||0))>Math.abs(Number(best.event_impact||0))?x:best,group[0]);
    const base={...last,trajectory:group.length===1?Number(last.trajectory):avg*0.35+Number(last.trajectory)*0.65,threshold,event_impact:Number(strongest.event_impact||0)};
    // Preserve meaningful spikes inside a long bucket. This is a visual
    // aggregation only; canonical trajectory values remain untouched.
    if(group.length>1 && Math.abs(Number(strongest.event_impact||0))>0.01 && strongest!==last){
      out.push({...base, recorded_at:strongest.recorded_at, trajectory:Number(strongest.trajectory), note:strongest.note||last.note});
    } else out.push(base);
  }
  if(out.length===1 && points.length>1){
    const first=points[0], last=points[points.length-1];
    const strongest=points.reduce((best,x)=>Math.abs(Number(x.event_impact||0))>Math.abs(Number(best.event_impact||0))?x:best,first);
    if(strongest!==first && strongest!==last) return [first,strongest,last];
    return [first,last];
  }
  return out;
}
function formatPointDate(iso,label){
  const d=new Date(iso);
  if(label==='1H'||label==='1D')return d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  if(label==='1W')return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:label==='ALL'?'numeric':undefined});
}
function timeframeLabel(label){return label==='ALL'?'all history':label.toLowerCase();}
function renderTrajectoryChart(fullHistory){
  const host=document.getElementById('trajectory-chart'); host.innerHTML=''; hideChartTooltip(); host.style.setProperty('--chart-area-color','#3ddc97');
  const raw=selectPoints(lastPoints,currentRange);
  const points=aggregatePoints(raw,currentRange);
  const fallback=selectHistory(fullHistory,currentRange).map((d,i)=>({
    id:`daily-${i}`, recorded_at:`${d.date}T12:00:00.000Z`,
    trajectory:d.trajectory, threshold:d.threshold, note:d.note,
    entry_id:null, event_impact:0
  }));
  const data=points.length?points:fallback;
  const empty=document.getElementById('chart-empty');
  if(!data.length){
    empty.hidden=false; updateChartStatus(null,null); return;
  }
  empty.hidden=true;

  // Hybrid "life market" view:
  // trajectory is the slow-moving baseline; each event creates a bounded,
  // transient visual impulse around that baseline. The impulse is display-only
  // and never changes the canonical score stored by the engine.
  const hybrid=data.map(d=>{
    const impact=Number(d.event_impact||0);
    const pulse=Math.max(-0.20,Math.min(0.20,impact*4.0));
    return {...d, displayValue:Math.max(0.01,Math.min(0.99,Number(d.trajectory)+pulse))};
  });

  host.style.setProperty('--chart-area-color', Number(hybrid[hybrid.length-1].displayValue) >= Number(hybrid[hybrid.length-1].threshold) ? '#3ddc97' : '#ef5350');

  const W=1000,H=390,pad={l:58,r:24,t:30,b:48},x0=pad.l,x1=W-pad.r,y0=pad.t,y1=H-pad.b;
  const values=hybrid.flatMap(d=>[Number(d.displayValue),Number(d.trajectory),Number(d.threshold)]).filter(Number.isFinite);
  let ymin=Math.min(...values), ymax=Math.max(...values);
  const spread=Math.max(ymax-ymin,0.018), padY=Math.max(spread*0.20,0.012);
  ymin=Math.max(0,ymin-padY); ymax=Math.min(1,ymax+padY);
  if(ymax-ymin<0.08){
    const mid=(ymax+ymin)/2;
    ymin=Math.max(0,mid-0.04); ymax=Math.min(1,mid+0.04);
  }
  const sx=i=>hybrid.length===1?(x0+x1)/2:x0+(i/(hybrid.length-1))*(x1-x0);
  const sy=v=>y1-(Math.max(ymin,Math.min(ymax,Number(v)||0))-ymin)/(ymax-ymin)*(y1-y0);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio','none');
  svg.classList.add('trajectory-svg');

  // Gradient definitions for subtle area shading.
  const defs=document.createElementNS(ns,'defs');
  const grad=document.createElementNS(ns,'linearGradient');
  grad.setAttribute('id','trajectoryAreaGrad'); grad.setAttribute('x1','0');grad.setAttribute('y1','0');grad.setAttribute('x2','0');grad.setAttribute('y2','1');
  const stop1=document.createElementNS(ns,'stop'); stop1.setAttribute('offset','0%'); stop1.setAttribute('class','area-stop-top');
  const stop2=document.createElementNS(ns,'stop'); stop2.setAttribute('offset','100%'); stop2.setAttribute('class','area-stop-bottom');
  grad.append(stop1,stop2); defs.appendChild(grad); svg.appendChild(defs);

  // Grid and adaptive Y labels.
  for(let i=0;i<5;i++){
    const v=ymin+(ymax-ymin)*(1-i/4), y=sy(v);
    const grid=document.createElementNS(ns,'line');
    grid.setAttribute('x1',x0);grid.setAttribute('x2',x1);grid.setAttribute('y1',y);grid.setAttribute('y2',y);
    grid.classList.add('chart-grid');svg.appendChild(grid);
    const text=document.createElementNS(ns,'text');text.setAttribute('x',x0-10);text.setAttribute('y',y+4);
    text.setAttribute('text-anchor','end');text.textContent=v.toFixed(2);text.classList.add('chart-axis');svg.appendChild(text);
  }

  // Threshold remains canonical and visually distinct.
  const thPts=hybrid.map((d,i)=>`${sx(i)},${sy(d.threshold)}`).join(' ');
  const th=document.createElementNS(ns,'polyline');th.setAttribute('points',thPts);th.classList.add('threshold-line');svg.appendChild(th);
  const thLabel=document.createElementNS(ns,'text');thLabel.setAttribute('x',x1);
  thLabel.setAttribute('y',Math.max(18,sy(hybrid[hybrid.length-1].threshold)-8));
  thLabel.setAttribute('text-anchor','end');thLabel.textContent=`THRESHOLD ${Number(hybrid[hybrid.length-1].threshold).toFixed(2)}`;
  thLabel.classList.add('threshold-label');svg.appendChild(thLabel);

  const basePts=hybrid.map((d,i)=>`${sx(i)},${sy(d.trajectory)}`).join(' ');
  const displayPts=hybrid.map((d,i)=>`${sx(i)},${sy(d.displayValue)}`).join(' ');

  if(hybrid.length>1){
    const area=document.createElementNS(ns,'polygon');
    area.setAttribute('points',`${displayPts} ${x1},${y1} ${x0},${y1}`);
    area.classList.add('trajectory-area');svg.appendChild(area);

    // Draw each segment separately so direction/state is immediately visible.
    for(let i=1;i<hybrid.length;i++){
      const seg=document.createElementNS(ns,'line');
      seg.setAttribute('x1',sx(i-1));seg.setAttribute('y1',sy(hybrid[i-1].displayValue));
      seg.setAttribute('x2',sx(i));seg.setAttribute('y2',sy(hybrid[i].displayValue));
      const current=Number(hybrid[i].displayValue), threshold=Number(hybrid[i].threshold);
      const previous=Number(hybrid[i-1].displayValue);
      seg.classList.add(current>=threshold?'segment-up':'segment-down');
      if(Math.abs(current-previous)<0.001) seg.classList.add('segment-flat');
      svg.appendChild(seg);
    }

    // Slow trajectory baseline: subtle, so the event impulses don't erase it.
    const baseLine=document.createElementNS(ns,'polyline');
    baseLine.setAttribute('points',basePts);baseLine.classList.add('trajectory-baseline');svg.appendChild(baseLine);
  }

  hybrid.forEach((d,i)=>{
    const c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',sx(i));c.setAttribute('cy',sy(d.displayValue));
    const impact=Number(d.event_impact||0);
    c.setAttribute('r',Math.max(3.5,Math.min(7,4+Math.abs(impact)*10)));
    c.classList.add(Number(d.displayValue)>=Number(d.threshold)?'point-up':'point-down');
    if(Math.abs(impact)>0.005)c.classList.add('event-point');
    c.setAttribute('tabindex','0');c.setAttribute('role','img');
    c.setAttribute('aria-label',`${formatPointDate(d.recorded_at,currentRange)}, value ${Number(d.displayValue).toFixed(3)}, trajectory ${Number(d.trajectory).toFixed(3)}`);
    c.addEventListener('mouseenter',()=>showChartTooltip({...d,displayValue:d.displayValue},c));
    c.addEventListener('focus',()=>showChartTooltip({...d,displayValue:d.displayValue},c));
    c.addEventListener('mouseleave',hideChartTooltip);c.addEventListener('blur',hideChartTooltip);
    svg.appendChild(c);
  });

  const start=document.createElementNS(ns,'text');start.setAttribute('x',x0);start.setAttribute('y',H-12);
  start.textContent=formatPointDate(hybrid[0].recorded_at,currentRange);start.classList.add('chart-axis');svg.appendChild(start);
  const end=document.createElementNS(ns,'text');end.setAttribute('x',x1);end.setAttribute('y',H-12);end.setAttribute('text-anchor','end');
  end.textContent=formatPointDate(hybrid[hybrid.length-1].recorded_at,currentRange);end.classList.add('chart-axis');svg.appendChild(end);

  host.appendChild(svg);
  requestAnimationFrame(()=>host.classList.add('chart-ready'));
  updateChartStatus(hybrid[0],hybrid[hybrid.length-1]);
}

function updateChartStatus(first,last){
  const el=document.getElementById('trajectory-change'); if(!el)return;
  if(!first||!last||first===last){el.textContent='—';el.className='hero-change';return;}
  const a=Number(first.trajectory),b=Number(last.trajectory),delta=b-a;
  const pct=a>0?(delta/a)*100:null, sign=delta>=0?'▲':'▼';
  el.textContent=`${sign} ${Math.abs(delta).toFixed(3)}${pct===null?'':` · ${Math.abs(pct).toFixed(1)}%`} · ${timeframeLabel(currentRange)}`;
  el.className='hero-change '+(delta>=0?'up':'down');
}

function labelForDate(s){const d=new Date(s+"T00:00:00Z");return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:currentRange==="ALL"?"numeric":undefined});}
function showChartTooltip(d,node){
  const t=document.getElementById("chart-tooltip");t.hidden=false;
  t.innerHTML=`<strong>${escapeHtml(formatPointDate(d.recorded_at,currentRange))}</strong><span>value <b>${Number(d.displayValue??d.trajectory).toFixed(3)}</b></span><span>trajectory ${Number(d.trajectory).toFixed(3)}</span><span>threshold ${Number(d.threshold).toFixed(3)}</span>${Number(d.event_impact||0)!==0?`<span>event ${Number(d.event_impact)>0?"+":""}${Number(d.event_impact).toFixed(3)}</span>`:""}<span>${Number(d.displayValue??d.trajectory)>=Number(d.threshold)?"above threshold":"below threshold"}</span>${d.note?`<small>${escapeHtml(d.note)}</small>`:""}`;
  const r=node.getBoundingClientRect(),host=document.getElementById("trajectory-chart").getBoundingClientRect();
  t.style.left=`${Math.max(8,Math.min(host.width-170,r.left-host.left+10))}px`;t.style.top=`${Math.max(8,r.top-host.top-8)}px`;
}
function hideChartTooltip(){document.getElementById("chart-tooltip").hidden=true;}

document.getElementById("range-tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-range]");if(!b)return;document.querySelectorAll("#range-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentRange=b.dataset.range;renderTrajectoryChart(lastHistory);});

function renderDimensions(dimensions){
  const c=document.getElementById("dimension-list");c.innerHTML="";
  for(const d of dimensions){const row=document.createElement("div");row.className="dim-row";row.innerHTML=`<span class="dim-name">${escapeHtml(d.name)}</span><span class="dim-value">${Number(d.value).toFixed(3)}</span><div class="dim-bar-track"><div class="dim-bar-fill" style="width:${Math.max(0,Math.min(100,Number(d.value)*100))}%"></div></div>`;c.appendChild(row);}
}
function escapeHtml(str){const div=document.createElement("div");div.textContent=String(str??"");return div.innerHTML;}

// ---------- Events ----------
async function loadEvents(){
  const res=await fetch("/api/events?limit=50",{cache:"no-store"});if(!res.ok)return;const {events=[]}=await res.json();const c=document.getElementById("events-list");c.innerHTML="";
  if(!events.length){c.innerHTML=`<p class="status-text">No events yet — log your first update above.</p>`;return;}
  for(const ev of events){const row=document.createElement("div");row.className="event-row";const cc=ev.credit>0?"pos":ev.credit<0?"neg":"";row.innerHTML=`<span class="ev-dim">${escapeHtml(ev.dimension)}</span><span class="ev-type">${escapeHtml(ev.event_type)}</span><span class="ev-explanation">${escapeHtml(ev.explanation||ev.raw_text||"")}</span><span class="ev-credit ${cc}">${ev.credit>=0?"+":""}${Number(ev.credit).toFixed(3)}</span>`;c.appendChild(row);}
}

// ---------- LLM ----------
document.getElementById("llm-submit").addEventListener("click",async()=>{
  const text=document.getElementById("llm-text").value.trim(),statusEl=document.getElementById("llm-status"),btn=document.getElementById("llm-submit");if(!text)return;btn.disabled=true;statusEl.textContent="Interpreting…";
  try{const res=await fetch("/api/entries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,mode:"llm"})});const data=await res.json();if(!res.ok){statusEl.textContent=data.error||`Request failed (${res.status}).`;}else if(data.error){statusEl.textContent=data.error;}else{statusEl.textContent=`Applied ${data.eventsApplied} event(s). Trajectory → ${Number(data.trajectory).toFixed(3)}`;document.getElementById("llm-text").value="";await refreshAll();}}catch{statusEl.textContent="Could not reach the server.";}finally{btn.disabled=false;}
});

// ---------- Manual ----------
function populateDimensionSelect(){const s=document.getElementById("m-dimension");s.innerHTML=DIMENSION_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");}
function bindSliders(){document.querySelectorAll(".slider-grid input").forEach(i=>{const out=i.nextElementSibling;const sync=()=>out.textContent=Number(i.value).toFixed(2);i.addEventListener("input",sync);sync();});}
let manualBatch=[];
document.getElementById("mode-llm").addEventListener("click",()=>toggleMode("llm"));document.getElementById("mode-manual").addEventListener("click",()=>toggleMode("manual"));
function toggleMode(mode){document.getElementById("llm-mode").hidden=mode!=="llm";document.getElementById("manual-mode").hidden=mode!=="manual";document.getElementById("mode-llm").classList.toggle("active",mode==="llm");document.getElementById("mode-manual").classList.toggle("active",mode==="manual");}
document.getElementById("m-add-btn").addEventListener("click",()=>{const get=id=>Number(document.getElementById(id).value);manualBatch.push({dimension:document.getElementById("m-dimension").value,type:document.getElementById("m-type").value,magnitude:get("m-magnitude"),quality:get("m-quality"),evidence:get("m-evidence"),significance:get("m-significance"),persistence:get("m-persistence"),alignment:get("m-alignment"),explanation:document.getElementById("m-explanation").value});renderBatch();});
function renderBatch(){document.getElementById("manual-batch").innerHTML=manualBatch.map((e,i)=>`<div>${i+1}. ${escapeHtml(e.dimension)} · ${escapeHtml(e.type)} · ${e.magnitude.toFixed(2)}</div>`).join("");}
document.getElementById("m-submit-btn").addEventListener("click",async()=>{if(!manualBatch.length)return;const status=document.getElementById("manual-status");const btn=document.getElementById("m-submit-btn");btn.disabled=true;try{const res=await fetch("/api/entries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"manual",events:manualBatch})});const data=await res.json();if(!res.ok)status.textContent=data.error||`Request failed (${res.status}).`;else{status.textContent=`Applied ${data.eventsApplied} event(s). Trajectory → ${Number(data.trajectory).toFixed(3)}`;manualBatch=[];renderBatch();await refreshAll();}}catch{status.textContent="Could not reach the server.";}finally{btn.disabled=false;}});

// ---------- Import / export ----------
document.getElementById("export-btn").addEventListener("click",async()=>{const res=await fetch("/api/export");if(!res.ok)return;const blob=await res.blob();const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="life-progress-backup.json";a.click();URL.revokeObjectURL(a.href);});
document.getElementById("import-btn").addEventListener("click",()=>document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;const text=await file.text();const res=await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:text});alert(res.ok?"Backup imported successfully.":"Import failed.");if(res.ok)await refreshAll();e.target.value="";});

populateDimensionSelect();bindSliders();checkSession();
