import { useState, useCallback, useMemo, useEffect } from "react";

// ─── Equipment Database ───
const EQUIPMENT_DB = {
  hframe: {
    name: "H-Frame Gas Turbine",
    shortName: "H-Frame",
    icon: "⚡",
    unitCapacity: 400, // MW
    heatRate: 5800, // BTU/kWh (combined cycle)
    capitalCostPerMW: 850000, // $/MW
    fixedOM: 15000, // $/MW-yr
    variableOM: 3.5, // $/MWh
    startupTime: 180, // minutes
    rampRate: 10, // MW/min
    minLoad: 50, // % of capacity
    availability: 0.92,
    lifespan: 30, // years
    footprintAcresPerMW: 0.015,
    waterGPMperMW: 0.45,
    emissionsLbCO2perMWh: 800,
    canConvertToBackup: false,
    modularity: 1,
    description: "Largest gas turbines available. Best heat rates in combined cycle. Long startup, limited flexibility.",
    pros: ["Best efficiency (CC)", "Lowest LCOE at scale", "Proven technology"],
    cons: ["Slow startup", "Poor part-load", "Large minimum order", "No backup conversion"],
  },
  fframe: {
    name: "F-Frame Gas Turbine",
    shortName: "F-Frame",
    icon: "🔥",
    unitCapacity: 200, // MW
    heatRate: 6200, // BTU/kWh (combined cycle)
    capitalCostPerMW: 900000,
    fixedOM: 16000,
    variableOM: 3.8,
    startupTime: 120,
    rampRate: 15,
    minLoad: 40,
    availability: 0.93,
    lifespan: 30,
    footprintAcresPerMW: 0.018,
    waterGPMperMW: 0.42,
    emissionsLbCO2perMWh: 860,
    canConvertToBackup: false,
    modularity: 2,
    description: "Workhorse industrial gas turbines. Good balance of efficiency and flexibility.",
    pros: ["Good efficiency", "Moderate flexibility", "Well-understood"],
    cons: ["Moderate startup time", "Limited backup potential", "Water intensive in CC"],
  },
  aero: {
    name: "Aeroderivative Turbine",
    shortName: "Aero",
    icon: "✈️",
    unitCapacity: 50, // MW (LM6000 class)
    heatRate: 8800, // BTU/kWh (simple cycle)
    capitalCostPerMW: 1100000,
    fixedOM: 18000,
    variableOM: 5.0,
    startupTime: 10,
    rampRate: 50,
    minLoad: 20,
    availability: 0.95,
    lifespan: 25,
    footprintAcresPerMW: 0.025,
    waterGPMperMW: 0.05,
    emissionsLbCO2perMWh: 1100,
    canConvertToBackup: true,
    modularity: 4,
    description: "Aircraft-engine derived. Fast start, high flexibility, excellent for peaking and backup.",
    pros: ["10-min start", "Excellent ramp", "Low water use", "Backup convertible"],
    cons: ["Higher heat rate", "Higher capital", "Smaller units", "More maintenance"],
  },
  recip: {
    name: "Reciprocating Engine",
    shortName: "Recip",
    icon: "🏭",
    unitCapacity: 20, // MW (Wärtsilä/Jenbacher class)
    heatRate: 7800, // BTU/kWh
    capitalCostPerMW: 950000,
    fixedOM: 20000,
    variableOM: 8.0,
    startupTime: 5,
    rampRate: 100,
    minLoad: 10,
    availability: 0.96,
    lifespan: 25,
    footprintAcresPerMW: 0.035,
    waterGPMperMW: 0.02,
    emissionsLbCO2perMWh: 950,
    canConvertToBackup: true,
    modularity: 5,
    description: "Maximum flexibility. Fastest start, best part-load, ideal for transition to backup role.",
    pros: ["5-min start", "Best part-load", "Highest modularity", "Backup ready", "Low water"],
    cons: ["Higher variable O&M", "More units to manage", "Noise considerations"],
  },
};

const BATTERY_SPECS = {
  costPerMWh: 280000, // $/MWh installed
  costPerMW: 150000, // $/MW power capacity
  roundTripEfficiency: 0.88,
  lifespan: 15, // years
  degradationPerYear: 0.025, // 2.5% per year
  footprintAcresPerMWh: 0.001,
};

const GAS_PRICE = 3.5; // $/MMBtu assumption
const CAPACITY_FACTOR = 0.90;
const TARGET_MW = 1000;
const DISCOUNT_RATE = 0.08;
const PROJECT_LIFE = 25; // years

// ─── Utility Functions ───
function calculateLCOE(equipment, gasPrice = GAS_PRICE) {
  const annualMWh = equipment.unitCapacity * 8760 * CAPACITY_FACTOR;
  const fuelCostPerMWh = (equipment.heatRate / 1000000) * gasPrice * 1000;
  const capitalRecoveryFactor = (DISCOUNT_RATE * Math.pow(1 + DISCOUNT_RATE, PROJECT_LIFE)) / (Math.pow(1 + DISCOUNT_RATE, PROJECT_LIFE) - 1);
  const annualCapitalCost = equipment.capitalCostPerMW * equipment.unitCapacity * capitalRecoveryFactor;
  const annualFixedOM = equipment.fixedOM * equipment.unitCapacity;
  const annualVariableOM = equipment.variableOM * annualMWh;
  const totalAnnualCost = annualCapitalCost + annualFixedOM + annualVariableOM + fuelCostPerMWh * annualMWh;
  return totalAnnualCost / annualMWh;
}

function formatMoney(val) {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(2)}`;
}

function formatNum(val, dec = 0) {
  return val.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

// ─── Score Calculation ───
function calculateConfigScore(config) {
  const { totalCapacity, redundancyMW, weightedLCOE, weightedStartup, batteryMWh, versatilityScore, totalCapex, modularity, waterUsage } = config;

  const capacityScore = Math.min(totalCapacity / TARGET_MW, 1.2) * 100;
  const redundancyScore = Math.min(redundancyMW / (TARGET_MW * 0.2), 1) * 100;
  const lcoeScore = Math.max(0, 100 - (weightedLCOE - 40) * 3);
  const startupScore = Math.max(0, 100 - (weightedStartup - 5) * 0.8);
  const versatility = versatilityScore * 100;
  const modularityScore = Math.min(modularity / 4, 1) * 100;
  const costEfficiency = Math.max(0, 100 - (totalCapex / 1e9 - 0.8) * 30);
  const waterScore = Math.max(0, 100 - waterUsage * 200);

  return {
    overall: (capacityScore * 0.15 + redundancyScore * 0.12 + lcoeScore * 0.20 + startupScore * 0.10 + versatility * 0.18 + modularityScore * 0.08 + costEfficiency * 0.12 + waterScore * 0.05),
    breakdown: {
      "Capacity Adequacy": capacityScore,
      "Redundancy": redundancyScore,
      "LCOE Efficiency": lcoeScore,
      "Startup Speed": startupScore,
      "Versatility / Future-proofing": versatility,
      "Modularity": modularityScore,
      "Capital Efficiency": costEfficiency,
      "Water Efficiency": waterScore,
    }
  };
}

// ─── Components ───

function EquipmentCard({ type, spec, count, onCountChange }) {
  const lcoe = calculateLCOE(spec);
  const totalMW = count * spec.unitCapacity;
  return (
    <div style={{
      background: count > 0 ? "rgba(20,255,180,0.04)" : "rgba(255,255,255,0.02)",
      border: count > 0 ? "1px solid rgba(20,255,180,0.25)" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 20,
      transition: "all 0.3s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: "#7a8a9a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            {spec.icon} {spec.shortName}
          </div>
          <div style={{ fontSize: 11, color: "#556", maxWidth: 260 }}>{spec.description}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: count > 0 ? "#14ffb4" : "#445", fontFamily: "'JetBrains Mono', monospace" }}>
            {count}
          </div>
          <div style={{ fontSize: 10, color: "#667" }}>units</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14, fontSize: 11 }}>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>Unit Size</div>
          <div style={{ color: "#bcc", fontWeight: 600 }}>{spec.unitCapacity} MW</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>Heat Rate</div>
          <div style={{ color: "#bcc", fontWeight: 600 }}>{formatNum(spec.heatRate)} BTU/kWh</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>LCOE</div>
          <div style={{ color: "#f0c040", fontWeight: 600 }}>${lcoe.toFixed(1)}/MWh</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>Startup</div>
          <div style={{ color: "#bcc", fontWeight: 600 }}>{spec.startupTime} min</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>CapEx/MW</div>
          <div style={{ color: "#bcc", fontWeight: 600 }}>${(spec.capitalCostPerMW / 1000).toFixed(0)}K</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#667" }}>Min Load</div>
          <div style={{ color: "#bcc", fontWeight: 600 }}>{spec.minLoad}%</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {spec.canConvertToBackup && (
          <span style={{ fontSize: 9, padding: "2px 7px", background: "rgba(80,200,255,0.15)", color: "#50c8ff", borderRadius: 20, border: "1px solid rgba(80,200,255,0.3)" }}>
            BACKUP CONVERTIBLE
          </span>
        )}
        <span style={{ fontSize: 9, padding: "2px 7px", background: "rgba(255,255,255,0.05)", color: "#889", borderRadius: 20 }}>
          Modularity: {"●".repeat(spec.modularity)}{"○".repeat(5 - spec.modularity)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => onCountChange(type, Math.max(0, count - 1))}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#aaa", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
        <input type="range" min={0} max={Math.ceil(TARGET_MW * 1.3 / spec.unitCapacity)}
          value={count} onChange={e => onCountChange(type, parseInt(e.target.value))}
          style={{ flex: 1, accentColor: "#14ffb4" }} />
        <button onClick={() => onCountChange(type, count + 1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#aaa", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
      </div>
      {count > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#14ffb4", textAlign: "center" }}>
          {totalMW} MW total from {count} × {spec.unitCapacity} MW units
        </div>
      )}
    </div>
  );
}

function ScoreGauge({ score, label, size = 120 }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const fillPct = Math.max(0, Math.min(score, 100)) / 100;
  const color = score > 75 ? "#14ffb4" : score > 50 ? "#f0c040" : "#ff4060";

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fillPct)}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          {score.toFixed(0)}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="#667" fontSize={9}>
          / 100
        </text>
      </svg>
      {label && <div style={{ fontSize: 10, color: "#889", marginTop: 4 }}>{label}</div>}
    </div>
  );
}

function ScoreBar({ label, value, max = 100 }) {
  const pct = Math.max(0, Math.min(value / max * 100, 100));
  const color = value > 75 ? "#14ffb4" : value > 50 ? "#f0c040" : "#ff4060";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: "#889" }}>{label}</span>
        <span style={{ color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{value.toFixed(0)}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function PresetButton({ label, desc, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 14px",
      background: active ? "rgba(20,255,180,0.1)" : "rgba(255,255,255,0.03)",
      border: active ? "1px solid rgba(20,255,180,0.3)" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.2s",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: active ? "#14ffb4" : "#bcc" }}>{label}</div>
      <div style={{ fontSize: 10, color: "#667", marginTop: 2 }}>{desc}</div>
    </button>
  );
}

// ─── Presets ───
const PRESETS = {
  efficiency: { hframe: 2, fframe: 1, aero: 0, recip: 0, batteryMWh: 50, batteryMW: 50, label: "Max Efficiency", desc: "2×H + 1×F — lowest LCOE" },
  balanced: { hframe: 1, fframe: 2, aero: 2, recip: 5, batteryMWh: 200, batteryMW: 100, label: "Balanced", desc: "H+F+Aero+Recip mix" },
  flexible: { hframe: 0, fframe: 2, aero: 6, recip: 15, batteryMWh: 400, batteryMW: 200, label: "Max Flexibility", desc: "Aero+Recip heavy, fast start" },
  futureproof: { hframe: 0, fframe: 2, aero: 4, recip: 20, batteryMWh: 600, batteryMW: 300, label: "Future-Proof", desc: "Recip-heavy for backup conversion" },
  hybrid: { hframe: 1, fframe: 1, aero: 4, recip: 10, batteryMWh: 300, batteryMW: 150, label: "Hybrid Optimal", desc: "Best overall score target" },
};

// ─── Timeline Analysis ───
function TimelineView({ config }) {
  const phases = [
    { year: "Year 0-2", label: "Construction & COD", desc: "All units as primary generation" },
    { year: "Year 3-7", label: "Full Operation", desc: "Steady state, optimizing dispatch" },
    { year: "Year 8-12", label: "Mid-Life Transition", desc: "Recips/Aeros can shift to backup as grid/renewables expand" },
    { year: "Year 13-20", label: "Mature Operation", desc: "Convertible assets become backup gen, new primary sources online" },
    { year: "Year 20-25", label: "End of Life Planning", desc: "Battery replacement, turbine overhauls, asset disposition" },
  ];

  const backupMW = config.counts.recip * EQUIPMENT_DB.recip.unitCapacity + config.counts.aero * EQUIPMENT_DB.aero.unitCapacity;
  const nonConvertMW = config.counts.hframe * EQUIPMENT_DB.hframe.unitCapacity + config.counts.fframe * EQUIPMENT_DB.fframe.unitCapacity;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 12 }}>Asset Lifecycle Timeline</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 12px", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: 6 }}>
            <div style={{ minWidth: 80, fontSize: 11, fontWeight: 700, color: "#14ffb4", fontFamily: "'JetBrains Mono', monospace" }}>{p.year}</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#bcc" }}>{p.label}</div>
              <div style={{ fontSize: 10, color: "#667" }}>{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: 12, background: "rgba(80,200,255,0.05)", borderRadius: 8, border: "1px solid rgba(80,200,255,0.15)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#50c8ff", marginBottom: 6 }}>Conversion Potential</div>
        <div style={{ fontSize: 11, color: "#8aa" }}>
          <strong>{backupMW} MW</strong> ({((backupMW / config.totalCapacity) * 100).toFixed(0)}%) of capacity can convert from primary → backup generation over time.
          {nonConvertMW > 0 && <span> Remaining <strong>{nonConvertMW} MW</strong> from H/F-frames stays as baseload.</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Single Line Diagram Component ───
function SingleLineDiagram({ counts, batteryMW, batteryMWh, totalCapacity }) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [showVoltages, setShowVoltages] = useState(true);

  // SVG drawing helpers
  const COLORS = {
    bus345: "#ff6b6b",
    bus138: "#f0c040",
    bus34: "#06b6d4",
    bus13: "#a78bfa",
    busDC: "#14ffb4",
    wire: "#445566",
    wireActive: "#667788",
    gen: "#14ffb4",
    xfmr: "#f0c040",
    breaker: "#ff6b6b",
    battery: "#22d3ee",
    load: "#f97316",
    ground: "#334",
    text: "#8899aa",
    textBright: "#bcc8d4",
    bg: "rgba(255,255,255,0.02)",
  };

  // Layout constants
  const W = 1180;
  const H = 920;
  const BUS_Y = {
    hv: 80,      // 345kV main bus
    mv: 220,     // 138kV collector bus
    dist: 480,   // 34.5kV distribution
    lv: 660,     // 13.8kV / 480V
    dc: 800,     // DC bus for data center
  };

  // Count active equipment
  const hCount = counts.hframe || 0;
  const fCount = counts.fframe || 0;
  const aCount = counts.aero || 0;
  const rCount = counts.recip || 0;
  const hasBattery = batteryMW > 0;
  const totalUnits = hCount + fCount + aCount + rCount;

  // Helpers to draw SLD symbols
  function Bus({ x, y, width, color, label, voltage, thickness = 4 }) {
    return (
      <g>
        <line x1={x} y1={y} x2={x + width} y2={y} stroke={color} strokeWidth={thickness} strokeLinecap="round" />
        {showVoltages && label && (
          <text x={x + width + 8} y={y + 4} fill={color} fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight={600} opacity={0.8}>
            {label}
          </text>
        )}
      </g>
    );
  }

  function Breaker({ x, y, size = 10, closed = true, id }) {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
        <rect x={x - size / 2} y={y - size / 2} width={size} height={size}
          fill={closed ? (isHovered ? "#ff8080" : COLORS.breaker) : "#222"}
          stroke={COLORS.breaker} strokeWidth={1.5} rx={2}
          style={{ transition: "all 0.2s" }} />
        {!closed && <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} stroke="#ff4060" strokeWidth={1.5} />}
        {isHovered && (
          <text x={x + size / 2 + 6} y={y + 3} fill="#ff8080" fontSize={8} fontFamily="'JetBrains Mono', monospace">CB</text>
        )}
      </g>
    );
  }

  function Transformer({ x, y, label, mvFrom, mvTo, id }) {
    const isHovered = hoveredNode === id;
    const r = 14;
    return (
      <g onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
        <circle cx={x} cy={y - 6} r={r} fill="none" stroke={isHovered ? "#ffd060" : COLORS.xfmr} strokeWidth={1.5} />
        <circle cx={x} cy={y + 6} r={r} fill="none" stroke={isHovered ? "#ffd060" : COLORS.xfmr} strokeWidth={1.5} />
        {label && (
          <text x={x + r + 6} y={y + 4} fill={isHovered ? "#ffd060" : COLORS.text} fontSize={8} fontFamily="'JetBrains Mono', monospace">
            {label}
          </text>
        )}
        {isHovered && mvFrom && (
          <text x={x + r + 6} y={y + 14} fill="#667" fontSize={7} fontFamily="'JetBrains Mono', monospace">
            {mvFrom} → {mvTo}
          </text>
        )}
      </g>
    );
  }

  function Generator({ x, y, label, mw, type, id }) {
    const isHovered = hoveredNode === id;
    const r = 22;
    const typeColors = { hframe: "#6366f1", fframe: "#f97316", aero: "#06b6d4", recip: "#22c55e" };
    const col = typeColors[type] || COLORS.gen;
    return (
      <g onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
        <circle cx={x} cy={y} r={r} fill={isHovered ? `${col}22` : "rgba(0,0,0,0.3)"}
          stroke={isHovered ? col : `${col}88`} strokeWidth={2}
          style={{ transition: "all 0.2s" }} />
        <text x={x} y={y - 3} textAnchor="middle" fill={col} fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', monospace">G</text>
        <text x={x} y={y + 9} textAnchor="middle" fill={`${col}aa`} fontSize={7} fontFamily="'JetBrains Mono', monospace">{mw}MW</text>
        <text x={x} y={y + r + 12} textAnchor="middle" fill={isHovered ? col : COLORS.text} fontSize={8} fontWeight={600} fontFamily="'JetBrains Mono', monospace">
          {label}
        </text>
        {isHovered && (
          <rect x={x - 50} y={y + r + 18} width={100} height={20} rx={4} fill="rgba(0,0,0,0.8)" stroke={`${col}44`} strokeWidth={1} />
        )}
        {isHovered && (
          <text x={x} y={y + r + 32} textAnchor="middle" fill={col} fontSize={7} fontFamily="'JetBrains Mono', monospace">
            {EQUIPMENT_DB[type]?.heatRate || "—"} BTU/kWh
          </text>
        )}
      </g>
    );
  }

  function BatterySymbol({ x, y, mw, mwh, id }) {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
        <rect x={x - 20} y={y - 14} width={40} height={28} rx={4}
          fill={isHovered ? "rgba(34,211,238,0.15)" : "rgba(0,0,0,0.3)"}
          stroke={isHovered ? COLORS.battery : `${COLORS.battery}66`} strokeWidth={2}
          style={{ transition: "all 0.2s" }} />
        <rect x={x + 20} y={y - 6} width={4} height={12} rx={1} fill={isHovered ? COLORS.battery : `${COLORS.battery}66`} />
        <text x={x - 2} y={y + 3} textAnchor="middle" fill={COLORS.battery} fontSize={8} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          BESS
        </text>
        <text x={x} y={y + 24} textAnchor="middle" fill={isHovered ? COLORS.battery : COLORS.text} fontSize={8} fontFamily="'JetBrains Mono', monospace">
          {mw}MW / {mwh}MWh
        </text>
        {isHovered && (
          <text x={x} y={y + 36} textAnchor="middle" fill="#667" fontSize={7} fontFamily="'JetBrains Mono', monospace">
            {mw > 0 ? (mwh / mw).toFixed(1) : 0}hr duration
          </text>
        )}
      </g>
    );
  }

  function DataCenterLoad({ x, y, mw, id }) {
    const isHovered = hoveredNode === id;
    return (
      <g onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
        <polygon points={`${x},${y - 20} ${x + 28},${y + 16} ${x - 28},${y + 16}`}
          fill={isHovered ? "rgba(249,115,22,0.15)" : "rgba(0,0,0,0.3)"}
          stroke={isHovered ? COLORS.load : `${COLORS.load}88`} strokeWidth={2}
          style={{ transition: "all 0.2s" }} />
        <text x={x} y={y + 6} textAnchor="middle" fill={COLORS.load} fontSize={9} fontWeight={700} fontFamily="'JetBrains Mono', monospace">DC</text>
        <text x={x} y={y + 32} textAnchor="middle" fill={isHovered ? COLORS.load : COLORS.text} fontSize={9} fontWeight={600} fontFamily="'JetBrains Mono', monospace">
          Data Center
        </text>
        <text x={x} y={y + 44} textAnchor="middle" fill="#667" fontSize={8} fontFamily="'JetBrains Mono', monospace">
          {mw} MW Load
        </text>
      </g>
    );
  }

  function VerticalWire({ x, y1, y2, color = COLORS.wireActive, dashed = false }) {
    return <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? "4,3" : "none"} />;
  }

  function HorizontalWire({ x1, x2, y, color = COLORS.wireActive }) {
    return <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={1.5} />;
  }

  // Layout generator positions
  const genGroups = [];
  const groupStartX = 60;
  const groupSpacing = 70;

  // H-Frames (large, spaced wider)
  for (let i = 0; i < hCount; i++) {
    genGroups.push({ type: "hframe", idx: i, label: `H${i + 1}`, mw: 400, busLevel: "hv" });
  }
  for (let i = 0; i < fCount; i++) {
    genGroups.push({ type: "fframe", idx: i, label: `F${i + 1}`, mw: 200, busLevel: "mv" });
  }
  for (let i = 0; i < Math.min(aCount, 12); i++) {
    genGroups.push({ type: "aero", idx: i, label: `A${i + 1}`, mw: 50, busLevel: "dist" });
  }
  for (let i = 0; i < Math.min(rCount, 15); i++) {
    genGroups.push({ type: "recip", idx: i, label: `R${i + 1}`, mw: 20, busLevel: "lv" });
  }

  // Position calculation
  const hvGens = genGroups.filter(g => g.busLevel === "hv");
  const mvGens = genGroups.filter(g => g.busLevel === "mv");
  const distGens = genGroups.filter(g => g.busLevel === "dist");
  const lvGens = genGroups.filter(g => g.busLevel === "lv");

  const busMargin = 80;
  const busWidth = W - busMargin * 2;
  const busStartX = busMargin;

  function distributeX(arr, busStart, busW) {
    if (arr.length === 0) return [];
    if (arr.length === 1) return [busStart + busW / 2];
    const spacing = busW / (arr.length + 1);
    return arr.map((_, i) => busStart + spacing * (i + 1));
  }

  const hvXs = distributeX(hvGens, busStartX, busWidth);
  const mvXs = distributeX(mvGens, busStartX, busWidth);
  const distXs = distributeX(distGens, busStartX, busWidth);
  const lvXs = distributeX(lvGens, busStartX, busWidth);

  // Battery and load positions
  const batteryX = busStartX + busWidth * 0.2;
  const loadCenterX = W / 2;
  const loadXs = [loadCenterX - 120, loadCenterX, loadCenterX + 120];

  // Determine which buses are active
  const hasHV = hCount > 0;
  const hasMV = fCount > 0 || hasHV;
  const hasDist = aCount > 0 || hasMV;
  const hasLV = rCount > 0 || hasDist;

  return (
    <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#bcc" }}>Single Line Diagram</div>
          <div style={{ fontSize: 11, color: "#556" }}>Hover elements for details — reflects current configuration</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#889", cursor: "pointer" }}>
            <input type="checkbox" checked={showVoltages} onChange={() => setShowVoltages(!showVoltages)} style={{ accentColor: "#14ffb4" }} />
            Show Voltage Labels
          </label>
          <div style={{ display: "flex", gap: 12, fontSize: 9 }}>
            {[
              ["#6366f1", "H-Frame"],
              ["#f97316", "F-Frame"],
              ["#06b6d4", "Aero"],
              ["#22c55e", "Recip"],
              ["#22d3ee", "BESS"],
              ["#f97316", "Load"],
            ].map(([col, label]) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: col, display: "inline-block" }} />
                <span style={{ color: "#778" }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto", background: "rgba(0,0,0,0.3)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)", padding: 8 }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* Background grid */}
          <defs>
            <pattern id="sld-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#sld-grid)" />

          {/* ── TITLE BLOCK ── */}
          <text x={W / 2} y={30} textAnchor="middle" fill="#556" fontSize={10} fontFamily="'JetBrains Mono', monospace" letterSpacing={2}>
            GAS-FIRED POWER PLANT — {totalCapacity} MW — SINGLE LINE DIAGRAM
          </text>

          {/* ══════ 345kV BUS (HV) ══════ */}
          {hasHV && (
            <>
              <Bus x={busStartX} y={BUS_Y.hv} width={busWidth} color={COLORS.bus345} label="345 kV" voltage="345" thickness={5} />

              {/* H-Frame generators connect up to 345kV bus */}
              {hvGens.map((g, i) => {
                const x = hvXs[i];
                const genY = BUS_Y.hv - 70;
                return (
                  <g key={`hv-${i}`}>
                    <VerticalWire x={x} y1={genY + 22} y2={BUS_Y.hv - 30} />
                    <Transformer x={x} y={BUS_Y.hv - 20} label={`GSU-H${i + 1}`} mvFrom="18kV" mvTo="345kV" id={`xfmr-h${i}`} />
                    <VerticalWire x={x} y1={BUS_Y.hv - 8} y2={BUS_Y.hv} />
                    <Breaker x={x} y={BUS_Y.hv - 5} id={`cb-h${i}`} />
                    <Generator x={x} y={genY} label={g.label} mw={g.mw} type="hframe" id={`gen-h${i}`} />
                  </g>
                );
              })}

              {/* Tie transformer HV → MV */}
              <VerticalWire x={busStartX + busWidth / 2} y1={BUS_Y.hv} y2={BUS_Y.hv + 20} color={COLORS.bus345} />
              <Transformer x={busStartX + busWidth / 2} y={BUS_Y.hv + 38} label="Auto-XFMR" mvFrom="345kV" mvTo="138kV" id="xfmr-tie-hv-mv" />
              <Breaker x={busStartX + busWidth / 2} y={BUS_Y.hv + 12} id="cb-tie-hv" />
              <VerticalWire x={busStartX + busWidth / 2} y1={BUS_Y.hv + 54} y2={BUS_Y.mv} color={COLORS.bus138} />
            </>
          )}

          {/* ══════ 138kV BUS (MV) ══════ */}
          {hasMV && (
            <>
              <Bus x={busStartX} y={BUS_Y.mv} width={busWidth} color={COLORS.bus138} label="138 kV" voltage="138" thickness={4} />

              {/* F-Frame generators */}
              {mvGens.map((g, i) => {
                const x = mvXs[i];
                const genY = BUS_Y.hv + (hasHV ? 90 : BUS_Y.mv - 80);
                return (
                  <g key={`mv-${i}`}>
                    <Generator x={x} y={genY} label={g.label} mw={g.mw} type="fframe" id={`gen-f${i}`} />
                    <VerticalWire x={x} y1={genY + 22} y2={BUS_Y.mv - 26} />
                    <Transformer x={x} y={BUS_Y.mv - 16} label={`GSU-F${i + 1}`} mvFrom="13.8kV" mvTo="138kV" id={`xfmr-f${i}`} />
                    <VerticalWire x={x} y1={BUS_Y.mv - 4} y2={BUS_Y.mv} />
                    <Breaker x={x} y={BUS_Y.mv - 2} id={`cb-f${i}`} />
                  </g>
                );
              })}

              {/* Tie transformer MV → Dist */}
              <VerticalWire x={busStartX + busWidth * 0.5} y1={BUS_Y.mv} y2={BUS_Y.mv + 20} color={COLORS.bus138} />
              <Breaker x={busStartX + busWidth * 0.5} y={BUS_Y.mv + 14} id="cb-tie-mv" />
              <Transformer x={busStartX + busWidth * 0.5} y={BUS_Y.mv + 38} label="Step-Down" mvFrom="138kV" mvTo="34.5kV" id="xfmr-tie-mv-dist" />
              <VerticalWire x={busStartX + busWidth * 0.5} y1={BUS_Y.mv + 54} y2={BUS_Y.dist} color={COLORS.bus34} />
            </>
          )}

          {/* ══════ 34.5kV BUS (Distribution) ══════ */}
          {hasDist && (
            <>
              <Bus x={busStartX} y={BUS_Y.dist} width={busWidth} color={COLORS.bus34} label="34.5 kV" voltage="34.5" thickness={3} />

              {/* Aero generators */}
              {distGens.map((g, i) => {
                const x = distXs[i];
                const genY = BUS_Y.mv + (hasMV ? 100 : BUS_Y.dist - 75);
                return (
                  <g key={`dist-${i}`}>
                    <Generator x={x} y={genY} label={g.label} mw={g.mw} type="aero" id={`gen-a${i}`} />
                    <VerticalWire x={x} y1={genY + 22} y2={BUS_Y.dist - 26} />
                    <Transformer x={x} y={BUS_Y.dist - 16} label={`T-A${i + 1}`} mvFrom="13.8kV" mvTo="34.5kV" id={`xfmr-a${i}`} />
                    <VerticalWire x={x} y1={BUS_Y.dist - 4} y2={BUS_Y.dist} />
                    <Breaker x={x} y={BUS_Y.dist - 2} id={`cb-a${i}`} />
                  </g>
                );
              })}

              {/* Battery on distribution bus */}
              {hasBattery && (
                <g>
                  <VerticalWire x={batteryX} y1={BUS_Y.dist} y2={BUS_Y.dist + 18} color={COLORS.battery} />
                  <Breaker x={batteryX} y={BUS_Y.dist + 10} id="cb-bess" />
                  <VerticalWire x={batteryX} y1={BUS_Y.dist + 22} y2={BUS_Y.dist + 45} color={COLORS.battery} />
                  <Transformer x={batteryX} y={BUS_Y.dist + 36} label="PCS" mvFrom="DC" mvTo="34.5kV" id="xfmr-bess" />
                  <VerticalWire x={batteryX} y1={BUS_Y.dist + 50} y2={BUS_Y.dist + 70} color={COLORS.battery} />
                  <BatterySymbol x={batteryX} y={BUS_Y.dist + 86} mw={batteryMW} mwh={batteryMWh} id="bess" />
                </g>
              )}

              {/* Tie transformer Dist → LV */}
              <VerticalWire x={busStartX + busWidth * 0.5} y1={BUS_Y.dist} y2={BUS_Y.dist + 18} color={COLORS.bus34} />
              <Breaker x={busStartX + busWidth * 0.5} y={BUS_Y.dist + 12} id="cb-tie-dist" />
              <Transformer x={busStartX + busWidth * 0.5} y={BUS_Y.dist + 36} label="Dist XFMR" mvFrom="34.5kV" mvTo="13.8kV" id="xfmr-tie-dist-lv" />
              <VerticalWire x={busStartX + busWidth * 0.5} y1={BUS_Y.dist + 52} y2={BUS_Y.lv} color={COLORS.bus13} />
            </>
          )}

          {/* ══════ 13.8kV BUS (LV) ══════ */}
          {hasLV && (
            <>
              <Bus x={busStartX} y={BUS_Y.lv} width={busWidth} color={COLORS.bus13} label="13.8 kV" voltage="13.8" thickness={2.5} />

              {/* Recip generators */}
              {lvGens.map((g, i) => {
                const x = lvXs[i];
                const genY = BUS_Y.dist + (hasDist ? 110 : BUS_Y.lv - 60);
                return (
                  <g key={`lv-${i}`}>
                    <Generator x={x} y={genY} label={g.label} mw={g.mw} type="recip" id={`gen-r${i}`} />
                    <VerticalWire x={x} y1={genY + 22} y2={BUS_Y.lv - 8} />
                    <Breaker x={x} y={BUS_Y.lv - 4} id={`cb-r${i}`} />
                  </g>
                );
              })}

              {/* Feeders to Data Center */}
              {loadXs.map((lx, i) => (
                <g key={`feed-${i}`}>
                  <VerticalWire x={lx} y1={BUS_Y.lv} y2={BUS_Y.lv + 16} color={COLORS.bus13} />
                  <Breaker x={lx} y={BUS_Y.lv + 10} id={`cb-feed-${i}`} />
                  <VerticalWire x={lx} y1={BUS_Y.lv + 18} y2={BUS_Y.dc - 22} color={COLORS.load} dashed />
                  <Transformer x={lx} y={BUS_Y.lv + 34} label={`UPS-${i + 1}`} mvFrom="13.8kV" mvTo="480V" id={`xfmr-feed-${i}`} />
                </g>
              ))}
            </>
          )}

          {/* ══════ DATA CENTER LOAD ══════ */}
          <Bus x={loadCenterX - 140} y={BUS_Y.dc} width={280} color={COLORS.busDC} label="480V DC Bus" voltage="480V" thickness={3} />
          {loadXs.map((lx, i) => (
            <VerticalWire key={`dc-${i}`} x={lx} y1={BUS_Y.dc} y2={BUS_Y.dc + 10} color={COLORS.busDC} />
          ))}
          <DataCenterLoad x={loadCenterX} y={BUS_Y.dc + 36} mw={TARGET_MW} id="dc-load" />

          {/* ── No equipment message ── */}
          {totalUnits === 0 && !hasBattery && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="#445" fontSize={14} fontFamily="'JetBrains Mono', monospace">
              Add equipment in Configuration tab to see the single line diagram
            </text>
          )}

          {/* ── Overflow indicators ── */}
          {aCount > 12 && (
            <text x={busStartX + busWidth - 10} y={BUS_Y.dist - 30} textAnchor="end" fill="#06b6d4" fontSize={9} fontFamily="'JetBrains Mono', monospace">
              +{aCount - 12} more aeros (not shown)
            </text>
          )}
          {rCount > 15 && (
            <text x={busStartX + busWidth - 10} y={BUS_Y.lv - 30} textAnchor="end" fill="#22c55e" fontSize={9} fontFamily="'JetBrains Mono', monospace">
              +{rCount - 15} more recips (not shown)
            </text>
          )}
        </svg>
      </div>

      {/* Legend & Notes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
        <div style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#889", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Symbols</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 10 }}>
            <span style={{ color: "#778" }}><span style={{ color: "#14ffb4" }}>◯ G</span> — Generator</span>
            <span style={{ color: "#778" }}><span style={{ color: "#f0c040" }}>◯◯</span> — Transformer</span>
            <span style={{ color: "#778" }}><span style={{ color: "#ff6b6b" }}>■</span> — Circuit Breaker</span>
            <span style={{ color: "#778" }}><span style={{ color: "#22d3ee" }}>▬</span> — Battery (BESS)</span>
            <span style={{ color: "#778" }}><span style={{ color: "#f97316" }}>▽</span> — Load</span>
          </div>
        </div>
        <div style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#889", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Voltage Levels</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
            <span style={{ color: COLORS.bus345 }}>━ 345 kV — Transmission (H-Frame GSUs)</span>
            <span style={{ color: COLORS.bus138 }}>━ 138 kV — Sub-Transmission (F-Frame GSUs)</span>
            <span style={{ color: COLORS.bus34 }}>━ 34.5 kV — Distribution (Aeros + BESS)</span>
            <span style={{ color: COLORS.bus13 }}>━ 13.8 kV — Plant Bus (Recips + Feeders)</span>
            <span style={{ color: COLORS.busDC }}>━ 480V — Data Center Bus</span>
          </div>
        </div>
        <div style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#889", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Configuration</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "#778" }}>
            {hCount > 0 && <span><span style={{ color: "#6366f1" }}>●</span> {hCount} × H-Frame @ 345kV</span>}
            {fCount > 0 && <span><span style={{ color: "#f97316" }}>●</span> {fCount} × F-Frame @ 138kV</span>}
            {aCount > 0 && <span><span style={{ color: "#06b6d4" }}>●</span> {aCount} × Aero @ 34.5kV</span>}
            {rCount > 0 && <span><span style={{ color: "#22c55e" }}>●</span> {rCount} × Recip @ 13.8kV</span>}
            {hasBattery && <span><span style={{ color: "#22d3ee" }}>●</span> BESS {batteryMW}MW/{batteryMWh}MWh @ 34.5kV</span>}
            <span style={{ color: "#556", marginTop: 4 }}>Total: {totalCapacity} MW → 1,000 MW load</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function GasPlantConfigurator() {
  const [counts, setCounts] = useState({ hframe: 1, fframe: 2, aero: 4, recip: 10, });
  const [batteryMWh, setBatteryMWh] = useState(300);
  const [batteryMW, setBatteryMW] = useState(150);
  const [gasPrice, setGasPrice] = useState(GAS_PRICE);
  const [activePreset, setActivePreset] = useState(null);
  const [tab, setTab] = useState("config");
  const [savedConfigs, setSavedConfigs] = useState([]);

  const handleCountChange = useCallback((type, val) => {
    setCounts(prev => ({ ...prev, [type]: val }));
    setActivePreset(null);
  }, []);

  const applyPreset = (key) => {
    const p = PRESETS[key];
    setCounts({ hframe: p.hframe, fframe: p.fframe, aero: p.aero, recip: p.recip });
    setBatteryMWh(p.batteryMWh);
    setBatteryMW(p.batteryMW);
    setActivePreset(key);
  };

  const config = useMemo(() => {
    let totalCapacity = 0, totalCapex = 0, totalFixedOM = 0, totalVariableOM = 0;
    let weightedHeatRate = 0, weightedStartup = 0, weightedLCOE = 0;
    let capWeights = 0, backupCapacity = 0, waterUsage = 0, totalAcres = 0;
    let totalUnits = 0, modSum = 0, totalEmissions = 0;

    Object.entries(counts).forEach(([type, count]) => {
      if (count <= 0) return;
      const spec = EQUIPMENT_DB[type];
      const cap = count * spec.unitCapacity;
      totalCapacity += cap;
      totalCapex += cap * spec.capitalCostPerMW;
      totalFixedOM += cap * spec.fixedOM;
      const annualMWh = cap * 8760 * CAPACITY_FACTOR;
      totalVariableOM += annualMWh * spec.variableOM;
      weightedHeatRate += spec.heatRate * cap;
      weightedStartup += spec.startupTime * cap;
      weightedLCOE += calculateLCOE(spec, gasPrice) * cap;
      capWeights += cap;
      if (spec.canConvertToBackup) backupCapacity += cap;
      waterUsage += spec.waterGPMperMW * cap;
      totalAcres += spec.footprintAcresPerMW * cap;
      totalUnits += count;
      modSum += spec.modularity * count;
      totalEmissions += spec.emissionsLbCO2perMWh * cap;
    });

    if (capWeights > 0) {
      weightedHeatRate /= capWeights;
      weightedStartup /= capWeights;
      weightedLCOE /= capWeights;
      totalEmissions /= capWeights;
    }

    // Battery costs
    const batteryCap = batteryMWh * BATTERY_SPECS.costPerMWh + batteryMW * BATTERY_SPECS.costPerMW;
    totalCapex += batteryCap;
    totalAcres += batteryMWh * BATTERY_SPECS.footprintAcresPerMWh;

    const redundancyMW = totalCapacity - TARGET_MW + batteryMW;
    const versatilityScore = capWeights > 0 ? backupCapacity / capWeights : 0;
    const modularity = totalUnits > 0 ? modSum / totalUnits : 0;
    const annualFuelCost = capWeights > 0 ? (weightedHeatRate / 1e6) * gasPrice * capWeights * 8760 * CAPACITY_FACTOR * 1000 : 0;

    return {
      counts,
      totalCapacity,
      totalCapex,
      batteryCost: batteryCap,
      totalFixedOM,
      totalVariableOM,
      annualFuelCost,
      weightedHeatRate,
      weightedStartup,
      weightedLCOE,
      redundancyMW,
      batteryMWh,
      batteryMW,
      versatilityScore,
      backupCapacity,
      waterUsage,
      totalAcres,
      totalUnits,
      modularity,
      totalEmissions,
    };
  }, [counts, batteryMWh, batteryMW, gasPrice]);

  const scores = useMemo(() => calculateConfigScore(config), [config]);

  const saveConfig = () => {
    setSavedConfigs(prev => [...prev, {
      id: Date.now(),
      counts: { ...counts },
      batteryMWh,
      batteryMW,
      gasPrice,
      score: scores.overall,
      totalCapacity: config.totalCapacity,
      totalCapex: config.totalCapex,
      lcoe: config.weightedLCOE,
    }]);
  };

  const capacityDelta = config.totalCapacity - TARGET_MW;
  const capacityColor = capacityDelta >= 0 ? "#14ffb4" : "#ff4060";

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: "#0a0e14",
      color: "#c8d0d8",
      minHeight: "100vh",
      padding: "24px 20px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#556", textTransform: "uppercase", marginBottom: 4 }}>GAS PLANT CONFIGURATOR</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e8eef4", margin: 0, letterSpacing: -0.5 }}>
              1 GW Data Center Power Plant
            </h1>
            <div style={{ fontSize: 12, color: "#556", marginTop: 4 }}>Model equipment mix, costs, redundancy & future-proofing</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#556" }}>TOTAL CAPACITY</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: capacityColor, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatNum(config.totalCapacity)} <span style={{ fontSize: 14 }}>MW</span>
              </div>
              <div style={{ fontSize: 10, color: capacityColor }}>
                {capacityDelta >= 0 ? "+" : ""}{formatNum(capacityDelta)} MW vs target
              </div>
            </div>
            <ScoreGauge score={scores.overall} label="CONFIG SCORE" size={100} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1200, margin: "0 auto 16px", display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3 }}>
        {[["config", "Configuration"], ["sld", "Single Line Diagram"], ["analysis", "Cost Analysis"], ["timeline", "Timeline & Versatility"], ["compare", "Compare Saved"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: "10px 16px", borderRadius: 6, border: "none",
            background: tab === key ? "rgba(20,255,180,0.1)" : "transparent",
            color: tab === key ? "#14ffb4" : "#667",
            fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ─── CONFIG TAB ─── */}
        {tab === "config" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
            <div>
              {/* Presets */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#556", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Quick Presets</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <PresetButton key={key} label={p.label} desc={p.desc} active={activePreset === key} onClick={() => applyPreset(key)} />
                  ))}
                </div>
              </div>

              {/* Equipment Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {Object.entries(EQUIPMENT_DB).map(([type, spec]) => (
                  <EquipmentCard key={type} type={type} spec={spec} count={counts[type]} onCountChange={handleCountChange} />
                ))}
              </div>

              {/* Battery Storage */}
              <div style={{ marginTop: 16, padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 12 }}>🔋 Battery Storage (Bridging & Peaking)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "#667" }}>Energy Capacity</span>
                      <span style={{ color: "#14ffb4", fontFamily: "'JetBrains Mono', monospace" }}>{batteryMWh} MWh</span>
                    </div>
                    <input type="range" min={0} max={2000} step={50} value={batteryMWh} onChange={e => { setBatteryMWh(parseInt(e.target.value)); setActivePreset(null); }}
                      style={{ width: "100%", accentColor: "#14ffb4" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#445" }}>
                      <span>0 MWh</span><span>2,000 MWh</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "#667" }}>Power Rating</span>
                      <span style={{ color: "#14ffb4", fontFamily: "'JetBrains Mono', monospace" }}>{batteryMW} MW</span>
                    </div>
                    <input type="range" min={0} max={500} step={25} value={batteryMW} onChange={e => { setBatteryMW(parseInt(e.target.value)); setActivePreset(null); }}
                      style={{ width: "100%", accentColor: "#14ffb4" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#445" }}>
                      <span>0 MW</span><span>500 MW</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: "#556" }}>
                  Duration: {batteryMW > 0 ? (batteryMWh / batteryMW).toFixed(1) : "—"} hours • 
                  Cost: {formatMoney(config.batteryCost)} • 
                  Bridges {batteryMW > 0 ? Math.round(batteryMWh / batteryMW * 60) : 0} min of startup gap
                </div>
              </div>

              {/* Gas Price */}
              <div style={{ marginTop: 12, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#889" }}>Gas Price Assumption</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#f0c040", fontFamily: "'JetBrains Mono', monospace" }}>${gasPrice.toFixed(2)}/MMBtu</span>
                </div>
                <input type="range" min={1.5} max={8} step={0.25} value={gasPrice} onChange={e => setGasPrice(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#f0c040", marginTop: 8 }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#445" }}>
                  <span>$1.50</span><span>$8.00</span>
                </div>
              </div>
            </div>

            {/* Right Panel — Scores */}
            <div>
              <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#556", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Configuration Score</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <ScoreGauge score={scores.overall} size={140} />
                </div>
                {Object.entries(scores.breakdown).map(([label, val]) => (
                  <ScoreBar key={label} label={label} value={val} />
                ))}
                <button onClick={saveConfig} style={{
                  width: "100%", marginTop: 16, padding: "10px 0", borderRadius: 8, border: "1px solid rgba(20,255,180,0.3)",
                  background: "rgba(20,255,180,0.08)", color: "#14ffb4", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  💾 Save This Configuration
                </button>
              </div>

              {/* Quick Stats */}
              <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#556", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Quick Summary</div>
                {[
                  ["Total CapEx", formatMoney(config.totalCapex)],
                  ["Blended LCOE", `$${config.weightedLCOE.toFixed(1)}/MWh`],
                  ["Heat Rate (wtd)", `${formatNum(config.weightedHeatRate)} BTU/kWh`],
                  ["Avg Startup", `${config.weightedStartup.toFixed(0)} min`],
                  ["Total Units", config.totalUnits],
                  ["Redundancy", `${config.redundancyMW > 0 ? "+" : ""}${formatNum(config.redundancyMW)} MW`],
                  ["Backup-Convertible", `${formatNum(config.backupCapacity)} MW (${config.totalCapacity > 0 ? ((config.backupCapacity / config.totalCapacity) * 100).toFixed(0) : 0}%)`],
                  ["Water Usage", `${formatNum(config.waterUsage)} GPM`],
                  ["Footprint", `${config.totalAcres.toFixed(1)} acres`],
                  ["Emissions", `${formatNum(config.totalEmissions)} lb CO₂/MWh`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 11 }}>
                    <span style={{ color: "#667" }}>{label}</span>
                    <span style={{ color: "#bcc", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── COST ANALYSIS TAB ─── */}
        {tab === "analysis" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* CapEx Breakdown */}
            <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 16 }}>Capital Expenditure Breakdown</div>
              {Object.entries(counts).map(([type, count]) => {
                if (count <= 0) return null;
                const spec = EQUIPMENT_DB[type];
                const cost = count * spec.unitCapacity * spec.capitalCostPerMW;
                const pct = config.totalCapex > 0 ? (cost / config.totalCapex * 100) : 0;
                return (
                  <div key={type} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: "#889" }}>{spec.icon} {spec.shortName} ({count} × {spec.unitCapacity}MW)</span>
                      <span style={{ color: "#bcc", fontFamily: "'JetBrains Mono', monospace" }}>{formatMoney(cost)}</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: type === "hframe" ? "#6366f1" : type === "fframe" ? "#f97316" : type === "aero" ? "#06b6d4" : "#22c55e", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#556", marginTop: 2 }}>{pct.toFixed(1)}% of total</div>
                  </div>
                );
              })}
              {config.batteryCost > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "#889" }}>🔋 Battery ({batteryMWh}MWh / {batteryMW}MW)</span>
                    <span style={{ color: "#bcc", fontFamily: "'JetBrains Mono', monospace" }}>{formatMoney(config.batteryCost)}</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${(config.batteryCost / config.totalCapex * 100)}%`, background: "#eab308", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 9, color: "#556", marginTop: 2 }}>{(config.batteryCost / config.totalCapex * 100).toFixed(1)}% of total</div>
                </div>
              )}
              <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: "#bcc" }}>Total CapEx</span>
                  <span style={{ color: "#14ffb4", fontFamily: "'JetBrains Mono', monospace" }}>{formatMoney(config.totalCapex)}</span>
                </div>
                <div style={{ fontSize: 10, color: "#556", marginTop: 4 }}>
                  {config.totalCapacity > 0 ? formatMoney(config.totalCapex / config.totalCapacity) : "$0"}/MW all-in
                </div>
              </div>
            </div>

            {/* Annual Operating Costs */}
            <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 16 }}>Annual Operating Costs (at {(CAPACITY_FACTOR * 100).toFixed(0)}% CF)</div>
              {[
                ["Fuel Cost", config.annualFuelCost, "#f97316"],
                ["Fixed O&M", config.totalFixedOM, "#6366f1"],
                ["Variable O&M", config.totalVariableOM, "#22c55e"],
              ].map(([label, val, color]) => {
                const total = config.annualFuelCost + config.totalFixedOM + config.totalVariableOM;
                const pct = total > 0 ? (val / total * 100) : 0;
                return (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: "#889" }}>{label}</span>
                      <span style={{ color: "#bcc", fontFamily: "'JetBrains Mono', monospace" }}>{formatMoney(val)}/yr</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: "#bcc" }}>Total Annual OpEx</span>
                  <span style={{ color: "#f0c040", fontFamily: "'JetBrains Mono', monospace" }}>{formatMoney(config.annualFuelCost + config.totalFixedOM + config.totalVariableOM)}/yr</span>
                </div>
              </div>

              {/* LCOE by equipment */}
              <div style={{ marginTop: 24, fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 12 }}>LCOE by Equipment Type</div>
              {Object.entries(EQUIPMENT_DB).map(([type, spec]) => {
                const lcoe = calculateLCOE(spec, gasPrice);
                return (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 11 }}>
                    <span style={{ color: counts[type] > 0 ? "#bcc" : "#445" }}>{spec.icon} {spec.shortName}</span>
                    <span style={{ color: counts[type] > 0 ? "#f0c040" : "#445", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      ${lcoe.toFixed(2)}/MWh
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: "#bcc" }}>Blended LCOE</span>
                <span style={{ color: "#14ffb4", fontFamily: "'JetBrains Mono', monospace" }}>${config.weightedLCOE.toFixed(2)}/MWh</span>
              </div>
            </div>

            {/* Gas Price Sensitivity */}
            <div style={{ gridColumn: "1 / -1", padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 16 }}>Gas Price Sensitivity — Blended LCOE</div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 120 }}>
                {[2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map(gp => {
                  let wLCOE = 0, wt = 0;
                  Object.entries(counts).forEach(([type, count]) => {
                    if (count <= 0) return;
                    const spec = EQUIPMENT_DB[type];
                    const cap = count * spec.unitCapacity;
                    wLCOE += calculateLCOE(spec, gp) * cap;
                    wt += cap;
                  });
                  const lcoe = wt > 0 ? wLCOE / wt : 0;
                  const maxLCOE = 120;
                  const h = Math.min((lcoe / maxLCOE) * 100, 100);
                  const isActive = Math.abs(gp - gasPrice) < 0.13;
                  return (
                    <div key={gp} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 8, color: "#889", fontFamily: "'JetBrains Mono', monospace" }}>${lcoe.toFixed(0)}</div>
                      <div style={{ width: "100%", height: `${h}%`, minHeight: 4, background: isActive ? "#14ffb4" : "rgba(20,255,180,0.2)", borderRadius: "3px 3px 0 0", transition: "all 0.3s" }} />
                      <div style={{ fontSize: 8, color: isActive ? "#14ffb4" : "#556" }}>${gp}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: "center", fontSize: 10, color: "#556", marginTop: 8 }}>Gas Price ($/MMBtu)</div>
            </div>
          </div>
        )}

        {/* ─── TIMELINE TAB ─── */}
        {tab === "timeline" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <TimelineView config={config} />
            </div>

            <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 12 }}>Versatility Matrix</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Equipment</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Primary</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Peaking</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Backup</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Black Start</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#667" }}>Grid Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["H-Frame", "●", "○", "○", "○", "●"],
                    ["F-Frame", "●", "◐", "○", "○", "●"],
                    ["Aero", "●", "●", "●", "●", "●"],
                    ["Recip", "●", "●", "●", "●", "●"],
                    ["Battery", "◐", "●", "●", "●", "○"],
                  ].map(([name, ...vals], i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#bcc", fontWeight: 600 }}>{name}</td>
                      {vals.map((v, j) => (
                        <td key={j} style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: v === "●" ? "#14ffb4" : v === "◐" ? "#f0c040" : "#333", fontSize: 14 }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 9, color: "#556" }}>
                ● Excellent &nbsp; ◐ Capable &nbsp; ○ Not suitable
              </div>

              {/* Dispatch Priority */}
              <div style={{ marginTop: 24, fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 12 }}>Recommended Dispatch Priority</div>
              {[
                { load: "Base Load (0-70%)", equip: "H-Frames → F-Frames", color: "#6366f1" },
                { load: "Intermediate (70-90%)", equip: "F-Frames → Aeros", color: "#06b6d4" },
                { load: "Peak (90-100%)", equip: "Aeros → Recips → Battery", color: "#f97316" },
                { load: "Startup Bridge", equip: "Battery → Recips → Aeros", color: "#eab308" },
                { load: "Emergency / Backup", equip: "Recips + Aeros + Battery", color: "#ef4444" },
              ].map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width: 4, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#bcc" }}>{d.load}</div>
                    <div style={{ fontSize: 10, color: "#667" }}>{d.equip}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Capacity Evolution */}
            <div style={{ gridColumn: "1 / -1", padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#bcc", marginBottom: 16 }}>Capacity Role Evolution Over Time</div>
              <div style={{ display: "flex", gap: 2, height: 100 }}>
                {Array.from({ length: 25 }, (_, yr) => {
                  const convertPct = Math.min(1, Math.max(0, (yr - 7) / 10));
                  const primaryMW = config.totalCapacity - config.backupCapacity * convertPct;
                  const backupMW = config.backupCapacity * convertPct;
                  const pPct = config.totalCapacity > 0 ? (primaryMW / config.totalCapacity * 100) : 0;
                  const bPct = config.totalCapacity > 0 ? (backupMW / config.totalCapacity * 100) : 0;
                  return (
                    <div key={yr} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ height: `${bPct}%`, background: "rgba(80,200,255,0.4)", borderRadius: "2px 2px 0 0", minHeight: bPct > 0 ? 2 : 0 }} title={`Year ${yr}: ${backupMW.toFixed(0)}MW backup`} />
                      <div style={{ height: `${pPct}%`, background: "rgba(20,255,180,0.3)", minHeight: 2 }} title={`Year ${yr}: ${primaryMW.toFixed(0)}MW primary`} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#445", marginTop: 4 }}>
                <span>Year 0</span><span>Year 5</span><span>Year 10</span><span>Year 15</span><span>Year 20</span><span>Year 25</span>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10 }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(20,255,180,0.3)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />Primary Generation</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(80,200,255,0.4)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />Converted to Backup</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── COMPARE TAB ─── */}
        {tab === "compare" && (
          <div>
            {savedConfigs.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#556" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14 }}>No saved configurations yet.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Go to Configuration tab and click "Save This Configuration" to compare different setups.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(savedConfigs.length, 4)}, 1fr)`, gap: 12 }}>
                {savedConfigs.map((cfg, i) => (
                  <div key={cfg.id} style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#bcc" }}>Config #{i + 1}</div>
                      <button onClick={() => setSavedConfigs(prev => prev.filter(c => c.id !== cfg.id))}
                        style={{ background: "none", border: "none", color: "#556", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <ScoreGauge score={cfg.score} size={100} />
                    </div>
                    {Object.entries(cfg.counts).map(([type, count]) => count > 0 && (
                      <div key={type} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "#889" }}>
                        <span>{EQUIPMENT_DB[type].icon} {EQUIPMENT_DB[type].shortName}</span>
                        <span>{count} × {EQUIPMENT_DB[type].unitCapacity}MW</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8, paddingTop: 8 }}>
                      {[
                        ["Capacity", `${formatNum(cfg.totalCapacity)} MW`],
                        ["CapEx", formatMoney(cfg.totalCapex)],
                        ["LCOE", `$${cfg.lcoe.toFixed(1)}/MWh`],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0" }}>
                          <span style={{ color: "#556" }}>{l}</span>
                          <span style={{ color: "#bcc", fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => {
                      setCounts({ ...cfg.counts });
                      setBatteryMWh(cfg.batteryMWh || 0);
                      setBatteryMW(cfg.batteryMW || 0);
                      setGasPrice(cfg.gasPrice || GAS_PRICE);
                      setTab("config");
                    }} style={{
                      width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.03)", color: "#889", fontSize: 10, cursor: "pointer",
                    }}>Load Config</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── SINGLE LINE DIAGRAM TAB ─── */}
        {tab === "sld" && (
          <SingleLineDiagram counts={counts} batteryMW={batteryMW} batteryMWh={batteryMWh} totalCapacity={config.totalCapacity} />
        )}

      </div>
    </div>
  );
}
