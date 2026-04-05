import { useState, useMemo, useCallback } from "react";

const DEF = {
  solarModule:450, solarRacking:120, solarBOP:180, solarInterconnect:80, solarEPC:50, solarSoft:40,
  windTSA:750, windFoundation:180, windBOP:200, windInterconnect:100, windEPC:80, windSoft:50,
  gasTurbine:550, gasBOP:120, gasPipeline:40, gasElectrical:60, gasSCR:30, gasEPC:60, gasSoft:40,
  battCells:150, battBOP:80, battEPC:50, battSite:20, upsCapex:150,
  solarCF:0.27, windCF:0.38, gasCF:0.90, batteryRTE:0.87, batteryDuration:4, solarWindCorr:0.15,
  gasPrice:3.50, heatRate:6.6, gasVol:0.35, fuelEsc:0.025,
  solarOM:12, windOM:28, gasOMFixed:18, gasOMVar:3.5, battOM:6, omEsc:0.02,
  wacc:0.08, life:25, solarITC:0.30, windPTC:26, battITC:0.30, loadMW:1000,
};

const GAS_EQUIP = {
  hframe: { name:"H-Frame Combined Cycle", short:"H-Frame", unitMW:400, heatRate:5.8, capex:850, startMin:180, voltage:"345kV", color:"#6366f1" },
  fframe: { name:"F-Frame Combined Cycle", short:"F-Frame", unitMW:200, heatRate:6.2, capex:900, startMin:120, voltage:"138kV", color:"#f97316" },
  aero:   { name:"Aeroderivative Simple Cycle", short:"Aero", unitMW:50, heatRate:8.8, capex:1100, startMin:10, voltage:"34.5kV", color:"#06b6d4" },
  recip:  { name:"Reciprocating Engine", short:"Recip", unitMW:20, heatRate:7.8, capex:950, startMin:5, voltage:"13.8kV", color:"#22c55e" },
};
const GAS_PRESETS = {
  baseload: {
    name: "Baseload Combined Cycle",
    desc: "3× H-Frame (1,200 MW) — Lowest fuel cost, slow start",
    equipment: { hframe: 3, fframe: 0, aero: 0, recip: 0 },
    totalMW: 1200, weightedHR: 5.8, weightedCapex: 850, avgStartup: 180,
  },
  flexible: {
    name: "Flexible Combined Cycle",
    desc: "6× F-Frame (1,200 MW) — Balanced efficiency & flexibility",
    equipment: { hframe: 0, fframe: 6, aero: 0, recip: 0 },
    totalMW: 1200, weightedHR: 6.2, weightedCapex: 900, avgStartup: 120,
  },
  peaker: {
    name: "Fast Peaker Fleet",
    desc: "24× Aeroderivative (1,200 MW) — 10-min start, higher fuel",
    equipment: { hframe: 0, fframe: 0, aero: 24, recip: 0 },
    totalMW: 1200, weightedHR: 8.8, weightedCapex: 1100, avgStartup: 10,
  },
  ultraflex: {
    name: "Ultra-Flexible Recips",
    desc: "60× Reciprocating (1,200 MW) — 5-min start, most modular",
    equipment: { hframe: 0, fframe: 0, aero: 0, recip: 60 },
    totalMW: 1200, weightedHR: 7.8, weightedCapex: 950, avgStartup: 5,
  },
  hybrid_ha: {
    name: "Hybrid: H-Frame + Aero",
    desc: "2× H-Frame + 8× Aero (1,200 MW) — Efficiency + fast backup",
    equipment: { hframe: 2, fframe: 0, aero: 8, recip: 0 },
    totalMW: 1200, weightedHR: 6.5, weightedCapex: 900, avgStartup: 65,
  },
  hybrid_fr: {
    name: "Hybrid: F-Frame + Recip",
    desc: "4× F-Frame + 20× Recip (1,200 MW) — Flexible + backup-ready",
    equipment: { hframe: 0, fframe: 4, aero: 0, recip: 20 },
    totalMW: 1200, weightedHR: 6.7, weightedCapex: 915, avgStartup: 45,
  },
};

const SCEN = [
  {id:"sb",label:"Solar + Battery",short:"S+B",color:"#D4A026",sources:["solar","battery"]},
  {id:"wb",label:"Wind + Battery",short:"W+B",color:"#3D7EC7",sources:["wind","battery"]},
  {id:"gu",label:"Gas + UPS",short:"G+U",color:"#C24B4B",sources:["gas"]},
  {id:"swb",label:"Solar+Wind+Batt",short:"SW+B",color:"#4A9960",sources:["solar","wind","battery"]},
  {id:"swgb",label:"Sol+Wind+Gas+Batt",short:"SWG+B",color:"#8B5DB8",sources:["solar","wind","gas","battery"]},
];
// Config-specific bull/bear: what's best/worst for EACH config
const SCENARIO_INPUTS = {
  sb: {
    label: "Solar + Battery",
    inputs: [
      { key:"solarModule", label:"Solar Module", unit:"$/kW",  base:450, bull:280, bear:700 },
      { key:"battCells",   label:"Batt Cells",   unit:"$/kWh", base:150, bull:80,  bear:350 },
      { key:"solarCF",     label:"Solar CF",      unit:"%",     base:0.27,bull:0.33,bear:0.19 },
      { key:"solarITC",    label:"Solar ITC",     unit:"%",     base:0.30,bull:0.50,bear:0.00 },
      { key:"battITC",     label:"Batt ITC",      unit:"%",     base:0.30,bull:0.50,bear:0.00 },
      { key:"wacc",        label:"WACC",           unit:"%",     base:0.08,bull:0.06,bear:0.13 },
    ],
    bullLabel: "Cheap panels + storage, high IRA, strong irradiance",
    bearLabel: "Tariffs on modules, no IRA, poor site, high rates",
  },
  wb: {
    label: "Wind + Battery",
    inputs: [
      { key:"windTSA",   label:"Wind TSA",     unit:"$/kW",  base:750, bull:550, bear:1050 },
      { key:"battCells",  label:"Batt Cells",   unit:"$/kWh", base:150, bull:80,  bear:350 },
      { key:"windCF",     label:"Wind CF",      unit:"%",     base:0.38,bull:0.48,bear:0.28 },
      { key:"windPTC",    label:"Wind PTC",     unit:"$/MWh", base:26,  bull:35,  bear:0 },
      { key:"battITC",    label:"Batt ITC",     unit:"%",     base:0.30,bull:0.50,bear:0.00 },
      { key:"wacc",       label:"WACC",          unit:"%",     base:0.08,bull:0.06,bear:0.13 },
    ],
    bullLabel: "Cheap turbines, great wind site, full PTC",
    bearLabel: "Expensive turbines, poor site, no PTC, high rates",
  },
  gu: {
    label: "Gas + UPS",
    inputs: [
      { key:"gasPrice",   label:"Gas Price",    unit:"$/MMBtu",base:3.50,bull:2.00,bear:8.00 },
      { key:"heatRate",   label:"Heat Rate",    unit:"MMBtu/MWh",base:6.6,bull:6.0,bear:8.5 },
      { key:"gasTurbine", label:"Gas Plant",   unit:"$/kW",  base:550, bull:450, bear:1200 },
      { key:"gasBOP",     label:"Gas BOP",      unit:"$/kW",  base:120, bull:80,  bear:400 },
      { key:"gasPipeline",label:"Gas Lateral",   unit:"$/kW",  base:40,  bull:15,  bear:200 },
      { key:"wacc",       label:"WACC",          unit:"%",     base:0.08,bull:0.06,bear:0.13 },
    ],
    bullLabel: "Cheap gas ($2 HH), brownfield site, efficient CC",
    bearLabel: "Gas spike ($8 HH), greenfield w/ long lateral, peaker HR",
  },
  swb: {
    label: "Solar + Wind + Battery",
    inputs: [
      { key:"solarModule",label:"Solar Module",  unit:"$/kW",  base:450, bull:280, bear:700 },
      { key:"windTSA",    label:"Wind TSA",      unit:"$/kW",  base:750, bull:550, bear:1050 },
      { key:"battCells",  label:"Batt Cells",    unit:"$/kWh", base:150, bull:80,  bear:350 },
      { key:"solarCF",    label:"Solar CF",       unit:"%",     base:0.27,bull:0.33,bear:0.19 },
      { key:"windCF",     label:"Wind CF",        unit:"%",     base:0.38,bull:0.48,bear:0.28 },
      { key:"solarITC",   label:"Solar ITC",      unit:"%",     base:0.30,bull:0.50,bear:0.00 },
      { key:"windPTC",    label:"Wind PTC",       unit:"$/MWh", base:26,  bull:35,  bear:0 },
      { key:"wacc",       label:"WACC",            unit:"%",     base:0.08,bull:0.06,bear:0.13 },
    ],
    bullLabel: "Cheap renewables + storage, full IRA, great sites",
    bearLabel: "Expensive equipment, no IRA, poor sites, high rates",
  },
  swgb: {
    label: "Hybrid (Sol+Wind+Gas+Batt)",
    inputs: [
      { key:"solarModule",label:"Solar Module",  unit:"$/kW",  base:450, bull:280, bear:700 },
      { key:"windTSA",    label:"Wind TSA",      unit:"$/kW",  base:750, bull:550, bear:1050 },
      { key:"gasPrice",   label:"Gas Price",     unit:"$/MMBtu",base:3.50,bull:2.00,bear:8.00 },
      { key:"gasTurbine", label:"Gas Plant",    unit:"$/kW",  base:550, bull:450, bear:1200 },
      { key:"battCells",  label:"Batt Cells",    unit:"$/kWh", base:150, bull:80,  bear:350 },
      { key:"solarITC",   label:"Solar ITC",      unit:"%",     base:0.30,bull:0.50,bear:0.00 },
      { key:"windPTC",    label:"Wind PTC",       unit:"$/MWh", base:26,  bull:35,  bear:0 },
      { key:"wacc",       label:"WACC",            unit:"%",     base:0.08,bull:0.06,bear:0.13 },
    ],
    bullLabel: "Cheap everything, full IRA, low gas backup cost",
    bearLabel: "All inputs stressed: expensive capex, high gas, no IRA",
  },
};


function computeGasMetrics(gasEquipCounts, totalGasMW) {
  if (totalGasMW <= 0) return { weightedHeatRate: 6.6, weightedCapex: 550, avgStartup: 60 };
  let totHR = 0, totCapex = 0, totStart = 0, totMW = 0;
  Object.entries(gasEquipCounts).forEach(([type, count]) => {
    if (count > 0 && GAS_EQUIP[type]) {
      const eq = GAS_EQUIP[type];
      const mw = count * eq.unitMW;
      totHR += mw * eq.heatRate;
      totCapex += mw * eq.capex;
      totStart += mw * eq.startMin;
      totMW += mw;
    }
  });
  if (totMW === 0) return { weightedHeatRate: 6.6, weightedCapex: 550, avgStartup: 60, actualMW: 0 };
  return { weightedHeatRate: totHR/totMW, weightedCapex: totCapex/totMW, avgStartup: totStart/totMW, actualMW: totMW };
}

function crf(r,n){return r===0?1/n:(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);}

// ============ SIZING: targets 100% reliability ============
// Oversized so the 72hr dispatch sim never drops load
function baseSize(p, id) {
  const L = p.loadMW;
  const rte = p.batteryRTE;
  switch(id) {
    case "sb": return { solarMW:Math.ceil(L*4.8/rte), windMW:0, gasMW:0, battMW:L*1.15, battMWh:L*20/rte, upsMWh:0 };
    case "wb": return { solarMW:0, windMW:Math.ceil(L*3.5/rte), gasMW:0, battMW:L*1.15, battMWh:L*18/rte, upsMWh:0 };
    case "gu": return { solarMW:0, windMW:0, gasMW:Math.ceil(L*1.2), battMW:0, battMWh:0, upsMWh:L*0.25 };
    case "swb": return { solarMW:Math.ceil(L*2.0), windMW:Math.ceil(L*2.2), gasMW:0, battMW:L*1.1, battMWh:L*14/rte, upsMWh:0 };
    case "swgb": return { solarMW:Math.ceil(L*0.65*0.4/p.solarCF*1.1), windMW:Math.ceil(L*0.65*0.6/p.windCF*1.1), gasMW:Math.ceil(L*0.6), battMW:L*0.35, battMWh:L*0.35*p.batteryDuration, upsMWh:0 };
    default: return {};
  }
}

function gasFrac(id) { return id==="gu"?1:id==="swgb"?0.35:0; }

function computeLCOE(p, sz, id) {
  const L=p.loadMW, annMWh=L*8760;
  const sC=p.solarModule+p.solarRacking+p.solarBOP+p.solarInterconnect+p.solarEPC+p.solarSoft;
  const wC=p.windTSA+p.windFoundation+p.windBOP+p.windInterconnect+p.windEPC+p.windSoft;
  const gC=p.gasTurbine+p.gasBOP+p.gasPipeline+p.gasElectrical+p.gasSCR+p.gasEPC+p.gasSoft;
  const bC=p.battCells+p.battBOP+p.battEPC+p.battSite;
  const CRF=crf(p.wacc,p.life);
  const gf=gasFrac(id);
  const gS=sz.solarMW*sC*1000,gW=sz.windMW*wC*1000,gG=sz.gasMW*gC*1000;
  const gB=sz.battMWh*bC*1000,gU=(sz.upsMWh||0)*p.upsCapex*1000;
  const iS=gS*p.solarITC,iB=gB*p.battITC;
  const net=gS+gW+gG+gB+gU-iS-iB;
  const annC=net*CRF;
  const annOM=(sz.solarMW*p.solarOM+sz.windMW*p.windOM+sz.gasMW*p.gasOMFixed+(sz.battMW||0)*p.battOM)*1000+gf*annMWh*p.gasOMVar;
  const annF=gf*annMWh*p.gasPrice*p.heatRate;
  const annPTC=sz.windMW*p.windCF*8760*p.windPTC*Math.min(10,p.life)/p.life;
  const lcC=annC/annMWh,lcO=annOM/annMWh,lcF=annF/annMWh,lcP=annPTC/annMWh;
  const lcoe=lcC+lcO+lcF-lcP;
  const fp=lcoe>0?lcF/lcoe:0;
  const p10=lcoe-lcF+lcF*Math.max(0.3,1-1.28*p.gasVol),p90=lcoe-lcF+lcF*(1+1.28*p.gasVol);
  return { ...sz, netCapex:net, lcoe, lcoeCapex:lcC, lcoeOM:lcO, lcoeFuel:lcF, lcoePTC:lcP, p10, p90, spread:p90-p10, fuelPct:fp,
    overbuild:(sz.solarMW+sz.windMW+sz.gasMW)/L,
    capexBreakdown:{solar:gS-iS,wind:gW,gas:gG,battery:gB-iB,ups:gU},
    gasFrac:gf };
}

// ============ DISPATCH SIM ============
function seededRng(s){return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646;};}

function dispatch(p, sz, hours=72) {
  const L=p.loadMW, rng=seededRng(42);
  const solarRaw=[], windRaw=[];
  for(let h=0;h<hours;h++){
    const hod=h%24;
    if(hod>=6&&hod<=19){const pk=12.5,sig=3;solarRaw.push(Math.exp(-0.5*Math.pow((hod-pk)/sig,2))*(0.65+0.35*rng()));}
    else solarRaw.push(0);
  }
  const sAvg=solarRaw.reduce((a,b)=>a+b,0)/hours;
  const sScale=sAvg>0?p.solarCF/sAvg:0;

  let wSt=0.4+0.2*rng();
  for(let h=0;h<hours;h++){
    const hod=h%24,diurnal=1+0.15*Math.cos((hod-3)*Math.PI/12);
    wSt=wSt*0.92+(rng()*0.6+0.2)*0.08;
    const day=Math.floor(h/24),ev=day===1?0.5:day===2?1.35:1;
    windRaw.push(Math.max(0,Math.min(1,wSt*diurnal*ev)));
  }
  const wAvg=windRaw.reduce((a,b)=>a+b,0)/hours;
  const wScale=wAvg>0?p.windCF/wAvg:0;

  let soc=(sz.battMWh||0)*0.5;
  const maxSoc=sz.battMWh||0;
  const data=[];
  let totCurt=0,totUnmet=0,totSol=0,totWnd=0,totGas=0,totBD=0;

  for(let h=0;h<hours;h++){
    const sol=sz.solarMW>0?Math.min(sz.solarMW,sz.solarMW*solarRaw[h]*sScale):0;
    const wnd=sz.windMW>0?Math.min(sz.windMW,sz.windMW*windRaw[h]*wScale):0;
    const ren=sol+wnd;
    let gas=0,bC=0,bD=0,curt=0,unmet=0;
    const def=L-ren;
    if(def>0){
      if(sz.gasMW>0)gas=Math.min(sz.gasMW,def);
      const rem=def-gas;
      if(rem>0&&soc>0){bD=Math.min(rem,sz.battMW||0,soc);soc-=bD;}
      unmet=Math.max(0,rem-bD);
    } else {
      const sur=-def;
      if(soc<maxSoc&&maxSoc>0){bC=Math.min(sur,sz.battMW||0,(maxSoc-soc)/p.batteryRTE);soc+=bC*p.batteryRTE;}
      curt=sur-bC;
    }
    totSol+=sol;totWnd+=wnd;totGas+=gas;totBD+=bD;totCurt+=curt;totUnmet+=unmet;
    data.push({hour:h,sol,wnd,gas,bD,bC,curt,unmet,soc,load:L});
  }
  return {data, stats:{
    reliability:(1-totUnmet/(L*hours))*100, curtailPct:totCurt/(totSol+totWnd+totGas+.001)*100,
    maxSoc, peakSol:Math.max(...data.map(d=>d.sol)), peakWnd:Math.max(...data.map(d=>d.wnd)),
    totUnmet, avgGas:totGas/hours,
  }};
}

function tornadoData(p, gasConfig){
  // Use gasConfig values for heat rate and gas capex
  const pWithGas = {...p, heatRate: gasConfig.weightedHR};
  const vars=[
    {key:"gasPrice",label:"Gas Price",u:"$/MMBtu",r:0.5},{key:"gasTurbine",label:"Gas CapEx",u:"$/kW",r:0.5},
    {key:"heatRate",label:"Heat Rate",u:"MMBtu/MWh",r:0.25},{key:"wacc",label:"WACC",u:"%",r:0.3},
    {key:"battCells",label:"Batt Cells",u:"$/kWh",r:0.5},{key:"solarModule",label:"Solar Module",u:"$/kW",r:0.4},
    {key:"windTSA",label:"Wind TSA",u:"$/kW",r:0.4},{key:"solarCF",label:"Solar CF",u:"%",r:0.25},
    {key:"windCF",label:"Wind CF",u:"%",r:0.25},{key:"solarITC",label:"Solar ITC",u:"%",r:1.0},
  ];
  return vars.map(v=>{
    const base = pWithGas[v.key];
    const lo={...pWithGas,[v.key]:base*(1-v.r)},hi={...pWithGas,[v.key]:base*(1+v.r)};
    const loR={},hiR={};
    SCEN.forEach(s=>{
      const hasGas = s.sources.includes("gas");
      // For gas scenarios, use the modified params; for non-gas, use original p
      const loEff = hasGas ? lo : {...p,[v.key]:p[v.key]*(1-v.r)};
      const hiEff = hasGas ? hi : {...p,[v.key]:p[v.key]*(1+v.r)};
      loR[s.id]=computeLCOE(loEff,baseSize(loEff,s.id),s.id);
      hiR[s.id]=computeLCOE(hiEff,baseSize(hiEff,s.id),s.id);
    });
    return{...v,loVal:lo[v.key],hiVal:hi[v.key],loR,hiR};
  });
}

function fmt$(v){return v>=1e9?`$${(v/1e9).toFixed(1)}B`:v>=1e6?`$${(v/1e6).toFixed(0)}M`:`$${(v/1e3).toFixed(0)}K`;}
const F={m:"'DM Mono',monospace",s:"'DM Sans',sans-serif"};

function Sl({label,value,onChange,min,max,step,unit=""}){
  return(<div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:1}}>
      <span style={{fontSize:10,color:"#8B95A5",fontFamily:F.m}}>{label}</span>
      <span style={{fontSize:11,color:"#E8E6E1",fontWeight:600,fontFamily:F.m}}>
        {typeof value==="number"&&value<1&&(unit==="%")&&value>0?(value*100).toFixed(1):value}{unit}
      </span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(parseFloat(e.target.value))} style={{width:"100%",height:2,accentColor:"#D4A026"}}/>
  </div>);
}

function CxP({title,items,p,update,color}){
  const total=items.reduce((s,i)=>s+p[i.key],0);
  return(<div style={{background:"#12151C",border:"1px solid #1E2330",borderRadius:5,padding:12,marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
      <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color,fontFamily:F.m}}>{title}</span>
      <span style={{fontSize:11,fontWeight:700,color:"#E8E6E1",fontFamily:F.m}}>${total}/kW</span>
    </div>
    <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",marginBottom:8}}>
      {items.map((it,i)=>(<div key={it.key} style={{width:`${(p[it.key]/total)*100}%`,background:color,opacity:0.4+(i*0.12),minWidth:1}} title={`${it.label}: $${p[it.key]}`}/>))}
    </div>
    {items.map(it=>(<Sl key={it.key} label={it.label} value={p[it.key]} onChange={v=>update(it.key,v)} min={it.min} max={it.max} step={it.step} unit={` ${it.unit}`}/>))}
  </div>);
}

// ============ PROFILE CHART ============
function PChart({profile,p,height=220}){
  const{data,stats}=profile;
  const W=720,H=height,PD={t:16,r:12,b:32,l:48};
  const cw=W-PD.l-PD.r,ch=H-PD.t-PD.b;
  const hrs=data.length, L=p.loadMW;
  const maxGen=Math.max(L*1.4,Math.max(...data.map(d=>d.sol+d.wnd+d.gas+d.bD))*1.1);
  const x=h=>PD.l+(h/(hrs-1))*cw, y=v=>PD.t+ch-(v/maxGen)*ch;
  const layers=[{k:"gas",color:"#C24B4B"},{k:"wnd",color:"#3D7EC7"},{k:"sol",color:"#D4A026"},{k:"bD",color:"#2D8C6F"}].filter(l=>data.some(d=>d[l.k]>0));
  const stk=data.map(d=>{let c=0;const v={};layers.forEach(l=>{v[l.k+"_b"]=c;c+=d[l.k];v[l.k+"_t"]=c;});return v;});
  function ap(tk,bk){let p="";for(let i=0;i<hrs;i++)p+=(i===0?"M":"L")+`${x(i).toFixed(1)},${y(stk[i][tk]).toFixed(1)}`;for(let i=hrs-1;i>=0;i--)p+=`L${x(i).toFixed(1)},${y(stk[i][bk]).toFixed(1)}`;return p+"Z";}
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}>
      {[0,.25,.5,.75,1].map(f=><g key={f}><line x1={PD.l} x2={W-PD.r} y1={y(maxGen*f)} y2={y(maxGen*f)} stroke="#1E2330" strokeWidth={.5}/><text x={PD.l-4} y={y(maxGen*f)+3} textAnchor="end" fill="#6B7280" fontSize={7} fontFamily={F.m}>{(maxGen*f/1000).toFixed(1)}GW</text></g>)}
      {[24,48].filter(h=>h<hrs).map(h=><line key={h} x1={x(h)} x2={x(h)} y1={PD.t} y2={H-PD.b} stroke="#2A3040" strokeWidth={1} strokeDasharray="3,3"/>)}
      {Array.from({length:7},(_,i)=>i*12).filter(h=>h<hrs).map(h=><text key={h} x={x(h)} y={H-PD.b+12} textAnchor="middle" fill="#6B7280" fontSize={7} fontFamily={F.m}>{h%24===0?`Day${Math.floor(h/24)+1}`:`${h%24}:00`}</text>)}
      {layers.map(l=><path key={l.k} d={ap(l.k+"_t",l.k+"_b")} fill={l.color} fillOpacity={.5}/>)}
      {data.map((d,i)=>d.curt>0?<rect key={`c${i}`} x={x(i)-1.5} y={y(L)-(d.curt/maxGen)*ch} width={3} height={(d.curt/maxGen)*ch} fill="#E74C3C" fillOpacity={.25}/>:null)}
      {data.map((d,i)=>d.unmet>0?<rect key={`u${i}`} x={x(i)-1.5} y={y(L)} width={3} height={(d.unmet/maxGen)*ch} fill="#FFD700" fillOpacity={.6}/>:null)}
      <line x1={PD.l} x2={W-PD.r} y1={y(L)} y2={y(L)} stroke="#E8E6E1" strokeWidth={1.5} strokeDasharray="6,3"/>
      <text x={W-PD.r+2} y={y(L)+3} fill="#E8E6E1" fontSize={7} fontFamily={F.m}>LOAD</text>
      {layers.map((l,i)=><g key={l.k} transform={`translate(${PD.l+i*90},${H-6})`}><rect x={0} y={-4} width={6} height={6} fill={l.color} rx={1}/><text x={9} y={2} fill="#9CA3AF" fontSize={7} fontFamily={F.m}>{l.k==="bD"?"Batt":l.k==="sol"?"Solar":l.k==="wnd"?"Wind":"Gas"}</text></g>)}
    </svg>
  );
}


// ============ GAS CONFIG PRESET SELECTOR ============
function GasPresetPanel({gasPreset, setGasPreset, gasConfig, gasMetrics}) {
  const equipColors = {hframe:"#6366f1", fframe:"#f97316", aero:"#06b6d4", recip:"#22c55e"};
  return (
    <div style={{background:"#12151C",border:"1px solid #1E2330",borderRadius:5,padding:12,marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#C24B4B",fontFamily:F.m}}>GAS PLANT CONFIG</span>
        <span style={{fontSize:10,color:"#E8E6E1",fontFamily:F.m}}>{gasMetrics.actualMW} MW</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
        {Object.entries(GAS_PRESETS).map(([key, preset]) => (
          <div key={key} onClick={()=>setGasPreset(key)} style={{
            padding:"8px 10px", borderRadius:4, cursor:"pointer",
            background: gasPreset===key ? "rgba(194,75,75,0.15)" : "rgba(255,255,255,0.02)",
            border: gasPreset===key ? "1px solid #C24B4B" : "1px solid #1E2330",
          }}>
            <div style={{fontSize:10,color:gasPreset===key?"#E8E6E1":"#9CA3AF",fontWeight:600,fontFamily:F.m}}>{preset.name}</div>
            <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m,marginTop:2}}>{preset.desc}</div>
          </div>
        ))}
      </div>
      <div style={{background:"rgba(0,0,0,0.2)",borderRadius:4,padding:8}}>
        <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Selected Config Details</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:9,fontFamily:F.m}}>
          <div><span style={{color:"#6B7280"}}>Heat Rate:</span> <span style={{color:"#E8A838"}}>{gasConfig.weightedHR} MMBtu/MWh</span></div>
          <div><span style={{color:"#6B7280"}}>Startup:</span> <span style={{color:"#2D8C6F"}}>{gasConfig.avgStartup} min</span></div>
          <div><span style={{color:"#6B7280"}}>CapEx:</span> <span style={{color:"#9CA3AF"}}>from slider</span></div>
          <div><span style={{color:"#6B7280"}}>Capacity:</span> <span style={{color:"#E8E6E1"}}>{gasConfig.totalMW} MW</span></div>
        </div>
        <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
          {Object.entries(gasConfig.equipment).filter(([,c])=>c>0).map(([type,count])=>(
            <span key={type} style={{fontSize:8,padding:"2px 6px",borderRadius:3,background:equipColors[type]+"22",color:equipColors[type],border:`1px solid ${equipColors[type]}44`}}>
              {count}× {GAS_EQUIP[type].short}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ ENHANCED SLD COMPONENT ============
function SLD({configId, sz, p, gasEquip, gasMetrics}) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [showVoltages, setShowVoltages] = useState(true);

  const L = p.loadMW;
  const W = 1100, H = 820;

  const hasSolar = sz.solarMW > 0, hasWind = sz.windMW > 0, hasGas = sz.gasMW > 0, hasBatt = (sz.battMW||0) > 0;
  const solarMW = sz.solarMW || 0, windMW = sz.windMW || 0, gasMW = sz.gasMW || 0, battMW = sz.battMW || 0, battMWh = sz.battMWh || 0;

  // Color scheme by voltage level
  const COLORS = {
    bus500: "#ff6b6b", bus230: "#f0c040", bus138: "#f97316", bus34: "#06b6d4",
    bus13: "#a78bfa", busDC: "#14ffb4", solar: "#D4A026", wind: "#3D7EC7",
    gas: "#C24B4B", battery: "#2D8C6F", wire: "#556677", text: "#8899aa", textBright: "#E8E6E1",
  };

  const BUS_Y = { hv: 100, mv: 280, gen: 480, dc: 640 };
  const busMargin = 60, busWidth = W - busMargin * 2, busStartX = busMargin;

  const Bus = ({x, y, width, color, label, thickness=4}) => (
    <g>
      <line x1={x} y1={y} x2={x+width} y2={y} stroke={color} strokeWidth={thickness} strokeLinecap="round"/>
      {showVoltages && label && <text x={x+width+8} y={y+4} fill={color} fontSize={9} fontFamily={F.m} fontWeight={600} opacity={0.9}>{label}</text>}
    </g>
  );

  const Breaker = ({x, y, size=8, id, label}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <rect x={x-size/2} y={y-size/2} width={size} height={size} fill={isHovered?"#ff8080":"#1E2330"} stroke={isHovered?"#ff6b6b":"#E8E6E1"} strokeWidth={1.5} rx={2}/>
        {isHovered && label && <text x={x+size/2+4} y={y+3} fill="#ff8080" fontSize={7} fontFamily={F.m}>{label}</text>}
      </g>
    );
  };

  const Transformer = ({x, y, label, voltages, id, r=12}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <circle cx={x} cy={y-5} r={r} fill="none" stroke={isHovered?"#ffd060":"#f0c040"} strokeWidth={1.5}/>
        <circle cx={x} cy={y+5} r={r} fill="none" stroke={isHovered?"#ffd060":"#f0c040"} strokeWidth={1.5}/>
        {label && <text x={x+r+6} y={y+3} fill={isHovered?"#ffd060":COLORS.text} fontSize={8} fontFamily={F.m}>{label}</text>}
        {isHovered && voltages && <text x={x+r+6} y={y+13} fill="#667" fontSize={7} fontFamily={F.m}>{voltages}</text>}
      </g>
    );
  };

  const Generator = ({x, y, label, mw, type, id}) => {
    const isHovered = hoveredNode === id;
    const col = type==="solar"?COLORS.solar:type==="wind"?COLORS.wind:type==="gas"?COLORS.gas:COLORS.battery;
    const r = 20;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <circle cx={x} cy={y} r={r} fill={isHovered?col+"22":"rgba(0,0,0,0.3)"} stroke={isHovered?col:col+"88"} strokeWidth={2}/>
        <text x={x} y={y-2} textAnchor="middle" fill={col} fontSize={11} fontWeight={700} fontFamily={F.m}>G</text>
        <text x={x} y={y+9} textAnchor="middle" fill={col+"aa"} fontSize={7} fontFamily={F.m}>{mw}MW</text>
        <text x={x} y={y+r+12} textAnchor="middle" fill={isHovered?col:COLORS.text} fontSize={8} fontWeight={600} fontFamily={F.m}>{label}</text>
        {isHovered && (
          <g><rect x={x-45} y={y+r+18} width={90} height={18} rx={3} fill="rgba(0,0,0,0.85)" stroke={col+"44"}/>
          <text x={x} y={y+r+30} textAnchor="middle" fill={col} fontSize={7} fontFamily={F.m}>
            {type==="gas"?"Heat Rate: "+p.heatRate+" BTU/kWh":type==="solar"?"CF: "+(p.solarCF*100).toFixed(0)+"%":type==="wind"?"CF: "+(p.windCF*100).toFixed(0)+"%":"Duration: "+(battMWh/(battMW||1)).toFixed(1)+"hr"}
          </text></g>
        )}
      </g>
    );
  };

  const SolarArray = ({x, y, mw, id}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <rect x={x-22} y={y-14} width={44} height={28} fill={isHovered?COLORS.solar+"22":"rgba(0,0,0,0.3)"} stroke={isHovered?COLORS.solar:COLORS.solar+"88"} strokeWidth={2} rx={3}/>
        <line x1={x-15} y1={y-8} x2={x-15} y2={y+8} stroke={COLORS.solar} strokeWidth={1}/>
        <line x1={x-5} y1={y-8} x2={x-5} y2={y+8} stroke={COLORS.solar} strokeWidth={1}/>
        <line x1={x+5} y1={y-8} x2={x+5} y2={y+8} stroke={COLORS.solar} strokeWidth={1}/>
        <line x1={x+15} y1={y-8} x2={x+15} y2={y+8} stroke={COLORS.solar} strokeWidth={1}/>
        <text x={x} y={y+24} textAnchor="middle" fill={isHovered?COLORS.solar:COLORS.text} fontSize={8} fontFamily={F.m} fontWeight={600}>PV Array</text>
        <text x={x} y={y+34} textAnchor="middle" fill={COLORS.text} fontSize={7} fontFamily={F.m}>{mw} MW</text>
        {isHovered && <text x={x} y={y+44} textAnchor="middle" fill="#667" fontSize={7} fontFamily={F.m}>CF: {(p.solarCF*100).toFixed(0)}%</text>}
      </g>
    );
  };

  const WindTurbine = ({x, y, mw, id}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <circle cx={x} cy={y} r={18} fill={isHovered?COLORS.wind+"22":"rgba(0,0,0,0.3)"} stroke={isHovered?COLORS.wind:COLORS.wind+"88"} strokeWidth={2}/>
        <circle cx={x} cy={y} r={4} fill={COLORS.wind}/>
        <line x1={x} y1={y-4} x2={x} y2={y-16} stroke={COLORS.wind} strokeWidth={2}/>
        <line x1={x} y1={y} x2={x+12} y2={y+10} stroke={COLORS.wind} strokeWidth={2}/>
        <line x1={x} y1={y} x2={x-12} y2={y+10} stroke={COLORS.wind} strokeWidth={2}/>
        <text x={x} y={y+32} textAnchor="middle" fill={isHovered?COLORS.wind:COLORS.text} fontSize={8} fontFamily={F.m} fontWeight={600}>Wind Farm</text>
        <text x={x} y={y+42} textAnchor="middle" fill={COLORS.text} fontSize={7} fontFamily={F.m}>{mw} MW</text>
        {isHovered && <text x={x} y={y+52} textAnchor="middle" fill="#667" fontSize={7} fontFamily={F.m}>CF: {(p.windCF*100).toFixed(0)}%</text>}
      </g>
    );
  };

  const BatteryBank = ({x, y, mw, mwh, id}) => {
    const isHovered = hoveredNode === id;
    const duration = mw > 0 ? (mwh/mw).toFixed(1) : 0;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <rect x={x-24} y={y-14} width={48} height={28} rx={4} fill={isHovered?COLORS.battery+"22":"rgba(0,0,0,0.3)"} stroke={isHovered?COLORS.battery:COLORS.battery+"88"} strokeWidth={2}/>
        <rect x={x+24} y={y-6} width={4} height={12} rx={1} fill={COLORS.battery}/>
        <text x={x} y={y+4} textAnchor="middle" fill={COLORS.battery} fontSize={9} fontWeight={700} fontFamily={F.m}>BESS</text>
        <text x={x} y={y+28} textAnchor="middle" fill={isHovered?COLORS.battery:COLORS.text} fontSize={8} fontFamily={F.m}>{mw}MW/{(mwh/1000).toFixed(1)}GWh</text>
        {isHovered && <text x={x} y={y+40} textAnchor="middle" fill="#667" fontSize={7} fontFamily={F.m}>{duration}hr duration</text>}
      </g>
    );
  };

  const Inverter = ({x, y, label, id}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <rect x={x-14} y={y-10} width={28} height={20} fill={isHovered?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.3)"} stroke={isHovered?"#E8E6E1":"#9CA3AF"} strokeWidth={1.5} rx={3}/>
        <text x={x} y={y+4} textAnchor="middle" fill="#E8E6E1" fontSize={7} fontFamily={F.m}>{label||"INV"}</text>
        {isHovered && <text x={x} y={y+18} textAnchor="middle" fill="#667" fontSize={6} fontFamily={F.m}>DC/AC</text>}
      </g>
    );
  };

  const DataCenter = ({x, y, mw, id}) => {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={()=>setHoveredNode(id)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <polygon points={`${x},${y-28} ${x+36},${y+20} ${x-36},${y+20}`} fill={isHovered?"rgba(249,115,22,0.15)":"rgba(0,0,0,0.3)"} stroke={isHovered?"#f97316":"#f9731688"} strokeWidth={2}/>
        <text x={x} y={y} textAnchor="middle" fill="#f97316" fontSize={10} fontWeight={700} fontFamily={F.m}>DC</text>
        <text x={x} y={y+36} textAnchor="middle" fill={isHovered?"#f97316":COLORS.text} fontSize={9} fontWeight={600} fontFamily={F.m}>Data Center</text>
        <text x={x} y={y+48} textAnchor="middle" fill="#667" fontSize={8} fontFamily={F.m}>{mw} MW Load</text>
      </g>
    );
  };

  const Wire = ({x1, y1, x2, y2, color=COLORS.wire, dashed=false}) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} strokeDasharray={dashed?"4,3":"none"}/>
  );

  const sources = [];
  let xPos = busStartX + 100;
  const numSources = [hasSolar, hasWind, hasBatt].filter(Boolean).length;
  const spacing = numSources > 0 ? (busWidth - 200) / (numSources + 1) : 0;
  if (hasSolar) { sources.push({type:"solar", x: xPos}); xPos += spacing; }
  if (hasWind) { sources.push({type:"wind", x: xPos}); xPos += spacing; }
  if (hasBatt) { sources.push({type:"battery", x: xPos}); }

  const gasX = busStartX + busWidth/2;
  const dcCenterX = W/2;

  return (
    <div style={{padding:16, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:"#E8E6E1", fontFamily:F.m}}>Single Line Diagram — {configId.toUpperCase()}</div>
          <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m}}>Hover elements for details • Total: {(solarMW+windMW+gasMW).toLocaleString()} MW generation + {battMW} MW storage</div>
        </div>
        <label style={{display:"flex", alignItems:"center", gap:6, fontSize:10, color:"#889", cursor:"pointer"}}>
          <input type="checkbox" checked={showVoltages} onChange={()=>setShowVoltages(!showVoltages)} style={{accentColor:"#14ffb4"}}/>
          Voltage Labels
        </label>
      </div>

      <div style={{overflowX:"auto", background:"rgba(0,0,0,0.25)", borderRadius:8, border:"1px solid rgba(255,255,255,0.05)", padding:8}}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
          <defs>
            <pattern id="sld-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#sld-grid)"/>

          <text x={W/2} y={28} textAnchor="middle" fill="#556" fontSize={10} fontFamily={F.m} letterSpacing={2}>
            HYBRID POWER PLANT — {L} MW LOAD — SINGLE LINE DIAGRAM
          </text>

          {/* 230kV HV BUS */}
          <Bus x={busStartX} y={BUS_Y.hv} width={busWidth} color={COLORS.bus230} label="230 kV" thickness={5}/>

          {/* 34.5kV COLLECTION BUS */}
          <Bus x={busStartX} y={BUS_Y.mv} width={busWidth} color={COLORS.bus34} label="34.5 kV" thickness={4}/>

          {/* Tie transformer HV to MV */}
          <Wire x1={busStartX + busWidth*0.85} y1={BUS_Y.hv} x2={busStartX + busWidth*0.85} y2={BUS_Y.hv+20} color={COLORS.bus230}/>
          <Breaker x={busStartX + busWidth*0.85} y={BUS_Y.hv+14} id="cb-tie-hv" label="TIE CB"/>
          <Transformer x={busStartX + busWidth*0.85} y={BUS_Y.hv+48} label="TIE XFMR" voltages="230kV-34.5kV" id="xfmr-tie"/>
          <Wire x1={busStartX + busWidth*0.85} y1={BUS_Y.hv+64} x2={busStartX + busWidth*0.85} y2={BUS_Y.mv} color={COLORS.bus34}/>

          {/* SOLAR BRANCH */}
          {hasSolar && (() => {
            const sx = sources.find(s=>s.type==="solar")?.x || busStartX+120;
            const arrayY = BUS_Y.mv - 100;
            return (
              <g>
                <SolarArray x={sx} y={arrayY} mw={solarMW} id="solar-array"/>
                <Wire x1={sx} y1={arrayY+16} x2={sx} y2={arrayY+40}/>
                <Inverter x={sx} y={arrayY+50} label="INV" id="solar-inv"/>
                <Wire x1={sx} y1={arrayY+60} x2={sx} y2={BUS_Y.mv-28}/>
                <Transformer x={sx} y={BUS_Y.mv-18} label="SSU" voltages="0.6kV-34.5kV" id="xfmr-solar" r={10}/>
                <Wire x1={sx} y1={BUS_Y.mv-6} x2={sx} y2={BUS_Y.mv-4}/>
                <Breaker x={sx} y={BUS_Y.mv-2} id="cb-solar" label="SOLAR CB"/>
              </g>
            );
          })()}

          {/* WIND BRANCH */}
          {hasWind && (() => {
            const wx = sources.find(s=>s.type==="wind")?.x || busStartX+300;
            const turbY = BUS_Y.mv - 100;
            return (
              <g>
                <WindTurbine x={wx} y={turbY} mw={windMW} id="wind-turbine"/>
                <Wire x1={wx} y1={turbY+20} x2={wx} y2={BUS_Y.mv-28}/>
                <Transformer x={wx} y={BUS_Y.mv-18} label="PAD" voltages="0.69kV-34.5kV" id="xfmr-wind" r={10}/>
                <Wire x1={wx} y1={BUS_Y.mv-6} x2={wx} y2={BUS_Y.mv-4}/>
                <Breaker x={wx} y={BUS_Y.mv-2} id="cb-wind" label="WIND CB"/>
              </g>
            );
          })()}

          {/* BATTERY BRANCH */}
          {hasBatt && (() => {
            const bx = sources.find(s=>s.type==="battery")?.x || busStartX+480;
            const battY = BUS_Y.mv - 90;
            return (
              <g>
                <BatteryBank x={bx} y={battY} mw={battMW} mwh={battMWh} id="battery"/>
                <Wire x1={bx} y1={battY+16} x2={bx} y2={battY+36} color={COLORS.battery}/>
                <Inverter x={bx} y={battY+46} label="PCS" id="batt-pcs"/>
                <Wire x1={bx} y1={battY+56} x2={bx} y2={BUS_Y.mv-28}/>
                <Transformer x={bx} y={BUS_Y.mv-18} label="BESS" voltages="0.48kV-34.5kV" id="xfmr-batt" r={10}/>
                <Wire x1={bx} y1={BUS_Y.mv-6} x2={bx} y2={BUS_Y.mv-4}/>
                <Breaker x={bx} y={BUS_Y.mv-2} id="cb-batt" label="BESS CB"/>
              </g>
            );
          })()}

          {/* GAS GENERATION - Equipment-specific voltage levels */}
          {hasGas && gasEquip && (() => {
            const hCount = gasEquip.hframe || 0;
            const fCount = gasEquip.fframe || 0;
            const aCount = gasEquip.aero || 0;
            const rCount = gasEquip.recip || 0;
            const hasH = hCount > 0, hasF = fCount > 0, hasA = aCount > 0, hasR = rCount > 0;
            const BUS_345 = 150, BUS_138 = 230, BUS_GEN = BUS_Y.gen;
            const equipColors = {hframe:"#6366f1", fframe:"#f97316", aero:"#06b6d4", recip:"#22c55e"};

            return (
              <g>
                {/* 345kV Bus for H-Frame */}
                {hasH && <Bus x={busStartX} y={BUS_345} width={busWidth*0.4} color="#ff6b6b" label="345 kV" thickness={5}/>}

                {/* 138kV Bus for F-Frame */}
                {hasF && <Bus x={busStartX+busWidth*0.3} y={BUS_138} width={busWidth*0.4} color="#f0c040" label="138 kV" thickness={4}/>}

                {/* 13.8kV Bus for Recip */}
                {hasR && <Bus x={busStartX+busWidth*0.2} y={BUS_GEN} width={busWidth*0.6} color={COLORS.bus13} label="13.8 kV" thickness={3}/>}

                {/* H-Frame generators - connect to 345kV */}
                {hasH && Array.from({length: Math.min(hCount, 3)}).map((_, i) => {
                  const hx = busStartX + 80 + i * 100;
                  return (
                    <g key={`hframe-${i}`}>
                      <Generator x={hx} y={BUS_345-65} label={`H-${i+1}`} mw={400} type="gas" id={`gen-h${i}`}/>
                      <Wire x1={hx} y1={BUS_345-43} x2={hx} y2={BUS_345-25}/>
                      <Transformer x={hx} y={BUS_345-15} label="GSU" voltages="18kV-345kV" id={`xfmr-h${i}`} r={10}/>
                      <Wire x1={hx} y1={BUS_345-3} x2={hx} y2={BUS_345}/>
                      <Breaker x={hx} y={BUS_345-1} id={`cb-h${i}`} label="345kV CB"/>
                      <text x={hx} y={BUS_345-75} textAnchor="middle" fill={equipColors.hframe} fontSize={7} fontFamily={F.m}>H-FRAME 400MW</text>
                    </g>
                  );
                })}

                {/* Tie from 345kV to 34.5kV if H-frames exist */}
                {hasH && (
                  <g>
                    <Wire x1={busStartX+busWidth*0.35} y1={BUS_345} x2={busStartX+busWidth*0.35} y2={BUS_345+20} color="#ff6b6b"/>
                    <Transformer x={busStartX+busWidth*0.35} y={BUS_345+38} label="AUTO" voltages="345kV-34.5kV" id="xfmr-345-34"/>
                    <Wire x1={busStartX+busWidth*0.35} y1={BUS_345+54} x2={busStartX+busWidth*0.35} y2={BUS_Y.mv} color={COLORS.bus34}/>
                  </g>
                )}

                {/* F-Frame generators - connect to 138kV */}
                {hasF && Array.from({length: Math.min(fCount, 5)}).map((_, i) => {
                  const fx = busStartX + busWidth*0.35 + i * 80;
                  return (
                    <g key={`fframe-${i}`}>
                      <Generator x={fx} y={BUS_138-65} label={`F-${i+1}`} mw={200} type="gas" id={`gen-f${i}`}/>
                      <Wire x1={fx} y1={BUS_138-43} x2={fx} y2={BUS_138-25}/>
                      <Transformer x={fx} y={BUS_138-15} label="GSU" voltages="13.8kV-138kV" id={`xfmr-f${i}`} r={10}/>
                      <Wire x1={fx} y1={BUS_138-3} x2={fx} y2={BUS_138}/>
                      <Breaker x={fx} y={BUS_138-1} id={`cb-f${i}`} label="138kV CB"/>
                      <text x={fx} y={BUS_138-75} textAnchor="middle" fill={equipColors.fframe} fontSize={7} fontFamily={F.m}>F-FRAME 200MW</text>
                    </g>
                  );
                })}

                {/* Tie from 138kV to 34.5kV if F-frames exist */}
                {hasF && (
                  <g>
                    <Wire x1={busStartX+busWidth*0.65} y1={BUS_138} x2={busStartX+busWidth*0.65} y2={BUS_138+20} color="#f0c040"/>
                    <Transformer x={busStartX+busWidth*0.65} y={BUS_138+38} label="TIE" voltages="138kV-34.5kV" id="xfmr-138-34"/>
                    <Wire x1={busStartX+busWidth*0.65} y1={BUS_138+54} x2={busStartX+busWidth*0.65} y2={BUS_Y.mv} color={COLORS.bus34}/>
                  </g>
                )}

                {/* Aero generators - connect directly to 34.5kV collection bus */}
                {hasA && Array.from({length: Math.min(aCount, 8)}).map((_, i) => {
                  const ax = busStartX + busWidth*0.1 + i * 60;
                  return (
                    <g key={`aero-${i}`}>
                      <Generator x={ax} y={BUS_Y.mv-65} label={`A-${i+1}`} mw={50} type="gas" id={`gen-a${i}`}/>
                      <Wire x1={ax} y1={BUS_Y.mv-43} x2={ax} y2={BUS_Y.mv-25}/>
                      <Transformer x={ax} y={BUS_Y.mv-15} label="PAD" voltages="13.8kV-34.5kV" id={`xfmr-a${i}`} r={8}/>
                      <Wire x1={ax} y1={BUS_Y.mv-5} x2={ax} y2={BUS_Y.mv}/>
                      <Breaker x={ax} y={BUS_Y.mv-2} size={6} id={`cb-a${i}`} label=""/>
                      {i===0 && <text x={ax+30} y={BUS_Y.mv-75} fill={equipColors.aero} fontSize={7} fontFamily={F.m}>AERO 50MW (fast start)</text>}
                    </g>
                  );
                })}

                {/* Tie from 34.5kV to 13.8kV if Recips exist */}
                {hasR && (
                  <g>
                    <Wire x1={gasX} y1={BUS_Y.mv} x2={gasX} y2={BUS_Y.mv+20} color={COLORS.bus34}/>
                    <Breaker x={gasX} y={BUS_Y.mv+14} id="cb-mv-gen" label="GEN TIE"/>
                    <Transformer x={gasX} y={BUS_Y.mv+48} label="AUX" voltages="34.5kV-13.8kV" id="xfmr-aux"/>
                    <Wire x1={gasX} y1={BUS_Y.mv+64} x2={gasX} y2={BUS_GEN} color={COLORS.bus13}/>
                  </g>
                )}

                {/* Recip generators - connect to 13.8kV */}
                {hasR && Array.from({length: Math.min(rCount, 10)}).map((_, i) => {
                  const rx = busStartX + busWidth*0.25 + i * 55;
                  return (
                    <g key={`recip-${i}`}>
                      <Generator x={rx} y={BUS_GEN-60} label={`R-${i+1}`} mw={20} type="gas" id={`gen-r${i}`}/>
                      <Wire x1={rx} y1={BUS_GEN-38} x2={rx} y2={BUS_GEN}/>
                      <Breaker x={rx} y={BUS_GEN-2} size={6} id={`cb-r${i}`} label=""/>
                      {i===0 && <text x={rx+40} y={BUS_GEN-70} fill={equipColors.recip} fontSize={7} fontFamily={F.m}>RECIP 20MW (fastest start)</text>}
                    </g>
                  );
                })}

                {/* Equipment summary */}
                <text x={busStartX+10} y={H-20} fill="#6B7280" fontSize={8} fontFamily={F.m}>
                  Gas Mix: {hCount>0?`${hCount}×H-Frame `:""}
                  {fCount>0?`${fCount}×F-Frame `:""}
                  {aCount>0?`${aCount}×Aero `:""}
                  {rCount>0?`${rCount}×Recip`:""}
                  {gasMetrics?` | Wtd HR: ${gasMetrics.weightedHeatRate?.toFixed(1)} | Avg Start: ${gasMetrics.avgStartup?.toFixed(0)}min`:""}
                </text>
              </g>
            );
          })()}

          {/* DATA CENTER FEED */}
          <Bus x={dcCenterX-180} y={BUS_Y.dc} width={360} color={COLORS.busDC} label="12.47 kV" thickness={3}/>

          <Wire x1={dcCenterX} y1={BUS_Y.mv} x2={dcCenterX} y2={BUS_Y.mv+20} color={COLORS.bus34}/>
          <Breaker x={dcCenterX} y={BUS_Y.mv+14} id="cb-dc-feed" label="DC FEED"/>
          <Transformer x={dcCenterX} y={BUS_Y.mv+48} label="MAIN XFMR" voltages="34.5kV-12.47kV" id="xfmr-main"/>
          <Wire x1={dcCenterX} y1={BUS_Y.mv+64} x2={dcCenterX} y2={BUS_Y.dc-20}/>
          <Breaker x={dcCenterX} y={BUS_Y.dc-10} id="cb-main" label="MAIN BKR"/>

          {[-100, 0, 100].map((dx, i) => (
            <g key={`dc-feed-${i}`}>
              <Wire x1={dcCenterX+dx} y1={BUS_Y.dc} x2={dcCenterX+dx} y2={BUS_Y.dc+20}/>
              <Breaker x={dcCenterX+dx} y={BUS_Y.dc+14} id={`cb-ups${i}`} label={`UPS-${i+1}`}/>
              <Wire x1={dcCenterX+dx} y1={BUS_Y.dc+22} x2={dcCenterX+dx} y2={BUS_Y.dc+50} color={COLORS.busDC} dashed/>
            </g>
          ))}

          <DataCenter x={dcCenterX} y={BUS_Y.dc+70} mw={L} id="dc-load"/>

          {!hasSolar && !hasWind && !hasGas && !hasBatt && (
            <text x={W/2} y={H/2} textAnchor="middle" fill="#445" fontSize={12} fontFamily={F.m}>
              Configure generation sources to see single line diagram
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:12}}>
        <div style={{padding:10, background:"rgba(0,0,0,0.2)", borderRadius:6}}>
          <div style={{fontSize:9, fontWeight:700, color:"#889", marginBottom:6, textTransform:"uppercase", letterSpacing:1}}>Symbols</div>
          <div style={{display:"flex", flexDirection:"column", gap:4, fontSize:9}}>
            <span style={{color:"#778"}}><span style={{color:"#E8E6E1"}}>G</span> — Generator</span>
            <span style={{color:"#778"}}><span style={{color:"#f0c040"}}>OO</span> — Transformer</span>
            <span style={{color:"#778"}}><span style={{color:"#ff6b6b"}}>[]</span> — Circuit Breaker</span>
            <span style={{color:"#778"}}><span style={{color:COLORS.battery}}>BESS</span> — Battery</span>
            <span style={{color:"#778"}}><span style={{color:"#f97316"}}>DC</span> — Data Center</span>
          </div>
        </div>
        <div style={{padding:10, background:"rgba(0,0,0,0.2)", borderRadius:6}}>
          <div style={{fontSize:9, fontWeight:700, color:"#889", marginBottom:6, textTransform:"uppercase", letterSpacing:1}}>Voltage Levels</div>
          <div style={{display:"flex", flexDirection:"column", gap:3, fontSize:9}}>
            <span style={{color:COLORS.bus230}}>━ 230 kV — Transmission</span>
            <span style={{color:COLORS.bus34}}>━ 34.5 kV — Collection</span>
            <span style={{color:COLORS.bus13}}>━ 13.8 kV — Generation</span>
            <span style={{color:COLORS.busDC}}>━ 12.47 kV — Distribution</span>
          </div>
        </div>
        <div style={{padding:10, background:"rgba(0,0,0,0.2)", borderRadius:6}}>
          <div style={{fontSize:9, fontWeight:700, color:"#889", marginBottom:6, textTransform:"uppercase", letterSpacing:1}}>Sources</div>
          <div style={{display:"flex", flexDirection:"column", gap:3, fontSize:9}}>
            {hasSolar && <span style={{color:COLORS.solar}}>Solar: {solarMW} MW</span>}
            {hasWind && <span style={{color:COLORS.wind}}>Wind: {windMW} MW</span>}
            {hasGas && <span style={{color:COLORS.gas}}>Gas: {gasMW} MW</span>}
            {hasBatt && <span style={{color:COLORS.battery}}>Battery: {battMW} MW / {(battMWh/1000).toFixed(1)} GWh</span>}
            <span style={{color:"#f97316"}}>Load: {L} MW</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============ MAIN APP ============
export default function App() {
  const [p, setP] = useState(DEF);
  const [tab, setTab] = useState("overview");
  const [tabOrder, setTabOrder] = useState(() => {
    const saved = localStorage.getItem("lcoe_tabOrder");
    return saved ? JSON.parse(saved) : ["overview","buildout","breakdown","reliability","profiles","sld","tornado","scenarios","sizing"];
  });
  const [draggedTab, setDraggedTab] = useState(null);
  const handleTabDragStart = (e, t) => { setDraggedTab(t); e.dataTransfer.effectAllowed = "move"; };
  const handleTabDragOver = (e, t) => { e.preventDefault(); if (draggedTab && draggedTab !== t) { const newOrder = [...tabOrder]; const fromIdx = newOrder.indexOf(draggedTab); const toIdx = newOrder.indexOf(t); newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggedTab); setTabOrder(newOrder); localStorage.setItem("lcoe_tabOrder", JSON.stringify(newOrder)); } };
  const handleTabDragEnd = () => setDraggedTab(null);
  const [torCfg, setTorCfg] = useState("gu");
  const [profCfg, setProfCfg] = useState("swgb");
  const [sldCfg, setSldCfg] = useState("swgb");
  // Reliability adjusters: delta MW/MWh per config
  const [relAdj, setRelAdj] = useState(() => {
    const o = {};
    SCEN.forEach(s => { o[s.id] = { dSolar: 0, dWind: 0, dGas: 0, dBattMW: 0, dBattMWh: 0 }; });
    return o;
  });
  const [gasPreset, setGasPreset] = useState("hybrid_ha");
  const gasConfig = GAS_PRESETS[gasPreset] || GAS_PRESETS.hybrid_ha;
  const gasEquip = gasConfig.equipment;
  const gasMetrics = { weightedHeatRate: gasConfig.weightedHR, weightedCapex: gasConfig.weightedCapex, avgStartup: gasConfig.avgStartup, actualMW: gasConfig.totalMW };
  const update = useCallback((k,v) => setP(prev=>({...prev,[k]:v})), []);
  const updateRel = useCallback((cfgId, key, val) => {
    setRelAdj(prev => ({ ...prev, [cfgId]: { ...prev[cfgId], [key]: val } }));
  }, []);

  // Buildout phases: 10GW campus deployed over time
  const [phases, setPhases] = useState([
    { year: 0,  label: "Phase 1", gasMW: 2000, solarMW: 0,    windMW: 0,    battMW: 0,   battMWh: 0 },
    { year: 1,  label: "Phase 2", gasMW: 2000, solarMW: 0,    windMW: 0,    battMW: 0,   battMWh: 0 },
    { year: 2,  label: "Phase 3", gasMW: 1000, solarMW: 1000, windMW: 0,    battMW: 300, battMWh: 1200 },
    { year: 3,  label: "Phase 4", gasMW: 0,    solarMW: 500,  windMW: 1500, battMW: 400, battMWh: 1600 },
    { year: 5,  label: "Phase 5", gasMW: 0,    solarMW: 1500, windMW: 1500, battMW: 500, battMWh: 4000 },
    { year: 7,  label: "Phase 6", gasMW: 0,    solarMW: 1000, windMW: 1000, battMW: 300, battMWh: 3000 },
  ]);
  const updatePhase = useCallback((idx, key, val) => {
    setPhases(prev => prev.map((ph, i) => i === idx ? { ...ph, [key]: val } : ph));
  }, []);

  // Compute cumulative buildout metrics
  const buildout = useMemo(() => {
    const sC = p.solarModule + p.solarRacking + p.solarBOP + p.solarInterconnect + p.solarEPC + p.solarSoft;
    const wC = p.windTSA + p.windFoundation + p.windBOP + p.windInterconnect + p.windEPC + p.windSoft;
    const gC = p.gasTurbine + p.gasBOP + p.gasPipeline + p.gasElectrical + p.gasSCR + p.gasEPC + p.gasSoft;
    const bC = p.battCells + p.battBOP + p.battEPC + p.battSite;
    const fuelMarg = p.gasPrice * p.heatRate;
    const CRF = crf(p.wacc, p.life);

    let cumGas = 0, cumSolar = 0, cumWind = 0, cumBattMW = 0, cumBattMWh = 0, cumCapex = 0;
    const snapshots = [];

    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      cumGas += ph.gasMW; cumSolar += ph.solarMW; cumWind += ph.windMW;
      cumBattMW += ph.battMW; cumBattMWh += ph.battMWh;

      const totalGen = cumGas + cumSolar + cumWind;
      const totalLoad = totalGen > 0 ? Math.min(10000, totalGen) : 0;
      const annMWh = totalLoad * 8760;

      // Phase capex (incremental)
      const phCapex = (ph.solarMW * sC + ph.windMW * wC + ph.gasMW * gC) * 1000 +
        ph.battMWh * bC * 1000 -
        ph.solarMW * sC * 1000 * p.solarITC -
        ph.battMWh * bC * 1000 * p.battITC;
      cumCapex += phCapex;

      // Blended generation fractions
      const gasFrac = totalGen > 0 ? cumGas / totalGen : 0;
      const solarFrac = totalGen > 0 ? cumSolar / totalGen : 0;
      const windFrac = totalGen > 0 ? cumWind / totalGen : 0;

      // Simplified blended LCOE at this snapshot
      const annCapex = cumCapex * CRF;
      const annOM = (cumSolar * p.solarOM + cumWind * p.windOM + cumGas * p.gasOMFixed + cumBattMW * p.battOM) * 1000 +
        gasFrac * annMWh * p.gasOMVar;
      const annFuel = gasFrac * annMWh * fuelMarg;
      const annPTC = cumWind * p.windCF * 8760 * p.windPTC * Math.min(10, p.life) / p.life;

      const lcoe = annMWh > 0 ? (annCapex + annOM + annFuel - annPTC) / annMWh : 0;
      const lcoeFuel = annMWh > 0 ? annFuel / annMWh : 0;
      const fuelPct = lcoe > 0 ? lcoeFuel / lcoe : 0;

      // P10/P90 from gas vol
      const p10 = lcoe - lcoeFuel + lcoeFuel * Math.max(0.3, 1 - 1.28 * p.gasVol);
      const p90 = lcoe - lcoeFuel + lcoeFuel * (1 + 1.28 * p.gasVol);

      snapshots.push({
        phase: i, year: ph.year, label: ph.label,
        cumGas, cumSolar, cumWind, cumBattMW, cumBattMWh, cumCapex, phCapex,
        totalLoad, annMWh, gasFrac, solarFrac, windFrac,
        lcoe, lcoeFuel, fuelPct, p10, p90, spread: p90 - p10,
      });
    }
    return snapshots;
  }, [p, phases]);

  // Compute base sizes + adjusted sizes + LCOE + dispatch
  // Use gasConfig values for gas-related scenarios
  const computed = useMemo(() => {
    const out = {};
    SCEN.forEach(s => {
      const bs = baseSize(p, s.id);
      const adj = relAdj[s.id];
      const hasGas = s.sources.includes("gas");
      const sz = {
        solarMW: Math.max(0, bs.solarMW + adj.dSolar),
        windMW: Math.max(0, bs.windMW + adj.dWind),
        gasMW: Math.max(0, bs.gasMW + adj.dGas),
        battMW: Math.max(0, (bs.battMW||0) + adj.dBattMW),
        battMWh: Math.max(0, (bs.battMWh||0) + adj.dBattMWh),
        upsMWh: bs.upsMWh || 0,
      };
      // Override heat rate and gas capex with preset values for gas scenarios
      const pEff = hasGas ? {...p, heatRate: gasConfig.weightedHR} : p;
      const lcoe = computeLCOE(pEff, sz, s.id);
      const disp = dispatch(p, sz);
      out[s.id] = { base: bs, sz, lcoe, disp };
    });
    return out;
  }, [p, relAdj, gasConfig]);

  const tornado = useMemo(() => tornadoData(p, gasConfig), [p, gasConfig]);
  // Per-config scenario blend: 0 = bear, 0.5 = base, 1.0 = bull
  // And per-input overrides
  const [scenCfg, setScenCfg] = useState("gu");
  const [scenBlends, setScenBlends] = useState(() => {
    const o = {};
    SCEN.forEach(s => { o[s.id] = {}; }); // empty = use blend slider
    return o;
  });
  const [blendSlider, setBlendSlider] = useState(() => {
    const o = {};
    SCEN.forEach(s => { o[s.id] = 0.5; }); // 0.5 = base
    return o;
  });

  // Compute scenario LCOE for a given config at a given blend level or with overrides
  const scenarioResults = useMemo(() => {
    const out = {};
    SCEN.forEach(s => {
      const si = SCENARIO_INPUTS[s.id];
      if (!si) return;
      const cases = {};
      // Compute for bull, base, bear, and custom (current blend)
      ["bull", "base", "bear", "custom"].forEach(caseType => {
        const merged = { ...p };
        si.inputs.forEach(inp => {
          if (caseType === "bull") merged[inp.key] = inp.bull;
          else if (caseType === "bear") merged[inp.key] = inp.bear;
          else if (caseType === "base") merged[inp.key] = inp.base;
          else {
            // Custom: use per-input override if set, otherwise interpolate from blend
            const override = scenBlends[s.id][inp.key];
            if (override !== undefined) {
              merged[inp.key] = override;
            } else {
              const bl = blendSlider[s.id];
              // bl: 0=bear, 0.5=base, 1=bull
              if (bl <= 0.5) {
                const t = bl / 0.5; // 0..1 from bear to base
                merged[inp.key] = inp.bear + (inp.base - inp.bear) * t;
              } else {
                const t = (bl - 0.5) / 0.5; // 0..1 from base to bull
                merged[inp.key] = inp.base + (inp.bull - inp.base) * t;
              }
            }
          }
        });
        const sz = baseSize(merged, s.id);
        cases[caseType] = computeLCOE(merged, sz, s.id);
        cases[caseType + "Params"] = { ...merged };
      });
      out[s.id] = cases;
    });
    return out;
  }, [p, scenBlends, blendSlider]);

  const results = useMemo(() => {
    const o = {};
    SCEN.forEach(s => { o[s.id] = computed[s.id].lcoe; });
    return o;
  }, [computed]);

  const maxLcoe = Math.max(...Object.values(results).map(r=>r.p90||r.lcoe))*1.08;
  const PS={background:"#12151C",border:"1px solid #1E2330",borderRadius:5,padding:14};
  const SL={fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#6B7280",fontFamily:F.m,marginBottom:10};
  const TS=(a)=>({padding:"5px 12px",fontSize:10,fontFamily:F.m,background:a?"#1E2330":"transparent",color:a?"#E8E6E1":"#6B7280",border:a?"1px solid #2A3040":"1px solid transparent",borderRadius:3,cursor:"pointer"});

  return (
    <div style={{fontFamily:F.s,background:"#0C0F14",color:"#E8E6E1",minHeight:"100vh",padding:"20px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{marginBottom:20,borderBottom:"1px solid #1E2330",paddingBottom:12}}>
        <h1 style={{fontSize:16,fontWeight:700,letterSpacing:"-0.02em",color:"#F0EDE8",margin:0,fontFamily:F.m}}>LCOE SIMULATOR v5</h1>
        <div style={{fontSize:10,color:"#6B7280",marginTop:3,fontFamily:F.m}}>10 GW campus {"\u00B7"} phased buildout {"\u00B7"} gas-first glide path {"\u00B7"} hedge construction over time</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"calc(100vh - 100px)",overflowY:"auto",paddingRight:4}}>
          <CxP title="SOLAR" color="#D4A026" p={p} update={update} items={[
            {key:"solarModule",label:"Module+Inv",min:200,max:800,step:10,unit:"$/kW"},
            {key:"solarBOP",label:"BOP",min:80,max:400,step:10,unit:"$/kW"},
            {key:"solarInterconnect",label:"Interconnect",min:20,max:200,step:10,unit:"$/kW"},
            {key:"solarEPC",label:"EPC+Soft",min:30,max:250,step:5,unit:"$/kW"},
          ]}/>
          <CxP title="WIND" color="#3D7EC7" p={p} update={update} items={[
            {key:"windTSA",label:"Turbine TSA",min:400,max:1200,step:25,unit:"$/kW"},
            {key:"windBOP",label:"BOP+Civil",min:100,max:500,step:10,unit:"$/kW"},
            {key:"windInterconnect",label:"Interconnect",min:40,max:300,step:10,unit:"$/kW"},
            {key:"windEPC",label:"EPC+Soft",min:50,max:350,step:10,unit:"$/kW"},
          ]}/>
          <CxP title="GAS CC" color="#C24B4B" p={p} update={update} items={[
            {key:"gasTurbine",label:"Gas Plant",min:300,max:2000,step:25,unit:"$/kW"},
            {key:"gasBOP",label:"BOP (all)",min:50,max:800,step:10,unit:"$/kW"},
            {key:"gasPipeline",label:"Gas Lateral",min:10,max:400,step:10,unit:"$/kW"},
            {key:"gasEPC",label:"EPC+Permit",min:30,max:500,step:10,unit:"$/kW"},
          ]}/>
          <GasPresetPanel gasPreset={gasPreset} setGasPreset={setGasPreset} gasConfig={gasConfig} gasMetrics={gasMetrics}/>
          <CxP title="BATTERY" color="#2D8C6F" p={p} update={update} items={[
            {key:"battCells",label:"LFP Cells",min:50,max:400,step:10,unit:"$/kWh"},
            {key:"battBOP",label:"PCS/BOP",min:30,max:200,step:5,unit:"$/kWh"},
            {key:"battEPC",label:"EPC+Site",min:15,max:150,step:5,unit:"$/kWh"},
          ]}/>
          <div style={PS}>
            <div style={SL}>PERFORMANCE</div>
            <Sl label="Solar CF" value={p.solarCF} onChange={v=>update("solarCF",v)} min={0.15} max={0.35} step={0.01} unit="%"/>
            <Sl label="Wind CF" value={p.windCF} onChange={v=>update("windCF",v)} min={0.25} max={0.55} step={0.01} unit="%"/>
            <Sl label="Gas Price" value={p.gasPrice} onChange={v=>update("gasPrice",v)} min={1.5} max={12} step={0.25} unit=" $/MMBtu"/>
            <Sl label="Heat Rate" value={p.heatRate} onChange={v=>update("heatRate",v)} min={5.5} max={10} step={0.1} unit=" MMBtu/MWh"/>
            <Sl label="Batt Dur" value={p.batteryDuration} onChange={v=>update("batteryDuration",v)} min={2} max={12} step={1} unit=" hr"/>
            <Sl label="WACC" value={p.wacc} onChange={v=>update("wacc",v)} min={0.04} max={0.16} step={0.005} unit="%"/>
            <Sl label="Solar ITC" value={p.solarITC} onChange={v=>update("solarITC",v)} min={0} max={0.50} step={0.05} unit="%"/>
            <Sl label="Wind PTC" value={p.windPTC} onChange={v=>update("windPTC",v)} min={0} max={35} step={1} unit=" $/MWh"/>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {tabOrder.map(t=>(
              <button key={t} draggable style={{...TS(tab===t), cursor: draggedTab ? "grabbing" : "grab", opacity: draggedTab === t ? 0.5 : 1}} onClick={()=>setTab(t)} onDragStart={(e)=>handleTabDragStart(e,t)} onDragOver={(e)=>handleTabDragOver(e,t)} onDragEnd={handleTabDragEnd}>{t.toUpperCase()}</button>
            ))}
          </div>

          {/* ===== OVERVIEW ===== */}
          {tab==="overview"&&(<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
              {SCEN.map(s=>{const r=results[s.id],d=computed[s.id].disp.stats;return(
                <div key={s.id} style={{...PS,padding:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><div style={{width:7,height:7,borderRadius:2,background:s.color}}/><span style={{fontSize:9,fontFamily:F.m,color:"#9CA3AF"}}>{s.short}</span></div>
                  <div style={{fontSize:9,color:"#6B7280",fontFamily:F.m}}>LCOE</div>
                  <div style={{fontSize:22,fontWeight:700,fontFamily:F.m,color:s.color,lineHeight:1}}>${r.lcoe.toFixed(1)}</div>
                  <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m}}>/MWh</div>
                  <div style={{marginTop:8,fontSize:8,color:"#6B7280",fontFamily:F.m,lineHeight:1.6}}>
                    <div>capex: {fmt$(r.netCapex)}</div>
                    <div>reliability: <span style={{color:d.reliability>=99.9?"#2D8C6F":"#E8A838"}}>{d.reliability.toFixed(1)}%</span></div>
                    <div>spread: ${r.spread.toFixed(1)}/MWh</div>
                  </div>
                </div>
              );})}
            </div>
            <div style={PS}>
              <div style={SL}>LCOE WITH P10/P90 GAS RISK BAND</div>
              {SCEN.map(s=>{const r=results[s.id];return(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:36,fontSize:9,fontFamily:F.m,color:"#9CA3AF",textAlign:"right",flexShrink:0}}>{s.short}</div>
                  <div style={{flex:1,position:"relative",height:22}}>
                    {r.spread>0.1&&<div style={{position:"absolute",left:`${(r.p10/maxLcoe)*100}%`,width:`${((r.p90-r.p10)/maxLcoe)*100}%`,height:22,background:s.color+"15",border:`1px dashed ${s.color}40`,borderRadius:2,top:0}}/>}
                    <div style={{position:"absolute",left:0,width:`${(r.lcoe/maxLcoe)*100}%`,height:22,background:`linear-gradient(90deg,${s.color}CC,${s.color}88)`,borderRadius:2,display:"flex",alignItems:"center",paddingLeft:6,top:0}}>
                      <span style={{fontSize:10,fontFamily:F.m,color:"#fff",fontWeight:600}}>${r.lcoe.toFixed(1)}</span>
                    </div>
                    {r.spread>0.1&&<div style={{position:"absolute",left:`${(r.p90/maxLcoe)*100}%`,top:2,fontSize:7,color:s.color,fontFamily:F.m,transform:"translateX(3px)"}}>P90:${r.p90.toFixed(0)}</div>}
                  </div>
                </div>);})}
            </div>
          </>)}


          {/* ===== BUILDOUT ===== */}
          {tab==="buildout"&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                {[
                  {l:"TARGET",v:"10 GW",c:"#E8E6E1"},
                  {l:"ONLINE",v:`${((buildout[buildout.length-1]||{}).totalLoad||0)/1000>0?((buildout[buildout.length-1].totalLoad)/1000).toFixed(1):"0"} GW`,c:((buildout[buildout.length-1]||{}).totalLoad||0)>=10000?"#2D8C6F":"#E8A838"},
                  {l:"BLENDED LCOE",v:`$${((buildout[buildout.length-1]||{}).lcoe||0).toFixed(1)}/MWh`,c:"#E8E6E1"},
                  {l:"FUEL EXPOSURE",v:`${(((buildout[buildout.length-1]||{}).fuelPct||0)*100).toFixed(0)}%`,c:((buildout[buildout.length-1]||{}).fuelPct||0)>0.5?"#C24B4B":"#2D8C6F"},
                  {l:"CUM CAPEX",v:fmt$((buildout[buildout.length-1]||{}).cumCapex||0),c:"#E8E6E1"},
                ].map(m=>(
                  <div key={m.l} style={{...PS,padding:10}}>
                    <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div>
                    <div style={{fontSize:18,fontWeight:700,fontFamily:F.m,color:m.c,lineHeight:1.2}}>{m.v}</div>
                  </div>
                ))}
              </div>

              {/* Capacity stack chart */}
              <div style={PS}>
                <div style={SL}>CUMULATIVE CAPACITY BY SOURCE</div>
                <svg viewBox="0 0 720 180" style={{width:"100%",height:"auto"}}>
                  {[0,2500,5000,7500,10000].map(mw=>{const y=16+148-mw/12000*148;return(<g key={mw}><line x1={50} x2={704} y1={y} y2={y} stroke="#1E2330" strokeWidth={0.5}/><text x={46} y={y+3} textAnchor="end" fill="#6B7280" fontSize={7} fontFamily={F.m}>{mw/1000}GW</text></g>);})}
                  <line x1={50} x2={704} y1={16+148-10000/12000*148} y2={16+148-10000/12000*148} stroke="#E8A838" strokeWidth={1} strokeDasharray="4,3"/>
                  {buildout.map((snap,i)=>{
                    const maxYr=Math.max(10,...buildout.map(s=>s.year+2));
                    const cx=50+(snap.year/maxYr)*654;
                    const bw=Math.max(18,654/maxYr*1.2);
                    let cumH=0;
                    return(<g key={i}>
                      {[{mw:snap.cumGas,c:"#C24B4B"},{mw:snap.cumWind,c:"#3D7EC7"},{mw:snap.cumSolar,c:"#D4A026"}].map((l,j)=>{
                        const h=l.mw/12000*148;const yy=16+148-cumH-h;cumH+=h;
                        return h>0.5?<rect key={j} x={cx-bw/2} y={yy} width={bw} height={h} fill={l.c} fillOpacity={0.7} rx={1}/>:null;
                      })}
                      {snap.cumBattMWh>0&&<rect x={cx-bw/2-3} y={16+148-cumH-3} width={3} height={6} fill="#2D8C6F" rx={1}/>}
                      <text x={cx} y={176} textAnchor="middle" fill="#9CA3AF" fontSize={7} fontFamily={F.m}>Yr{snap.year}</text>
                    </g>);
                  })}
                  {[{c:"#C24B4B",l:"Gas"},{c:"#3D7EC7",l:"Wind"},{c:"#D4A026",l:"Solar"},{c:"#2D8C6F",l:"Batt"}].map((l,i)=>(<g key={l.l} transform={`translate(${50+i*70},10)`}><rect x={0} y={-3} width={6} height={6} fill={l.c} rx={1}/><text x={9} y={2} fill="#9CA3AF" fontSize={7} fontFamily={F.m}>{l.l}</text></g>))}
                </svg>
              </div>

              {/* LCOE glide path */}
              <div style={PS}>
                <div style={SL}>BLENDED LCOE & FUEL EXPOSURE GLIDE PATH</div>
                {(()=>{
                  const maxL=Math.max(1,...buildout.map(s=>(s.p90||s.lcoe||1)))*1.15;
                  const maxYr=Math.max(10,...buildout.map(s=>s.year+2));
                  const xP=yr=>50+(yr/maxYr)*654;
                  const yL=v=>16+148-((v||0)/maxL)*148;
                  const yF=f=>16+148-(f||0)*148;
                  return(
                    <svg viewBox="0 0 720 180" style={{width:"100%",height:"auto"}}>
                      {[0,.25,.5,.75,1].map(f=>(<g key={f}><line x1={50} x2={704} y1={yL(maxL*f)} y2={yL(maxL*f)} stroke="#1E2330" strokeWidth={0.5}/><text x={46} y={yL(maxL*f)+3} textAnchor="end" fill="#6B7280" fontSize={7} fontFamily={F.m}>${(maxL*f).toFixed(0)}</text></g>))}
                      {buildout.length>1&&<path d={buildout.map((s,i)=>`${i===0?"M":"L"}${xP(s.year).toFixed(1)},${yL(s.p10||0).toFixed(1)}`).join("")+[...buildout].reverse().map(s=>`L${xP(s.year).toFixed(1)},${yL(s.p90||0).toFixed(1)}`).join("")+"Z"} fill="#8B5DB8" fillOpacity={0.1}/>}
                      <path d={buildout.map((s,i)=>`${i===0?"M":"L"}${xP(s.year).toFixed(1)},${yL(s.lcoe||0).toFixed(1)}`).join("")} fill="none" stroke="#E8E6E1" strokeWidth={2}/>
                      {buildout.map((s,i)=>(<g key={i}><circle cx={xP(s.year)} cy={yL(s.lcoe||0)} r={4} fill="#E8E6E1" stroke="#0C0F14" strokeWidth={1.5}/><text x={xP(s.year)} y={yL(s.lcoe||0)-8} textAnchor="middle" fill="#E8E6E1" fontSize={8} fontFamily={F.m} fontWeight="600">${(s.lcoe||0).toFixed(0)}</text></g>))}
                      <path d={buildout.map((s,i)=>`${i===0?"M":"L"}${xP(s.year).toFixed(1)},${yF(s.fuelPct||0).toFixed(1)}`).join("")} fill="none" stroke="#C24B4B" strokeWidth={1.5} strokeDasharray="4,3"/>
                      {buildout.map((s,i)=>(<g key={`f${i}`}><circle cx={xP(s.year)} cy={yF(s.fuelPct||0)} r={3} fill="#C24B4B"/><text x={xP(s.year)+10} y={yF(s.fuelPct||0)+3} fill="#C24B4B" fontSize={7} fontFamily={F.m}>{((s.fuelPct||0)*100).toFixed(0)}%</text></g>))}
                      {buildout.map((s,i)=>(<text key={i} x={xP(s.year)} y={176} textAnchor="middle" fill="#9CA3AF" fontSize={7} fontFamily={F.m}>Yr{s.year}</text>))}
                      <text x={704} y={24} textAnchor="end" fill="#C24B4B" fontSize={7} fontFamily={F.m}>Fuel%</text>
                      <text x={46} y={24} textAnchor="end" fill="#E8E6E1" fontSize={7} fontFamily={F.m}>$/MWh</text>
                    </svg>
                  );
                })()}
                <div style={{display:"flex",gap:14,marginTop:4,fontSize:8,fontFamily:F.m,color:"#6B7280"}}>
                  <span style={{color:"#E8E6E1"}}>{"\u25CF"} LCOE</span>
                  <span style={{color:"#C24B4B"}}>-- Fuel%</span>
                  <span style={{color:"#8B5DB8",opacity:0.5}}>{"\u25A0"} P10-P90</span>
                </div>
              </div>

              {/* Phase editor */}
              <div style={PS}>
                <div style={SL}>PHASE EDITOR {"\u2014"} INCREMENTAL MW PER PHASE</div>
                <div style={{fontSize:8,color:"#4B5563",fontFamily:F.m,marginBottom:8}}>Drag sliders to adjust each phase. Charts update live.</div>
                {phases.map((ph,i)=>{
                  const snap=buildout[i]||{};
                  return(
                    <div key={i} style={{marginBottom:14,paddingBottom:12,borderBottom:"1px solid #1E2330"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:11,fontFamily:F.m,color:"#E8E6E1",fontWeight:600}}>{ph.label} (Yr {ph.year})</span>
                        <div style={{display:"flex",gap:14,fontSize:9,fontFamily:F.m}}>
                          <span style={{color:"#E8E6E1"}}>{((snap.totalLoad||0)/1000).toFixed(1)} GW</span>
                          <span style={{color:"#E8E6E1"}}>${(snap.lcoe||0).toFixed(1)}/MWh</span>
                          <span style={{color:(snap.fuelPct||0)>0.5?"#C24B4B":"#2D8C6F"}}>{((snap.fuelPct||0)*100).toFixed(0)}% fuel</span>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                        <div>
                          <div style={{fontSize:8,color:"#C24B4B",fontFamily:F.m}}>+Gas: {ph.gasMW} MW</div>
                          <input type="range" min={0} max={4000} step={100} value={ph.gasMW} onChange={e=>updatePhase(i,"gasMW",parseInt(e.target.value))} style={{width:"100%",height:2,accentColor:"#C24B4B"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:8,color:"#D4A026",fontFamily:F.m}}>+Solar: {ph.solarMW} MW</div>
                          <input type="range" min={0} max={4000} step={100} value={ph.solarMW} onChange={e=>updatePhase(i,"solarMW",parseInt(e.target.value))} style={{width:"100%",height:2,accentColor:"#D4A026"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:8,color:"#3D7EC7",fontFamily:F.m}}>+Wind: {ph.windMW} MW</div>
                          <input type="range" min={0} max={4000} step={100} value={ph.windMW} onChange={e=>updatePhase(i,"windMW",parseInt(e.target.value))} style={{width:"100%",height:2,accentColor:"#3D7EC7"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:8,color:"#2D8C6F",fontFamily:F.m}}>+Batt: {ph.battMW} MW</div>
                          <input type="range" min={0} max={2000} step={50} value={ph.battMW} onChange={e=>updatePhase(i,"battMW",parseInt(e.target.value))} style={{width:"100%",height:2,accentColor:"#2D8C6F"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:8,color:"#2D8C6F",fontFamily:F.m}}>+Batt: {(ph.battMWh/1000).toFixed(1)} GWh</div>
                          <input type="range" min={0} max={8000} step={200} value={ph.battMWh} onChange={e=>updatePhase(i,"battMWh",parseInt(e.target.value))} style={{width:"100%",height:2,accentColor:"#2D8C6F"}}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={()=>setPhases(prev=>[...prev,{year:(prev[prev.length-1]?.year||0)+2,label:`Phase ${prev.length+1}`,gasMW:0,solarMW:500,windMW:500,battMW:200,battMWh:800}])}
                  style={{marginTop:4,padding:"4px 12px",fontSize:9,fontFamily:F.m,background:"#1E2330",color:"#9CA3AF",border:"1px solid #2A3040",borderRadius:3,cursor:"pointer"}}>+ ADD PHASE</button>
              </div>

              {/* Insight */}
              <div style={{...PS,borderColor:"#2A3040"}}>
                <div style={SL}>BUILDOUT STRATEGY</div>
                <div style={{fontSize:11,lineHeight:1.7,color:"#D1D5DB"}}>
                  Phase 1 at <span style={{fontFamily:F.m}}>${(buildout[0]?.lcoe||0).toFixed(0)}/MWh</span> with{" "}
                  <span style={{color:"#C24B4B"}}>{((buildout[0]?.fuelPct||0)*100).toFixed(0)}% fuel</span> {"\u2014"} gas-first for speed.
                  By Phase {buildout.length}: <span style={{fontFamily:F.m}}>${((buildout[buildout.length-1]||{}).lcoe||0).toFixed(0)}/MWh</span>,{" "}
                  fuel at <span style={{color:"#2D8C6F"}}>{(((buildout[buildout.length-1]||{}).fuelPct||0)*100).toFixed(0)}%</span>.
                  P10-P90 narrows from ${(buildout[0]?.spread||0).toFixed(0)} to ${((buildout[buildout.length-1]||{}).spread||0).toFixed(0)}/MWh.
                </div>
              </div>
            </div>
          )}


          {/* ===== BREAKDOWN ===== */}
          {tab==="breakdown"&&(
            <div style={PS}>
              <div style={SL}>LCOE COMPONENT BREAKDOWN ($/MWh)</div>
              {SCEN.map(s=>{const r=results[s.id],t=r.lcoe;if(t<=0)return null;
                const cp=(r.lcoeCapex/t)*100,om=(r.lcoeOM/t)*100,fu=(r.lcoeFuel/t)*100,pt=(r.lcoePTC/t)*100;
                return(<div key={s.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,fontFamily:F.m,color:s.color}}>{s.short}</span>
                    <span style={{fontSize:11,fontFamily:F.m,color:"#9CA3AF"}}>${t.toFixed(1)}/MWh</span>
                  </div>
                  <div style={{display:"flex",borderRadius:3,overflow:"hidden"}}>
                    {cp>0.5&&<div style={{width:`${cp}%`,height:28,backgroundColor:"#4A6FA5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.m,color:"#fff"}}>{cp>10?"CAPEX":""}</div>}
                    {om>0.5&&<div style={{width:`${om}%`,height:28,backgroundColor:"#6B8E7B",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.m,color:"#fff"}}>{om>10?"O&M":""}</div>}
                    {fu>0.5&&<div style={{width:`${fu}%`,height:28,backgroundColor:"#C75B3A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.m,color:"#fff"}}>{fu>10?"FUEL":""}</div>}
                    {pt>0.5&&<div style={{width:`${Math.min(pt,15)}%`,height:28,backgroundColor:"#2D8C6F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.m,color:"#fff"}}>{pt>8?"PTC":""}</div>}
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:4,fontSize:9,fontFamily:F.m,color:"#6B7280"}}>
                    <span>capex: ${r.lcoeCapex.toFixed(1)}</span><span>o&m: ${r.lcoeOM.toFixed(1)}</span>
                    {r.lcoeFuel>0&&<span>fuel: ${r.lcoeFuel.toFixed(1)}</span>}
                    {r.lcoePTC>0&&<span style={{color:"#2D8C6F"}}>ptc: -${r.lcoePTC.toFixed(1)}</span>}
                  </div>
                </div>);})}
              <div style={{display:"flex",gap:16,marginTop:12,paddingTop:10,borderTop:"1px solid #1E2330"}}>
                {[{c:"#4A6FA5",l:"Capital"},{c:"#6B8E7B",l:"O&M"},{c:"#C75B3A",l:"Fuel"},{c:"#2D8C6F",l:"PTC"}].map(x=>(
                  <div key={x.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#6B7280",fontFamily:F.m}}>
                    <div style={{width:8,height:8,borderRadius:1,background:x.c}}/>{x.l}
                  </div>))}
              </div>
            </div>
          )}

          {/* ===== RELIABILITY ===== */}
          {tab==="reliability"&&(<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
              {SCEN.map(s=>{const d=computed[s.id].disp.stats;
                const rColor=d.reliability>=99.99?"#2D8C6F":d.reliability>=99?"#E8A838":"#C24B4B";
                return(<div key={s.id} style={{...PS,padding:10,borderColor:rColor+"40"}}>
                  <div style={{fontSize:9,fontFamily:F.m,color:s.color,fontWeight:600,marginBottom:4}}>{s.short}</div>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:F.m,color:rColor,lineHeight:1}}>{d.reliability.toFixed(2)}%</div>
                  <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m}}>reliability</div>
                  <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m,marginTop:4}}>curtail: {d.curtailPct.toFixed(1)}%</div>
                  <div style={{fontSize:8,color:"#6B7280",fontFamily:F.m}}>unmet: {d.totUnmet.toFixed(0)} MWh</div>
                </div>);})}
            </div>

            <div style={PS}>
              <div style={SL}>REDUNDANCY ADJUSTER {"\u2014"} ADD/REMOVE CAPACITY PER CONFIG</div>
              <div style={{fontSize:8,color:"#4B5563",fontFamily:F.m,marginBottom:12}}>Base sizing targets 100% reliability. Remove capacity to see how reliability degrades and LCOE drops. Add to increase margin.</div>
              {SCEN.map(s => {
                const bs = computed[s.id].base;
                const adj = relAdj[s.id];
                const d = computed[s.id].disp.stats;
                const r = results[s.id];
                const rColor = d.reliability >= 99.99 ? "#2D8C6F" : d.reliability >= 99 ? "#E8A838" : "#C24B4B";

                return (
                  <div key={s.id} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1E2330" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: F.m, color: s.color, fontWeight: 600 }}>{s.short}</span>
                      <div style={{ display: "flex", gap: 16, fontSize: 9, fontFamily: F.m }}>
                        <span style={{ color: rColor }}>{d.reliability.toFixed(2)}% reliable</span>
                        <span style={{ color: "#9CA3AF" }}>${r.lcoe.toFixed(1)}/MWh</span>
                        <span style={{ color: "#9CA3AF" }}>{fmt$(r.netCapex)}</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                      {bs.solarMW > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>Solar {"\u0394"}MW (base: {bs.solarMW})</div>
                          <input type="range" min={-Math.floor(bs.solarMW * 0.5)} max={Math.ceil(bs.solarMW * 0.3)} step={50}
                            value={adj.dSolar} onChange={e => updateRel(s.id, "dSolar", parseInt(e.target.value))}
                            style={{ width: "100%", height: 2, accentColor: "#D4A026" }} />
                          <div style={{ fontSize: 9, fontFamily: F.m, color: adj.dSolar === 0 ? "#6B7280" : adj.dSolar > 0 ? "#2D8C6F" : "#C24B4B" }}>
                            {adj.dSolar >= 0 ? "+" : ""}{adj.dSolar} MW
                          </div>
                        </div>
                      )}
                      {bs.windMW > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>Wind {"\u0394"}MW (base: {bs.windMW})</div>
                          <input type="range" min={-Math.floor(bs.windMW * 0.5)} max={Math.ceil(bs.windMW * 0.3)} step={50}
                            value={adj.dWind} onChange={e => updateRel(s.id, "dWind", parseInt(e.target.value))}
                            style={{ width: "100%", height: 2, accentColor: "#3D7EC7" }} />
                          <div style={{ fontSize: 9, fontFamily: F.m, color: adj.dWind === 0 ? "#6B7280" : adj.dWind > 0 ? "#2D8C6F" : "#C24B4B" }}>
                            {adj.dWind >= 0 ? "+" : ""}{adj.dWind} MW
                          </div>
                        </div>
                      )}
                      {bs.gasMW > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>Gas {"\u0394"}MW (base: {bs.gasMW})</div>
                          <input type="range" min={-Math.floor(bs.gasMW * 0.5)} max={Math.ceil(bs.gasMW * 0.3)} step={50}
                            value={adj.dGas} onChange={e => updateRel(s.id, "dGas", parseInt(e.target.value))}
                            style={{ width: "100%", height: 2, accentColor: "#C24B4B" }} />
                          <div style={{ fontSize: 9, fontFamily: F.m, color: adj.dGas === 0 ? "#6B7280" : adj.dGas > 0 ? "#2D8C6F" : "#C24B4B" }}>
                            {adj.dGas >= 0 ? "+" : ""}{adj.dGas} MW
                          </div>
                        </div>
                      )}
                      {(bs.battMW || 0) > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>Batt {"\u0394"}MW (base: {bs.battMW})</div>
                          <input type="range" min={-Math.floor(bs.battMW * 0.5)} max={Math.ceil(bs.battMW * 0.3)} step={50}
                            value={adj.dBattMW} onChange={e => updateRel(s.id, "dBattMW", parseInt(e.target.value))}
                            style={{ width: "100%", height: 2, accentColor: "#2D8C6F" }} />
                          <div style={{ fontSize: 9, fontFamily: F.m, color: adj.dBattMW === 0 ? "#6B7280" : adj.dBattMW > 0 ? "#2D8C6F" : "#C24B4B" }}>
                            {adj.dBattMW >= 0 ? "+" : ""}{adj.dBattMW} MW
                          </div>
                        </div>
                      )}
                      {(bs.battMWh || 0) > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>Batt {"\u0394"}GWh (base: {(bs.battMWh / 1000).toFixed(1)})</div>
                          <input type="range" min={-Math.floor(bs.battMWh * 0.4)} max={Math.ceil(bs.battMWh * 0.3)} step={500}
                            value={adj.dBattMWh} onChange={e => updateRel(s.id, "dBattMWh", parseInt(e.target.value))}
                            style={{ width: "100%", height: 2, accentColor: "#2D8C6F" }} />
                          <div style={{ fontSize: 9, fontFamily: F.m, color: adj.dBattMWh === 0 ? "#6B7280" : adj.dBattMWh > 0 ? "#2D8C6F" : "#C24B4B" }}>
                            {adj.dBattMWh >= 0 ? "+" : ""}{(adj.dBattMWh / 1000).toFixed(1)} GWh
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ ...PS, borderColor: "#2A3040" }}>
              <div style={SL}>RELIABILITY INSIGHT</div>
              <div style={{ fontSize: 11, lineHeight: 1.7, color: "#D1D5DB" }}>
                {(() => {
                  const costs = SCEN.map(s => ({ short: s.short, color: s.color, lcoe: results[s.id].lcoe, rel: computed[s.id].disp.stats.reliability }));
                  const cheapest = costs.reduce((a, b) => a.lcoe < b.lcoe ? a : b);
                  const mostReliable = costs.reduce((a, b) => a.rel > b.rel ? a : b);
                  return (
                    <>
                      All configs sized for 100% reliability baseline. Drag sliders left to strip capacity and watch reliability degrade {"\u2014"} this reveals each config's
                      reliability margin. <span style={{ color: "#C24B4B" }}>Gas</span> has N+1 turbine redundancy built in. <span style={{ color: "#D4A026" }}>Solar+Batt</span> needs
                      massive storage to cover multi-day cloud events. The yellow bars in the PROFILES tab show unmet load when you undersize. The cost of 100% reliability
                      vs. 99% reliability is the marginal cost of that last unit of storage or generation.
                    </>
                  );
                })()}
              </div>
            </div>
          </>)}

          {/* ===== PROFILES ===== */}
          {tab==="profiles"&&(<>
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              {SCEN.map(s=>(<button key={s.id} style={{...TS(profCfg===s.id),borderColor:profCfg===s.id?s.color+"80":"transparent"}} onClick={()=>setProfCfg(s.id)}>{s.short}</button>))}
            </div>
            <div style={PS}>
              <div style={SL}>72-HR DISPATCH {"\u2014"} {SCEN.find(s=>s.id===profCfg)?.short}</div>
              <div style={{fontSize:8,color:"#4B5563",fontFamily:F.m,marginBottom:6}}>Stacked gen vs flat load. Yellow bars = unmet load. Red = curtailment. Day 2 has a wind lull stress event.</div>
              <PChart profile={computed[profCfg].disp} p={p}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[
                {l:"RELIABILITY",v:`${computed[profCfg].disp.stats.reliability.toFixed(2)}%`,c:computed[profCfg].disp.stats.reliability>=99.9?"#2D8C6F":"#E8A838"},
                {l:"CURTAILMENT",v:`${computed[profCfg].disp.stats.curtailPct.toFixed(1)}%`,c:computed[profCfg].disp.stats.curtailPct>10?"#C24B4B":"#6B7280"},
                {l:"UNMET LOAD",v:`${computed[profCfg].disp.stats.totUnmet.toFixed(0)} MWh`,c:computed[profCfg].disp.stats.totUnmet>0?"#FFD700":"#2D8C6F"},
                {l:"AVG GAS",v:`${computed[profCfg].disp.stats.avgGas.toFixed(0)} MW`,c:"#C24B4B"},
              ].map(m=>(<div key={m.l} style={{...PS,padding:10}}><div style={{fontSize:8,color:"#6B7280",fontFamily:F.m,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div><div style={{fontSize:16,fontWeight:700,fontFamily:F.m,color:m.c,lineHeight:1.2}}>{m.v}</div></div>))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {SCEN.filter(s=>s.id!==profCfg).map(s=>(<div key={s.id} style={{background:"#0C0F14",borderRadius:4,padding:8}}>
                <div style={{fontSize:9,fontFamily:F.m,color:s.color,fontWeight:600,marginBottom:2}}>{s.short} <span style={{color:computed[s.id].disp.stats.reliability>=99.9?"#2D8C6F":"#E8A838",fontWeight:400}}>{computed[s.id].disp.stats.reliability.toFixed(1)}%</span></div>
                <PChart profile={computed[s.id].disp} p={p} height={140}/>
              </div>))}
            </div>
          </>)}

          {/* ===== SLD ===== */}
          {tab==="sld"&&(<>
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              {SCEN.map(s=>(<button key={s.id} style={{...TS(sldCfg===s.id),borderColor:sldCfg===s.id?s.color+"80":"transparent"}} onClick={()=>setSldCfg(s.id)}>{s.short}</button>))}
            </div>
            <SLD configId={sldCfg} sz={computed[sldCfg].sz} p={p} gasEquip={gasEquip} gasMetrics={gasMetrics}/>
          </>)}


          {/* ===== TORNADO ===== */}
          {tab==="tornado"&&(<>
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              {SCEN.map(s=>(<button key={s.id} style={{...TS(torCfg===s.id),borderColor:torCfg===s.id?s.color+"80":"transparent"}} onClick={()=>setTorCfg(s.id)}>{s.short}</button>))}
            </div>
            <div style={PS}>
              <div style={SL}>TORNADO SENSITIVITY {"\u2014"} {SCEN.find(s=>s.id===torCfg)?.short}</div>
              <div style={{fontSize:9,color:"#6B7280",fontFamily:F.m,marginBottom:10}}>Shows how ± changes in each input affect LCOE. <span style={{color:"#2D8C6F"}}>Green = lower cost</span>, <span style={{color:"#C24B4B"}}>Red = higher cost</span>. Sorted by impact.</div>
              {(()=>{const bL=results[torCfg].lcoe;const sc=SCEN.find(s=>s.id===torCfg);
                const sorted=tornado.map(v=>{const lo=v.loR[torCfg].lcoe,hi=v.hiR[torCfg].lcoe;return{...v,lo,hi,imp:Math.abs(hi-lo)};}).sort((a,b)=>b.imp-a.imp);
                const mI=Math.max(...sorted.map(s=>s.imp));
                return sorted.map(v=>{if(v.imp<0.1)return null;const lD=v.lo-bL,hD=v.hi-bL,mn=Math.min(lD,hD),mx=Math.max(lD,hD),sc2=200/(mI||1);
                  const fV=(val,u)=>u==="%"?`${(val*100).toFixed(1)}%`:`$${val.toFixed(val<10?2:0)}`;
                  return(<div key={v.key} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{width:100,fontSize:9,fontFamily:F.m,color:"#9CA3AF",textAlign:"right",flexShrink:0}}>{v.label}</div>
                    <div style={{width:45,fontSize:8,fontFamily:F.m,color:"#6B7280",textAlign:"right",flexShrink:0}}>{fV(v.loVal,v.u)}</div>
                    <div style={{flex:1,position:"relative",height:18}}>
                      <div style={{position:"absolute",left:"50%",top:0,width:1,height:18,background:"#2A3040"}}/>
                      <div style={{position:"absolute",left:mn<0?`${50+mn*sc2/2}%`:"50%",width:`${Math.abs(mn)*sc2/2}%`,height:18,background:mn<0?"#2D8C6F80":"#C24B4B80",borderRadius:2,top:0}}/>
                      <div style={{position:"absolute",left:mx<0?`${50+mx*sc2/2}%`:"50%",width:`${Math.abs(mx)*sc2/2}%`,height:18,background:mx>0?"#C24B4B80":"#2D8C6F80",borderRadius:2,top:0}}/>
                      <div style={{position:"absolute",left:"50%",top:0,transform:"translateX(-50%)",height:18,display:"flex",alignItems:"center",fontSize:8,fontFamily:F.m,color:"#E8E6E1",fontWeight:600,pointerEvents:"none"}}>${bL.toFixed(1)}</div>
                    </div>
                    <div style={{width:45,fontSize:8,fontFamily:F.m,color:"#6B7280",flexShrink:0}}>{fV(v.hiVal,v.u)}</div>
                    <div style={{width:55,fontSize:9,fontFamily:F.m,color:sc.color,textAlign:"right",flexShrink:0,fontWeight:600}}>{"\u00B1"}${(v.imp/2).toFixed(1)}</div>
                  </div>);});})()}
            </div>
          </>)}

          {/* ===== SCENARIOS ===== */}
          {tab==="scenarios"&&(<>
            {/* Cross-config live comparison - always visible at top */}
            <div style={PS}>
              <div style={SL}>ALL CONFIGS {"\u2014"} BULL vs BASE vs BEAR (per-config stress)</div>
              <div style={{ fontSize: 8, color: "#4B5563", fontFamily: F.m, marginBottom: 8 }}>
                Each config stressed with its own best/worst inputs. Click a row to drill in below.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: F.m }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2A3040" }}>
                    <th style={{ padding: "6px 4px", textAlign: "left", color: "#6B7280", fontSize: 8 }}>CONFIG</th>
                    <th style={{ padding: "6px 4px", textAlign: "right", color: "#2D8C6F", fontSize: 8 }}>BULL</th>
                    <th style={{ padding: "6px 4px", textAlign: "right", color: "#E8E6E1", fontSize: 8 }}>BASE</th>
                    <th style={{ padding: "6px 4px", textAlign: "right", color: "#C24B4B", fontSize: 8 }}>BEAR</th>
                    <th style={{ padding: "6px 4px", textAlign: "right", color: "#E8A838", fontSize: 8 }}>RANGE</th>
                    <th style={{ padding: "6px 4px", textAlign: "right", color: "#6B7280", fontSize: 8 }}>EXPOSURE</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = SCEN.map(s2 => {
                      const sr2 = scenarioResults[s2.id];
                      if (!sr2) return null;
                      const bu = sr2.bull?.lcoe || 0;
                      const ba = sr2.base?.lcoe || 0;
                      const be = sr2.bear?.lcoe || 0;
                      const rng = be - bu;
                      return { s: s2, bu, ba, be, rng };
                    }).filter(Boolean);
                    const minRng = Math.min(...rows.map(r => r.rng));
                    return rows.map(r => (
                      <tr key={r.s.id}
                        onClick={() => setScenCfg(r.s.id)}
                        style={{ borderBottom: "1px solid #1E2330", background: r.s.id === scenCfg ? "#1A1D25" : "transparent", cursor: "pointer" }}>
                        <td style={{ padding: "6px 4px", color: r.s.color, fontWeight: 600 }}>
                          {r.s.id === scenCfg ? "\u25B6 " : ""}{r.s.short}
                        </td>
                        <td style={{ padding: "6px 4px", textAlign: "right", color: "#2D8C6F" }}>${r.bu.toFixed(1)}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", color: "#E8E6E1" }}>${r.ba.toFixed(1)}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", color: "#C24B4B" }}>${r.be.toFixed(1)}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", color: "#E8E6E1", fontWeight: 600 }}>
                          ${r.rng.toFixed(1)} {Math.abs(r.rng - minRng) < 0.5 && <span style={{ color: "#E8A838" }}>{"\u2605"}</span>}
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", height: 14 }}>
                            <div style={{ flex: 1, height: 6, background: "#1E2330", borderRadius: 3, position: "relative" }}>
                              <div style={{
                                position: "absolute",
                                left: `${Math.max(0, (r.bu / (r.be * 1.1)) * 100)}%`,
                                width: `${Math.max(2, ((r.be - r.bu) / (r.be * 1.1)) * 100)}%`,
                                height: 6,
                                background: `linear-gradient(90deg, #2D8C6F, ${r.s.color}, #C24B4B)`,
                                borderRadius: 3,
                              }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Config selector */}
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              {SCEN.map(s=>(<button key={s.id} style={{...TS(scenCfg===s.id),borderColor:scenCfg===s.id?s.color+"80":"transparent"}} onClick={()=>setScenCfg(s.id)}>{s.short}</button>))}
            </div>

            {(() => {
              const si = SCENARIO_INPUTS[scenCfg];
              const sc = SCEN.find(s => s.id === scenCfg);
              const sr = scenarioResults[scenCfg];
              if (!si || !sr) return null;
              const bullLcoe = sr.bull?.lcoe || 0;
              const baseLcoe = sr.base?.lcoe || 0;
              const bearLcoe = sr.bear?.lcoe || 0;
              const customLcoe = sr.custom?.lcoe || 0;
              const bl = blendSlider[scenCfg];

              // Get current custom values for display
              const customParams = sr.customParams || p;

              return (
                <>
                  {/* LCOE summary: BULL | BASE | BEAR + custom */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { label: "BULL", sub: si.bullLabel, lcoe: bullLcoe, color: "#2D8C6F", bg: "#0D2818" },
                      { label: "BASE", sub: "Current assumptions", lcoe: baseLcoe, color: "#E8E6E1", bg: "#1A1A1A" },
                      { label: "BEAR", sub: si.bearLabel, lcoe: bearLcoe, color: "#C24B4B", bg: "#2A1515" },
                      { label: "CUSTOM", sub: `Blend: ${bl < 0.5 ? "bear" : bl > 0.5 ? "bull" : "base"}-leaning`, lcoe: customLcoe, color: sc.color, bg: "#12151C" },
                    ].map(c => (
                      <div key={c.label} style={{ ...PS, background: c.bg, borderColor: c.color + "30", padding: 12 }}>
                        <div style={{ fontSize: 9, fontFamily: F.m, color: c.color, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: F.m, color: c.color, lineHeight: 1 }}>${c.lcoe.toFixed(1)}</div>
                        <div style={{ fontSize: 8, color: "#6B7280", fontFamily: F.m }}>/MWh</div>
                        <div style={{ fontSize: 8, color: "#4B5563", fontFamily: F.m, marginTop: 6, lineHeight: 1.4 }}>{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Master blend slider */}
                  <div style={PS}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={SL}>SCENARIO BLEND</div>
                      <div style={{ fontSize: 9, fontFamily: F.m, color: "#9CA3AF" }}>
                        Drag to interpolate all assumptions between bear and bull
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontFamily: F.m, color: "#C24B4B", flexShrink: 0 }}>BEAR</span>
                      <input type="range" min={0} max={1} step={0.02} value={bl}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setBlendSlider(prev => ({ ...prev, [scenCfg]: v }));
                          setScenBlends(prev => ({ ...prev, [scenCfg]: {} })); // clear overrides
                        }}
                        style={{ flex: 1, height: 3, accentColor: sc.color }} />
                      <span style={{ fontSize: 9, fontFamily: F.m, color: "#2D8C6F", flexShrink: 0 }}>BULL</span>
                    </div>
                    <div style={{ textAlign: "center", fontSize: 10, fontFamily: F.m, color: sc.color, fontWeight: 600, marginTop: 4 }}>
                      Custom LCOE: ${customLcoe.toFixed(1)}/MWh
                    </div>
                  </div>

                  {/* Assumption table with per-input sliders */}
                  <div style={PS}>
                    <div style={SL}>ASSUMPTIONS {"\u2014"} {sc.short}</div>
                    <div style={{ fontSize: 8, color: "#4B5563", fontFamily: F.m, marginBottom: 10 }}>
                      Each row shows bull/base/bear values. Adjust individual inputs to override the blend.
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: F.m }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #2A3040" }}>
                          <th style={{ padding: "6px 4px", textAlign: "left", color: "#6B7280", fontSize: 8, width: 110 }}>INPUT</th>
                          <th style={{ padding: "6px 4px", textAlign: "right", color: "#2D8C6F", fontSize: 8, width: 60 }}>BULL</th>
                          <th style={{ padding: "6px 4px", textAlign: "right", color: "#E8E6E1", fontSize: 8, width: 60 }}>BASE</th>
                          <th style={{ padding: "6px 4px", textAlign: "right", color: "#C24B4B", fontSize: 8, width: 60 }}>BEAR</th>
                          <th style={{ padding: "6px 4px", textAlign: "center", color: sc.color, fontSize: 8 }}>CUSTOM</th>
                          <th style={{ padding: "6px 4px", textAlign: "right", color: sc.color, fontSize: 8, width: 65 }}>VALUE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {si.inputs.map(inp => {
                          const curVal = customParams[inp.key] !== undefined ? customParams[inp.key] : inp.base;
                          const fmtV = (v) => inp.unit === "%" ? `${(v * 100).toFixed(1)}%` : inp.unit === "$/MMBtu" ? `$${v.toFixed(2)}` : inp.unit === "MMBtu/MWh" ? v.toFixed(1) : `$${v.toFixed(0)}`;
                          const sliderMin = Math.min(inp.bull, inp.bear);
                          const sliderMax = Math.max(inp.bull, inp.bear);
                          const step = inp.unit === "%" ? 0.01 : inp.unit === "$/MMBtu" ? 0.25 : inp.unit === "MMBtu/MWh" ? 0.1 : 10;

                          return (
                            <tr key={inp.key} style={{ borderBottom: "1px solid #1E2330" }}>
                              <td style={{ padding: "6px 4px", color: "#9CA3AF", fontSize: 9 }}>{inp.label}</td>
                              <td style={{ padding: "6px 4px", textAlign: "right", color: "#2D8C6F", fontSize: 9 }}>{fmtV(inp.bull)}</td>
                              <td style={{ padding: "6px 4px", textAlign: "right", color: "#E8E6E1", fontSize: 9 }}>{fmtV(inp.base)}</td>
                              <td style={{ padding: "6px 4px", textAlign: "right", color: "#C24B4B", fontSize: 9 }}>{fmtV(inp.bear)}</td>
                              <td style={{ padding: "4px 8px" }}>
                                <input type="range"
                                  min={sliderMin} max={sliderMax} step={step}
                                  value={curVal}
                                  onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    setScenBlends(prev => ({
                                      ...prev,
                                      [scenCfg]: { ...prev[scenCfg], [inp.key]: v },
                                    }));
                                  }}
                                  style={{ width: "100%", height: 2, accentColor: sc.color }}
                                />
                              </td>
                              <td style={{ padding: "6px 4px", textAlign: "right", color: sc.color, fontSize: 10, fontWeight: 600 }}>
                                {fmtV(curVal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </>)}

          {/* ===== SIZING ===== */}
          {tab==="sizing"&&(
            <div style={PS}>
              <div style={SL}>INFRASTRUCTURE SIZING {"\u2014"} 100% RELIABLE</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:F.m}}>
                <thead><tr style={{borderBottom:"1px solid #2A3040"}}>
                  {["Config","Solar MW","Wind MW","Gas MW","Batt MW","Batt GWh","Overbuild","Capex","Reliability"].map(h=>
                    <th key={h} style={{padding:"6px 4px",textAlign:"right",color:"#6B7280",fontWeight:500,fontSize:8}}>{h}</th>)}
                </tr></thead>
                <tbody>{SCEN.map(s=>{const r=results[s.id],sz=computed[s.id].sz,d=computed[s.id].disp.stats;return(
                  <tr key={s.id} style={{borderBottom:"1px solid #1E2330"}}>
                    <td style={{padding:"6px 4px",color:s.color,fontWeight:600}}>{s.short}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:sz.solarMW?"#E8E6E1":"#2A3040"}}>{sz.solarMW?sz.solarMW.toLocaleString():"\u2014"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:sz.windMW?"#E8E6E1":"#2A3040"}}>{sz.windMW?sz.windMW.toLocaleString():"\u2014"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:sz.gasMW?"#E8E6E1":"#2A3040"}}>{sz.gasMW?sz.gasMW.toLocaleString():"\u2014"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:sz.battMW?"#E8E6E1":"#2A3040"}}>{sz.battMW?sz.battMW.toLocaleString():"\u2014"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:sz.battMWh?"#E8E6E1":"#2A3040"}}>{sz.battMWh?(sz.battMWh/1000).toFixed(1):"\u2014"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}>{r.overbuild.toFixed(1)}x</td>
                    <td style={{padding:"6px 4px",textAlign:"right",fontWeight:600}}>{fmt$(r.netCapex)}</td>
                    <td style={{padding:"6px 4px",textAlign:"right",color:d.reliability>=99.9?"#2D8C6F":"#E8A838"}}>{d.reliability.toFixed(1)}%</td>
                  </tr>);})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
