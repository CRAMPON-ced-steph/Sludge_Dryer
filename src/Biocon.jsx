import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { STRINGS } from "./Biocon_traduction.jsx";
import {
  DRYER_TYPES, DEFAULT_INPUTS, runModel,
  setLocale, fmt, pct, passLabels, tempColor,
  saveProject, parseProject, slugify,
  buildReportHTML, openReport,
} from "./Biocon_fonction.jsx";

/* ============================================================================
   Biocon — Outil de dimensionnement de sécheur à bande pour biosolides
   Portage React de la feuille Google Sheets + Apps Script d'origine.
   Le moteur de calcul ci-dessous est un portage fidèle des 115 fonctions
   du script (psychrométrie, bilans matière/enthalpie, goal-seek imbriqués).
   ============================================================================ */

// Palette de surlignage des correctifs : une couleur stable par critère.
const FIX_COLORS = [
  "bg-amber-100 text-amber-900",
  "bg-sky-100 text-sky-900",
  "bg-violet-100 text-violet-900",
  "bg-orange-100 text-orange-900",
  "bg-cyan-100 text-cyan-900",
  "bg-fuchsia-100 text-fuchsia-900",
  "bg-teal-100 text-teal-900",
  "bg-indigo-100 text-indigo-900",
  "bg-lime-100 text-lime-900",
];
// Pastilles pleines et anneaux, même teinte que FIX_COLORS (pour les champs à modifier).
const FIX_DOT = [
  "bg-amber-400", "bg-sky-400", "bg-violet-400", "bg-orange-400", "bg-cyan-400",
  "bg-fuchsia-400", "bg-teal-400", "bg-indigo-400", "bg-lime-400",
];
const FIX_RING = [
  "ring-amber-400", "ring-sky-400", "ring-violet-400", "ring-orange-400", "ring-cyan-400",
  "ring-fuchsia-400", "ring-teal-400", "ring-indigo-400", "ring-lime-400",
];
// Champs de consigne visés par le correctif de chaque critère (même ordre que les checks).
const FIX_FIELDS = [
  ["sludgeMC4"],                 // 0 charge évap. ZC
  ["wzUnitBL", "sludgeMC4"],     // 1 flux évap. ZC
  [],                            // 2 charge bande ZF (machine/train)
  ["sludgeMC4"],                 // 3 charge évap. ZF
  ["dryerRT", "sludgeMC4"],      // 4 flux évap. ZF
  [],                            // 5 charge par buse (machine/train)
  ["dryerRT"],                   // 6 épaisseur lit
  ["airTemp0", "deltaTemp5"],    // 7 vitesse air ZC
  ["airTemp12", "deltaTemp17"],  // 8 vitesse air ZF
];

// ============================================================================
//  PETITS COMPOSANTS
// ============================================================================
function Field({ label, value, onChange, unit, type = "number", step = "any", hint, options, markers }) {
  const mk = markers || [];
  const ring = mk.length ? ` ring-2 ${FIX_RING[mk[0] % FIX_RING.length]}` : "";
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
        {label}
        {mk.length > 0 && (
          <span className="inline-flex gap-0.5">
            {mk.map((idx) => (
              <span key={idx} title={label}
                className={`inline-block h-2 w-2 rounded-full ${FIX_DOT[idx % FIX_DOT.length]}`} />
            ))}
          </span>
        )}
      </span>
      <div className="flex items-stretch">
        {options ? (
          <select
            className={`min-w-0 flex-1 rounded-l border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600${ring}`}
            value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={type} step={step} value={value}
            onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) : e.target.value)}
            className={`min-w-0 flex-1 rounded-l border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600${ring}`} />
        )}
        <span className="inline-flex items-center rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 text-[11px] text-slate-500">
          {unit || "—"}
        </span>
      </div>
      {hint && <span className="text-[10px] leading-tight text-slate-400">{hint}</span>}
    </label>
  );
}

function Section({ title, note, children, cols = 3 }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline gap-3 border-b border-slate-200 pb-1.5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
        {note && <span className="text-[11px] text-slate-500">{note}</span>}
      </div>
      <div className={`grid gap-3 ${cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {children}
      </div>
    </section>
  );
}

function Stat({ label, value, unit, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white", ok: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-300 bg-amber-50", bad: "border-rose-300 bg-rose-50",
  };
  return (
    <div className={`rounded border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function DataTable({ head, rows, firstColWidth = "180px" }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-slate-100">
            {head.map((h, i) => (
              <th key={i} style={i === 0 ? { minWidth: firstColWidth } : {}}
                className={`border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-700 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
              {r.map((c, j) => (
                <td key={j} className={`border-b border-slate-100 px-2 py-1 tabular-nums ${j === 0 ? "text-left font-medium text-slate-700" : "text-right text-slate-800"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
//  SCHÉMA DE PROCÉDÉ
// ============================================================================
function ProcessDiagram({ R, t }) {
  if (!R) return null;
  const A = R.streams.air, Sl = R.streams.sludge;
  const chip = (x, y, label, tv, extra) => (
    <g>
      <rect x={x} y={y} width="90" height="26" rx="3" fill="white" stroke={tempColor(tv)} strokeWidth="1.5" />
      <text x={x + 5} y={y + 10} fontSize="6.8" fill="#64748b" fontFamily="ui-monospace, monospace">{label}</text>
      <text x={x + 5} y={y + 21} fontSize="9.5" fill="#0f172a" fontFamily="ui-monospace, monospace" fontWeight="600">
        {fmt(tv, 0)}°C{extra ? ` · ${extra}` : ""}
      </text>
    </g>
  );
  const pass = (x, y, label, xs) => (
    <g>
      <rect x={x} y={y} width="62" height="34" rx="2" fill="#f8fafc" stroke="#334155" strokeWidth="1" />
      <line x1={x + 6} y1={y + 24} x2={x + 56} y2={y + 24} stroke="#0f172a" strokeWidth="2" />
      <text x={x + 31} y={y + 12} fontSize="8" textAnchor="middle" fill="#334155" fontWeight="600">{label}</text>
      <text x={x + 31} y={y + 20} fontSize="7.5" textAnchor="middle" fill="#0284c7" fontFamily="ui-monospace, monospace">
        {pct(xs, 0)} {t.dgDS}
      </text>
    </g>
  );
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white p-3">
      <svg viewBox="0 0 880 330" className="w-full min-w-[860px]">
        <rect x="20" y="20" width="330" height="120" rx="4" fill="none" stroke="#7c3aed" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x="30" y="35" fontSize="10" fill="#7c3aed" fontWeight="700">{t.dgWZ}</text>
        {pass(30, 55, `${t.dgPass} 1`, Sl[1].xS)}
        {pass(110, 55, `${t.dgPass} 2`, Sl[2].xS)}
        {pass(190, 55, `${t.dgPass} 3`, Sl[3].xS)}
        {pass(270, 55, `${t.dgPass} 4`, Sl[4].xS)}
        {[92, 172, 252].map((x, i) => <path key={i} d={`M${x} 72 L${x + 18} 72`} stroke="#0f172a" strokeWidth="1.2" markerEnd="url(#arr)" />)}

        <rect x="380" y="20" width="330" height="120" rx="4" fill="none" stroke="#0284c7" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x="390" y="35" fontSize="10" fill="#0284c7" fontWeight="700">{t.dgEZ}</text>
        {pass(390, 55, `${t.passEZ} 1`, Sl[5].xS)}
        {pass(470, 55, `${t.passEZ} 2`, Sl[6].xS)}
        {pass(550, 55, `${t.passEZ} 3`, Sl[7].xS)}
        {pass(630, 55, `${t.passEZ} 4`, Sl[8].xS)}
        {[452, 532, 612].map((x, i) => <path key={i} d={`M${x} 72 L${x + 18} 72`} stroke="#0f172a" strokeWidth="1.2" markerEnd="url(#arr)" />)}
        <path d="M352 72 L378 72" stroke="#0f172a" strokeWidth="1.5" markerEnd="url(#arr)" />

        <text x="22" y="52" fontSize="8" fill="#475569">{t.dgFeed} {pct(Sl[0].xS, 0)} {t.dgDS}</text>
        <text x="700" y="52" fontSize="8" fill="#059669" fontWeight="600">{t.dgProduct} {pct(Sl[8].xS, 0)} {t.dgDS}</text>
        <path d="M694 72 L716 72" stroke="#059669" strokeWidth="2" markerEnd="url(#arrg)" />

        {chip(30, 155, `Air 0 · ${t.dgIn} ${t.passWZ}`, A[0].tA)}
        {chip(270, 155, `Air 5 · ${t.dgOut} ${t.passWZ}`, A[5].tA, `${fmt(A[5].dptA, 0)}°C ${t.dgDew}`)}
        {chip(390, 155, `Air 12 · ${t.dgIn} ${t.passEZ}`, A[12].tA)}
        {chip(630, 155, `Air 17 · ${t.dgOut} ${t.passEZ}`, A[17].tA)}

        <rect x="20" y="205" width="230" height="100" rx="4" fill="none" stroke="#f97316" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x="30" y="220" fontSize="10" fill="#ea580c" fontWeight="700">{t.dgAirTreat}</text>
        {chip(30, 232, `Air 7 · ${t.dgExtract}`, A[7].tA, `${fmt(A[7].fVolA, 1)} m³/s`)}
        {chip(144, 232, `Air 9 · ${t.dgCond}`, A[9].tA)}
        {chip(30, 268, `Air 10 · ${t.dgRecycl}`, A[10].tA)}
        <text x="149" y="280" fontSize="8" fill="#475569">{t.dgCondWater} {fmt(R.condenser.fW1 * 3.6, 1)} m³/h</text>

        <rect x="270" y="205" width="200" height="100" rx="4" fill="none" stroke="#dc2626" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x="280" y="220" fontSize="10" fill="#dc2626" fontWeight="700">{t.dgOil}</text>
        <text x="280" y="240" fontSize="9" fill="#0f172a">{t.dgHexWz} : <tspan fontWeight="700">{fmt(R.energy.wzHInput, 0)} kW</tspan></text>
        <text x="280" y="256" fontSize="9" fill="#0f172a">{t.dgHexEz} : <tspan fontWeight="700">{fmt(R.energy.ezHInput, 0)} kW</tspan></text>
        <text x="280" y="272" fontSize="9" fill="#0f172a">{t.dgHeater} : <tspan fontWeight="700">{R.heater.model}</tspan> ({fmt(R.heater.capacity, 1)} MMBTU/h)</text>
        <text x="280" y="288" fontSize="9" fill="#0f172a">{t.dgNeed} : <tspan fontWeight="700">{fmt(R.heater.totalHInput_MMBTU, 2)} MMBTU/h</tspan></text>

        <rect x="490" y="205" width="220" height="100" rx="4" fill="none" stroke="#0891b2" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x="500" y="220" fontSize="10" fill="#0891b2" fontWeight="700">{t.dgEvap}</text>
        <text x="500" y="240" fontSize="9" fill="#0f172a">{t.dgTotal} : <tspan fontWeight="700">{fmt(R.energy.evapTotal, 0)} kg/h</tspan></text>
        <text x="500" y="256" fontSize="9" fill="#0f172a">{t.dgWarmZone} : <tspan fontWeight="700">{fmt(R.energy.evapWZ, 0)} kg/h</tspan></text>
        <text x="500" y="272" fontSize="9" fill="#0f172a">{t.dgEndZone} : <tspan fontWeight="700">{fmt(R.energy.evapEZ, 0)} kg/h</tspan></text>
        <text x="500" y="288" fontSize="9" fill="#0f172a">{t.dgRatio} : <tspan fontWeight="700">{fmt(R.energy.evapWZ / R.energy.evapEZ, 2)}</tspan>
          <tspan fill="#64748b" fontSize="8"> {t.dgTarget}</tspan></text>

        <rect x="730" y="205" width="130" height="100" rx="4" fill="#0f172a" />
        <text x="742" y="224" fontSize="8" fill="#94a3b8">{t.dgSelected}</text>
        <text x="742" y="242" fontSize="13" fill="white" fontWeight="700" fontFamily="ui-monospace, monospace">{R.selection.dryerType}</text>
        <text x="742" y="262" fontSize="8" fill="#94a3b8">{R.selection.trainNoSelected} {t.dgTrains}</text>
        <text x="742" y="278" fontSize="8" fill="#94a3b8">{R.selection.depositorNo} {t.dgDepositors}</text>
        <text x="742" y="294" fontSize="8" fill="#94a3b8">{R.selection.nozzleNo} {t.dgNozzles}</text>

        <defs>
          <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#0f172a" /></marker>
          <marker id="arrg" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#059669" /></marker>
        </defs>
      </svg>
    </div>
  );
}

// ============================================================================
//  APPLICATION
// ============================================================================
export default function BiocoDryerSizing() {
  const [lang, setLang] = useState("fr");
  const [I, setI] = useState(DEFAULT_INPUTS);
  const [mode, setMode] = useState("auto");
  const [inTab, setInTab] = useState("basis");
  const [outTab, setOutTab] = useState("summary");
  const [R, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false); // recalcul en direct en cours
  const fileRef = useRef(null);
  const liveTimer = useRef(null);

  const t = STRINGS[lang];
  setLocale(lang === "fr" ? "fr-FR" : "en-GB");
  const PL = passLabels(t);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const set = useCallback((k) => (v) => setI((p) => ({ ...p, [k]: v })), []);
  const setArr = useCallback((k, idx) => (v) =>
    setI((p) => ({ ...p, [k]: p[k].map((x, i) => (i === idx ? v : x)) })), []);

  // Éditer le modèle ou le nombre de trains bascule en mode « imposé » :
  // sinon ces champs ne sont pas lus (le mode auto sélectionne lui-même).
  const setUserModel = useCallback((v) => {
    setI((p) => ({ ...p, userModel: v }));
    setMode("user");
  }, []);
  const setTrainNoUser = useCallback((v) => {
    setI((p) => ({
      ...p,
      trainNoUser: v,
      // en venant du mode auto, on fige le modèle actuellement retenu
      ...(mode === "auto" && R ? { userModel: R.selection.dryerType } : {}),
    }));
    setMode("user");
  }, [mode, R]);

  const convergenceMsg = useCallback((e) =>
    e && e.message === "convergence"
      ? (lang === "fr"
        ? "Le calcul n'a pas convergé. Vérifiez les consignes (point de rosée > 60 °C, temp. air 8 > point de rosée, temps de séjour suffisant)."
        : "The calculation did not converge. Check the setpoints (dew point > 60 °C, air temp. 8 > dew point, sufficient retention time).")
      : String((e && e.message) || e), [lang]);

  const compute = useCallback((inputs, m) => {
    const res = runModel(inputs, m);
    if (!Number.isFinite(res.energy.totalHInput)) throw new Error("convergence");
    return res;
  }, []);

  const run = useCallback((m) => {
    setBusy(true); setErr(null);
    setTimeout(() => {
      try {
        setR(compute(I, m)); setMode(m); setOutTab("summary");
      } catch (e) {
        setErr(convergenceMsg(e)); setR(null);
      } finally { setBusy(false); }
    }, 10);
  }, [I, compute, convergenceMsg]);

  // Recalcul automatique en direct : dès qu'un premier résultat existe, toute
  // modification d'entrée relance le calcul (debounce). En cas d'erreur passagère
  // (valeur en cours de saisie), on conserve le dernier résultat valide.
  useEffect(() => {
    if (!R) return;                       // seulement après un premier calcul
    // setLive(true) est volontairement synchrone : l'indicateur « mise à jour… »
    // doit apparaître dès la frappe, avant le recalcul différé par le debounce.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(true);
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      try { setR(compute(I, mode)); setErr(null); }
      catch (e) { setErr(convergenceMsg(e)); }   // on garde le dernier R valide
      finally { setLive(false); }
    }, 250);
    return () => { if (liveTimer.current) clearTimeout(liveTimer.current); };
    // R volontairement hors dépendances (sinon boucle infinie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [I, mode, compute, convergenceMsg]);

  const onSave = useCallback(() => { saveProject(I, lang); flash(t.savedOk); }, [I, lang, t, flash]);

  const onLoadFile = useCallback((e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const { inputs, lang: l } = parseProject(rd.result);
        setI(inputs); setR(null); setErr(null);
        if (l) setLang(l);
        setInTab("basis");
        flash(t.loadOk);
      } catch { setErr(t.loadErr); }
    };
    rd.onerror = () => setErr(t.loadErr);
    rd.readAsText(f);
    e.target.value = "";
  }, [t, flash]);

  // Contrôle des limites de conception
  const checks = useMemo(() => {
    if (!R) return [];
    const L = R.limits;
    const mk = (label, val, limit, kind, unit, fix, d = 1) => {
      const ok = kind === "range" ? val >= limit[0] && val <= limit[1] : val <= limit;
      return {
        label, value: fmt(val, d),
        limit: kind === "range" ? `${limit[0]} – ${limit[1]}` : `≤ ${limit}`,
        unit, ok, fix,
      };
    };
    // Correctif direction-dépendant pour la vitesse d'air ZF (limite = plage)
    const fixVez = L.ezAirV > L.maxAirV_EZ ? t.fixVezHigh : t.fixVezLow;
    return [
      mk(t.lEvapLwz, L.unitEvapL_WZ, L.maxEL_WZ, "max", "kgH₂O/m²/h", t.fixEvapWz),
      mk(t.lFluxWz, L.wzEvapFlux, L.maxEF_WZ, "max", "kgH₂O/m²", t.fixFluxWz),
      mk(t.lBeltLez, L.ezBeltLoad, L.maxBL_EZ, "max", "kg/m²", t.fixBeltEz),
      mk(t.lEvapLez, L.unitEvapL_EZ, L.maxEL_EZ, "max", "kgH₂O/m²/h", t.fixEvapEz),
      mk(t.lFluxEz, L.ezEvapFlux, L.maxEF_EZ, "max", "kgH₂O/m²", t.fixFluxEz),
      mk(t.lNozzle, L.nozzleLoad, I.maxNozzleLoad, "max", "kg/h", t.fixNozzle, 0),
      mk(t.lThick, L.sludgeThickness, L.maxBedThick, "max", "mm", t.fixThick, 0),
      mk(t.lVwz, L.wzAirV, L.maxAirV_WZ, "max", "m/s", t.fixVwz, 2),
      mk(t.lVez, L.ezAirV, [1.0, L.maxAirV_EZ], "range", "m/s", fixVez, 2),
    ];
  }, [R, I.maxNozzleLoad, t]);

  const nOK = checks.filter((c) => c.ok).length;

  // Marqueurs de couleur par champ de consigne : pour chaque critère hors limite,
  // ses champs correctifs reçoivent l'index (donc la couleur) du critère.
  const fieldMarkers = useMemo(() => {
    const m = {};
    checks.forEach((c, i) => {
      if (c.ok) return;
      (FIX_FIELDS[i] || []).forEach((key) => {
        if (!m[key]) m[key] = [];
        m[key].push(i);
      });
    });
    return m;
  }, [checks]);
  const mk = (key) => fieldMarkers[key];

  const onReport = useCallback(() => {
    if (!R) { flash(t.reportNeedsRun); return; }
    const html = buildReportHTML(R, I, t, lang, mode, checks);
    openReport(html, `${slugify(I.prjName)}_rapport.html`, () => flash(t.reportBlocked));
  }, [R, I, t, lang, mode, checks, flash]);

  const TABS_IN = [["basis", t.tabBasis], ["setpoints", t.tabSetpoints], ["equip", t.tabEquip]];
  const TABS_OUT = [["summary", t.tabSummary], ["balance", t.tabBalance],
                    ["belt", t.tabBelt], ["equipment", t.tabEquipment]];

  const barBtn = "rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <header className="border-b border-slate-800 bg-slate-900 px-5 py-3">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              Biocon <span className="font-normal text-slate-400">· {t.appSub}</span>
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-400">{t.appTag}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.modeLabel}</span>
            {/* Les deux états (actif/inactif) portent une bordure de même épaisseur
                et l'étiquette « Calcul… » est superposée en grille : la largeur des
                boutons ne varie jamais, donc pas de saut de mise en page. */}
            <button onClick={() => run("auto")} disabled={busy} aria-pressed={mode === "auto"}
              className={`rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${mode === "auto"
                ? "border-sky-600 bg-sky-600 text-white ring-2 ring-sky-300 hover:bg-sky-500"
                : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <span className="grid justify-items-center">
                <span className={`col-start-1 row-start-1 ${busy && mode === "auto" ? "invisible" : ""}`}>{t.runAuto}</span>
                <span className={`col-start-1 row-start-1 ${busy && mode === "auto" ? "" : "invisible"}`}>{t.computing}</span>
              </span>
            </button>
            <button onClick={() => run("user")} disabled={busy} aria-pressed={mode === "user"}
              className={`rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${mode === "user"
                ? "border-violet-600 bg-violet-600 text-white ring-2 ring-violet-300 hover:bg-violet-500"
                : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <span className="grid justify-items-center">
                <span className={`col-start-1 row-start-1 ${busy && mode === "user" ? "invisible" : ""}`}>{t.runUser}</span>
                <span className={`col-start-1 row-start-1 ${busy && mode === "user" ? "" : "invisible"}`}>{t.computing}</span>
              </span>
            </button>

            <span className="mx-1 h-5 w-px bg-slate-700" />

            <button onClick={onSave} className={barBtn} title={t.save}>{t.save}</button>
            <button onClick={() => fileRef.current && fileRef.current.click()} className={barBtn} title={t.load}>{t.load}</button>
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={onLoadFile} className="hidden" />
            <button onClick={onReport} disabled={!R} className={barBtn} title={t.report}>{t.report}</button>

            <span className="mx-1 h-5 w-px bg-slate-700" />

            <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} title={t.langTitle}
              className="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
              {t.langBtn}
            </button>
            <button onClick={() => { setI(DEFAULT_INPUTS); setR(null); setErr(null); }}
              className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200">
              {t.reset}
            </button>
          </div>
        </div>
      </header>

      {err && (
        <div className="mx-auto mt-4 max-w-[1400px] rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong className="font-semibold">{t.errTitle}</strong> {err}
        </div>
      )}
      {toast && (
        <div className="mx-auto mt-4 max-w-[1400px] rounded border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-5 py-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ---------------- Entrées ---------------- */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex border-b border-slate-200">
              {TABS_IN.map(([k, l]) => (
                <button key={k} onClick={() => setInTab(k)}
                  className={`flex-1 px-2 py-2.5 text-[11px] font-semibold transition ${inTab === k ? "border-b-2 border-sky-600 text-sky-700" : "text-slate-500 hover:text-slate-800"}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="p-4">
              {inTab === "basis" && (
                <>
                  <Section title={t.secProject} cols={2}>
                    <Field label={t.fProjectName} type="text" value={I.prjName} onChange={set("prjName")} unit="" />
                    <Field label={t.fProjectNo} type="text" value={I.prjNo} onChange={set("prjNo")} unit="" />
                  </Section>
                  <Section title={t.secLoad} note={t.secLoadNote} cols={2}>
                    <Field label={t.fAvgDSP} value={I.avgDSP} onChange={set("avgDSP")} unit={t.uKgD} hint={t.fAvgDSPh} />
                    <Field label={t.fFeedDS} value={I.feedDS} onChange={set("feedDS")} unit="frac." step="0.01" hint={t.fFeedDSh} />
                    <Field label={t.fProductDS} value={I.productDS} onChange={set("productDS")} unit="frac." step="0.01" hint={t.fProductDSh} />
                    <Field label={t.fSludgeTemp} value={I.sludgeTemp} onChange={set("sludgeTemp")} unit="°C" />
                  </Section>
                  <Section title={t.secSchedule} cols={2}>
                    <Field label={t.fDPerW} value={I.dPerW} onChange={set("dPerW")} unit={t.uDays} />
                    <Field label={t.fHPerD} value={I.hPerD} onChange={set("hPerD")} unit="h" />
                    <Field label={t.fMinTrain} value={I.minTrainNo} onChange={set("minTrainNo")} unit="—" />
                    <Field label={t.fSiteElev} value={I.siteElev} onChange={set("siteElev")} unit="m" />
                  </Section>
                  <Section title={t.secOptions} cols={2}>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{t.fPreheater}</span>
                      <button onClick={() => set("preHeaterYN")(!I.preHeaterYN)}
                        className={`rounded border px-2 py-1.5 text-sm font-medium ${I.preHeaterYN ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
                        {I.preHeaterYN ? t.onSvc : t.offSvc}
                      </button>
                      <span className="text-[10px] text-slate-400">{t.fPreheaterH}</span>
                    </label>
                    <Field label={t.fCakeRT} value={I.cakeRT} onChange={set("cakeRT")} unit="h" />
                  </Section>
                  <Section title={t.secForced} note={t.secForcedNote} cols={2}>
                    <Field label={t.fModel} value={I.userModel} onChange={setUserModel} unit="" options={DRYER_TYPES} />
                    <Field label={t.fTrains} value={I.trainNoUser} onChange={setTrainNoUser} unit="—" />
                  </Section>
                </>
              )}

              {inTab === "setpoints" && (
                <>
                  <Section title={t.secDryAir} note={t.secDryAirNote} cols={2}>
                    <Field label={t.fDpt} value={I.dpTemp5} onChange={set("dpTemp5")} unit="°C" hint={t.fDptH} />
                    <Field label={t.fAirT0} value={I.airTemp0} onChange={set("airTemp0")} unit="°C" hint={t.fAirT0h} markers={mk("airTemp0")} />
                    <Field label={t.fDT5} value={I.deltaTemp5} onChange={set("deltaTemp5")} unit="°C" hint={t.fDT5h} markers={mk("deltaTemp5")} />
                    <Field label={t.fAirT12} value={I.airTemp12} onChange={set("airTemp12")} unit="°C" hint={t.fAirT12h} markers={mk("airTemp12")} />
                    <Field label={t.fDT17} value={I.deltaTemp17} onChange={set("deltaTemp17")} unit="°C" hint={t.fDT17h} markers={mk("deltaTemp17")} />
                    <Field label={t.fAirT8} value={I.airTemp8} onChange={set("airTemp8")} unit="°C" hint={t.fAirT8h} />
                    <Field label={t.fAirT9} value={I.airTemp9} onChange={set("airTemp9")} unit="°C" />
                  </Section>
                  <Section title={t.secSludgeBelt} cols={2}>
                    <Field label={t.fMC4} value={I.sludgeMC4} onChange={set("sludgeMC4")} unit="frac. H₂O" step="0.01" hint={t.fMC4h} markers={mk("sludgeMC4")} />
                    <Field label={t.fBL} value={I.wzUnitBL} onChange={set("wzUnitBL")} unit="kg/m²" hint={t.fBLh} markers={mk("wzUnitBL")} />
                    <Field label={t.fRT} value={I.dryerRT} onChange={set("dryerRT")} unit="min" hint={t.fRTh} markers={mk("dryerRT")} />
                  </Section>
                  <Section title={t.secLosses} cols={2}>
                    <Field label={t.fWzHL} value={I.wzUnitHL} onChange={set("wzUnitHL")} unit="kW/(t/h)" />
                    <Field label={t.fEzHL} value={I.ezUnitHL} onChange={set("ezUnitHL")} unit="kW/(t/h)" />
                    <Field label={t.fPhHL} value={I.phHLpc} onChange={set("phHLpc")} unit="frac." step="0.01" />
                    <Field label={t.fToHL} value={I.toHLpc} onChange={set("toHLpc")} unit="frac." step="0.01" />
                  </Section>
                  <Section title={t.secFluids} cols={2}>
                    <Field label={t.fTw0} value={I.waterTemp0} onChange={set("waterTemp0")} unit="°C" />
                    <Field label={t.fTw1} value={I.condensateTemp} onChange={set("condensateTemp")} unit="°C" />
                    <Field label={t.fO0} value={I.oilTemp0} onChange={set("oilTemp0")} unit="°C" />
                    <Field label={t.fO1} value={I.oilTemp1} onChange={set("oilTemp1")} unit="°C" />
                    <Field label={t.fO2} value={I.oilTemp2} onChange={set("oilTemp2")} unit="°C" />
                    <Field label={t.fO3} value={I.oilTemp3} onChange={set("oilTemp3")} unit="°C" />
                  </Section>
                </>
              )}

              {inTab === "equip" && (
                <>
                  <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
                    {t.equipNote}
                  </p>
                  {[
                    ["noodleDia", t.gNoodleDia, "mm"],
                    ["noodleDen", t.gNoodleDen, "kg/m³"],
                    ["beltOAR", t.gBeltOAR, "frac."],
                    ["sludgeSAR", t.gSludgeSAR, "frac."],
                    ["sludgeOAR", t.gSludgeOAR, "frac."],
                    ["sludgePR", t.gSludgePR, "frac."],
                  ].map(([key, label, unit]) => (
                    <div key={key} className="mb-4">
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{label}</span>
                        <span className="text-[10px] text-slate-400">{unit}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {I[key].map((v, idx) => (
                          <div key={idx} className="flex flex-col">
                            <span className="mb-0.5 text-[9px] text-slate-400">{PL[idx]}</span>
                            <input type="number" step="any" value={v}
                              onChange={(e) => setArr(key, idx)(parseFloat(e.target.value))}
                              className="w-full rounded border border-slate-300 px-1.5 py-1 text-[11px] tabular-nums focus:border-sky-600 focus:outline-none" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <Section title={t.secFans} cols={2}>
                    <Field label={t.fSfFlow} value={I.fanSafetyFactors[0]} onChange={setArr("fanSafetyFactors", 0)} unit="—" step="0.05" />
                    <Field label={t.fSfPress} value={I.fanSafetyFactors[1]} onChange={setArr("fanSafetyFactors", 1)} unit="—" step="0.05" />
                    <Field label={t.fEff} value={I.fanSafetyFactors[2]} onChange={setArr("fanSafetyFactors", 2)} unit="frac." step="0.05" />
                    <Field label={t.fPf} value={I.fanSafetyFactors[3]} onChange={setArr("fanSafetyFactors", 3)} unit="—" step="0.05" />
                    <Field label={t.fDpNoHex} value={I.fanPressureLoss[0]} onChange={setArr("fanPressureLoss", 0)} unit="Pa" />
                    <Field label={t.fDpHex} value={I.fanPressureLoss[1]} onChange={setArr("fanPressureLoss", 1)} unit="Pa" />
                    <Field label={t.fDpWz} value={I.fanPressureLoss[2]} onChange={setArr("fanPressureLoss", 2)} unit="Pa" />
                    <Field label={t.fDpEz} value={I.fanPressureLoss[3]} onChange={setArr("fanPressureLoss", 3)} unit="Pa" />
                  </Section>

                  <Section title={t.secLimits} note={t.secLimitsNote} cols={2}>
                    <Field label={t.fMaxVwz} value={I.maxAirV_WZ} onChange={set("maxAirV_WZ")} unit="m/s" />
                    <Field label={t.fMaxVez} value={I.maxAirV_EZ} onChange={set("maxAirV_EZ")} unit="m/s" />
                    <Field label={t.fMaxELwz} value={I.maxEL_WZ} onChange={set("maxEL_WZ")} unit="kgH₂O/m²/h" />
                    <Field label={t.fMaxELez} value={I.maxEL_EZ} onChange={set("maxEL_EZ")} unit="kgH₂O/m²/h" />
                    <Field label={t.fMaxEFwz} value={I.maxEF_WZ} onChange={set("maxEF_WZ")} unit="kgH₂O/m²" />
                    <Field label={t.fMaxEFez} value={I.maxEF_EZ} onChange={set("maxEF_EZ")} unit="kgH₂O/m²" />
                    <Field label={t.fMaxBLez} value={I.maxBL_EZ} onChange={set("maxBL_EZ")} unit="kg/m²" />
                    <Field label={t.fMaxThick} value={I.maxBedThick} onChange={set("maxBedThick")} unit="mm" />
                    <Field label={t.fMaxNozzle} value={I.maxNozzleLoad} onChange={set("maxNozzleLoad")} unit="kg/h" />
                  </Section>
                </>
              )}
            </div>
          </div>

          {/* ---------------- Résultats ---------------- */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {!R ? (
              <div className="flex h-full min-h-[520px] flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 h-12 w-12 rounded-full border-2 border-dashed border-slate-300" />
                <p className="text-sm font-medium text-slate-700">{t.noRunTitle}</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{t.noRunBody}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3">
                  <div className="flex">
                    {TABS_OUT.map(([k, l]) => (
                      <button key={k} onClick={() => setOutTab(k)}
                        className={`px-3 py-2.5 text-[11px] font-semibold transition ${outTab === k ? "border-b-2 border-sky-600 text-sky-700" : "text-slate-500 hover:text-slate-800"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium transition-opacity ${live ? "text-sky-600 opacity-100" : "text-slate-400 opacity-70"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-sky-500" : "bg-emerald-500"}`} />
                      {live ? t.liveUpdating : t.liveOn}
                    </span>
                    {/* Les deux libellés sont superposés (le plus long fixe la
                        largeur) : le badge ne décale pas ses voisins au changement
                        de mode. */}
                    <span className={`grid justify-items-center rounded px-2 py-0.5 text-[10px] font-semibold ${mode === "auto" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>
                      <span className={`col-start-1 row-start-1 ${mode === "auto" ? "" : "invisible"}`}>{t.modeAuto}</span>
                      <span className={`col-start-1 row-start-1 ${mode === "user" ? "" : "invisible"}`}>{t.modeUser}</span>
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  {outTab === "summary" && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        <Stat label={t.sModel} value={R.selection.dryerType} />
                        <Stat label={t.sTrains} value={R.selection.trainNoSelected} />
                        <Stat label={t.sWetPerTrain} value={fmt(R.selection.fWSperTrain, 0)} unit="kg/h" />
                        <Stat label={t.sCapacity} value={fmt(R.selection.maxCap, 0)} unit="kg/h" />
                        <Stat label={t.sEvapTotal} value={fmt(R.energy.evapTotal, 0)} unit="kg/h" />
                        <Stat label={t.sHeatInput} value={fmt(R.energy.totalHInput, 0)} unit="kW" />
                        <Stat label={t.sSpecific} value={fmt(R.limits.unitBTU, 0)} unit="BTU/lb H₂O" />
                        <Stat label={t.sRatio} value={fmt(R.energy.evapWZ / R.energy.evapEZ, 2)}
                          tone={Math.abs(R.energy.evapWZ / R.energy.evapEZ - 2) < 0.6 ? "ok" : "warn"} />
                      </div>

                      <ProcessDiagram R={R} t={t} />

                      <div>
                        <div className="mb-2 flex items-baseline justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">{t.limitsTitle}</h3>
                          <span className={`text-xs font-semibold ${nOK === checks.length ? "text-emerald-700" : "text-amber-700"}`}>
                            {nOK}/{checks.length} {t.conform}
                          </span>
                        </div>
                        <DataTable
                          head={[t.thCriterion, t.thValue, t.thLimit, t.thUnit, t.thState]}
                          rows={checks.map((c, i) => [
                            c.label, c.value, c.limit, c.unit,
                            <span key="s" className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                {c.ok ? t.ok : t.bad}
                              </span>
                              {!c.ok && (
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${FIX_COLORS[i % FIX_COLORS.length]}`}>
                                  {c.fix}
                                </span>
                              )}
                            </span>,
                          ])}
                          firstColWidth="200px"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-xs font-semibold text-slate-800">{t.basisTitle}</h4>
                          <DataTable head={[t.thQuantity, t.thTotal, t.thPerTrain]} rows={[
                            [t.rDS, fmt(R.selection.dsgnDSF, 0), fmt(R.selection.fDSperTrain, 0)],
                            [t.rWS, fmt(R.selection.dsgnWSF, 0), fmt(R.selection.fWSperTrain, 0)],
                            [t.rProd, fmt(R.selection.finalWSF, 0), fmt(R.selection.fWSprodPerTrain, 0)],
                            [t.rEvap, fmt(R.selection.dsgnEvapL, 0), fmt(R.selection.evapLperTrain, 0)],
                          ]} firstColWidth="160px" />
                        </div>
                        <div>
                          <h4 className="mb-2 text-xs font-semibold text-slate-800">{t.energyTitle}</h4>
                          <DataTable head={[t.thItem, t.thValue, t.thUnit]} rows={[
                            [t.eHexWz, fmt(R.energy.wzHInput, 0), "kW"],
                            [t.eHexEz, fmt(R.energy.ezHInput, 0), "kW"],
                            [t.eLossWz, fmt(R.energy.wzHeatLoss, 0), "kW"],
                            [t.eLossEz, fmt(R.energy.ezHeatLoss, 0), "kW"],
                            [t.eProcess, fmt(R.energy.totalHInput, 0), "kW"],
                            [t.eBurner, fmt(R.energy.heaterDuty, 0), "kW"],
                          ]} firstColWidth="160px" />
                        </div>
                      </div>
                    </div>
                  )}

                  {outTab === "balance" && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.sludgeStreams}</h3>
                        <DataTable
                          head={[t.thQuantity, ...R.streams.sludge.map((s) => `[${s.id}]`), t.thUnit]}
                          rows={[
                            [t.rWetFlow, ...R.streams.sludge.map((s) => fmt(s.fWS, 2)), "kg/s"],
                            [t.rDryFlow, ...R.streams.sludge.map((s) => fmt(s.fDS, 3)), "kg/s"],
                            [t.rDryness, ...R.streams.sludge.map((s) => pct(s.xS, 0)), "%"],
                            [t.rMoisture, ...R.streams.sludge.map((s) => pct(s.mc, 0)), "%"],
                            [t.rTemp, ...R.streams.sludge.map((s) => fmt(s.tS, 1)), "°C"],
                            [t.rEnth, ...R.streams.sludge.map((s) => fmt(s.sensH, 1)), "kJ/kg"],
                            [t.rEnergy, ...R.streams.sludge.map((s) => fmt(s.fSH, 1)), "kW"],
                          ]}
                          firstColWidth="150px"
                        />
                      </div>
                      {[[t.airWZ, [0, 1, 2, 3, 18, 4, 5, 6, 7, 8]], [t.airEZ, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]]].map(([title, ids]) => (
                        <div key={title}>
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
                          <DataTable
                            head={[t.thQuantity, ...ids.map((i) => `[${i}]`), t.thUnit]}
                            rows={[
                              [t.rVolFlow, ...ids.map((i) => fmt(R.streams.air[i].fVolA, 2)), "m³/s"],
                              [t.rDryAir, ...ids.map((i) => fmt(R.streams.air[i].fDA, 2)), "kg/s"],
                              [t.rVapour, ...ids.map((i) => fmt(R.streams.air[i].fWV, 2)), "kg/s"],
                              [t.rAbsHum, ...ids.map((i) => fmt(R.streams.air[i].yA, 3)), "kg/kg"],
                              [t.rDewPt, ...ids.map((i) => fmt(R.streams.air[i].dptA, 1)), "°C"],
                              [t.rTemp, ...ids.map((i) => fmt(R.streams.air[i].tA, 1)), "°C"],
                              [t.rEnth, ...ids.map((i) => fmt(R.streams.air[i].airHv, 0)), "kJ/kg"],
                              [t.rEnergy, ...ids.map((i) => fmt(R.streams.air[i].fAH, 0)), "kW"],
                            ]}
                            firstColWidth="150px"
                          />
                        </div>
                      ))}
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.oilStreams}</h3>
                          <DataTable
                            head={[t.thQuantity, ...R.oil.tO.map((_, i) => `[${i}]`), t.thUnit]}
                            rows={[
                              [t.rMassFlow, ...R.oil.fO.map((v) => fmt(v, 1)), "kg/s"],
                              [t.rVolFlow, ...R.oil.fOv.map((v) => fmt(v, 1)), "m³/h"],
                              [t.rTemp, ...R.oil.tO.map((v) => fmt(v, 0)), "°C"],
                            ]}
                            firstColWidth="120px"
                          />
                        </div>
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.condTitle}</h3>
                          <DataTable head={[t.thQuantity, t.thIn, t.thOut, t.thUnit]} rows={[
                            [t.rTemp, fmt(R.condenser.tW0, 1), fmt(R.condenser.tW1, 1), "°C"],
                            [t.rMassFlow, fmt(R.condenser.fW0, 2), fmt(R.condenser.fW1, 2), "kg/s"],
                            [t.rVolFlow, fmt(R.condenser.fW0 * 3.6, 1), fmt(R.condenser.fW1 * 3.6, 1), "m³/h"],
                          ]} firstColWidth="120px" />
                        </div>
                      </div>
                    </div>
                  )}

                  {outTab === "belt" && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.beltTitle}</h3>
                        <DataTable
                          head={[t.thQuantity, t.cWzBelt, t.cEzTop, t.cEzBot, t.thUnit]}
                          rows={[
                            [t.rBeltW, fmt(R.belt.beltW, 2), fmt(R.belt.beltW, 2), fmt(R.belt.beltW, 2), "m"],
                            [t.rBeltL, fmt(R.belt.wzBeltL / 1000, 1), fmt(R.belt.ezTopBeltL / 1000, 1), fmt(R.belt.ezBBeltL / 1000, 1), "m"],
                            [t.rBeltA, fmt(R.belt.effectArea[0], 1), fmt(R.belt.effectArea[1], 1), fmt(R.belt.effectArea[2], 1), "m²"],
                            [t.rBeltV, fmt(R.belt.beltSpeedTop, 1), fmt(R.belt.beltSpeedTop, 1), fmt(R.belt.beltSpeedBottom, 1), "m/h"],
                            [t.rRT, fmt(R.belt.wzRT, 1), fmt(R.belt.ezRT_Top, 1), fmt(R.belt.ezRT_Bottom, 1), "min"],
                            [t.rThick, fmt(R.belt.layerThickness[0], 0), fmt(R.belt.layerThickness[1], 0), fmt(R.belt.layerThickness[2], 0), "mm"],
                            [t.rPoros, fmt(R.belt.porosityFactor[0], 2), fmt(R.belt.porosityFactor[1], 2), fmt(R.belt.porosityFactor[2], 2), "—"],
                          ]}
                          firstColWidth="150px"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-500">
                          {t.beltNote(fmt(R.belt.wzRT + R.belt.ezRT_Top + R.belt.ezRT_Bottom, 0), I.dryerRT)}
                        </p>
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.htTitle}</h3>
                        <DataTable
                          head={[t.thQuantity, ...PL, t.thUnit]}
                          rows={[
                            [t.rPassA, ...R._raw.passArea.map((v) => fmt(v, 1)), "m²"],
                            [t.rAirDen, ...R._raw.airDen.map((v) => fmt(v, 2)), "kg/m³"],
                            [t.rKinVis, ...R._raw.kineVisc.map((v) => fmt(v, 1)), "mm²/s"],
                            [t.rPr, ...R._raw.prandtl.map((v) => fmt(v, 2)), "—"],
                            [t.rVsup, ...R._raw.velToBelt.map((v) => fmt(v, 2)), "m/s"],
                            [t.rVbelt, ...R._raw.velThruBelt.map((v) => fmt(v, 2)), "m/s"],
                            [t.rVsludge, ...R._raw.velThruSludge.map((v) => fmt(v, 2)), "m/s"],
                            [t.rRe, ...R._raw.reynoldNo.map((v) => fmt(v, 0)), "—"],
                            [t.rReC, ...R._raw.correctedRN.map((v) => fmt(v, 0)), "—"],
                            [t.rNu, ...R._raw.nusseltNo.map((v) => fmt(v, 0)), "—"],
                            [t.rK, ...R._raw.heatTransferK.map((v) => fmt(v, 0)), "W/(m²·K)"],
                            [t.rKA, ...R._raw.kxA.map((v) => fmt(v, 0)), "W/K"],
                            [t.rSf, ...R._raw.safetyFactor.map((v) => fmt(v, 2)), "—"],
                          ]}
                          firstColWidth="170px"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-500">{t.htNote}</p>
                      </div>
                    </div>
                  )}

                  {outTab === "equipment" && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.fansTitle}</h3>
                        <DataTable
                          head={[t.thQuantity, t.fanDry, t.fanWz, t.fanEz, t.fanVac, t.thUnit]}
                          rows={[
                            [t.rNfans, ...R.fans.map((f) => f.nFans), "—"],
                            [t.rOpFlow, ...R.fans.map((f) => fmt(f.operatingFlow, 2)), "m³/s"],
                            [t.rSfFlow, ...R.fans.map((f) => fmt(f.safetyFactorAir, 2)), "—"],
                            [t.rDsgnFlow, ...R.fans.map((f) => fmt(f.designFlow, 2)), "m³/s"],
                            [t.rOpP, ...R.fans.map((f) => fmt(f.operatingPressure, 0)), "Pa"],
                            [t.rDsgnP, ...R.fans.map((f) => fmt(f.designPressure, 0)), "Pa"],
                            [t.rEffi, ...R.fans.map((f) => pct(f.efficiency, 0)), "%"],
                            [t.rFanKW, ...R.fans.map((f) => fmt(f.fanCapacity_kW, 1)), "kW"],
                            [t.rMotKW, ...R.fans.map((f) => fmt(f.motorCapacity_kW, 1)), "kW"],
                            [t.rMotHP, ...R.fans.map((f) => f.selectedHP), "HP"],
                            [t.rCons, ...R.fans.map((f) => fmt(f.powerConsumption_kW, 1)), "kW"],
                          ]}
                          firstColWidth="170px"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.heaterTitle}</h3>
                          <DataTable head={[t.thItem, t.thValue, t.thUnit]} rows={[
                            [t.rNeed, fmt(R.heater.totalHInput_MMBTU, 2), "MMBTU/h"],
                            [t.rHModel, R.heater.model, "—"],
                            [t.rHCap, fmt(R.heater.capacity, 1), "MMBTU/h"],
                            [t.rPumpWz, R.heater.wzPumpHP, "HP"],
                            [t.rPumpEz, R.heater.ezPumpHP, "HP"],
                            [t.rBurner, R.heater.burnerHP, "HP"],
                            [t.rFlowWz, fmt(R.oil.wzOilPump, 0), "m³/h"],
                            [t.rFlowEz, fmt(R.oil.ezOilPump, 0), "m³/h"],
                          ]} firstColWidth="160px" />
                        </div>
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t.binTitle}</h3>
                          <DataTable head={[t.thItem, t.thValue, t.thUnit]} rows={[
                            [t.rBinVol, fmt(R.heater.binVol_yd3, 0), "yd³"],
                            [t.rBinVol, fmt(R.heater.binVol_yd3 * 0.7646, 0), "m³"],
                            [t.rCondWater, fmt(R.condenser.fW0 * 3.6, 1), "m³/h"],
                            [t.rFanPower, fmt(R.fans.reduce((a, f) => a + f.powerConsumption_kW * f.nFans, 0), 1), "kW"],
                            [t.rSpec, fmt(R.limits.unitBTU, 0), "BTU/lb H₂O"],
                          ]} firstColWidth="160px" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="mt-6 border-t border-slate-200 pt-3 text-[10px] leading-relaxed text-slate-500">
          {t.footer}
        </footer>
      </main>
    </div>
  );
}