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
          <div><span style={{color:"#6B7280"}}>Heat Rate:</span> <span style={{color:"#C9B896"}}>{gasConfig.weightedHR} MMBtu/MWh</span></div>
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
// Current formula: Amps = MW × 1000 / (√3 × kV × PF)
function calcAmps(mw, kv, pf=0.9) {
  return mw * 1000 / (Math.sqrt(3) * kv * pf);
}

function SLD({configId, sz, p, gasEquip, gasMetrics}) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [showCurrents, setShowCurrents] = useState(true);

  const L = p.loadMW;
  const W = 1100, H = 900;

  const hasSolar = sz.solarMW > 0, hasWind = sz.windMW > 0, hasGas = sz.gasMW > 0, hasBatt = (sz.battMW||0) > 0;
  const solarMW = sz.solarMW || 0, windMW = sz.windMW || 0, gasMW = sz.gasMW || 0, battMW = sz.battMW || 0, battMWh = sz.battMWh || 0;
  const totalGenMW = solarMW + windMW + gasMW;

  const COLORS = {
    bus345: "#ef4444", bus230: "#f59e0b", bus138: "#f97316", bus34: "#06b6d4",
    bus13: "#a78bfa", bus12: "#10b981", bus480: "#ff9f43",
    solar: "#eab308", wind: "#3b82f6", gas: "#ef4444", battery: "#10b981",
    wire: "#4b5563", text: "#9ca3af",
  };

  // Voltage bus Y positions - plenty of vertical space
  const Y = {
    bus345: 80,    // H-frames connect here
    bus230: 180,   // Main HV bus
    bus138: 280,   // F-frames connect here
    bus34: 400,    // Collection bus - Aeros connect here
    bus12: 540,    // Distribution to DC
    dc: 700,       // Data center
  };

  const margin = 50;
  const busWidth = W - margin * 2;

  // Gas equipment counts
  const hCount = gasEquip?.hframe || 0;
  const fCount = gasEquip?.fframe || 0;
  const aCount = gasEquip?.aero || 0;
  const rCount = gasEquip?.recip || 0;
  const hasH = hCount > 0, hasF = fCount > 0, hasA = aCount > 0, hasR = rCount > 0;

  // Current calculations
  const mvAmps = calcAmps(L, 34.5);
  const distAmps = calcAmps(L, 12.47);
  const numXfmrs = Math.max(2, Math.ceil(distAmps / 1500));

  // Simple reusable components
  const Bus = ({y, color, label, amps}) => (
    <g>
      <line x1={margin} y1={y} x2={margin+busWidth} y2={y} stroke={color} strokeWidth={5} strokeLinecap="round"/>
      <text x={margin-8} y={y+4} fill={color} fontSize={10} fontFamily={F.m} fontWeight={700} textAnchor="end">{label}</text>
      {showCurrents && amps > 0 && (
        <text x={margin+busWidth+8} y={y+4} fill={color} fontSize={9} fontFamily={F.m}>{Math.round(amps).toLocaleString()}A</text>
      )}
    </g>
  );

  const Gen = ({x, y, label, mw, color, type}) => {
    const isHovered = hoveredNode === label;
    return (
      <g onMouseEnter={()=>setHoveredNode(label)} onMouseLeave={()=>setHoveredNode(null)} style={{cursor:"pointer"}}>
        <circle cx={x} cy={y} r={18} fill={isHovered ? color+"22" : "#0f1115"} stroke={color} strokeWidth={2}/>
        <text x={x} y={y+5} textAnchor="middle" fill={color} fontSize={11} fontWeight={700} fontFamily={F.m}>G</text>
        <text x={x} y={y+32} textAnchor="middle" fill={color} fontSize={9} fontWeight={600} fontFamily={F.m}>{label}</text>
        <text x={x} y={y+44} textAnchor="middle" fill="#6b7280" fontSize={8} fontFamily={F.m}>{mw}MW</text>
      </g>
    );
  };

  const Xfmr = ({x, y1, y2, label, color1, color2}) => {
    const midY = (y1 + y2) / 2;
    return (
      <g>
        <line x1={x} y1={y1} x2={x} y2={midY-12} stroke={color1 || "#4b5563"} strokeWidth={2}/>
        <circle cx={x} cy={midY-6} r={8} fill="none" stroke="#fbbf24" strokeWidth={2}/>
        <circle cx={x} cy={midY+6} r={8} fill="none" stroke="#fbbf24" strokeWidth={2}/>
        <line x1={x} y1={midY+12} x2={x} y2={y2} stroke={color2 || "#4b5563"} strokeWidth={2}/>
        {label && <text x={x+14} y={midY+4} fill="#6b7280" fontSize={8} fontFamily={F.m}>{label}</text>}
      </g>
    );
  };

  const Box = ({x, y, w, h, label, sub, color}) => (
    <g>
      <rect x={x-w/2} y={y-h/2} width={w} height={h} rx={4} fill={color+"18"} stroke={color+"55"} strokeWidth={2}/>
      <text x={x} y={y} textAnchor="middle" fill={color} fontSize={10} fontWeight={600} fontFamily={F.m}>{label}</text>
      {sub && <text x={x} y={y+14} textAnchor="middle" fill="#6b7280" fontSize={8} fontFamily={F.m}>{sub}</text>}
    </g>
  );

  return (
    <div style={{padding:12, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8}}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:"#E8E6E1", fontFamily:F.m}}>Single Line Diagram — {configId.toUpperCase()}</div>
          <div style={{fontSize:9, color:"#6B7280", fontFamily:F.m}}>
            {totalGenMW.toLocaleString()} MW generation → {L} MW load
            {hasGas && gasMetrics && ` • Gas: HR ${gasMetrics.weightedHeatRate?.toFixed(1)}, Start ${gasMetrics.avgStartup?.toFixed(0)}min`}
          </div>
        </div>
        <label style={{display:"flex", alignItems:"center", gap:5, fontSize:9, color:"#9ca3af", cursor:"pointer"}}>
          <input type="checkbox" checked={showCurrents} onChange={()=>setShowCurrents(!showCurrents)} style={{accentColor:"#f97316"}}/>
          Show Currents
        </label>
      </div>

      <div style={{overflowX:"auto", background:"#0a0c0f", borderRadius:6, border:"1px solid #1f2937"}}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1f2937" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)"/>

          {/* ========== 345kV BUS - H-FRAMES ========== */}
          {hasH && (
            <g>
              <Bus y={Y.bus345} color={COLORS.bus345} label="345kV" amps={calcAmps(hCount*400, 345)}/>
              <text x={margin+busWidth-5} y={Y.bus345-12} fill="#6b7280" fontSize={8} fontFamily={F.m} textAnchor="end">H-Frame Combined Cycle</text>

              {/* H-Frame generators */}
              {Array.from({length: Math.min(hCount, 3)}).map((_, i) => {
                const x = margin + 100 + i * 120;
                return (
                  <g key={"h-"+i}>
                    <Gen x={x} y={Y.bus345-70} label={`H-${i+1}`} mw={400} color="#6366f1" type="hframe"/>
                    <Xfmr x={x} y1={Y.bus345-50} y2={Y.bus345} label="GSU" color1="#6366f1" color2={COLORS.bus345}/>
                  </g>
                );
              })}
              {hCount > 3 && <text x={margin+100+3*120} y={Y.bus345-60} fill="#6b7280" fontSize={9} fontFamily={F.m}>+{hCount-3} more</text>}

              {/* 345kV to 230kV tie */}
              <Xfmr x={margin+busWidth-100} y1={Y.bus345} y2={Y.bus230} label="AUTO" color1={COLORS.bus345} color2={COLORS.bus230}/>
            </g>
          )}

          {/* ========== 230kV BUS - MAIN HV ========== */}
          <Bus y={Y.bus230} color={COLORS.bus230} label="230kV" amps={calcAmps(totalGenMW, 230)}/>
          <text x={margin+busWidth-5} y={Y.bus230-12} fill="#6b7280" fontSize={8} fontFamily={F.m} textAnchor="end">Main HV Bus</text>

          {/* Solar connects to 230kV */}
          {hasSolar && (
            <g>
              <Box x={margin+80} y={Y.bus230-70} w={70} h={45} label="SOLAR" sub={`${solarMW}MW`} color={COLORS.solar}/>
              <Xfmr x={margin+80} y1={Y.bus230-45} y2={Y.bus230} label="SSU" color1={COLORS.solar} color2={COLORS.bus230}/>
            </g>
          )}

          {/* Wind connects to 230kV */}
          {hasWind && (
            <g>
              <Box x={margin+200} y={Y.bus230-70} w={70} h={45} label="WIND" sub={`${windMW}MW`} color={COLORS.wind}/>
              <Xfmr x={margin+200} y1={Y.bus230-45} y2={Y.bus230} label="PAD" color1={COLORS.wind} color2={COLORS.bus230}/>
            </g>
          )}

          {/* Battery connects to 230kV */}
          {hasBatt && (
            <g>
              <Box x={margin+320} y={Y.bus230-70} w={70} h={45} label="BESS" sub={`${battMW}MW/${(battMWh/1000).toFixed(1)}GWh`} color={COLORS.battery}/>
              <Xfmr x={margin+320} y1={Y.bus230-45} y2={Y.bus230} label="PCS" color1={COLORS.battery} color2={COLORS.bus230}/>
            </g>
          )}

          {/* 230kV to 138kV/34.5kV tie (if no F-frames, skip 138kV) */}
          {!hasF && (
            <Xfmr x={W/2} y1={Y.bus230} y2={Y.bus34} label="MAIN TIE" color1={COLORS.bus230} color2={COLORS.bus34}/>
          )}
          {hasF && (
            <Xfmr x={W/2+150} y1={Y.bus230} y2={Y.bus138} label="TIE" color1={COLORS.bus230} color2={COLORS.bus138}/>
          )}

          {/* ========== 138kV BUS - F-FRAMES ========== */}
          {hasF && (
            <g>
              <Bus y={Y.bus138} color={COLORS.bus138} label="138kV" amps={calcAmps(fCount*200, 138)}/>
              <text x={margin+busWidth-5} y={Y.bus138-12} fill="#6b7280" fontSize={8} fontFamily={F.m} textAnchor="end">F-Frame Combined Cycle</text>

              {/* F-Frame generators */}
              {Array.from({length: Math.min(fCount, 5)}).map((_, i) => {
                const x = margin + 80 + i * 100;
                return (
                  <g key={"f-"+i}>
                    <Gen x={x} y={Y.bus138-70} label={`F-${i+1}`} mw={200} color="#f97316" type="fframe"/>
                    <Xfmr x={x} y1={Y.bus138-50} y2={Y.bus138} label="" color1="#f97316" color2={COLORS.bus138}/>
                  </g>
                );
              })}
              {fCount > 5 && <text x={margin+80+5*100} y={Y.bus138-60} fill="#6b7280" fontSize={9} fontFamily={F.m}>+{fCount-5} more</text>}

              {/* 138kV to 34.5kV tie */}
              <Xfmr x={margin+busWidth-100} y1={Y.bus138} y2={Y.bus34} label="TIE" color1={COLORS.bus138} color2={COLORS.bus34}/>
            </g>
          )}

          {/* ========== 34.5kV BUS - COLLECTION ========== */}
          <Bus y={Y.bus34} color={COLORS.bus34} label="34.5kV" amps={mvAmps}/>
          <text x={margin+busWidth-5} y={Y.bus34-12} fill="#6b7280" fontSize={8} fontFamily={F.m} textAnchor="end">Collection Bus</text>

          {/* Aero generators connect to 34.5kV */}
          {hasA && (
            <g>
              {Array.from({length: Math.min(aCount, 6)}).map((_, i) => {
                const x = margin + 80 + i * 80;
                return (
                  <g key={"a-"+i}>
                    <Gen x={x} y={Y.bus34-65} label={`A-${i+1}`} mw={50} color="#06b6d4" type="aero"/>
                    <Xfmr x={x} y1={Y.bus34-45} y2={Y.bus34} label="" color1="#06b6d4" color2={COLORS.bus34}/>
                  </g>
                );
              })}
              {aCount > 6 && <text x={margin+80+6*80} y={Y.bus34-55} fill="#06b6d4" fontSize={9} fontFamily={F.m}>+{aCount-6} Aeros</text>}
            </g>
          )}

          {/* Recip generators - shown as summary box connecting to 34.5kV */}
          {hasR && (
            <g>
              <rect x={margin+busWidth-180} y={Y.bus34-80} width={120} height={55} rx={4} fill="#22c55e15" stroke="#22c55e44"/>
              <text x={margin+busWidth-120} y={Y.bus34-58} textAnchor="middle" fill="#22c55e" fontSize={10} fontWeight={600} fontFamily={F.m}>{rCount}× RECIP</text>
              <text x={margin+busWidth-120} y={Y.bus34-42} textAnchor="middle" fill="#6b7280" fontSize={8} fontFamily={F.m}>{rCount*20}MW total</text>
              <text x={margin+busWidth-120} y={Y.bus34-28} textAnchor="middle" fill="#4b5563" fontSize={7} fontFamily={F.m}>5 min fast start</text>
              <line x1={margin+busWidth-120} y1={Y.bus34-25} x2={margin+busWidth-120} y2={Y.bus34} stroke="#22c55e" strokeWidth={2}/>
            </g>
          )}

          {/* ========== 12.47kV BUS - DISTRIBUTION ========== */}
          <Bus y={Y.bus12} color={COLORS.bus12} label="12.47kV" amps={distAmps}/>
          <text x={margin+busWidth-5} y={Y.bus12-12} fill="#6b7280" fontSize={8} fontFamily={F.m} textAnchor="end">Distribution ({numXfmrs} transformers needed)</text>

          {/* Main transformers 34.5kV to 12.47kV */}
          {[0, 1, 2].map(i => {
            const x = margin + 200 + i * 200;
            return (
              <g key={"main-"+i}>
                <Xfmr x={x} y1={Y.bus34} y2={Y.bus12} label={i===1 ? `MAIN ${i+1}` : ""} color1={COLORS.bus34} color2={COLORS.bus12}/>
              </g>
            );
          })}
          {numXfmrs > 3 && (
            <text x={W/2} y={(Y.bus34+Y.bus12)/2+25} textAnchor="middle" fill="#4b5563" fontSize={8} fontFamily={F.m}>(showing 3 of {numXfmrs})</text>
          )}

          {/* ========== DATA CENTER ========== */}
          {/* Feeders to 480V */}
          {[0, 1, 2, 3].map(i => {
            const x = margin + 200 + i * 150;
            return (
              <g key={"dc-"+i}>
                <line x1={x} y1={Y.bus12} x2={x} y2={Y.dc-50} stroke={COLORS.bus12} strokeWidth={2}/>
                <rect x={x-18} y={Y.dc-48} width={36} height={18} rx={3} fill="#ff9f4322" stroke="#ff9f4355"/>
                <text x={x} y={Y.dc-35} textAnchor="middle" fill="#ff9f43" fontSize={8} fontFamily={F.m}>480V</text>
                <line x1={x} y1={Y.dc-30} x2={x} y2={Y.dc-15} stroke="#ff9f43" strokeWidth={2} strokeDasharray="4,2"/>
              </g>
            );
          })}

          {/* Data Center Load */}
          <rect x={W/2-100} y={Y.dc-10} width={200} height={70} rx={6} fill="#f9731615" stroke="#f9731655" strokeWidth={2}/>
          <text x={W/2} y={Y.dc+20} textAnchor="middle" fill="#f97316" fontSize={14} fontWeight={700} fontFamily={F.m}>DATA CENTER</text>
          <text x={W/2} y={Y.dc+40} textAnchor="middle" fill="#f97316aa" fontSize={10} fontFamily={F.m}>{L} MW Load</text>

          {/* Voltage level annotations */}
          <text x={W-20} y={Y.bus345+5} fill="#374151" fontSize={7} fontFamily={F.m} textAnchor="end">EHV Generation</text>
          <text x={W-20} y={Y.bus230+5} fill="#374151" fontSize={7} fontFamily={F.m} textAnchor="end">HV Transmission</text>
          {hasF && <text x={W-20} y={Y.bus138+5} fill="#374151" fontSize={7} fontFamily={F.m} textAnchor="end">HV Generation</text>}
          <text x={W-20} y={Y.bus34+5} fill="#374151" fontSize={7} fontFamily={F.m} textAnchor="end">MV Collection</text>
          <text x={W-20} y={Y.bus12+5} fill="#374151" fontSize={7} fontFamily={F.m} textAnchor="end">MV Distribution</text>

          {/* Empty state */}
          {!hasSolar && !hasWind && !hasGas && !hasBatt && (
            <text x={W/2} y={H/2} textAnchor="middle" fill="#374151" fontSize={12} fontFamily={F.m}>
              Configure generation sources to see diagram
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{display:"flex", flexWrap:"wrap", gap:12, marginTop:10, fontSize:9, color:"#9ca3af", fontFamily:F.m}}>
        {hasH && <span><span style={{color:"#6366f1"}}>●</span> H-Frame 400MW @ 345kV</span>}
        {hasF && <span><span style={{color:"#f97316"}}>●</span> F-Frame 200MW @ 138kV</span>}
        {hasA && <span><span style={{color:"#06b6d4"}}>●</span> Aero 50MW @ 34.5kV</span>}
        {hasR && <span><span style={{color:"#22c55e"}}>●</span> Recip 20MW</span>}
        {hasSolar && <span><span style={{color:COLORS.solar}}>●</span> Solar</span>}
        {hasWind && <span><span style={{color:COLORS.wind}}>●</span> Wind</span>}
        {hasBatt && <span><span style={{color:COLORS.battery}}>●</span> Battery</span>}
        <span style={{marginLeft:"auto", color:"#6b7280"}}>Amps = MW × 1000 / (√3 × kV × 0.9)</span>
      </div>
    </div>
  );
}


// ============ MAIN APP ============
export default function App() {
  const [p, setP] = useState(DEF);
  const [tab, setTab] = useState("overview");
  const [tabOrder, setTabOrder] = useState(() => {
    const defaultOrder = ["overview","solar-wind corr","thesis","breakdown","profiles","scenarios","tornado","sld","buildout"];
    const saved = localStorage.getItem("lcoe_tabOrder_v2");
    if (!saved) return defaultOrder;
    const parsed = JSON.parse(saved);
    // Ensure new tabs are added if missing from saved order
    const missing = defaultOrder.filter(t => !parsed.includes(t));
    if (missing.length > 0) {
      const updated = [...parsed.slice(0,1), ...missing, ...parsed.slice(1)];
      localStorage.setItem("lcoe_tabOrder_v2", JSON.stringify(updated));
      return updated;
    }
    return parsed;
  });
  const [draggedTab, setDraggedTab] = useState(null);
  const handleTabDragStart = (e, t) => { setDraggedTab(t); e.dataTransfer.effectAllowed = "move"; };
  const handleTabDragOver = (e, t) => { e.preventDefault(); if (draggedTab && draggedTab !== t) { const newOrder = [...tabOrder]; const fromIdx = newOrder.indexOf(draggedTab); const toIdx = newOrder.indexOf(t); newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggedTab); setTabOrder(newOrder); localStorage.setItem("lcoe_tabOrder_v2", JSON.stringify(newOrder)); } };
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

  // Correlation tab state
  const [corrWindPeak, setCorrWindPeak] = useState(53);
  const [corrSolarPeak, setCorrSolarPeak] = useState(25);
  const [corrWindMW, setCorrWindMW] = useState(500);
  const [corrSolarMW, setCorrSolarMW] = useState(500);

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
            {/* Sizing table */}
            <div style={PS}>
              <div style={SL}>INFRASTRUCTURE SIZING</div>
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
                  style={{marginTop:4,padding:"4px 12px",fontSize:9,fontFamily:F.m,background:"#1E2330",color:"#9CA3AF",border:"1px solid #1E2330",borderRadius:3,cursor:"pointer"}}>+ ADD PHASE</button>
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

          {/* ===== THESIS ===== */}
          {tab==="thesis"&&(<>
            <div style={PS}>
              <div style={SL}>THE HYBRID ADVANTAGE — A DEEPER LOOK</div>
              <div style={{fontSize:11, color:"#E8E6E1", fontFamily:F.m, lineHeight:1.8, marginBottom:12}}>
                Why can a hybrid system (solar + wind + battery + gas) match or beat gas-only LCOE despite needing more types of equipment?
                The answer lies in <b style={{color:"#C9B896"}}>what each technology contributes</b> and <b style={{color:"#C9B896"}}>what it eliminates</b>.
              </div>
            </div>

            {/* Key Observations */}
            <div style={PS}>
              <div style={SL}>KEY INSIGHTS</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>

                <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:16}}>
                  <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px"}}>Battery Storage</div>
                  <div style={{fontSize:22, color:"#E8E6E1", fontFamily:F.m, fontWeight:700, marginBottom:8}}>
                    {computed.sb?.sz?.battMWh && computed.swgb?.sz?.battMWh ?
                      Math.round((1 - computed.swgb.sz.battMWh / computed.sb.sz.battMWh) * 100) : 94}% reduction
                  </div>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    Solar+Battery requires {computed.sb?.sz?.battMWh?.toLocaleString() || "23,000"} MWh.
                    Hybrid requires only {computed.swgb?.sz?.battMWh?.toLocaleString() || "1,400"} MWh.
                    Gas backup eliminates multi-day storage needs.
                  </div>
                </div>

                <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:16}}>
                  <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px"}}>Solar Capacity</div>
                  <div style={{fontSize:22, color:"#E8E6E1", fontFamily:F.m, fontWeight:700, marginBottom:8}}>
                    {computed.sb?.sz?.solarMW && computed.swgb?.sz?.solarMW ?
                      Math.round((1 - computed.swgb.sz.solarMW / computed.sb.sz.solarMW) * 100) : 80}% reduction
                  </div>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    Solar-only requires {computed.sb?.sz?.solarMW?.toLocaleString() || "5,500"} MW.
                    Hybrid requires only {computed.swgb?.sz?.solarMW?.toLocaleString() || "1,100"} MW.
                    No need to overbuild for worst-case scenarios.
                  </div>
                </div>

                <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:16}}>
                  <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px"}}>Gas Capacity</div>
                  <div style={{fontSize:22, color:"#E8E6E1", fontFamily:F.m, fontWeight:700, marginBottom:8}}>
                    {computed.gu?.sz?.gasMW && computed.swgb?.sz?.gasMW ?
                      Math.round((1 - computed.swgb.sz.gasMW / computed.gu.sz.gasMW) * 100) : 50}% reduction
                  </div>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    Gas-only requires {computed.gu?.sz?.gasMW?.toLocaleString() || "1,200"} MW at 100% utilization.
                    Hybrid requires only {computed.swgb?.sz?.gasMW?.toLocaleString() || "600"} MW.
                    Renewables displace 65% of fuel consumption.
                  </div>
                </div>

                <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:16}}>
                  <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px"}}>Resource Diversification</div>
                  <div style={{fontSize:22, color:"#E8E6E1", fontFamily:F.m, fontWeight:700, marginBottom:8}}>
                    Complementary profiles
                  </div>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    Solar peaks midday; wind peaks at night and winter.
                    Combined variability is lower than either alone.
                    Further reduces storage requirements.
                  </div>
                </div>
              </div>
            </div>

            {/* The Cost Tradeoff Frontier */}
            <div style={PS}>
              <div style={SL}>THE COST TRADEOFF — LCOE vs GAS RELIANCE</div>
              <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, marginBottom:12}}>
                As you reduce gas usage, what happens to cost? This curve reveals the tradeoff.
              </div>
              {(()=>{
                const W=750, H=320, pad={t:30,r:120,b:50,l:70};
                const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

                // Data points: gas fraction vs LCOE
                const data = SCEN.map(s => {
                  const r = results[s.id];
                  const gf = s.id==="gu"?1:s.id==="swgb"?0.35:0;
                  const sz = computed[s.id].sz;
                  const battMWh = sz.battMWh || 0;
                  const overbuild = r.overbuild;
                  return {
                    id: s.id,
                    name: s.short,
                    fullName: s.name,
                    color: s.color,
                    lcoe: r.lcoe,
                    gf,
                    battMWh,
                    overbuild,
                    capex: r.netCapex,
                    fuelCost: r.lcoeFuel
                  };
                }).sort((a,b) => b.gf - a.gf); // Sort by gas fraction descending

                const maxLcoe = Math.max(...data.map(d=>d.lcoe)) * 1.15;
                const minLcoe = Math.min(...data.map(d=>d.lcoe)) * 0.85;

                const x = (gf) => pad.l + (1 - gf) * cw; // 100% gas on left, 0% on right
                const y = (lcoe) => pad.t + ch - ((lcoe - minLcoe) / (maxLcoe - minLcoe)) * ch;

                return (
                  <svg width={W} height={H} style={{display:"block"}}>
                    {/* Grid */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <g key={"grid-"+pct}>
                        <line x1={pad.l} y1={pad.t+ch*pct} x2={pad.l+cw} y2={pad.t+ch*pct} stroke="#1E2330" strokeWidth={1}/>
                        <line x1={pad.l+cw*pct} y1={pad.t} x2={pad.l+cw*pct} y2={pad.t+ch} stroke="#1E2330" strokeWidth={1}/>
                      </g>
                    ))}

                    {/* Zones */}
                    <rect x={pad.l} y={pad.t} width={cw*0.35} height={ch} fill="#1a1d2510"/>
                    <rect x={pad.l+cw*0.35} y={pad.t} width={cw*0.35} height={ch} fill="#E8A83808"/>
                    <rect x={pad.l+cw*0.7} y={pad.t} width={cw*0.3} height={ch} fill="#1a1d2510"/>

                    <text x={pad.l+cw*0.15} y={pad.t+15} textAnchor="middle" fill="#ef4444" fontSize={8} fontFamily={F.m}>Gas Heavy</text>
                    <text x={pad.l+cw*0.52} y={pad.t+15} textAnchor="middle" fill="#E8A838" fontSize={8} fontFamily={F.m}>Hybrid Zone</text>
                    <text x={pad.l+cw*0.85} y={pad.t+15} textAnchor="middle" fill="#10b981" fontSize={8} fontFamily={F.m}>Renewables Heavy</text>

                    {/* Axes */}
                    <line x1={pad.l} y1={pad.t+ch} x2={pad.l+cw} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>
                    <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>

                    {/* Axis labels */}
                    <text x={pad.l+cw/2} y={H-8} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m}>← More Gas | Renewable Energy Fraction | More Renewables →</text>
                    <text x={15} y={pad.t+ch/2} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m} transform={`rotate(-90,15,${pad.t+ch/2})`}>LCOE ($/MWh)</text>

                    {/* Y-axis ticks */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <text key={"y-"+pct} x={pad.l-8} y={pad.t+ch*(1-pct)+4} textAnchor="end" fill="#6B7280" fontSize={8} fontFamily={F.m}>
                        ${(minLcoe + (maxLcoe-minLcoe)*pct).toFixed(0)}
                      </text>
                    ))}

                    {/* X-axis ticks */}
                    <text x={pad.l} y={pad.t+ch+16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily={F.m}>100% Gas</text>
                    <text x={pad.l+cw*0.35} y={pad.t+ch+16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily={F.m}>65%</text>
                    <text x={pad.l+cw*0.65} y={pad.t+ch+16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily={F.m}>35%</text>
                    <text x={pad.l+cw} y={pad.t+ch+16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily={F.m}>0% Gas</text>

                    {/* Connect the dots with a line */}
                    <path
                      d={data.map((d,i) => `${i===0?"M":"L"}${x(d.gf)},${y(d.lcoe)}`).join(" ")}
                      stroke="#E8A838"
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray="4,2"
                    />

                    {/* Data points */}
                    {data.map((d,i) => (
                      <g key={d.id}>
                        <circle cx={x(d.gf)} cy={y(d.lcoe)} r={8} fill={d.color+"44"} stroke={d.color} strokeWidth={2}/>
                        <text x={x(d.gf)} y={y(d.lcoe)+4} textAnchor="middle" fill="#fff" fontSize={7} fontWeight={700} fontFamily={F.m}>
                          ${d.lcoe.toFixed(0)}
                        </text>
                      </g>
                    ))}

                    {/* Legend on right */}
                    {data.map((d,i) => (
                      <g key={"leg-"+d.id}>
                        <circle cx={pad.l+cw+20} cy={pad.t+30+i*28} r={5} fill={d.color}/>
                        <text x={pad.l+cw+30} y={pad.t+33+i*28} fill="#E8E6E1" fontSize={9} fontFamily={F.m}>{d.name}</text>
                        <text x={pad.l+cw+30} y={pad.t+44+i*28} fill="#6B7280" fontSize={7} fontFamily={F.m}>
                          {d.gf===1?"100% gas":d.gf===0?"0% gas":Math.round(d.gf*100)+"% gas"}
                        </text>
                      </g>
                    ))}
                  </svg>
                );
              })()}
              <div style={{fontSize:9, color:"#6B7280", fontFamily:F.m, marginTop:8, fontStyle:"italic"}}>
                The curve shows: moving from 100% gas to ~35% gas (hybrid) can maintain similar LCOE.
                But going to 0% gas requires massive overbuild, causing costs to rise.
              </div>
            </div>

            {/* The Infrastructure Tradeoff */}
            <div style={PS}>
              <div style={SL}>WHY THE CURVE BENDS — INFRASTRUCTURE REQUIREMENTS</div>
              {(()=>{
                const W=750, H=280, pad={t:30,r:30,b:50,l:70};
                const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

                const data = SCEN.map(s => {
                  const sz = computed[s.id].sz;
                  const gf = s.id==="gu"?1:s.id==="swgb"?0.35:0;
                  return {
                    id: s.id,
                    name: s.short,
                    color: s.color,
                    gf,
                    battMWh: sz.battMWh || 0,
                    solarMW: sz.solarMW || 0,
                    windMW: sz.windMW || 0,
                  };
                }).sort((a,b) => b.gf - a.gf);

                const maxBatt = Math.max(...data.map(d=>d.battMWh)) * 1.1;
                const maxSolar = Math.max(...data.map(d=>d.solarMW)) * 1.1;

                const x = (gf) => pad.l + (1 - gf) * cw;
                const yBatt = (mwh) => pad.t + ch - (mwh / maxBatt) * ch;
                const ySolar = (mw) => pad.t + ch - (mw / maxSolar) * ch;

                return (
                  <svg width={W} height={H} style={{display:"block"}}>
                    {/* Grid */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <line key={"g-"+pct} x1={pad.l} y1={pad.t+ch*pct} x2={pad.l+cw} y2={pad.t+ch*pct} stroke="#1E2330" strokeWidth={1}/>
                    ))}

                    {/* Axes */}
                    <line x1={pad.l} y1={pad.t+ch} x2={pad.l+cw} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>
                    <text x={pad.l+cw/2} y={H-8} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m}>← More Gas | Renewable Fraction | More Renewables →</text>

                    {/* Battery line */}
                    <path
                      d={data.map((d,i) => `${i===0?"M":"L"}${x(d.gf)},${yBatt(d.battMWh)}`).join(" ")}
                      stroke="#10b981"
                      strokeWidth={3}
                      fill="none"
                    />
                    {data.map(d => (
                      <circle key={"b-"+d.id} cx={x(d.gf)} cy={yBatt(d.battMWh)} r={5} fill="#10b981"/>
                    ))}

                    {/* Solar line */}
                    <path
                      d={data.map((d,i) => `${i===0?"M":"L"}${x(d.gf)},${ySolar(d.solarMW)}`).join(" ")}
                      stroke="#eab308"
                      strokeWidth={3}
                      fill="none"
                    />
                    {data.map(d => (
                      <circle key={"s-"+d.id} cx={x(d.gf)} cy={ySolar(d.solarMW)} r={5} fill="#eab308"/>
                    ))}

                    {/* Legend */}
                    <circle cx={pad.l+20} cy={pad.t+10} r={5} fill="#10b981"/>
                    <text x={pad.l+30} y={pad.t+14} fill="#10b981" fontSize={9} fontFamily={F.m}>Battery (MWh) — up to {(maxBatt/1000).toFixed(0)} GWh</text>
                    <circle cx={pad.l+200} cy={pad.t+10} r={5} fill="#eab308"/>
                    <text x={pad.l+210} y={pad.t+14} fill="#eab308" fontSize={9} fontFamily={F.m}>Solar (MW) — up to {maxSolar.toLocaleString()} MW</text>

                    {/* Annotation */}
                    <text x={pad.l+cw-10} y={pad.t+50} textAnchor="end" fill="#ef4444" fontSize={9} fontFamily={F.m}>↑ Exponential growth</text>
                    <text x={pad.l+cw-10} y={pad.t+62} textAnchor="end" fill="#ef4444" fontSize={8} fontFamily={F.m}>as gas → 0%</text>
                  </svg>
                );
              })()}
              <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, marginTop:10, lineHeight:1.7}}>
                <b style={{color:"#E8E6E1"}}>The key insight:</b> Infrastructure requirements grow <b style={{color:"#9CA3AF"}}>exponentially</b> as you approach 0% gas.
                The last 35% of gas to eliminate requires more additional infrastructure than the first 65%.
                This is why the hybrid "sweet spot" exists — you get most of the fuel savings with minimal infrastructure penalty.
              </div>
            </div>

            {/* The Math */}
            <div style={PS}>
              <div style={SL}>THE UNDERLYING MATH</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
                <div style={{background:"#12151C", borderRadius:8, padding:14}}>
                  <div style={{fontSize:11, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:10}}>GAS-ONLY COST STRUCTURE</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.8}}>
                    <div style={{display:"flex", justifyContent:"space-between", borderBottom:"1px solid #2A3040", paddingBottom:4, marginBottom:4}}>
                      <span>Capex (~$900/kW × 1.2 GW)</span>
                      <span style={{color:"#E8E6E1"}}>{fmt$(computed.gu?.lcoe?.netCapex || 1080000000)}</span>
                    </div>
                    <div style={{display:"flex", justifyContent:"space-between", borderBottom:"1px solid #2A3040", paddingBottom:4, marginBottom:4}}>
                      <span>Annual Fuel (100% × 8760h × ${(p.gasPrice * p.heatRate).toFixed(1)}/MWh)</span>
                      <span style={{color:"#9CA3AF", fontWeight:600}}>${(p.gasPrice * p.heatRate * 8760 * p.loadMW / 1e6).toFixed(0)}M/yr</span>
                    </div>
                    <div style={{display:"flex", justifyContent:"space-between", paddingTop:4}}>
                      <span style={{color:"#E8E6E1", fontWeight:600}}>Fuel over {p.life} years</span>
                      <span style={{color:"#9CA3AF", fontWeight:700}}>${(p.gasPrice * p.heatRate * 8760 * p.loadMW * p.life / 1e9).toFixed(1)}B</span>
                    </div>
                  </div>
                </div>

                <div style={{background:"#12151C", borderRadius:8, padding:14}}>
                  <div style={{fontSize:11, color:"#C9B896", fontFamily:F.m, fontWeight:700, marginBottom:10}}>HYBRID COST STRUCTURE</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.8}}>
                    <div style={{display:"flex", justifyContent:"space-between", borderBottom:"1px solid #2A3040", paddingBottom:4, marginBottom:4}}>
                      <span>Capex (Solar+Wind+Batt+Gas)</span>
                      <span style={{color:"#E8E6E1"}}>{fmt$(computed.swgb?.lcoe?.netCapex || 2500000000)}</span>
                    </div>
                    <div style={{display:"flex", justifyContent:"space-between", borderBottom:"1px solid #2A3040", paddingBottom:4, marginBottom:4}}>
                      <span>Less: ITC Credit (30% on solar+batt)</span>
                      <span style={{color:"#9CA3AF"}}>-{fmt$((computed.swgb?.lcoe?.capexBreakdown?.solar || 0) * 0.3 + (computed.swgb?.lcoe?.capexBreakdown?.battery || 0) * 0.3)}</span>
                    </div>
                    <div style={{display:"flex", justifyContent:"space-between", borderBottom:"1px solid #2A3040", paddingBottom:4, marginBottom:4}}>
                      <span>Annual Fuel (35% × 8760h × ${(p.gasPrice * p.heatRate).toFixed(1)}/MWh)</span>
                      <span style={{color:"#C9B896", fontWeight:600}}>${(0.35 * p.gasPrice * p.heatRate * 8760 * p.loadMW / 1e6).toFixed(0)}M/yr</span>
                    </div>
                    <div style={{display:"flex", justifyContent:"space-between", paddingTop:4}}>
                      <span style={{color:"#E8E6E1", fontWeight:600}}>Fuel over {p.life} years</span>
                      <span style={{color:"#C9B896", fontWeight:700}}>${(0.35 * p.gasPrice * p.heatRate * 8760 * p.loadMW * p.life / 1e9).toFixed(1)}B</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{marginTop:16, padding:14, background:"#12151C", borderRadius:8, border:"1px solid #1E2330"}}>
                <div style={{fontSize:11, color:"#E8E6E1", fontFamily:F.m, lineHeight:1.8}}>
                  <b style={{color:"#C9B896"}}>The tradeoff:</b> Hybrid has ~{fmt$(Math.abs((computed.swgb?.lcoe?.netCapex || 2500000000) - (computed.gu?.lcoe?.netCapex || 1080000000)))} higher capex,
                  but saves ~<b style={{color:"#9CA3AF"}}>${((1-0.35) * p.gasPrice * p.heatRate * 8760 * p.loadMW * p.life / 1e9).toFixed(1)}B</b> in fuel over {p.life} years.
                  <br/><br/>
                  Add the <b style={{color:"#9CA3AF"}}>ITC/PTC incentives</b> and the economics converge.
                </div>
              </div>
            </div>

            {/* Key Takeaways */}
            <div style={{...PS, background:"#12151C", border:"1px solid #1E2330"}}>
              <div style={SL}>KEY TAKEAWAYS</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12}}>
                <div style={{padding:12, background:"#0a0c0f", borderRadius:6, borderLeft:"3px solid #4B5563"}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:6}}>1. GAS PROVIDES CAPACITY</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    Gas is "reliability insurance." It eliminates the need for weeks of battery storage and massive renewable overbuild.
                  </div>
                </div>
                <div style={{padding:12, background:"#0a0c0f", borderRadius:6, borderLeft:"3px solid #4B5563"}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:6}}>2. RENEWABLES PROVIDE ENERGY</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    Every MWh from solar/wind displaces expensive gas fuel. Zero marginal cost generation is the key to long-term savings.
                  </div>
                </div>
                <div style={{padding:12, background:"#0a0c0f", borderRadius:6, borderLeft:"3px solid #4B5563"}}>
                  <div style={{fontSize:10, color:"#C9B896", fontFamily:F.m, fontWeight:700, marginBottom:6}}>3. HYBRID OPTIMIZES BOTH</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    The "sweet spot" uses gas for ~35% of energy. You get most fuel savings with minimal infrastructure penalty.
                  </div>
                </div>
              </div>
            </div>

            {/* ===== MATHEMATICAL FOUNDATION ===== */}
            <div style={{...PS, background:"#12151C", border:"1px solid #1E2330"}}>
              <div style={{...SL, color:"#9CA3AF"}}>MATHEMATICAL FOUNDATION</div>
              <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, marginBottom:16, lineHeight:1.7}}>
                The hybrid advantage emerges from fundamental mathematics of <b style={{color:"#E8E6E1"}}>energy</b> vs <b style={{color:"#E8E6E1"}}>capacity</b>.
              </div>
            </div>

            {/* The Two Constraints */}
            <div style={PS}>
              <div style={SL}>THE TWO CONSTRAINTS THAT GOVERN POWER SYSTEMS</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
                <div style={{background:"#12151C", borderRadius:8, padding:16, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:12, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:12}}>1. ENERGY BALANCE</div>
                  <div style={{fontSize:11, color:"#E8E6E1", fontFamily:"monospace", background:"#0f1115", padding:12, borderRadius:6, marginBottom:12}}>
                    Sum(Generation) = Sum(Load) + Losses
                  </div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    Total energy generated must equal total energy consumed.
                    <br/><br/>
                    Solar at 27% CF: 2,365 MWh/MW/year.<br/>
                    Gas at 90% CF: 7,884 MWh/MW/year.<br/>
                    <br/>
                    <span style={{color:"#E8E6E1"}}>Renewables excel here</span> - zero fuel cost.
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:8, padding:16, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:12, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:12}}>2. CAPACITY ADEQUACY</div>
                  <div style={{fontSize:11, color:"#E8E6E1", fontFamily:"monospace", background:"#0f1115", padding:12, borderRadius:6, marginBottom:12}}>
                    At all times: Available {">"} Load
                  </div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7}}>
                    At <b>every instant</b>, available generation must meet load.
                    This is the <b style={{color:"#9CA3AF"}}>binding constraint</b>.
                    <br/><br/>
                    Solar: ~10-15% capacity credit.<br/>
                    Gas: ~95-100% capacity credit.<br/>
                    <br/>
                    <span style={{color:"#E8E6E1"}}>Gas excels here</span> - dispatchable.
                  </div>
                </div>
              </div>
              <div style={{marginTop:16, padding:14, background:"#E8A83812", borderRadius:8, border:"1px solid #1E2330"}}>
                <div style={{fontSize:10, color:"#E8E6E1", fontFamily:F.m, lineHeight:1.7}}>
                  <b style={{color:"#C9B896"}}>Insight:</b> These constraints need <i>different</i> resources.
                  Energy is cheap from renewables. Capacity is cheap from gas.
                  <b style={{color:"#C9B896"}}> Hybrid optimizes both.</b>
                </div>
              </div>
            </div>

            {/* Storage Duration */}
            <div style={PS}>
              <div style={SL}>THE STORAGE DURATION PROBLEM</div>
              <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, marginBottom:16}}>
                Battery requirements <b style={{color:"#9CA3AF"}}>explode</b> as gas approaches 0%.
              </div>
              {/* Storage Duration Chart */}
              {(()=>{
                const W=720, H=280, pad={t:30,r:140,b:50,l:70};
                const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;
                const data = [
                  {rel:90, renew:4, hybrid:4},
                  {rel:95, renew:8, hybrid:4},
                  {rel:99, renew:24, hybrid:4},
                  {rel:99.9, renew:72, hybrid:4},
                  {rel:99.99, renew:168, hybrid:4},
                ];
                const maxH = 180;
                const x = (rel) => pad.l + ((rel-90)/10) * cw;
                const y = (hrs) => pad.t + ch - (Math.min(hrs,maxH)/maxH) * ch;
                return (
                  <svg width={W} height={H} style={{display:"block", marginBottom:16}}>
                    <rect x={pad.l} y={pad.t} width={cw*0.5} height={ch} fill="#1a1d2510"/>
                    <rect x={pad.l+cw*0.5} y={pad.t} width={cw*0.5} height={ch} fill="#1a1d2510"/>
                    {[0,24,48,72,120,168].map(hrs => (
                      <g key={"g-"+hrs}>
                        <line x1={pad.l} y1={y(hrs)} x2={pad.l+cw} y2={y(hrs)} stroke="#1E2330" strokeWidth={1}/>
                        <text x={pad.l-8} y={y(hrs)+4} textAnchor="end" fill="#6B7280" fontSize={8} fontFamily={F.m}>{hrs}h</text>
                      </g>
                    ))}
                    <rect x={x(99)} y={pad.t} width={x(100)-x(99)} height={ch} fill="#ef444410"/>
                    <text x={x(99.5)} y={pad.t+15} textAnchor="middle" fill="#ef4444" fontSize={8} fontFamily={F.m}>Danger Zone</text>
                    <line x1={pad.l} y1={pad.t+ch} x2={pad.l+cw} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>
                    <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>
                    <text x={pad.l+cw/2} y={H-10} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m}>Reliability Target (%)</text>
                    <text x={18} y={pad.t+ch/2} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m} transform={`rotate(-90,18,${pad.t+ch/2})`}>Storage Duration (hours)</text>
                    {data.map(d => (
                      <text key={"x-"+d.rel} x={x(d.rel)} y={pad.t+ch+18} textAnchor="middle" fill="#6B7280" fontSize={9} fontFamily={F.m}>{d.rel}%</text>
                    ))}
                    <path d={data.map((d,i) => `${i===0?"M":"L"}${x(d.rel)},${y(d.renew)}`).join(" ")} stroke="#ef4444" strokeWidth={3} fill="none"/>
                    {data.map(d => (
                      <g key={"r-"+d.rel}>
                        <circle cx={x(d.rel)} cy={y(d.renew)} r={6} fill="#ef4444"/>
                        <text x={x(d.rel)} y={y(d.renew)-10} textAnchor="middle" fill="#ef4444" fontSize={9} fontWeight={700} fontFamily={F.m}>{d.renew}h</text>
                      </g>
                    ))}
                    <path d={data.map((d,i) => `${i===0?"M":"L"}${x(d.rel)},${y(d.hybrid)}`).join(" ")} stroke="#10b981" strokeWidth={3} fill="none"/>
                    {data.map(d => (
                      <circle key={"h-"+d.rel} cx={x(d.rel)} cy={y(d.hybrid)} r={5} fill="#10b981"/>
                    ))}
                    <g transform={`translate(${pad.l+cw+15}, ${pad.t+20})`}>
                      <line x1={0} y1={0} x2={25} y2={0} stroke="#ef4444" strokeWidth={3}/>
                      <circle cx={12} cy={0} r={4} fill="#ef4444"/>
                      <text x={32} y={4} fill="#ef4444" fontSize={9} fontFamily={F.m}>Renewables</text>
                      <text x={32} y={16} fill="#ef4444" fontSize={8} fontFamily={F.m}>Only</text>
                      <line x1={0} y1={40} x2={25} y2={40} stroke="#10b981" strokeWidth={3}/>
                      <circle cx={12} cy={40} r={4} fill="#10b981"/>
                      <text x={32} y={44} fill="#10b981" fontSize={9} fontFamily={F.m}>Hybrid</text>
                      <text x={32} y={56} fill="#10b981" fontSize={8} fontFamily={F.m}>(Gas Backup)</text>
                    </g>
                    <text x={x(99.5)} y={y(120)-5} textAnchor="middle" fill="#E8E6E1" fontSize={9} fontFamily={F.m}>7 days of</text>
                    <text x={x(99.5)} y={y(120)+8} textAnchor="middle" fill="#E8E6E1" fontSize={9} fontFamily={F.m}>storage!</text>
                    <line x1={x(99.5)} y1={y(120)+12} x2={x(99.99)} y2={y(168)-10} stroke="#E8E6E1" strokeWidth={1} strokeDasharray="3,2"/>
                  </svg>
                );
              })()}
              <div style={{fontSize:9, color:"#6B7280", fontFamily:F.m, marginBottom:16, fontStyle:"italic", textAlign:"center"}}>
                As reliability increases, renewables-only storage explodes exponentially while hybrid stays flat at 4 hours.
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
                <div style={{background:"#12151C", borderRadius:8, padding:14, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontWeight:700, marginBottom:8}}>WHY EXPONENTIAL?</div>
                  <div style={{fontSize:9, color:"#9CA3AF", lineHeight:1.7}}>
                    Weather follows <b style={{color:"#E8E6E1"}}>heavy-tailed distribution</b>:<br/>
                    - Most gaps short (overnight)<br/>
                    - Rare gaps VERY long (storms)<br/>
                    - Must size for 1-in-10,000 event
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:8, padding:14, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontWeight:700, marginBottom:8}}>WHY HYBRID FLAT?</div>
                  <div style={{fontSize:9, color:"#9CA3AF", lineHeight:1.7}}>
                    With gas backup, battery only needs:<br/>
                    - Daily shifting (4h)<br/>
                    - Short ramps<br/>
                    <b style={{color:"#9CA3AF"}}>Gas handles the long-tail.</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Marginal Cost */}
            <div style={PS}>
              <div style={SL}>MARGINAL COST OF DISPLACEMENT</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12}}>
                <div style={{background:"#12151C", borderRadius:8, padding:14}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontWeight:700, marginBottom:8}}>FIRST 35%</div>
                  <div style={{fontSize:9, color:"#9CA3AF", lineHeight:1.6}}>
                    Best hours displace gas.<br/>
                    Minimal storage.<br/>
                    <b style={{color:"#9CA3AF"}}>~$15-25/MWh</b>
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:8, padding:14}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontWeight:700, marginBottom:8}}>35-65%</div>
                  <div style={{fontSize:9, color:"#9CA3AF", lineHeight:1.6}}>
                    4h battery needed.<br/>
                    Still economic.<br/>
                    <b style={{color:"#9CA3AF"}}>~$40-60/MWh</b>
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:8, padding:14}}>
                  <div style={{fontSize:10, color:"#9CA3AF", fontWeight:700, marginBottom:8}}>LAST 35%</div>
                  <div style={{fontSize:9, color:"#9CA3AF", lineHeight:1.6}}>
                    Days of storage.<br/>
                    Massive overbuild.<br/>
                    <b style={{color:"#9CA3AF"}}>{">"} $200/MWh</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Theorem */}
            <div style={{...PS, background:"#12151C", border:"1px solid #1E2330"}}>
              <div style={{fontSize:12, color:"#C9B896", fontWeight:700, marginBottom:12}}>THE FUNDAMENTAL THEOREM</div>
              <div style={{background:"#0f1115", borderRadius:8, padding:16, marginBottom:16}}>
                <div style={{fontSize:11, color:"#E8E6E1", fontFamily:"monospace", textAlign:"center", lineHeight:2}}>
                  Optimal f* minimizes: Total(f) = Capex(f) + Storage(f) + Fuel(f)<br/>
                  Storage(f) grows exponentially as f approaches 0
                </div>
              </div>
              <div style={{fontSize:10, color:"#E8E6E1", lineHeight:1.8}}>
                1. Early renewable MWh cheap (good hours, minimal storage)<br/>
                2. Later renewable MWh expensive (massive storage)<br/>
                3. Crossover at ~35% gas defines the optimum
              </div>
            </div>

          </>)}

          {/* ===== SOLAR-WIND CORR ===== */}
          {tab==="solar-wind corr"&&(<>
            <div style={PS}>
              <div style={SL}>WIND-SOLAR DIURNAL CORRELATION</div>
              <div style={{fontSize:10, color:"#6B7280", fontFamily:F.m, marginBottom:16}}>
                Western Oklahoma / panhandle corridor — yearly-averaged hourly profiles
              </div>

              {(()=>{
                // Wind CF profile - peaks overnight due to Low-Level Jet
                const windShape = [0.82,0.85,0.87,0.88,0.86,0.83,0.76,0.67,0.58,0.51,0.46,0.43,0.42,0.43,0.46,0.50,0.55,0.62,0.70,0.76,0.80,0.82,0.82,0.82];
                const windAvgShape = windShape.reduce((a,b)=>a+b,0)/24;
                const windCF = windShape.map(s => (s/windAvgShape) * (corrWindPeak/100) * windAvgShape);

                // Solar CF profile - Gaussian centered at 13:00
                const solarCF = Array.from({length:24}, (_,h) => {
                  if (h < 6 || h > 20) return 0;
                  const x = (h - 13) / 4.5;
                  return (corrSolarPeak/100) * Math.exp(-0.5 * x * x);
                });

                const totalNP = corrWindMW + corrSolarMW;
                const blendedCF = Array.from({length:24}, (_,i) => totalNP > 0 ? (windCF[i]*corrWindMW + solarCF[i]*corrSolarMW)/totalNP : 0);
                const windOut = windCF.map(c => c * corrWindMW);
                const solarOut = solarCF.map(c => c * corrSolarMW);
                const combined = windOut.map((w,i) => w + solarOut[i]);
                const dcLoad = totalNP * 0.4;

                // Pearson correlation
                const wAvg = windCF.reduce((a,b)=>a+b,0)/24;
                const sAvg = solarCF.reduce((a,b)=>a+b,0)/24;
                let num=0, dx2=0, dy2=0;
                for (let i=0; i<24; i++) {
                  const dx = windCF[i]-wAvg, dy = solarCF[i]-sAvg;
                  num += dx*dy; dx2 += dx*dx; dy2 += dy*dy;
                }
                const pearsonR = dy2===0 ? 0 : num/Math.sqrt(dx2*dy2);
                const bAvg = blendedCF.reduce((a,b)=>a+b,0)/24;

                // Surplus/deficit
                const surplus = combined.map(c => Math.max(0, c - dcLoad));
                const deficit = combined.map(c => Math.min(0, c - dcLoad));
                const surplusHrs = surplus.filter(s => s > 0);
                const deficitHrs = deficit.filter(d => d < 0);
                const avgSurplus = surplusHrs.length > 0 ? surplusHrs.reduce((a,b)=>a+b,0)/surplusHrs.length : 0;
                const avgDeficit = deficitHrs.length > 0 ? Math.abs(deficitHrs.reduce((a,b)=>a+b,0)/deficitHrs.length) : 0;

                // Chart dimensions
                const W=720, H=220, pad={t:20,r:30,b:35,l:50};
                const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;
                const maxMW = Math.max(...combined, dcLoad) * 1.1;
                const x = (i) => pad.l + (i/23)*cw;
                const yMW = (v) => pad.t + ch - (v/maxMW)*ch;
                const yCF = (v) => pad.t + ch - (v/0.7)*ch;

                return (
                  <>
                    {/* Metrics */}
                    <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:20}}>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Pearson r</div>
                        <div style={{fontSize:20, color:"#E8E6E1", fontWeight:700}}>{pearsonR.toFixed(3)}</div>
                      </div>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Wind avg CF</div>
                        <div style={{fontSize:20, color:"#E8E6E1", fontWeight:700}}>{(wAvg*100).toFixed(1)}%</div>
                      </div>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Solar avg CF</div>
                        <div style={{fontSize:20, color:"#E8E6E1", fontWeight:700}}>{(sAvg*100).toFixed(1)}%</div>
                      </div>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Blended CF</div>
                        <div style={{fontSize:20, color:"#E8E6E1", fontWeight:700}}>{(bAvg*100).toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* Controls */}
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20}}>
                      <div>
                        <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:8}}>
                          <span style={{fontSize:10, color:"#6B7280", width:80}}>Wind peak CF</span>
                          <input type="range" min={40} max={65} value={corrWindPeak} onChange={e=>setCorrWindPeak(+e.target.value)} style={{flex:1}}/>
                          <span style={{fontSize:10, color:"#E8E6E1", width:40}}>{corrWindPeak}%</span>
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:12}}>
                          <span style={{fontSize:10, color:"#6B7280", width:80}}>Solar peak CF</span>
                          <input type="range" min={15} max={35} value={corrSolarPeak} onChange={e=>setCorrSolarPeak(+e.target.value)} style={{flex:1}}/>
                          <span style={{fontSize:10, color:"#E8E6E1", width:40}}>{corrSolarPeak}%</span>
                        </div>
                      </div>
                      <div>
                        <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:8}}>
                          <span style={{fontSize:10, color:"#6B7280", width:80}}>Wind MW</span>
                          <input type="range" min={100} max={2000} step={50} value={corrWindMW} onChange={e=>setCorrWindMW(+e.target.value)} style={{flex:1}}/>
                          <span style={{fontSize:10, color:"#E8E6E1", width:50}}>{corrWindMW}</span>
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:12}}>
                          <span style={{fontSize:10, color:"#6B7280", width:80}}>Solar MW</span>
                          <input type="range" min={0} max={2000} step={50} value={corrSolarMW} onChange={e=>setCorrSolarMW(+e.target.value)} style={{flex:1}}/>
                          <span style={{fontSize:10, color:"#E8E6E1", width:50}}>{corrSolarMW}</span>
                        </div>
                      </div>
                    </div>

                    {/* MW Output Chart */}
                    <div style={{marginBottom:24}}>
                      <div style={{fontSize:10, color:"#6B7280", marginBottom:8}}>
                        Total MW output by hour
                        <span style={{marginLeft:16, color:"#3b82f6"}}>● Wind</span>
                        <span style={{marginLeft:12, color:"#eab308"}}>● Solar</span>
                        <span style={{marginLeft:12, color:"#22c55e"}}>● Combined</span>
                        <span style={{marginLeft:12, color:"#ef4444"}}>― DC Load</span>
                      </div>
                      <svg width={W} height={H} style={{display:"block"}}>
                        {[0,0.25,0.5,0.75,1].map(p => (
                          <g key={"g"+p}>
                            <line x1={pad.l} y1={pad.t+ch*(1-p)} x2={pad.l+cw} y2={pad.t+ch*(1-p)} stroke="#1E2330" strokeWidth={1}/>
                            <text x={pad.l-6} y={pad.t+ch*(1-p)+4} textAnchor="end" fill="#6B7280" fontSize={8}>{Math.round(maxMW*p)}</text>
                          </g>
                        ))}
                        {[0,6,12,18,23].map(h => (
                          <text key={"x"+h} x={x(h)} y={H-8} textAnchor="middle" fill="#6B7280" fontSize={8}>{h}:00</text>
                        ))}
                        {/* Wind area */}
                        <path d={`M${x(0)},${yMW(0)} ${windOut.map((v,i)=>`L${x(i)},${yMW(v)}`).join(" ")} L${x(23)},${yMW(0)} Z`} fill="#3b82f620"/>
                        <path d={windOut.map((v,i)=>`${i===0?"M":"L"}${x(i)},${yMW(v)}`).join(" ")} stroke="#3b82f6" strokeWidth={2} fill="none"/>
                        {/* Solar area */}
                        <path d={`M${x(0)},${yMW(0)} ${solarOut.map((v,i)=>`L${x(i)},${yMW(v)}`).join(" ")} L${x(23)},${yMW(0)} Z`} fill="#eab30820"/>
                        <path d={solarOut.map((v,i)=>`${i===0?"M":"L"}${x(i)},${yMW(v)}`).join(" ")} stroke="#eab308" strokeWidth={2} fill="none"/>
                        {/* Combined */}
                        <path d={combined.map((v,i)=>`${i===0?"M":"L"}${x(i)},${yMW(v)}`).join(" ")} stroke="#22c55e" strokeWidth={2.5} fill="none"/>
                        {/* DC Load */}
                        <line x1={pad.l} y1={yMW(dcLoad)} x2={pad.l+cw} y2={yMW(dcLoad)} stroke="#ef4444" strokeWidth={2} strokeDasharray="6,4"/>
                        <text x={pad.l+cw-4} y={yMW(dcLoad)-6} textAnchor="end" fill="#ef4444" fontSize={8}>{Math.round(dcLoad)} MW load</text>
                      </svg>
                    </div>

                    {/* Capacity Factor Chart */}
                    <div style={{marginBottom:24}}>
                      <div style={{fontSize:10, color:"#6B7280", marginBottom:8}}>
                        Capacity factor view
                        <span style={{marginLeft:16, color:"#3b82f6"}}>● Wind CF</span>
                        <span style={{marginLeft:12, color:"#eab308"}}>● Solar CF</span>
                        <span style={{marginLeft:12, color:"#a855f7"}}>― Blended CF</span>
                      </div>
                      <svg width={W} height={180} style={{display:"block"}}>
                        {[0,0.25,0.5,0.75,1].map(p => (
                          <g key={"g"+p}>
                            <line x1={pad.l} y1={20+140*(1-p)} x2={pad.l+cw} y2={20+140*(1-p)} stroke="#1E2330" strokeWidth={1}/>
                            <text x={pad.l-6} y={20+140*(1-p)+4} textAnchor="end" fill="#6B7280" fontSize={8}>{Math.round(70*p)}%</text>
                          </g>
                        ))}
                        {[0,6,12,18,23].map(h => (
                          <text key={"x"+h} x={x(h)} y={175} textAnchor="middle" fill="#6B7280" fontSize={8}>{h}:00</text>
                        ))}
                        <path d={windCF.map((v,i)=>`${i===0?"M":"L"}${x(i)},${20+140-(v/0.7)*140}`).join(" ")} stroke="#3b82f6" strokeWidth={2} fill="none"/>
                        {windCF.map((v,i) => <circle key={"w"+i} cx={x(i)} cy={20+140-(v/0.7)*140} r={2} fill="#3b82f6"/>)}
                        <path d={solarCF.map((v,i)=>`${i===0?"M":"L"}${x(i)},${20+140-(v/0.7)*140}`).join(" ")} stroke="#eab308" strokeWidth={2} fill="none"/>
                        {solarCF.map((v,i) => <circle key={"s"+i} cx={x(i)} cy={20+140-(v/0.7)*140} r={2} fill="#eab308"/>)}
                        <path d={blendedCF.map((v,i)=>`${i===0?"M":"L"}${x(i)},${20+140-(v/0.7)*140}`).join(" ")} stroke="#a855f7" strokeWidth={2.5} fill="none" strokeDasharray="6,3"/>
                      </svg>
                    </div>

                    {/* Surplus/Deficit Chart */}
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:10, color:"#6B7280", marginBottom:8}}>
                        Hourly surplus / deficit vs DC load
                        <span style={{marginLeft:16, color:"#22c55e"}}>■ Surplus (curtail/store)</span>
                        <span style={{marginLeft:12, color:"#ef4444"}}>■ Deficit (need gas)</span>
                      </div>
                      <svg width={W} height={160} style={{display:"block"}}>
                        {(() => {
                          const maxDelta = Math.max(Math.max(...surplus), Math.abs(Math.min(...deficit))) * 1.1 || 100;
                          const yD = (v) => 80 - (v/maxDelta)*60;
                          const barW = cw/24 - 2;
                          return (
                            <>
                              <line x1={pad.l} y1={80} x2={pad.l+cw} y2={80} stroke="#4B5563" strokeWidth={1}/>
                              {surplus.map((s,i) => s > 0 && (
                                <rect key={"s"+i} x={pad.l + (i/24)*cw + 1} y={yD(s)} width={barW} height={80-yD(s)} fill="#22c55e99"/>
                              ))}
                              {deficit.map((d,i) => d < 0 && (
                                <rect key={"d"+i} x={pad.l + (i/24)*cw + 1} y={80} width={barW} height={yD(d)-80} fill="#ef444499"/>
                              ))}
                              {[0,6,12,18,23].map(h => (
                                <text key={"x"+h} x={x(h)} y={155} textAnchor="middle" fill="#6B7280" fontSize={8}>{h}:00</text>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* Bottom metrics */}
                    <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12}}>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Avg surplus</div>
                        <div style={{fontSize:18, color:"#E8E6E1", fontWeight:700}}>{Math.round(avgSurplus)} MW</div>
                      </div>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Avg deficit</div>
                        <div style={{fontSize:18, color:"#E8E6E1", fontWeight:700}}>{Math.round(avgDeficit)} MW</div>
                      </div>
                      <div style={{background:"#12151C", border:"1px solid #1E2330", borderRadius:4, padding:12}}>
                        <div style={{fontSize:10, color:"#6B7280", marginBottom:4}}>Hours in deficit</div>
                        <div style={{fontSize:18, color:"#E8E6E1", fontWeight:700}}>{deficitHrs.length} / 24</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Methodology */}
            <div style={PS}>
              <div style={SL}>METHODOLOGY {"&"} ASSUMPTIONS</div>
              <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.8}}>
                <p style={{marginBottom:12}}>
                  This tool models <b style={{color:"#E8E6E1"}}>yearly-averaged hourly</b> capacity factor profiles for wind and solar resources
                  in the western Oklahoma / panhandle corridor. Profiles are synthetic approximations calibrated to published empirical data —
                  they are not raw hourly timeseries from any single year or site. Users should treat outputs as directional for portfolio sizing
                  and complementarity analysis, not as bankable energy yield estimates.
                </p>

                <p style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Wind diurnal profile</b></p>
                <p style={{marginBottom:12}}>
                  The 24-hour wind shape vector is derived from the diurnal pattern characteristic of the U.S. Southern Great Plains low-level jet (LLJ),
                  where hub-height winds peak overnight (~22:00–04:00 CST) and trough midday (~12:00–15:00 CST). This pattern is well-documented across
                  the Oklahoma panhandle, West Texas, and western Kansas corridors. Default peak CF of 53% is based on the DOE Plains {"&"} Eastern
                  Clean Line levelized cost analysis assumption for Oklahoma panhandle wind resources.<sup>1</sup> The 30–45% statewide range reflects
                  fleet-wide averages inclusive of older, shorter turbines.<sup>2</sup> Modern turbines at 140m+ hub heights in the panhandle corridor
                  can achieve 48–55% net CF.<sup>3</sup>
                </p>

                <p style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Solar diurnal profile</b></p>
                <p style={{marginBottom:12}}>
                  Solar CF is modeled as a Gaussian curve centered at 13:00 CST (accounting for Oklahoma's position within the Central time zone) with
                  a standard deviation of 4.5 hours, truncated to zero before 06:00 and after 20:00. Default peak CF of 25% reflects western Oklahoma
                  GHI of ~5.0–5.5 kWh/m²/day,<sup>4</sup> yielding annual CFs in the 22–26% range for fixed-tilt PV. Single-axis tracking would increase
                  this to ~27–32%.
                </p>

                <p style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Correlation methodology</b></p>
                <p style={{marginBottom:12}}>
                  Pearson correlation coefficient (r) is computed across the 24 hourly wind and solar CF values. This captures the <i>average diurnal</i>
                  complementarity only. Actual hourly correlations on any given day will vary significantly due to weather — frontal systems, cloud cover,
                  and wind drought events can produce positive correlations (both resources low simultaneously). Published research shows hourly wind-solar
                  correlations are weakest (near zero or weakly negative), while monthly/seasonal correlations are more strongly negative.<sup>5, 6</sup>
                </p>

                <p style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>DC load assumption</b></p>
                <p style={{marginBottom:12}}>
                  The DC load line is set at 40% of total combined nameplate capacity (wind + solar). This is a rough proxy representing a flat 24/7 data
                  center load sized to approximately match annual energy production from the renewable portfolio.
                </p>

                <p style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Key limitations</b></p>
                <ul style={{marginBottom:12, paddingLeft:16, listStyleType:"disc"}}>
                  <li>Profiles are yearly averages — seasonal variation (stronger wind in spring, weaker in summer; stronger solar in summer) is smoothed out</li>
                  <li>Multi-day wind/solar drought events (3–7+ day calm/cloudy periods) are not represented in averaged profiles</li>
                  <li>No curtailment, transmission constraints, or wake losses modeled</li>
                  <li>No battery storage or gas backup dispatch modeled</li>
                  <li>Solar profile assumes fixed-tilt; single-axis tracking would widen and flatten the curve</li>
                </ul>
              </div>
            </div>

            {/* Sources */}
            <div style={PS}>
              <div style={SL}>SOURCES {"&"} DATABASES</div>
              <ol style={{fontSize:9, color:"#6B7280", fontFamily:F.m, lineHeight:1.9, paddingLeft:16}}>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>U.S. Department of Energy</b>, Plains {"&"} Eastern Clean Line Levelized Cost Analysis, Appendix 6-B (2015). Oklahoma panhandle wind CF assumption of 53%.
                  <br/><a href="https://www.energy.gov/sites/default/files/2015/04/f22/CleanLinePt2-Appendix-6-B.pdf" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>energy.gov — Plains {"&"} Eastern Appendix 6-B</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Oklahoma Historical Society</b>, "Wind Energy," Encyclopedia of Oklahoma History and Culture (2019). Statewide CF range of 30–45%.
                  <br/><a href="https://www.okhistory.org/publications/enc/entry?entry=WI085" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>okhistory.org — Wind Energy</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>U.S. DOE / Lawrence Berkeley National Laboratory</b>, Land-Based Wind Market Report: 2024 Edition. National fleet-wide CF of 33.5% (2023); plants built in 2022 achieving 38.2%.
                  <br/><a href="https://www.energy.gov/cmei/systems/land-based-wind-market-report-2024-edition" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>energy.gov — Wind Market Report 2024</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>NREL National Solar Radiation Database (NSRDB)</b>, PSM v3. GHI data for Oklahoma (~4.7–5.5 kWh/m²/day west-to-east gradient).
                  <br/><a href="https://nsrdb.nrel.gov/" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>nsrdb.nrel.gov</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Monforti-Ferrario et al.</b> (2017), "Local complementarity of wind and solar energy resources over Europe," <i>J. Applied Meteorology and Climatology</i>, 56(1).
                  <br/><a href="https://journals.ametsoc.org/view/journals/apme/56/1/jamc-d-16-0031.1.xml" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>AMS Journals — Monforti-Ferrario 2017</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Jurasz et al.</b> (2021), "Complementarity and 'Resource Droughts' of Solar and Wind Energy in Poland," <i>Energies</i>, 14(4), 1118.
                  <br/><a href="https://www.mdpi.com/1996-1073/14/4/1118" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>MDPI Energies — Jurasz 2021</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Rhodes et al.</b> (2018), "Assessing solar and wind complementarity in Texas," <i>Sustainable Energy Research</i>, 5(1). Diurnal wind-solar profiles and Pearson correlations.
                  <br/><a href="https://sustainenergyres.springeropen.com/articles/10.1186/s40807-018-0054-3" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>Springer — Rhodes 2018</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>NREL Wind Integration National Dataset (WIND) Toolkit</b>. Hourly wind speed and modeled power output at 126,000+ sites across the continental U.S.
                  <br/><a href="https://www.nrel.gov/grid/wind-toolkit.html" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>nrel.gov — WIND Toolkit</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>U.S. EIA</b>, "U.S. wind generation falls into regional patterns by season" (2022). Lower Plains (TX, OK, KS, NM) seasonal capacity factor patterns.
                  <br/><a href="https://www.eia.gov/todayinenergy/detail.php?id=54819" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>eia.gov — Regional wind patterns</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>S{"&"}P Global Market Intelligence</b>, "Over 16 GW of planned wind capacity in SPP supported by robust financial outlook" (2024). Oklahoma fleet-average wind CF of 41%.
                  <br/><a href="https://www.spglobal.com/market-intelligence/en/news-insights/research/over-16-gw-of-planned-wind-capacity-in-spp-supported-by-robust-financial-outlook" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>S{"&"}P Global — SPP Wind Outlook</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Lazard</b>, Levelized Cost of Energy+ (LCOE+), v17/v18 (2024). Onshore wind + storage LCOE: $45–133/MWh; standalone onshore wind: $27–73/MWh.
                  <br/><a href="https://www.lazard.com/research-insights/levelized-cost-of-energyplus/" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>lazard.com — LCOE+</a>
                </li>
                <li style={{marginBottom:8}}>
                  <b style={{color:"#9CA3AF"}}>Windpower Monthly</b>, "Gaining a better understanding of capacity factor, productivity and efficiency" (2013). Relationship between specific rating and capacity factor.
                  <br/><a href="https://www.windpowermonthly.com/article/1163492" target="_blank" rel="noopener" style={{color:"#3b82f6"}}>windpowermonthly.com</a>
                </li>
              </ol>
              <p style={{fontSize:9, color:"#4B5563", marginTop:16, fontStyle:"italic"}}>
                Profiles are synthetic approximations, not site-specific energy yield assessments. For bankable estimates, use hourly timeseries from
                NREL WIND Toolkit / NSRDB with site-specific turbine power curves and NREL PVWatts / System Advisor Model (SAM).
              </p>
            </div>
          </>)}

          {/* ===== THESIS ===== */}
          {tab==="thesis"&&(<>
            <div style={PS}>
              <div style={SL}>THE HYBRID UNLOCK — WHY RENEWABLES + GAS BEATS EITHER ALONE</div>
              <div style={{fontSize:10, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.7, marginBottom:16}}>
                The counterintuitive result: a hybrid system (solar + wind + battery + gas) can achieve similar LCOE to gas-only,
                despite requiring more infrastructure. The key insight is that <b style={{color:"#E8E6E1"}}>each technology does what it's best at</b>:
                renewables provide cheap energy, gas provides reliable capacity.
              </div>
            </div>

            {/* The Core Problem */}
            <div style={PS}>
              <div style={SL}>THE INTERMITTENCY PROBLEM</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
                <div>
                  <div style={{fontSize:10, color:"#E8E6E1", fontFamily:F.m, marginBottom:8, fontWeight:600}}>Without Gas Backup</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    To serve a 24/7 load with <b>solar-only</b>, you must:<br/>
                    • Overbuild 5-6x to capture enough energy<br/>
                    • Store 20+ hours of battery for nights<br/>
                    • Handle multi-day cloudy periods<br/>
                    • Result: <span style={{color:"#9CA3AF"}}>Massive capex, still not 100% reliable</span>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10, color:"#E8E6E1", fontFamily:F.m, marginBottom:8, fontWeight:600}}>With Gas Backup</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    Hybrid approach:<br/>
                    • Build "just enough" renewables for typical conditions<br/>
                    • 4-hour battery for daily solar shifting<br/>
                    • Gas fills gaps during weather events<br/>
                    • Result: <span style={{color:"#9CA3AF"}}>Optimized capex, 100% reliable</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sizing Comparison Table */}
            <div style={PS}>
              <div style={SL}>INFRASTRUCTURE REQUIREMENTS — {p.loadMW.toLocaleString()} MW LOAD</div>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:10, fontFamily:F.m}}>
                <thead>
                  <tr style={{borderBottom:"2px solid #2A3040"}}>
                    <th style={{padding:"8px 4px", textAlign:"left", color:"#6B7280", fontSize:9}}>Configuration</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF", fontSize:9}}>Solar MW</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF", fontSize:9}}>Wind MW</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF", fontSize:9}}>Gas MW</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF", fontSize:9}}>Battery MWh</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF", fontSize:9}}>Overbuild</th>
                    <th style={{padding:"8px 4px", textAlign:"right", color:"#E8E6E1", fontSize:9}}>LCOE</th>
                  </tr>
                </thead>
                <tbody>
                  {SCEN.map(s => {
                    const sz = computed[s.id].sz;
                    const r = results[s.id];
                    return (
                      <tr key={s.id} style={{borderBottom:"1px solid #1E2330"}}>
                        <td style={{padding:"8px 4px", color:s.color, fontWeight:600}}>{s.name}</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:sz.solarMW?"#eab308":"#2A3040"}}>{sz.solarMW ? sz.solarMW.toLocaleString() : "—"}</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:sz.windMW?"#3b82f6":"#2A3040"}}>{sz.windMW ? sz.windMW.toLocaleString() : "—"}</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:sz.gasMW?"#ef4444":"#2A3040"}}>{sz.gasMW ? sz.gasMW.toLocaleString() : "—"}</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:sz.battMWh?"#10b981":"#2A3040"}}>{sz.battMWh ? sz.battMWh.toLocaleString() : "—"}</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:"#9CA3AF"}}>{r.overbuild.toFixed(1)}x</td>
                        <td style={{padding:"8px 4px", textAlign:"right", color:"#E8E6E1", fontWeight:700}}>${r.lcoe.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{fontSize:9, color:"#6B7280", fontFamily:F.m, marginTop:12, fontStyle:"italic"}}>
                Note: Solar/Wind-only configs require massive overbuild + storage to approach reliability.
                Hybrid achieves same reliability with far less infrastructure by using gas for backup.
              </div>
            </div>

            {/* Efficiency Frontier Chart */}
            <div style={PS}>
              <div style={SL}>EFFICIENCY FRONTIER — COST vs CARBON INTENSITY</div>
              <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, marginBottom:12}}>
                The frontier shows optimal tradeoffs. Points below/left are impossible; above/right are suboptimal.
              </div>
              {(()=>{
                const W=700, H=350, pad={t:30,r:30,b:50,l:60};
                const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

                // Calculate carbon intensity (tCO2/MWh) and LCOE for each config
                const data = SCEN.map(s => {
                  const r = results[s.id];
                  const gf = s.id==="gu"?1:s.id==="swgb"?0.35:0;
                  // CO2: ~0.4 tCO2/MWh for gas at 100% (based on ~53 kg CO2/MMBtu * heat rate)
                  const co2 = gf * 0.053 * p.heatRate; // tCO2/MWh
                  return { id: s.id, name: s.short, color: s.color, lcoe: r.lcoe, co2, gf };
                });

                const maxLcoe = Math.max(...data.map(d=>d.lcoe)) * 1.15;
                const maxCO2 = Math.max(...data.map(d=>d.co2)) * 1.15 || 0.5;

                const x = (co2) => pad.l + (co2 / maxCO2) * cw;
                const y = (lcoe) => pad.t + ch - (lcoe / maxLcoe) * ch;

                // Sort by CO2 for frontier line
                const sorted = [...data].sort((a,b) => a.co2 - b.co2);

                // Find Pareto frontier points (non-dominated)
                const frontier = [];
                let minLcoe = Infinity;
                for (const pt of sorted) {
                  if (pt.lcoe < minLcoe) {
                    frontier.push(pt);
                    minLcoe = pt.lcoe;
                  }
                }

                return (
                  <svg width={W} height={H} style={{display:"block", margin:"0 auto"}}>
                    {/* Grid */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <g key={"grid-"+pct}>
                        <line x1={pad.l} y1={pad.t+ch*pct} x2={pad.l+cw} y2={pad.t+ch*pct} stroke="#1E2330" strokeWidth={1}/>
                        <line x1={pad.l+cw*pct} y1={pad.t} x2={pad.l+cw*pct} y2={pad.t+ch} stroke="#1E2330" strokeWidth={1}/>
                      </g>
                    ))}

                    {/* Axes */}
                    <line x1={pad.l} y1={pad.t+ch} x2={pad.l+cw} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>
                    <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+ch} stroke="#4B5563" strokeWidth={2}/>

                    {/* Axis labels */}
                    <text x={pad.l+cw/2} y={H-8} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m}>Carbon Intensity (tCO₂/MWh)</text>
                    <text x={15} y={pad.t+ch/2} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontFamily={F.m} transform={`rotate(-90,15,${pad.t+ch/2})`}>LCOE ($/MWh)</text>

                    {/* Y-axis ticks */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <text key={"y-"+pct} x={pad.l-8} y={pad.t+ch*(1-pct)+4} textAnchor="end" fill="#6B7280" fontSize={8} fontFamily={F.m}>
                        ${(maxLcoe*pct).toFixed(0)}
                      </text>
                    ))}

                    {/* X-axis ticks */}
                    {[0,0.25,0.5,0.75,1].map(pct => (
                      <text key={"x-"+pct} x={pad.l+cw*pct} y={pad.t+ch+16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily={F.m}>
                        {(maxCO2*pct).toFixed(2)}
                      </text>
                    ))}

                    {/* Frontier line */}
                    {frontier.length > 1 && (
                      <path
                        d={frontier.map((pt,i) => `${i===0?"M":"L"}${x(pt.co2)},${y(pt.lcoe)}`).join(" ")}
                        stroke="#E8A838"
                        strokeWidth={2}
                        fill="none"
                        strokeDasharray="6,3"
                      />
                    )}

                    {/* Frontier area (shaded) */}
                    {frontier.length > 1 && (
                      <path
                        d={`M${x(0)},${y(frontier[0].lcoe)} ${frontier.map(pt => `L${x(pt.co2)},${y(pt.lcoe)}`).join(" ")} L${x(frontier[frontier.length-1].co2)},${pad.t} L${x(0)},${pad.t} Z`}
                        fill="#E8A83808"
                      />
                    )}

                    {/* Data points */}
                    {data.map(d => (
                      <g key={d.id}>
                        <circle cx={x(d.co2)} cy={y(d.lcoe)} r={10} fill={d.color+"33"} stroke={d.color} strokeWidth={2}/>
                        <text x={x(d.co2)} y={y(d.lcoe)-16} textAnchor="middle" fill={d.color} fontSize={9} fontWeight={600} fontFamily={F.m}>{d.name}</text>
                        <text x={x(d.co2)} y={y(d.lcoe)+4} textAnchor="middle" fill="#E8E6E1" fontSize={8} fontFamily={F.m}>${d.lcoe.toFixed(0)}</text>
                      </g>
                    ))}

                    {/* Legend */}
                    <text x={pad.l+cw-10} y={pad.t+15} textAnchor="end" fill="#E8A838" fontSize={9} fontFamily={F.m}>— Efficiency Frontier</text>
                    <text x={pad.l+cw-10} y={pad.t+28} textAnchor="end" fill="#6B7280" fontSize={8} fontFamily={F.m}>(optimal tradeoff curve)</text>
                  </svg>
                );
              })()}
            </div>

            {/* The Economics */}
            <div style={PS}>
              <div style={SL}>THE ECONOMIC THEORY</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16}}>
                <div style={{background:"#12151C", borderRadius:6, padding:12, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:11, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:8}}>Gas-Only</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    <div style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Pros:</b></div>
                    • Low capex (~$900/kW)<br/>
                    • 100% dispatchable<br/>
                    • Proven technology<br/>
                    <div style={{marginTop:8, marginBottom:6}}><b style={{color:"#E8E6E1"}}>Cons:</b></div>
                    • Fuel = ${(p.gasPrice * p.heatRate).toFixed(1)}/MWh forever<br/>
                    • Price volatility exposure<br/>
                    • Carbon risk
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:6, padding:12, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:11, color:"#9CA3AF", fontFamily:F.m, fontWeight:700, marginBottom:8}}>Renewables-Only</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    <div style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Pros:</b></div>
                    • Zero fuel cost<br/>
                    • Zero carbon<br/>
                    • 30% ITC incentive<br/>
                    <div style={{marginTop:8, marginBottom:6}}><b style={{color:"#E8E6E1"}}>Cons:</b></div>
                    • Intermittent (27-38% CF)<br/>
                    • Need 5x+ overbuild<br/>
                    • Need 20hr+ storage
                  </div>
                </div>
                <div style={{background:"#12151C", borderRadius:6, padding:12, border:"1px solid #1E2330"}}>
                  <div style={{fontSize:11, color:"#C9B896", fontFamily:F.m, fontWeight:700, marginBottom:8}}>Hybrid (The Unlock)</div>
                  <div style={{fontSize:9, color:"#9CA3AF", fontFamily:F.m, lineHeight:1.6}}>
                    <div style={{marginBottom:6}}><b style={{color:"#E8E6E1"}}>Best of both:</b></div>
                    • Renewables for cheap energy<br/>
                    • Gas for reliable capacity<br/>
                    • Minimal overbuild needed<br/>
                    • 4hr battery (not 20hr)<br/>
                    <div style={{marginTop:8}}><b style={{color:"#9CA3AF"}}>Gas burns only {((results.swgb?.gasFrac||0.35)*100).toFixed(0)}% of hours</b></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Waterfall */}
            <div style={PS}>
              <div style={SL}>LCOE COMPONENT BREAKDOWN</div>
              <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8}}>
                {SCEN.map(s => {
                  const r = results[s.id];
                  const capexPct = r.lcoe > 0 ? (r.lcoeCapex / r.lcoe * 100) : 0;
                  const omPct = r.lcoe > 0 ? (r.lcoeOM / r.lcoe * 100) : 0;
                  const fuelPct = r.lcoe > 0 ? (r.lcoeFuel / r.lcoe * 100) : 0;
                  const ptcPct = r.lcoe > 0 ? (r.lcoePTC / r.lcoe * 100) : 0;
                  return (
                    <div key={s.id} style={{background:"#12151C", borderRadius:6, padding:10}}>
                      <div style={{fontSize:10, color:s.color, fontFamily:F.m, fontWeight:700, marginBottom:8}}>{s.short}</div>
                      <div style={{fontSize:18, color:"#E8E6E1", fontFamily:F.m, fontWeight:700}}>${r.lcoe.toFixed(1)}</div>
                      <div style={{marginTop:8}}>
                        <div style={{display:"flex", height:8, borderRadius:4, overflow:"hidden", marginBottom:4}}>
                          <div style={{width:capexPct+"%", background:"#6366f1"}} title="Capex"/>
                          <div style={{width:omPct+"%", background:"#8b5cf6"}} title="O&M"/>
                          <div style={{width:fuelPct+"%", background:"#ef4444"}} title="Fuel"/>
                        </div>
                        <div style={{fontSize:7, color:"#6B7280", fontFamily:F.m}}>
                          <span style={{color:"#6366f1"}}>■</span> Capex ${r.lcoeCapex.toFixed(1)} |
                          <span style={{color:"#8b5cf6"}}> ■</span> O&M ${r.lcoeOM.toFixed(1)} |
                          <span style={{color:"#9CA3AF"}}> ■</span> Fuel ${r.lcoeFuel.toFixed(1)}
                          {r.lcoePTC > 0 && <span style={{color:"#9CA3AF"}}> | ■ PTC -${r.lcoePTC.toFixed(1)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Key Insight */}
            <div style={{...PS, background:"linear-gradient(135deg, #1a1d25 0%, #12151C 100%)", border:"1px solid #1E2330"}}>
              <div style={{fontSize:12, color:"#C9B896", fontFamily:F.m, fontWeight:700, marginBottom:8}}>💡 THE KEY INSIGHT</div>
              <div style={{fontSize:11, color:"#E8E6E1", fontFamily:F.m, lineHeight:1.8}}>
                Gas-only pays <b style={{color:"#9CA3AF"}}>${(p.gasPrice * p.heatRate).toFixed(1)}/MWh in fuel</b> for 100% of generation.<br/>
                Hybrid pays the same fuel rate but <b style={{color:"#9CA3AF"}}>only for ~35% of generation</b>.<br/>
                The <b style={{color:"#C9B896"}}>65% fuel savings</b> funds the additional renewable + battery capex.<br/>
                Add <b style={{color:"#9CA3AF"}}>30% ITC + Wind PTC</b> incentives, and the math works out to similar LCOE.
              </div>
              <div style={{marginTop:12, padding:10, background:"#0f1115", borderRadius:6}}>
                <div style={{fontSize:9, color:"#6B7280", fontFamily:F.m, fontStyle:"italic"}}>
                  "Each technology does what it's best at: renewables provide cheap energy (zero marginal cost),
                  gas provides cheap capacity (reliable backup). The hybrid optimizes the portfolio."
                </div>
              </div>
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}
