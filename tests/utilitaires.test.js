// ============================================================================
//  TESTS UNITAIRES — utilitaires de formatage et chargement de projet
// ============================================================================
import { describe, it, expect, afterEach } from "vitest";
import { fmt, pct, setLocale, parseProject, runModel, DEFAULT_INPUTS } from "../src/Biocon_fonction.jsx";

afterEach(() => setLocale("fr-FR"));

describe("fmt — formatage des nombres", () => {
  it("formate selon la locale courante", () => {
    setLocale("en-GB");
    expect(fmt(1234.5, 1)).toBe("1,234.5");
    setLocale("fr-FR");
    expect(fmt(1234.5, 1)).toBe("1 234,5");
  });
  it("affiche — pour les valeurs non exploitables", () => {
    expect(fmt(undefined)).toBe("—");
    expect(fmt(null)).toBe("—");
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity)).toBe("—");
  });
  it("bascule en notation exponentielle hors plage lisible", () => {
    expect(fmt(1e-4)).toBe("1.00e-4");
    expect(fmt(2.5e7)).toBe("2.50e+7");
    expect(fmt(0, 0)).toBe("0");
  });
});

describe("pct — formatage des fractions", () => {
  it("convertit une fraction en pourcentage", () => {
    expect(pct(0.925)).toBe("92.5 %");
    expect(pct(0.5, 0)).toBe("50 %");
  });
  it("affiche — pour les valeurs non exploitables", () => {
    expect(pct(undefined)).toBe("—");
    expect(pct(NaN)).toBe("—");
  });
});

describe("parseProject — chargement d'un projet sauvegardé", () => {
  const payload = (inputs, lang) => JSON.stringify({ format: "bioco-project", lang, inputs });

  it("recharge un projet complet à l'identique", () => {
    const { inputs, lang } = parseProject(payload(DEFAULT_INPUTS, "en"));
    expect(inputs).toEqual(DEFAULT_INPUTS);
    expect(lang).toBe("en");
  });
  it("complète les champs manquants avec les défauts", () => {
    const partial = { avgDSP: 50000, feedDS: 0.2, productDS: 0.9, dPerW: 5, hPerD: 16 };
    const { inputs } = parseProject(payload(partial));
    expect(inputs.avgDSP).toBe(50000);
    expect(inputs.dryerRT).toBe(DEFAULT_INPUTS.dryerRT);
  });
  it("ignore les valeurs de type incohérent", () => {
    const bad = { ...DEFAULT_INPUTS, avgDSP: "beaucoup", noodleDia: [1, 2] };
    const { inputs } = parseProject(payload(bad));
    expect(inputs.avgDSP).toBe(DEFAULT_INPUTS.avgDSP);
    expect(inputs.noodleDia).toEqual(DEFAULT_INPUTS.noodleDia);
  });
  it("rejette un fichier qui n'est pas un projet", () => {
    expect(() => parseProject("null")).toThrow();
    expect(() => parseProject('{"a":1}')).toThrow();
    expect(() => parseProject("pas du JSON")).toThrow();
  });
});

describe("runModel — validation des entrées", () => {
  const withField = (k, v) => ({ ...DEFAULT_INPUTS, [k]: v });

  it("rejette un champ numérique manquant ou NaN avec un message nommant le champ", () => {
    expect(() => runModel(withField("avgDSP", NaN))).toThrow(/avgDSP/);
    expect(() => runModel(withField("dryerRT", "90"))).toThrow(/dryerRT/);
  });
  it("rejette les fractions hors bornes", () => {
    expect(() => runModel(withField("feedDS", 0))).toThrow(/feedDS/);
    expect(() => runModel(withField("feedDS", 1.2))).toThrow(/feedDS/);
    expect(() => runModel(withField("sludgeMC4", 1.5))).toThrow(/sludgeMC4/);
  });
  it("rejette une siccité produit inférieure à la siccité d'entrée", () => {
    expect(() => runModel(withField("productDS", 0.10))).toThrow(/productDS/);
  });
  it("rejette un tableau par passe de mauvaise longueur", () => {
    expect(() => runModel(withField("noodleDia", [7, 7]))).toThrow(/noodleDia/);
  });
  it("rejette un planning impossible", () => {
    expect(() => runModel(withField("hPerD", 0))).toThrow(/hPerD/);
    expect(() => runModel(withField("dPerW", 9))).toThrow(/dPerW/);
  });
  it("rejette un modèle imposé inconnu (mode user uniquement)", () => {
    expect(() => runModel(withField("userModel", "SD9999-IO"), "user")).toThrow(/userModel/);
    // en mode auto, le modèle imposé n'est pas lu : pas d'erreur
    expect(() => runModel(withField("userModel", "SD9999-IO"), "auto")).not.toThrow();
  });
});
