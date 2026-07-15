// ============================================================================
//  TEST ÉTALON — cas de référence « Seaview » (DEFAULT_INPUTS)
//  Fige l'intégralité des résultats de runModel dans un snapshot. Toute
//  divergence numérique lors d'un refactor du moteur fait échouer ce test.
//  Pour re-valider volontairement une évolution du moteur : npx vitest run -u
// ============================================================================
import { describe, it, expect } from "vitest";
import { runModel, DEFAULT_INPUTS } from "../src/Biocon_fonction.jsx";

// Arrondit tous les nombres à 12 chiffres significatifs : suffisant pour
// détecter la moindre dérive de calcul, insensible au bruit du dernier bit.
function roundDeep(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Number(v.toPrecision(12)) : String(v);
  if (Array.isArray(v)) return [...v].map(roundDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  return v;
}

// On écarte _raw (état interne complet, redondant avec streams/energy/limits).
function summary(R) {
  const { _raw, ...rest } = R;
  return roundDeep(rest);
}

describe("étalon Seaview — runModel", () => {
  it("mode auto (pré-sélection du modèle) reproduit la référence", () => {
    const R = runModel(DEFAULT_INPUTS, "auto");
    expect(R.selection.dryerType).toBe("SD8315-IO");
    expect(Number.isFinite(R.energy.totalHInput)).toBe(true);
    expect(summary(R)).toMatchSnapshot();
  });

  it("mode user (modèle imposé SD8315-IO × 3 trains) reproduit la référence", () => {
    const R = runModel(DEFAULT_INPUTS, "user");
    expect(R.selection.trainNoSelected).toBe(DEFAULT_INPUTS.trainNoUser);
    expect(Number.isFinite(R.energy.totalHInput)).toBe(true);
    expect(summary(R)).toMatchSnapshot();
  });

  it("le moteur est déterministe (deux appels identiques → mêmes résultats)", () => {
    const a = summary(runModel(DEFAULT_INPUTS, "auto"));
    const b = summary(runModel(DEFAULT_INPUTS, "auto"));
    expect(a).toEqual(b);
  });

  it("ne modifie pas l'objet d'entrées", () => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_INPUTS));
    runModel(DEFAULT_INPUTS, "auto");
    expect(DEFAULT_INPUTS).toEqual(copy);
  });
});
