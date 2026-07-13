// ============================================================================
//  BIOCO — Moteur de calcul, utilitaires de formatage, sauvegarde et rapport.
//  Extrait de Biocon.jsx : aucune dépendance React, importé par le composant.
// ============================================================================

// ============================================================================
//  BIOCO DRYER ENGINE  —  Portage fidèle du script Google Apps Script
//  Modèle de dimensionnement thermique d'un sécheur à bande pour biosolides
//  (type Biocon Turbo). Zone chaude (Warm Zone, 4 passes) + Zone finale
//  (End Zone, 4 passes) + pré-chauffeur d'air + condenseur + chauffe-huile.
//
//  Le moteur est PUR : il prend un objet `inputs` et renvoie un objet `results`.
//  Aucune dépendance à un tableur. Toute la logique itérative (goal-seek) du
//  script original est reproduite à l'identique.
// ============================================================================

// ---------------------------------------------------------------------------
//  Données modèles sécheur (dryerModelInfo)
// ---------------------------------------------------------------------------
const DRYER_TYPES = [
  'SD2311-IO', 'SD3315-IO', 'SD4315-IO', 'SD6312-IO',
  'SD6315-IO', 'SD8312-IO', 'SD8315-IO', 'SD8318-IO',
];
// capacité max en kg/h de boue humide
const MAX_CAP = [901, 1351, 1800, 2650, 2700, 3550, 3600, 3650];
// longueurs de passe (mm) : [modèle][passe 0..7]  (4 WZ + 4 EZ)
const PASS_LENGTH = [
  [1195, 1456, 1457, 1402, 2419, 1786, 2194, 2099],
  [1791, 1813, 1940, 1710, 3704, 2762, 3126, 2861],
  [1791, 1813, 1940, 1710, 3704, 2762, 3126, 2861],
  [1516, 1402, 1402, 1402, 3043, 2523, 2935, 2164],
  [1791, 1813, 1940, 1710, 3704, 2762, 3126, 2861],
  [1516, 1402, 1402, 1402, 3043, 2523, 2935, 2164],
  [1791, 1813, 1940, 1710, 3704, 2762, 3126, 2861],
  [2211, 2330, 2330, 2330, 3823, 3824, 3635, 3554],
];
const FAN_NO = [1, 1, 1, 2, 2, 2, 2, 2];
const MOTOR_LIST_HP = [3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75];

// chauffe-huile (toHeaterInput)
const HEATER_MODEL = ['080C','120C','160C','240C','320C','400C','600C','800C','1000C','1200C','1600C','2000C'];
const HEATER_CAPACITY = [0.8,1.2,1.6,2.4,3.2,4.0,6.0,8.0,10,12,16,20];
const WZ_PUMP_HP = [10,10,15,15,20,20,30,40,50,60,100,125];
const EZ_PUMP_HP = [2,2,5,5,7.5,7.5,10,15,20,30,40,50];
const BURNER_HP  = [1.5,3,3,3,5,5,10,15,20,20,30,30];

// ---------------------------------------------------------------------------
//  Fonctions psychrométriques (section "functions" du script)
// ---------------------------------------------------------------------------

// Température de point de rosée à partir du ratio massique vapeur/air sec (kg/kg)
function dptCalc(wvRatio) {
  const ak6 = Math.log(146.96 * 1.013 * wvRatio / 1 / (0.622 + wvRatio));
  const c1 = [35.15789, 24.592588, 2.1182069, -0.3414474, 0.15741642,
    -0.031329585, 0.0038658282, -0.00024901784, 0.000006840155];
  let dpt = 0;
  for (let k = 0; k < 9; k++) dpt += c1[k] * ak6 ** k;
  return (dpt - 32) * 5 / 9;
}

function airDensity(temp, xh2o) {
  return (1.293 * (1 + xh2o) / (1 + xh2o * 1.6084)) * 273 / (273 + temp);
}

function airDynVis(temp, xh2o) {
  const c2 = [17.14237, 0.0463604, -2.74584e-5, 1.81124e-8, -6.74497e-12,
    1.02775e-15, -9.108949, 0.02654355, -6.43242e-5, 1.30794e-7, -8.19028e-11];
  const a = c2[0] + c2[1]*temp + c2[2]*temp**2 + c2[3]*temp**3 + c2[4]*temp**4 + c2[5]*temp**5;
  return a + xh2o / (1 + xh2o) * (c2[6] + c2[7]*temp + c2[8]*temp**2 + c2[9]*temp**3 + c2[10]*temp**4);
}

function airKnVis(temp, xh2o) {
  const c2 = [17.14237, 0.0463604, -2.74584e-5, 1.81124e-8, -6.74497e-12,
    1.02775e-15, -9.108949, 0.02654355, -6.43242e-5, 1.30794e-7, -8.19028e-11];
  const a = c2[0] + c2[1]*temp + c2[2]*temp**2 + c2[3]*temp**3 + c2[4]*temp**4 + c2[5]*temp**5;
  const b = a + xh2o / (1 + xh2o) * (c2[6] + c2[7]*temp + c2[8]*temp**2 + c2[9]*temp**3 + c2[10]*temp**4);
  const c = (1.293 * (1 + xh2o) / (1 + xh2o * 1.6084)) * 273 / (273 + temp);
  return b / c;
}

function airLambda(temp, xh2o) {
  const c3 = [0.02498583, 6.53537e-5, -7.69084e-9, -1.92e-12, 1.61e-15,
    -2.86e-19, -0.01076906, 0.000104357, -1.26993e-7, 3.32e-10, -2.25e-13];
  const a = c3[0] + c3[1]*temp + c3[2]*temp**2 + c3[3]*temp**3 + c3[4]*temp**4 + c3[5]*temp**5;
  return a + xh2o / (1 + xh2o) * (c3[6] + c3[7]*temp + c3[8]*temp**2 + c3[9]*temp**3 + c3[10]*temp**4);
}

function airCP(temp, xh2o) {
  const c4 = [1.004173, 1.91921e-5, 5.88348e-7, -7.01e-10, 3.31e-13,
    -5.67e-17, 0.8648769, 0.000182506, -5.5794e-7, 3.23128e-9, -2.75e-12];
  const a = c4[0] + c4[1]*temp + c4[2]*temp**2 + c4[3]*temp**3 + c4[4]*temp**4 + c4[5]*temp**5;
  return a + xh2o / (1 + xh2o) * (c4[6] + c4[7]*temp + c4[8]*temp**2 + c4[9]*temp**3 + c4[10]*temp**4);
}

function volAirflow(temp, xh2o, dryAirflow, wvFlow) {
  return (0.2869 - 0.0746 * 0.03 + 0.1746 * xh2o / (1 + xh2o)) * (temp + 273) / 101.3 * (dryAirflow + wvFlow);
}

// Recherche du ratio vapeur donnant un point de rosée cible (goalSeek_wvRatio)
function goalSeek_wvRatio(targetValue, tolerance, initialValue) {
  let result = dptCalc(initialValue);
  let currentValue = initialValue;
  let stepSize = 0.001 * initialValue;
  let previousValue = initialValue;
  let guard = 0;
  while (Math.abs(result - targetValue) > tolerance && guard < 100000) {
    guard++;
    if (result > targetValue) currentValue -= stepSize;
    else currentValue += stepSize;
    result = dptCalc(currentValue);
    if ((currentValue - previousValue) * (currentValue - initialValue) < 0) stepSize *= 0.5;
    previousValue = currentValue;
  }
  return currentValue;
}

// ---------------------------------------------------------------------------
//  État de simulation  —  reproduit les variables globales du script
//  Toutes les grandeurs de flux sont indexées par numéro de flux (stream).
// ---------------------------------------------------------------------------
function newState() {
  return {
    // boue (sludge)
    fDS: [], fWS: [], xS: [], tS: [], sensH: [], fSH: [],
    // air
    fDA: [], fWV: [], fVolA: [], yA: [], tA: [], dptA: [], airHv: [], fAH: [],
    // eau (condenseur) / huile (chauffe-huile)
    tW: [], fW: [], fWH: [], waterSHC: [],
    tO: [], fO: [], fOv: [], oilHv: [], fOH: [],
    // transfert de chaleur (par passe)
    airDen: [], dynaVisc: [], kineVisc: [], spHeatCap: [], thermalC: [],
    prandtl: [], passArea: [], velToBelt: [], velThruBelt: [], velThruSludge: [],
    sludgeSA: [], sludgeLength: [], effectiveSA: [], reynoldNo: [], correctedRN: [],
    nusseltNo: [], heatTransferK: [], kxA: [], safetyFactor: [],
    // scalaires
    totalHInput: 0, wzHInput: 0, ezHInput: 0,
    avgKxAEZ: 0, avgKxAWZ: 0, pNo: 0,
    totNoodleL: 0, porosityFactor: [], layerThickness: [], effectArea: [],
    wzOilPump: 0, ezOilPump: 0,
  };
}

// ============================================================================
//  SOLVEUR PRINCIPAL
//  `I` = objet d'entrées consolidé (Design Basis + Setpoints + Equip Sizing)
//  `mode` : 'auto' (preSelection) ou 'user' (userSelection)
// ============================================================================
function runModel(I, mode = 'auto') {
  const S = newState();
  const indicator = mode === 'user' ? 2 : 1;

  // ---- setpoints scalaires (inputSetpoints / defaultSetpoints) ----
  const dpt5SP = I.dpTemp5, airTemp0SP = I.airTemp0, airTemp12SP = I.airTemp12;
  const deltaT5 = I.deltaTemp5, deltaT17 = I.deltaTemp17;
  const wzUnitHL = I.wzUnitHL, ezUnitHL = I.ezUnitHL, toHLpc = I.toHLpc,
        phHLpc = I.phHLpc, wzUnitBL = I.wzUnitBL, dryerRT = I.dryerRT;
  const sludgeMC4SP = I.sludgeMC4;

  S.dptA[5] = dpt5SP; S.dptA[6] = dpt5SP; S.dptA[7] = dpt5SP;
  S.tA[0] = airTemp0SP; S.tA[12] = airTemp12SP;
  S.tW[0] = I.waterTemp0; S.tW[1] = I.condensateTemp;
  S.tA[9] = I.airTemp9; S.tA[8] = I.airTemp8;
  S.tO[0] = I.oilTemp0; S.tO[4] = I.oilTemp0; S.tO[6] = I.oilTemp0;
  S.tO[5] = I.oilTemp1; S.tO[2] = I.oilTemp2; S.tO[3] = I.oilTemp3;
  S.xS[4] = 1 - sludgeMC4SP;

  // ---- table "Equipment Sizing Setpoints" (sludgeInfo / otherSetpointInput) ----
  // chaque tableau : 1 valeur par passe (8 colonnes). Emballé en [[...]] comme getValues().
  const noodleDia = [I.noodleDia];
  const noodleDen = [I.noodleDen];
  const beltOAR  = [I.beltOAR];
  const sludgeSAR = [I.sludgeSAR];
  const sludgeOAR = [I.sludgeOAR];
  const sludgePR = [I.sludgePR];
  const fanSafetyFactors = I.fanSafetyFactors;   // [airflowSF, pressureSF, efficiency, powerFactor]
  const fanPressureLoss = I.fanPressureLoss;      // [dryAirNoHex, dryAirHex, wzCirc, ezCirc]
  const vacFlow = I.vacFlow;    // [modèle] cfm
  const vacPressure = I.vacPressure; // [modèle] inH2O

  // ---- Design Basis (readDsgnBasis) ----
  const prjName = I.prjName, prjNumber = I.prjNo;
  const avgDSP = I.avgDSP, feedDS = I.feedDS, productDS = I.productDS;
  const minTrainNo = I.minTrainNo, dPerW = I.dPerW, hPerD = I.hPerD;
  const sludgeTemp = I.sludgeTemp;
  const hexOpCheck = I.preHeaterYN;
  const siteElev = I.siteElev, cakeRT = I.cakeRT;
  const pmRemEff = I.pmRemEff, dryerPM = I.dryerPM;

  S.xS[0] = feedDS; S.xS[8] = productDS;

  // ---- sélection sécheur (dryerSelection) ----
  const dsgnDSF = avgDSP * (7 / dPerW) * (24 / hPerD) / 24;  // kg/h sec
  const dsgnWSF = dsgnDSF / feedDS;
  const finalWSF = dsgnDSF / productDS;
  const dsgnEvapL = dsgnWSF - finalWSF;
  let trainNoSelected = 0, modelNoSelected = 0;
  outer:
  for (let j = minTrainNo; j < 2000; j++) {
    let iLast = 0;
    for (let i = 0; i < 8; i++) {
      iLast = i;
      if (dsgnWSF <= j * MAX_CAP[i]) { trainNoSelected = j; modelNoSelected = i; break; }
    }
    if (dsgnWSF <= j * MAX_CAP[iLast]) break outer;
  }

  // ---- mode "user" : le modèle et le nb de trains sont imposés ----
  if (mode === 'user') {
    const userModel = I.userModel;
    trainNoSelected = I.trainNoUser;
    for (let i = 0; i < 8; i++) if (DRYER_TYPES[i] === userModel) { modelNoSelected = i; break; }
  }

  const depositorNo = parseInt(DRYER_TYPES[modelNoSelected].substring(2, 3), 10);
  const nozzleNo = parseInt(DRYER_TYPES[modelNoSelected].substring(3, 4), 10);

  // ---- initialDsgn ----
  const iM = modelNoSelected;
  const beltW = depositorNo * 0.75;
  const wzBeltL = PASS_LENGTH[iM][0] + PASS_LENGTH[iM][1] + PASS_LENGTH[iM][2] + PASS_LENGTH[iM][3];
  const ezTopBeltL = PASS_LENGTH[iM][4] + PASS_LENGTH[iM][5];
  const ezBBeltL = PASS_LENGTH[iM][6] + PASS_LENGTH[iM][7];

  S.fDS[0] = dsgnDSF / trainNoSelected;   // kg/h
  S.fWS[0] = dsgnWSF / trainNoSelected;
  const fWS0_kgph = S.fWS[0];
  const beltSpeedTop = fWS0_kgph / (wzUnitBL * beltW);   // m/h
  const wzRT = (wzBeltL / 1000) / beltSpeedTop * 60;     // min
  S.xS[0] = feedDS; S.xS[8] = productDS; S.xS[4] = 1 - sludgeMC4SP;
  const ezRT_Top = (ezTopBeltL / 1000) / beltSpeedTop * 60;
  const ezRT_Bottom = dryerRT - (wzRT + ezRT_Top);
  const beltSpeedBottom = (ezBBeltL / 1000) / ezRT_Bottom * 60;

  // Contexte partagé passé aux sous-routines
  const C = {
    S, hexOpCheck, deltaT5, deltaT17, phHLpc, sludgeTemp,
    wzUnitHL, ezUnitHL, sludgeMC4SP, dpt5SP,
    noodleDia, noodleDen, beltOAR, sludgeSAR, sludgeOAR, sludgePR,
    modelNoSelected, beltW, wzBeltL, ezTopBeltL, ezBBeltL, wzRT, ezRT_Top, ezRT_Bottom,
    depositorNo, nozzleNo,
  };

  // ---- pipeline de calcul (identique à preSelection/userSelection) ----
  streamsBalance(C);
  dryerEZpasses(C);
  round3updateEZ(C);
  dryerWZpasses(C);
  round3updateWZ(C);
  beltInfo(C);
  heatTransfer(C);

  // Apport thermique procédé, tel qu'établi par le bilan (avant perte chauffe-huile).
  // C'est cette valeur que checkDsgnLimits utilise : on la fige AVANT toHeater(),
  // qui la réécrit en la divisant par (1 - toHLpc).
  const totalHInputProcess = S.totalHInput;

  // Capacités d'échangeur, définitions de dryerEnergySummary (après round 3)
  S.wzHInput = S.fAH[0] - S.fAH[6];
  S.ezHInput = S.fAH[12] - S.fAH[11];

  heaterCondensor(C);
  const toRes = toHeater(C, { dsgnWSF, cakeRT, toHLpc });

  // ---- calcul limites design (checkDsgnLimits) ----
  const unitEvapL_WZ = (S.fWS[0] - S.fWS[4]) * 3600 / (beltW * wzBeltL / 1000);
  const wzEvapFlux = unitEvapL_WZ / (wzRT / 60);
  const ezBeltLoad = S.fWS[6] * 3600 / (beltW * ezBBeltL / 1000);
  const unitEvapL_EZ = (S.fWS[6] - S.fWS[8]) * 3600 / (beltW * ezBBeltL / 1000);
  const ezEvapFlux = unitEvapL_EZ / (ezRT_Bottom / 60);
  const nozzleLoad = S.fWS[0] * 3600 / (nozzleNo * depositorNo);
  const a7 = S.fWS[6] * 3600 / noodleDen[0][6] / sludgePR[0][6];
  const sludgeThickness = a7 / (beltW * ezBBeltL / 1000 * 60 / ezRT_Bottom) * 1000;
  const wzAirV = (S.velToBelt[0] + S.velToBelt[1] + S.velToBelt[2] + S.velToBelt[3]) / 4;
  const ezAirV = (S.velToBelt[4] + S.velToBelt[5] + S.velToBelt[6] + S.velToBelt[7]) / 4;
  const unitBTU = trainNoSelected * totalHInputProcess * 3600 * 0.9478 / (dsgnEvapL * 2.2046) / (1 - toHLpc);

  // Ventilateurs (fanSummaryOutput) — calcul des puissances
  const fans = computeFans(C, { fanNo: FAN_NO[modelNoSelected], fanSafetyFactors, fanPressureLoss,
    vacFlow, vacPressure, modelNoSelected, hexOpCheck });

  return {
    meta: { prjName, prjNumber, indicator, mode },
    selection: {
      dryerType: DRYER_TYPES[modelNoSelected], modelNoSelected, trainNoSelected,
      depositorNo, nozzleNo, dsgnDSF, dsgnWSF, finalWSF, dsgnEvapL,
      fDSperTrain: dsgnDSF / trainNoSelected, fWSperTrain: dsgnWSF / trainNoSelected,
      evapLperTrain: dsgnEvapL / trainNoSelected, fWSprodPerTrain: finalWSF / trainNoSelected,
      maxCap: MAX_CAP[modelNoSelected],
    },
    belt: { beltW, wzBeltL, ezTopBeltL, ezBBeltL, beltSpeedTop, beltSpeedBottom,
      wzRT, ezRT_Top, ezRT_Bottom,
      effectArea: S.effectArea, layerThickness: S.layerThickness, porosityFactor: S.porosityFactor,
      totNoodleL: S.totNoodleL },
    limits: { unitEvapL_WZ, wzEvapFlux, ezBeltLoad, unitEvapL_EZ, ezEvapFlux,
      nozzleLoad, sludgeThickness, wzAirV, ezAirV, unitBTU,
      maxAirV_WZ: I.maxAirV_WZ, maxAirV_EZ: I.maxAirV_EZ,
      maxEL_WZ: I.maxEL_WZ, maxEL_EZ: I.maxEL_EZ, maxEF_WZ: I.maxEF_WZ, maxEF_EZ: I.maxEF_EZ,
      maxBL_EZ: I.maxBL_EZ, maxBedThick: I.maxBedThick },
    energy: {
      wzHInput: S.wzHInput, ezHInput: S.ezHInput,
      totalHInput: totalHInputProcess,          // apport procédé (hors perte chauffe-huile)
      heaterDuty: S.totalHInput,                // apport au brûleur (perte chauffe-huile incluse)
      wzHeatLoss: wzUnitHL * S.fWS[0] * 3600 / 1000,
      ezHeatLoss: ezUnitHL * S.fWS[0] * 3600 / 1000,
      evapLoadH: (S.fWS[0] - S.fWS[8]) * (2500 + 1.93 * (S.tA[17] - S.tS[0])),
      evapTotal: (S.fWS[0] - S.fWS[8]) * 3600,
      evapWZ: (S.fWS[0] - S.fWS[4]) * 3600,
      evapEZ: (S.fWS[4] - S.fWS[8]) * 3600,
    },
    streams: extractStreams(S),
    heater: toRes.heater,
    condenser: { fW0: S.fW[0], fW1: S.fW[1], tW0: S.tW[0], tW1: S.tW[1] },
    oil: { fO: S.fO.slice(0, 9), fOv: S.fOv.slice(0, 9), tO: S.tO.slice(0, 9),
      wzOilPump: S.wzOilPump, ezOilPump: S.ezOilPump },
    fans,
    _raw: S,
  };
}

// ============================================================================
//  streamsBalance — round 1 + boucle round 2 (5 itérations)
// ============================================================================
function streamsBalance(C) {
  const S = C.S;
  // round1AirStream7
  S.dptA[7] = S.dptA[7];
  S.yA[7] = goalSeek_wvRatio(S.dptA[7], 0.01 * S.dptA[7], 0.3);
  S.tA[7] = S.dptA[7] + C.deltaT5;
  S.airHv[7] = S.tA[7] + (2500 + 1.93 * S.tA[7]) * S.yA[7];
  // round1AirStream8
  if (C.hexOpCheck === true) {
    S.yA[8] = S.yA[7]; S.dptA[8] = S.dptA[7];
    S.airHv[8] = S.tA[8] + (2500 + 1.93 * S.tA[8]) * S.yA[8];
  } else {
    S.yA[8] = S.yA[7]; S.dptA[8] = S.dptA[7]; S.tA[8] = S.tA[7]; S.airHv[8] = S.airHv[7];
  }
  // round1AirStream9
  S.dptA[9] = S.tA[9];
  S.yA[9] = goalSeek_wvRatio(S.dptA[9], 0.01 * S.dptA[9], 0.2);
  S.airHv[9] = S.tA[9] + (2500 + 1.93 * S.tA[9]) * S.yA[9];
  // round1AirStream10
  if (C.hexOpCheck === true) {
    S.yA[10] = S.yA[9]; S.dptA[10] = dptCalc(S.yA[10]);
    S.airHv[10] = (S.airHv[7] - S.airHv[8]) * (1 - C.phHLpc) + S.airHv[9];
    S.tA[10] = (S.airHv[10] - 2500 * S.yA[10]) / (1 + 1.93 * S.yA[10]);
  } else {
    S.tA[10] = S.tA[9]; S.yA[10] = S.yA[9]; S.dptA[10] = S.dptA[9]; S.airHv[10] = S.airHv[9];
  }
  // round1AirStream6 / 5
  S.yA[6] = S.yA[7]; S.tA[6] = S.tA[7]; S.dptA[6] = S.dptA[7]; S.airHv[6] = S.airHv[7];
  S.yA[5] = S.yA[7]; S.tA[5] = S.tA[7]; S.dptA[5] = S.dptA[7]; S.airHv[5] = S.airHv[7];

  // drySludgeFlows — conversion kg/h -> kg/s
  S.fDS[0] = S.fDS[0] / 3600;
  for (let i = 1; i <= 8; i++) S.fDS[i] = S.fDS[0];
  S.fWS[0] = S.fDS[0] / S.xS[0];
  S.fWS[4] = S.fDS[4] / S.xS[4];
  if (S.xS[6] !== undefined) S.fWS[6] = S.fDS[6] / S.xS[6];
  S.fWS[8] = S.fDS[8] / S.xS[8];

  // dryingAirFlow
  S.fDA[7] = (S.fDS[0] / S.xS[0] - S.fDS[8] / S.xS[8]) / (S.yA[7] - S.yA[10]);
  S.fDA[8] = S.fDA[7]; S.fDA[9] = S.fDA[7]; S.fDA[10] = S.fDA[7]; S.fDA[18] = S.fDA[7];
  for (const k of [7, 8, 9, 10]) { S.fWV[k] = S.fDA[k] * S.yA[k]; S.fAH[k] = S.fDA[k] * S.airHv[k]; }

  // stream18Ya
  S.fDA[18] = S.fDA[10];
  S.yA[18] = ((S.fWS[4] - S.fWS[8]) + S.fDA[10] * S.yA[10]) / S.fDA[18];
  // round1AirStream18
  S.dptA[18] = dptCalc(S.yA[18]);
  S.tA[18] = S.dptA[18] + C.deltaT17;
  S.airHv[18] = S.tA[18] + (2500 + 1.93 * S.tA[18]) * S.yA[18];
  S.fWV[18] = S.fDA[18] * S.yA[18]; S.fAH[18] = S.fDA[18] * S.airHv[18];

  // round1SludgeStream0/4/8
  S.fWS[0] = S.fDS[0] / S.xS[0]; S.tS[0] = C.sludgeTemp;
  S.sensH[0] = ((1 - S.xS[0]) * 4.2 + S.xS[0] * 1.5) * S.tS[0]; S.fSH[0] = S.sensH[0] * S.fWS[0];
  S.fWS[4] = S.fDS[4] / S.xS[4]; S.tS[4] = S.dptA[5];
  S.sensH[4] = ((1 - S.xS[4]) * 4.2 + S.xS[4] * 1.5) * S.tS[4]; S.fSH[4] = S.sensH[4] * S.fWS[4];
  S.tS[8] = S.dptA[18]; S.fWS[8] = S.fDS[8] / S.xS[8];
  S.sensH[8] = ((1 - S.xS[8]) * 4.2 + S.xS[8] * 1.5) * S.tS[8]; S.fSH[8] = S.sensH[8] * S.fWS[8];

  // round1AirStream0
  S.yA[0] = S.yA[7]; S.dptA[0] = dptCalc(S.yA[0]);
  S.airHv[0] = S.tA[0] + (2500 + 1.93 * S.tA[0]) * S.yA[0];

  circAirFlowWZ(C); totalHeatInput(C);
  // round1AirStream17
  S.yA[17] = S.yA[18]; S.dptA[17] = dptCalc(S.yA[17]);
  S.tA[17] = S.dptA[17] + C.deltaT17;
  S.airHv[17] = S.tA[17] + (2500 + 1.93 * S.tA[17]) * S.yA[17];
  // round1AirStream12 (setpoint)
  round1CircAirFlowEZ(C);

  let counter = 0;
  while (counter < 5) {
    counter++;
    round2AirStream12(C); round2AirStream18(C); round2AirStream17(C);
    round2AirStream0(C); round2SludgeStream8(C);
    circAirFlowWZ(C); totalHeatInput(C); round1CircAirFlowEZ(C);
  }
}

function circAirFlowWZ(C) {
  const S = C.S;
  S.fAH[7] = S.fDA[7] * S.airHv[7];
  S.fDA[0] = (S.fSH[4] - S.fSH[0] + S.fAH[7] - S.fAH[18] + C.wzUnitHL * S.fWS[0] * 3600 / 1000) / (S.airHv[0] - S.airHv[5]);
  S.airHv[6] = S.airHv[5];
  S.wzHInput = S.fDA[0] * (S.airHv[0] - S.airHv[6]);
}

function totalHeatInput(C) {
  const S = C.S;
  S.fAH[10] = S.fDA[10] * S.airHv[10];
  const totalHeatLoss = S.fWS[0] * 3600 / 1000 * (C.wzUnitHL + C.ezUnitHL);
  S.totalHInput = (S.fAH[7] - S.fAH[10]) + (S.fSH[8] - S.fSH[0] + totalHeatLoss);
}

function round1CircAirFlowEZ(C) {
  const S = C.S;
  S.ezHInput = S.totalHInput - S.wzHInput;
  let counter = 0;
  let a = S.yA[17];
  const c1 = 2500 + 1.93 * S.tA[12];
  const c2 = S.fAH[10] + S.ezHInput - S.fDA[10] * S.tA[12] - c1 * S.fDA[10] * S.yA[10];
  while (counter < 10) {
    counter++;
    const c3 = S.tA[12] + c1 * a - S.airHv[17];
    S.fDA[17] = c2 / c3;
    S.yA[17] = S.yA[18] + (S.fWS[4] - S.fWS[8]) / 2 / (S.fDA[17]);
    S.dptA[17] = dptCalc(S.yA[17]);
    S.tA[17] = S.dptA[17] + C.deltaT17;
    S.airHv[17] = S.tA[17] + (2500 + 1.93 * S.tA[17]) * S.yA[17];
    a = S.yA[17];
  }
}

function round2AirStream12(C) {
  const S = C.S;
  S.fDA[12] = S.fDA[10] + S.fDA[17];
  S.yA[12] = (S.fDA[10] * S.yA[10] + S.fDA[17] * S.yA[17]) / S.fDA[12];
  S.dptA[12] = dptCalc(S.yA[12]);
  S.airHv[12] = S.tA[12] + (2500 + 1.93 * S.tA[12]) * S.yA[12];
  S.fAH[12] = S.fDA[12] * S.airHv[12]; S.fWV[12] = S.fDA[12] * S.yA[12];
  S.fVolA[12] = volAirflow(S.tA[12], S.yA[12], S.fDA[12], S.fWV[12]);
}

function round2AirStream18(C) {
  const S = C.S;
  S.dptA[18] = dptCalc(S.yA[18]);
  S.airHv[18] = S.airHv[12];
  S.fAH[18] = S.fDA[18] * S.airHv[18];
  S.fAH[18] = S.fAH[18] - S.fWS[0] * 3600 / 1000 * (C.ezUnitHL) * S.fDA[18] / S.fDA[12];
  S.tA[18] = (S.fAH[18] / S.fDA[18] - 2500 * S.yA[18]) / (1 + 1.93 * S.yA[18]);
  S.fWV[18] = S.fDA[18] * S.yA[18];
  S.fVolA[18] = volAirflow(S.tA[18], S.yA[18], S.fDA[18], S.fWV[18]);
}

function round2AirStream17(C) {
  const S = C.S;
  S.dptA[17] = dptCalc(S.yA[17]);
  S.tA[17] = S.dptA[17] + C.deltaT17;
  S.airHv[17] = S.tA[17] + (2500 + 1.93 * S.tA[17]) * S.yA[17];
  S.fAH[17] = S.fDA[17] * S.airHv[17]; S.fWV[17] = S.fDA[17] * S.yA[17];
  S.fVolA[17] = volAirflow(S.tA[17], S.yA[17], S.fDA[17], S.fWV[17]);
}

function round2SludgeStream8(C) {
  const S = C.S;
  S.tS[8] = S.dptA[17]; S.fWS[8] = S.fDS[8] / S.xS[8];
  S.sensH[8] = ((1 - S.xS[8]) * 4.2 + S.xS[8] * 1.5) * S.tS[8]; S.fSH[8] = S.sensH[8] * S.fWS[8];
}

function round2AirStream0(C) {
  const S = C.S;
  S.yA[0] = S.yA[7]; S.dptA[0] = dptCalc(S.yA[0]);
  S.airHv[0] = S.tA[0] + (2500 + 1.93 * S.tA[0]) * S.yA[0];
  S.fAH[0] = S.fDA[0] * S.airHv[0]; S.fWV[0] = S.fDA[0] * S.yA[0];
  S.fVolA[0] = volAirflow(S.tA[0], S.yA[0], S.fDA[0], S.fWV[0]);
}

// ============================================================================
//  END ZONE — dryerEZpasses + 4 passes (goal-seek imbriqués)
// ============================================================================
function dryerEZpasses(C) {
  const S = C.S;
  S.fWS[4] = S.fDS[4] / S.xS[4]; S.fWS[8] = S.fDS[8] / S.xS[8];
  S.tS[8] = S.dptA[17]; S.tS[4] = S.dptA[5];

  const avgHeatEZ = (S.fWS[4] - S.fWS[8]) * (2500 + 1.93 * (S.tA[17] - S.tS[4]))
    - S.fWS[4] * (1.5 * S.xS[4] + (1.0 - S.xS[4]) * 4.2) * S.tS[4]
    + S.fWS[8] * (1.5 * S.xS[8] + (1.0 - S.xS[8]) * 4.2) * S.tS[8];
  const avgDTempEZ = ((S.tA[12] - S.dptA[12]) - (S.tA[17] - S.dptA[17]))
    / Math.log((S.tA[12] - S.dptA[12]) / (S.tA[17] - S.dptA[17]));
  const intialkxA = avgHeatEZ * 1000 / avgDTempEZ / 4;
  S.avgKxAEZ = intialkxA;

  dryerEZPass4(C); dryerEZPass3(C); dryerEZPass2(C); dryerEZPass1(C);

  let stepSizeQ = 0.01 * S.fDA[17];
  let counter1 = 0;
  while (counter1 < 10) {
    counter1++;
    let g = 0;
    while (S.tA[16] > (S.tA[15] + S.tA[17]) * 0.5 && g < 100000) {
      g++; S.fDA[17] -= stepSizeQ;
      dryerEZPass4(C); dryerEZPass3(C); dryerEZPass2(C); dryerEZPass1(C);
    }
    g = 0;
    while (S.tA[16] < (S.tA[15] + S.tA[17]) * 0.5 && g < 100000) {
      g++; S.fDA[17] += stepSizeQ;
      dryerEZPass4(C); dryerEZPass3(C); dryerEZPass2(C); dryerEZPass1(C);
    }
  }

  const targetValue = 1 - C.sludgeMC4SP;
  let stepSize = 0.01 * intialkxA;
  let prevkxA = intialkxA;
  let g = 0;
  while (Math.abs(S.xS[4] - targetValue) > 0.005 && g < 100000) {
    g++;
    if (S.xS[4] > targetValue) S.avgKxAEZ += stepSize; else S.avgKxAEZ -= stepSize;
    dryerEZPass4(C); dryerEZPass3(C); dryerEZPass2(C); dryerEZPass1(C);
    if ((S.avgKxAEZ - prevkxA) * (S.avgKxAEZ - intialkxA) < 0) stepSize *= 0.5;
    prevkxA = S.avgKxAEZ;
  }
}

function dryerEZPass4(C) {
  const S = C.S;
  let varXS = S.xS[8] - 10 / 100;
  let deltaT = (S.tA[17] - S.dptA[17]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (S.xS[8] - varXS) / (varXS * S.xS[8]);
    S.yA[16] = S.yA[17] - (S.fDS[0] / S.fDA[17]) * a0;
    S.dptA[16] = dptCalc(S.yA[16]); S.dptA[17] = dptCalc(S.yA[17]);
    S.tS[8] = S.dptA[17]; S.tS[7] = S.tS[8];
    const a2 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[7]);
    const b1 = (S.fDS[0] / S.xS[8]) * (S.xS[8] * 1.5 + (1 - S.xS[8]) * 4.2) * S.tS[8];
    const a1 = S.fDA[17] * (S.tA[17] + (2500 + 1.93 * S.tA[17]) * S.yA[17]);
    const ezHL = S.fWS[0] * 3600 / 1000 * (C.ezUnitHL) / 4;
    S.tA[16] = ((a1 + (ezHL + b1) - a2) / S.fDA[17] - 2500 * S.yA[17]) / (1 + 1.93 * S.yA[17]);
    const passHT = S.avgKxAEZ * deltaT;
    const c0 = (S.xS[8] * 1.5 + (1 - S.xS[8]) * 4.2) * S.tS[8] / S.xS[8];
    const c1 = (passHT / 1000) / S.fDS[0];
    const c2 = 2500 + 1.93 * (S.tA[17] - S.tS[7]);
    S.xS[7] = (4.2 * S.tS[8] - c2) / (c0 - c1 + 2.7 * S.tS[8] - c2 / S.xS[8]);
    varXS = S.xS[7];
    deltaT = ((S.tA[16] - S.dptA[16]) - (S.tA[17] - S.dptA[17])) / Math.log((S.tA[16] - S.dptA[16]) / (S.tA[17] - S.dptA[17]));
  }
}

function dryerEZPass3(C) {
  const S = C.S;
  let varXS = S.xS[7] - 10 / 100;
  let deltaT = (S.tA[12] - S.dptA[12]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (S.xS[7] - varXS) / (varXS * S.xS[7]);
    S.fDA[12] = S.fDA[17] + S.fDA[10]; S.fDA[13] = S.fDA[12];
    S.yA[13] = S.yA[12] + (S.fDS[0] / S.fDA[13]) * a0;
    S.dptA[13] = dptCalc(S.yA[13]);
    S.tS[7] = S.dptA[13]; S.tS[6] = S.tS[7];
    const a2 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[6]);
    const b1 = (S.fDS[0] / S.xS[7]) * (S.xS[7] * 1.5 + (1 - S.xS[7]) * 4.2) * S.tS[7];
    const a1 = S.fDA[12] * (S.tA[12] + (2500 + 1.93 * S.tA[12]) * S.yA[12]);
    const ezHL = S.fWS[0] * 3600 / 1000 * (C.ezUnitHL) / 4;
    S.tA[13] = ((a1 + a2 - (ezHL + b1)) / S.fDA[13] - 2500 * S.yA[13]) / (1 + 1.93 * S.yA[13]);
    const passHT = S.avgKxAEZ * deltaT;
    const c0 = (S.xS[7] * 1.5 + (1 - S.xS[7]) * 4.2) * S.tS[7] / S.xS[7];
    const c1 = (passHT / 1000) / S.fDS[0];
    S.tS[6] = S.tS[7];
    const c2 = 2500 + 1.93 * (S.tA[13] - S.tS[6]);
    S.xS[6] = (4.2 * S.tS[7] - c2) / (c0 - c1 + 2.7 * S.tS[7] - c2 / S.xS[7]);
    varXS = S.xS[6];
    deltaT = ((S.tA[12] - S.dptA[12]) - (S.tA[13] - S.dptA[13])) / Math.log((S.tA[12] - S.dptA[12]) / (S.tA[13] - S.dptA[13]));
  }
}

function dryerEZPass2(C) {
  const S = C.S;
  let varXS = S.xS[6] - 10 / 100;
  let deltaT = (S.tA[13] - S.dptA[13]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (S.xS[6] - varXS) / (varXS * S.xS[6]);
    S.fDA[14] = S.fDA[17] + S.fDA[10]; S.fDA[13] = S.fDA[17] + S.fDA[10];
    S.yA[14] = S.yA[13] + (S.fDS[0] / S.fDA[14]) * a0;
    S.dptA[14] = dptCalc(S.yA[14]);
    S.tS[6] = S.dptA[14]; S.tS[5] = S.tS[6];
    const a2 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[5]);
    const b1 = (S.fDS[0] / S.xS[6]) * (S.xS[6] * 1.5 + (1 - S.xS[6]) * 4.2) * S.tS[6];
    const a1 = S.fDA[13] * (S.tA[13] + (2500 + 1.93 * S.tA[13]) * S.yA[13]);
    const ezHL = S.fWS[0] * 3600 / 1000 * (C.ezUnitHL) / 4;
    S.tA[14] = ((a1 + a2 - (ezHL + b1)) / S.fDA[14] - 2500 * S.yA[14]) / (1 + 1.93 * S.yA[14]);
    const passHT = S.avgKxAEZ * deltaT;
    const c0 = (S.xS[6] * 1.5 + (1 - S.xS[6]) * 4.2) * S.tS[6] / S.xS[6];
    const c1 = (passHT / 1000) / S.fDS[0];
    const c2 = 2500 + 1.93 * (S.tA[14] - S.tS[5]);
    S.xS[5] = (4.2 * S.tS[6] - c2) / (c0 - c1 + 2.7 * S.tS[6] - c2 / S.xS[6]);
    varXS = S.xS[5];
    deltaT = ((S.tA[13] - S.dptA[13]) - (S.tA[14] - S.dptA[14])) / Math.log((S.tA[13] - S.dptA[13]) / (S.tA[14] - S.dptA[14]));
  }
}

function dryerEZPass1(C) {
  const S = C.S;
  let varXS = S.xS[5] - 10 / 100;
  S.tA[15] = S.tA[14]; S.dptA[15] = S.dptA[14];
  let deltaT = (S.tA[15] - S.dptA[15]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (S.xS[5] - varXS) / (varXS * S.xS[5]);
    S.fDA[15] = S.fDA[17]; S.fDA[16] = S.fDA[15];
    S.yA[15] = S.yA[14];
    S.yA[16] = S.yA[15] + (S.fDS[0] / S.fDA[16]) * a0;
    S.dptA[16] = dptCalc(S.yA[16]);
    S.tS[5] = S.dptA[16]; S.tS[4] = S.dptA[5];
    const a2 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[4]);
    const b1 = (S.fDS[0] / S.xS[5]) * (S.xS[5] * 1.5 + (1 - S.xS[5]) * 4.2) * S.tS[5];
    const a1 = S.fDA[15] * (S.tA[15] + (2500 + 1.93 * S.tA[15]) * S.yA[15]);
    const ezHL = S.fWS[0] * 3600 / 1000 * (C.ezUnitHL) / 4;
    S.tA[16] = ((a1 + a2 - (ezHL + b1)) / S.fDA[16] - 2500 * S.yA[16]) / (1 + 1.93 * S.yA[16]);
    const passHT = S.avgKxAEZ * deltaT;
    const c0 = (S.xS[5] * 1.5 + (1 - S.xS[5]) * 4.2) * S.tS[5] / S.xS[5];
    const c1 = (passHT / 1000) / S.fDS[0];
    const c2 = 2500 + 1.93 * (S.tA[16] - S.tS[4]);
    S.xS[4] = (4.2 * S.tS[5] - c2) / (c0 - c1 + 2.7 * S.tS[5] - c2 / S.xS[5]);
    varXS = S.xS[4];
    deltaT = ((S.tA[15] - S.dptA[15]) - (S.tA[16] - S.dptA[16])) / Math.log((S.tA[15] - S.dptA[15]) / (S.tA[16] - S.dptA[16]));
  }
}

// ============================================================================
//  WARM ZONE — dryerWZpasses + dryerPassWZ (passes 1-3) + dryerPass4WZ
// ============================================================================
function dryerWZpasses(C) {
  const S = C.S;
  S.fWS[0] = S.fDS[0] / S.xS[0]; S.fWS[4] = S.fDS[4] / S.xS[4]; S.tS[4] = S.dptA[5];
  const avgHeatWZ = (S.fWS[0] - S.fWS[4]) * (2500 + 1.93 * (S.tA[5] - S.tS[0]))
    - S.fWS[0] * (1.5 * S.xS[0] + (1.0 - S.xS[0]) * 4.2) * S.tS[0]
    + S.fWS[4] * (1.5 * S.xS[4] + (1.0 - S.xS[4]) * 4.2) * S.tS[4];
  const avgDTempWZ = ((S.tA[0] - S.dptA[0]) - (S.tA[5] - S.dptA[5]))
    / Math.log((S.tA[0] - S.dptA[0]) / (S.tA[5] - S.dptA[5]));
  const initialkxA = avgHeatWZ * 1000 / avgDTempWZ / 4;
  S.avgKxAWZ = initialkxA;

  S.pNo = 1; dryerPassWZ(C); S.pNo = 2; dryerPassWZ(C); S.pNo = 3; dryerPassWZ(C); dryerPass4WZ(C);

  const targetT5 = C.dpt5SP + C.deltaT5;
  let stepSizeQ = 0.01 * S.fDA[0];
  let counter1 = 0;
  while (counter1 < 5) {
    counter1++;
    let g = 0;
    while (S.tA[5] <= targetT5 + 0.5 && g < 100000) {
      g++; S.fDA[0] += stepSizeQ;
      S.pNo = 1; dryerPassWZ(C); S.pNo = 2; dryerPassWZ(C); S.pNo = 3; dryerPassWZ(C); dryerPass4WZ(C);
    }
    g = 0;
    while (S.tA[5] >= targetT5 + 0.5 && g < 100000) {
      g++; S.fDA[0] -= stepSizeQ;
      S.pNo = 1; dryerPassWZ(C); S.pNo = 2; dryerPassWZ(C); S.pNo = 3; dryerPassWZ(C); dryerPass4WZ(C);
    }
    const targetValue = 1 - C.sludgeMC4SP;
    let stepSize = 0.01 * initialkxA;
    let prevkxA = initialkxA;
    g = 0;
    while (Math.abs(S.xS[4] - targetValue) > 0.005 && g < 100000) {
      g++;
      if (S.xS[4] > targetValue) S.avgKxAWZ -= stepSize; else S.avgKxAWZ += stepSize;
      S.pNo = 1; dryerPassWZ(C); S.pNo = 2; dryerPassWZ(C); S.pNo = 3; dryerPassWZ(C); dryerPass4WZ(C);
      if ((S.avgKxAWZ - prevkxA) * (S.avgKxAWZ - initialkxA) < 0) stepSize *= 0.5;
      prevkxA = S.avgKxAWZ;
    }
  }
}

function dryerPassWZ(C) {
  const S = C.S; const pNo = S.pNo;
  let varXS = S.xS[pNo - 1] + 10 / 100;
  let deltaT = (S.tA[pNo - 1] - S.dptA[pNo - 1]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (varXS - S.xS[pNo - 1]) / (varXS * S.xS[pNo - 1]);
    S.yA[pNo] = S.yA[pNo - 1] + (S.fDS[0] / S.fDA[0]) * a0;
    S.dptA[pNo] = dptCalc(S.yA[pNo]); S.tS[pNo] = S.dptA[pNo];
    const a2 = S.fDS[0] / S.xS[pNo - 1] * ((S.xS[pNo - 1] * 1.5 + (1 - S.xS[pNo - 1]) * 4.2) * S.tS[pNo - 1]);
    const b1 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[pNo]);
    const wzHL = S.fWS[0] * 3600 / 1000 * (C.wzUnitHL) / 4;
    const a1 = S.fDA[0] * (S.tA[pNo - 1] + (2500 + 1.93 * S.tA[pNo - 1]) * S.yA[pNo - 1]);
    S.tA[pNo] = ((a1 + a2 - (wzHL + b1)) / S.fDA[0] - 2500 * S.yA[pNo]) / (1 + 1.93 * S.yA[pNo]);
    const passHT = S.avgKxAWZ * deltaT;
    const c1 = 2500 + 1.93 * (S.tA[pNo] - S.tS[pNo - 1]);
    S.xS[pNo] = (4.2 * S.tS[pNo] - c1) * S.fDS[0] * S.xS[pNo - 1]
      / ((passHT / 1000 + a2) * S.xS[pNo - 1] + 2.7 * S.fDS[0] * S.xS[pNo - 1] * S.tS[pNo] - c1 * S.fDS[0]);
    varXS = S.xS[pNo];
    deltaT = ((S.tA[pNo - 1] - S.dptA[pNo - 1]) - (S.tA[pNo] - S.dptA[pNo])) / Math.log((S.tA[pNo - 1] - S.dptA[pNo - 1]) / (S.tA[pNo] - S.dptA[pNo]));
  }
}

function dryerPass4WZ(C) {
  const S = C.S;
  S.fDA[3] = S.fDA[0]; S.fDA[4] = S.fDA[3] + S.fDA[18];
  S.yA[4] = (S.fDA[3] * S.yA[3] + S.fDA[18] * S.yA[18]) / S.fDA[4];
  S.dptA[4] = dptCalc(S.yA[4]);
  S.airHv[3] = S.tA[3] + (2500 + 1.93 * S.tA[3]) * S.yA[3];
  S.airHv[18] = S.tA[18] + (2500 + 1.93 * S.tA[18]) * S.yA[18];
  S.fAH[3] = S.fDA[3] * S.airHv[3]; S.fAH[18] = S.fDA[18] * S.airHv[18];
  S.airHv[4] = (S.fAH[3] + S.fAH[18]) / S.fDA[4];
  S.tA[4] = (S.airHv[4] - 2500 * S.yA[4]) / (1 + 1.93 * S.yA[4]);
  S.pNo = 4;
  let varXS = S.xS[3] + 10 / 100;
  let deltaT = (S.tA[4] - S.dptA[4]);
  for (let counter = 0; counter < 10; counter++) {
    const a0 = (varXS - S.xS[3]) / (varXS * S.xS[3]);
    S.yA[5] = S.yA[4] + (S.fDS[0] / S.fDA[4]) * a0;
    S.dptA[5] = dptCalc(S.yA[5]); S.tS[4] = S.dptA[5];
    const a2 = (S.fDS[0] / S.xS[3]) * (S.xS[3] * 1.5 + (1 - S.xS[3]) * 4.2) * S.tS[3];
    const b1 = S.fDS[0] / varXS * ((varXS * 1.5 + (1 - varXS) * 4.2) * S.tS[4]);
    const a1 = S.fDA[4] * (S.tA[4] + (2500 + 1.93 * S.tA[4]) * S.yA[4]);
    const wzHL = S.fWS[0] * 3600 / 1000 * (C.wzUnitHL) / 4;
    S.tA[5] = ((a1 + a2 - (wzHL + b1)) / S.fDA[4] - 2500 * S.yA[5]) / (1 + 1.93 * S.yA[5]);
    const passHT = S.avgKxAWZ * deltaT;
    const c1 = 2500 + 1.93 * (S.tA[5] - S.tS[3]);
    S.xS[4] = (4.2 * S.tS[4] - c1) * S.fDS[0] * S.xS[3]
      / ((passHT / 1000 + a2) * S.xS[3] + 2.7 * S.fDS[0] * S.xS[3] * S.tS[4] - c1 * S.fDS[0]);
    varXS = S.xS[4];
    deltaT = ((S.tA[4] - S.dptA[4]) - (S.tA[5] - S.dptA[5])) / Math.log((S.tA[4] - S.dptA[4]) / (S.tA[5] - S.dptA[5]));
  }
}

// ============================================================================
//  BELT INFO
// ============================================================================
function beltInfo(C) {
  const S = C.S;
  // sludgeBedWZ
  S.fWS[0] = S.fDS[0] / S.xS[0];
  S.totNoodleL = (S.fWS[0] * 3600 / C.noodleDen[0][0]) / (3.14 * (C.noodleDia[0][0] / 1000) ** 2 / 4);
  S.effectArea[0] = C.beltW * C.wzBeltL / 1000;
  const effAreaPh0 = (S.effectArea[0]) * (60 / C.wzRT);
  S.layerThickness[0] = (S.fWS[0] * 3600 / C.noodleDen[0][0]) / (effAreaPh0) * 1000;
  const a1_0 = S.effectArea[0] * C.nozzleNo * C.noodleDia[0][0] / 1000;
  S.porosityFactor[0] = (a1_0 - (3.14 / 4 * (C.noodleDia[0][0] / 1000) ** 2) * S.totNoodleL / 3600 * (C.wzRT * 60)) / (a1_0);
  // sludgeTopBedEZ
  S.fDS[4] = S.fDS[0]; S.fWS[4] = S.fDS[4] / S.xS[4];
  S.effectArea[1] = C.beltW * C.ezTopBeltL / 1000;
  const effAreaPh1 = (S.effectArea[1]) * (60 / C.ezRT_Top);
  S.layerThickness[1] = ((S.fWS[4] * 3600 / C.noodleDen[0][4]) / C.sludgePR[0][4]) / (effAreaPh1) * 1000;
  const a1_1 = S.effectArea[1] * C.nozzleNo * C.noodleDia[0][4] / 1000;
  S.porosityFactor[1] = (a1_1 - (3.14 / 4 * (C.noodleDia[0][4] / 1000) ** 2) * S.totNoodleL / 3600 * C.ezRT_Top * 60) / (a1_1);
  // sludgeBottomBedEZ
  S.fDS[6] = S.fDS[0]; S.fWS[6] = S.fDS[6] / S.xS[6];
  S.effectArea[2] = C.beltW * C.ezBBeltL / 1000;
  const effAreaPh2 = (S.effectArea[2]) * (60 / C.ezRT_Bottom);
  S.layerThickness[2] = ((S.fWS[6] * 3600 / C.noodleDen[0][6]) / C.sludgePR[0][6]) / (effAreaPh2) * 1000;
  S.porosityFactor[2] = (1 - C.sludgePR[0][6]);
}

// ============================================================================
//  HEAT TRANSFER (par passe)
// ============================================================================
function htPass(C, seq, airStream, refPass, passLenIdx, rt, zoneBeltL, porIdx, avgKxA) {
  const S = C.S; const i = C.modelNoSelected;
  S.airDen[seq] = airDensity(S.tA[airStream], S.yA[airStream]);
  S.dynaVisc[seq] = airDynVis(S.tA[airStream], S.yA[airStream]);
  S.kineVisc[seq] = airKnVis(S.tA[airStream], S.yA[airStream]);
  S.spHeatCap[seq] = airCP(S.tA[airStream], S.yA[airStream]);
  S.thermalC[seq] = airLambda(S.tA[airStream], S.yA[airStream]);
  S.prandtl[seq] = S.dynaVisc[seq] * S.spHeatCap[seq] / S.thermalC[seq] / 1000;
  S.passArea[seq] = C.beltW * PASS_LENGTH[i][passLenIdx] / 1000;
  const a1 = S.passArea[seq] * C.beltOAR[0][passLenIdx];
  S.velToBelt[seq] = S.fVolA[airStream] / S.passArea[seq];
  S.velThruBelt[seq] = S.fVolA[airStream] / (a1);
  S.velThruSludge[seq] = S.velToBelt[seq] / C.sludgeOAR[0][passLenIdx];
  S.sludgeLength[seq] = S.totNoodleL / 3600 * (rt * 60) * (PASS_LENGTH[i][passLenIdx] / zoneBeltL);
  S.sludgeSA[seq] = S.sludgeLength[seq] * 3.14 * C.noodleDia[0][passLenIdx] / 1000;
  S.effectiveSA[seq] = S.sludgeSA[seq] * C.sludgeSAR[0][passLenIdx];
  S.reynoldNo[seq] = S.velToBelt[seq] * 1000 * (C.noodleDia[0][passLenIdx] * 3.14 / 2) / S.kineVisc[seq];
  S.correctedRN[seq] = S.reynoldNo[seq] / S.porosityFactor[porIdx];
  S.nusseltNo[seq] = (1.95 + 0.178 * (S.correctedRN[seq] ** 0.4) * (S.prandtl[seq] ** 0.116)) ** 2 * (S.prandtl[seq] ** 0.19) * 1.58;
  S.heatTransferK[seq] = S.nusseltNo[seq] * S.thermalC[seq] / C.noodleDia[0][passLenIdx] / 3.14 * 2 * 1000;
  S.kxA[seq] = S.heatTransferK[seq] * S.effectiveSA[seq];
  S.safetyFactor[seq] = S.kxA[seq] / avgKxA;
}

function heatTransfer(C) {
  const S = C.S;
  // WZ passes #1-#3 (air streams 0,1,2 ; porosityFactor[0])
  for (let p = 1; p < 4; p++) htPass(C, p - 1, p - 1, p, p - 1, C.wzRT, C.wzBeltL, 0, S.avgKxAWZ);
  // WZ pass #4 (air stream 4 ; seq 3)
  htPass(C, 3, 4, 4, 3, C.wzRT, C.wzBeltL, 0, S.avgKxAWZ);
  // EZ pass #1 (air stream 15 ; seq 4 ; porosityFactor[1])
  htPass(C, 4, 15, 5, 4, C.ezRT_Top, C.ezTopBeltL, 1, S.avgKxAEZ);
  // EZ pass #2 (air stream 13 ; seq 5)
  htPass(C, 5, 13, 6, 5, C.ezRT_Top, C.ezTopBeltL, 1, S.avgKxAEZ);
  // EZ pass #3 (air stream ? ) — script uses streams 11/12 region; seq 6, len idx 6
  htPass(C, 6, 12, 7, 6, C.ezRT_Bottom, C.ezBBeltL, 2, S.avgKxAEZ);
  // EZ pass #4 seq 7, len idx 7, air stream 16
  htPass(C, 7, 16, 8, 7, C.ezRT_Bottom, C.ezBBeltL, 2, S.avgKxAEZ);
}

// ============================================================================
//  ROUND 3 UPDATES — finalisation des flux pour affichage
// ============================================================================
function round3updateEZ(C) {
  const S = C.S;
  // AirStream16
  S.airHv[16] = S.tA[16] + (2500 + 1.93 * S.tA[16]) * S.yA[16];
  S.fDA[16] = S.fDA[17]; S.fAH[16] = S.fDA[16] * S.airHv[16];
  S.fWV[16] = S.fDA[16] * S.yA[16]; S.fVolA[16] = volAirflow(S.tA[16], S.yA[16], S.fDA[16], S.fWV[16]);
  // AirStream17
  { const a0 = (S.xS[8] - S.xS[7]) / (S.xS[8] * S.xS[7]);
    S.yA[17] = S.yA[16] + (S.fDS[0] / S.fDA[17]) * a0; S.dptA[17] = dptCalc(S.yA[17]);
    S.tA[17] = S.dptA[17] + C.deltaT17;
    S.airHv[17] = S.tA[17] + (2500 + 1.93 * S.tA[17]) * S.yA[17];
    S.fAH[17] = S.fDA[17] * S.airHv[17]; S.fWV[17] = S.fDA[17] * S.yA[17];
    S.fVolA[17] = volAirflow(S.tA[17], S.yA[17], S.fDA[17], S.fWV[17]); }
  // SludgeStream7
  S.fDS[7] = S.fDS[0]; S.tS[7] = S.dptA[13]; S.fWS[7] = S.fDS[7] / S.xS[7];
  S.sensH[7] = ((1 - S.xS[7]) * 4.2 + S.xS[7] * 1.5) * S.tS[7]; S.fSH[7] = S.sensH[7] * S.fWS[7];
  // AirStream13
  S.airHv[13] = S.tA[13] + (2500 + 1.93 * S.tA[13]) * S.yA[13]; S.fDA[13] = S.fDA[12];
  S.fAH[13] = S.fDA[13] * S.airHv[13]; S.fWV[13] = S.fDA[13] * S.yA[13];
  S.fVolA[13] = volAirflow(S.tA[13], S.yA[13], S.fDA[13], S.fWV[13]);
  // SludgeStream6
  S.fDS[6] = S.fDS[0]; S.tS[6] = S.dptA[14]; S.fWS[6] = S.fDS[6] / S.xS[6];
  S.sensH[6] = ((1 - S.xS[6]) * 4.2 + S.xS[6] * 1.5) * S.tS[6]; S.fSH[6] = S.sensH[6] * S.fWS[6];
  // AirStream14
  S.airHv[14] = S.tA[14] + (2500 + 1.93 * S.tA[14]) * S.yA[14]; S.fDA[14] = S.fDA[13];
  S.fAH[14] = S.fDA[14] * S.airHv[14]; S.fWV[14] = S.fDA[14] * S.yA[14];
  S.fVolA[14] = volAirflow(S.tA[14], S.yA[14], S.fDA[14], S.fWV[14]);
  // SludgeStream5
  S.fDS[5] = S.fDS[0]; S.tS[5] = S.dptA[16]; S.fWS[5] = S.fDS[5] / S.xS[5];
  S.sensH[5] = ((1 - S.xS[5]) * 4.2 + S.xS[5] * 1.5) * S.tS[5]; S.fSH[5] = S.sensH[5] * S.fWS[5];
  // AirStream15
  S.airHv[15] = S.tA[15] + (2500 + 1.93 * S.tA[15]) * S.yA[15];
  S.fAH[15] = S.fDA[15] * S.airHv[15]; S.fWV[15] = S.fDA[15] * S.yA[15];
  S.fVolA[15] = volAirflow(S.tA[15], S.yA[15], S.fDA[15], S.fWV[15]);
  // AirStream18 == 15
  S.yA[18] = S.yA[15]; S.tA[18] = S.tA[15]; S.dptA[18] = S.dptA[15]; S.airHv[18] = S.airHv[15];
  S.fAH[18] = S.fDA[18] * S.airHv[18]; S.fWV[18] = S.fDA[18] * S.yA[18];
  S.fVolA[18] = volAirflow(S.tA[18], S.yA[18], S.fDA[18], S.fWV[18]);
  // SludgeStream4
  S.fDS[4] = S.fDS[0]; S.fWS[4] = S.fDS[4] / S.xS[4];
  S.sensH[4] = ((1 - S.xS[4]) * 4.2 + S.xS[4] * 1.5) * S.tS[4]; S.fSH[4] = S.sensH[4] * S.fWS[4];
  // AirStream9
  S.fDA[9] = S.fDA[7]; S.dptA[9] = S.tA[9];
  S.yA[9] = goalSeek_wvRatio(S.dptA[9], 0.01 * S.dptA[9], 0.2);
  S.airHv[9] = S.tA[9] + (2500 + 1.93 * S.tA[9]) * S.yA[9];
  S.fAH[9] = S.fDA[9] * S.airHv[9]; S.fWV[9] = S.fDA[9] * S.yA[9];
  S.fVolA[9] = volAirflow(S.tA[9], S.yA[9], S.fDA[9], S.fWV[9]);
  // AirStream10
  S.fDA[10] = S.fDA[9];
  if (C.hexOpCheck === true) {
    S.yA[10] = S.yA[9]; S.dptA[10] = dptCalc(S.yA[10]);
    S.airHv[10] = (S.airHv[7] - S.airHv[8]) * (1 - C.phHLpc) + S.airHv[9];
    S.tA[10] = (S.airHv[10] - 2500 * S.yA[10]) / (1 + 1.93 * S.yA[10]);
  } else { S.tA[10] = S.tA[9]; S.yA[10] = S.yA[9]; S.dptA[10] = S.dptA[9]; S.airHv[10] = S.airHv[9]; }
  S.fAH[10] = S.fDA[10] * S.airHv[10]; S.fWV[10] = S.fDA[10] * S.yA[10];
  S.fVolA[10] = volAirflow(S.tA[10], S.yA[10], S.fDA[10], S.fWV[10]);
  // AirStream11
  S.fDA[11] = S.fDA[10] + S.fDA[17]; S.yA[11] = (S.fDA[10] * S.yA[10] + S.fDA[17] * S.yA[17]) / S.fDA[11];
  S.dptA[11] = dptCalc(S.yA[11]); S.airHv[11] = (S.fAH[10] + S.fAH[17]) / S.fDA[11];
  S.tA[11] = (S.airHv[11] - 2500 * S.yA[11]) / (1 + 1.93 * S.yA[11]);
  S.fAH[11] = S.fDA[11] * S.airHv[11]; S.fWV[11] = S.fDA[11] * S.yA[11];
  S.fVolA[11] = volAirflow(S.tA[11], S.yA[11], S.fDA[11], S.fWV[11]);
  // AirStream12
  S.fDA[12] = S.fDA[10] + S.fDA[17]; S.yA[12] = S.yA[11]; S.dptA[12] = dptCalc(S.yA[12]);
  S.airHv[12] = S.tA[12] + (2500 + 1.93 * S.tA[12]) * S.yA[12];
  S.fAH[12] = S.fDA[12] * S.airHv[12]; S.fWV[12] = S.fDA[12] * S.yA[12];
  S.fVolA[12] = volAirflow(S.tA[12], S.yA[12], S.fDA[12], S.fWV[12]);
}

function round3updateWZ(C) {
  const S = C.S;
  // AirStream0
  S.yA[0] = S.yA[7]; S.dptA[0] = dptCalc(S.yA[0]);
  S.airHv[0] = S.tA[0] + (2500 + 1.93 * S.tA[0]) * S.yA[0];
  S.fAH[0] = S.fDA[0] * S.airHv[0]; S.fWV[0] = S.fDA[0] * S.yA[0];
  S.fVolA[0] = volAirflow(S.tA[0], S.yA[0], S.fDA[0], S.fWV[0]);
  // AirStream1
  S.fDA[1] = S.fDA[0]; S.airHv[1] = S.tA[1] + (2500 + 1.93 * S.tA[1]) * S.yA[1];
  S.fAH[1] = S.fDA[1] * S.airHv[1]; S.fWV[1] = S.fDA[1] * S.yA[1];
  S.fVolA[1] = volAirflow(S.tA[1], S.yA[1], S.fDA[1], S.fWV[1]);
  // SludgeStream1
  S.fDS[1] = S.fDS[0]; S.fWS[1] = S.fDS[1] / S.xS[1];
  S.sensH[1] = ((1 - S.xS[1]) * 4.2 + S.xS[1] * 1.5) * S.tS[1]; S.fSH[1] = S.sensH[1] * S.fWS[1];
  // AirStream2
  S.fDA[2] = S.fDA[0]; S.airHv[2] = S.tA[2] + (2500 + 1.93 * S.tA[2]) * S.yA[2];
  S.fAH[2] = S.fDA[2] * S.airHv[2]; S.fWV[2] = S.fDA[2] * S.yA[2];
  S.fVolA[2] = volAirflow(S.tA[2], S.yA[2], S.fDA[2], S.fWV[2]);
  // SludgeStream2
  S.fDS[2] = S.fDS[0]; S.fWS[2] = S.fDS[2] / S.xS[2];
  S.sensH[2] = ((1 - S.xS[2]) * 4.2 + S.xS[2] * 1.5) * S.tS[2]; S.fSH[2] = S.sensH[2] * S.fWS[2];
  // AirStream3
  S.fDA[3] = S.fDA[0]; S.airHv[3] = S.tA[3] + (2500 + 1.93 * S.tA[3]) * S.yA[3];
  S.fAH[3] = S.fDA[3] * S.airHv[3]; S.fWV[3] = S.fDA[3] * S.yA[3];
  S.fVolA[3] = volAirflow(S.tA[3], S.yA[3], S.fDA[3], S.fWV[3]);
  // SludgeStream3
  S.fDS[3] = S.fDS[0]; S.fWS[3] = S.fDS[3] / S.xS[3];
  S.sensH[3] = ((1 - S.xS[3]) * 4.2 + S.xS[3] * 1.5) * S.tS[3]; S.fSH[3] = S.sensH[3] * S.fWS[3];
  // AirStream4
  S.airHv[4] = S.tA[4] + (2500 + 1.93 * S.tA[4]) * S.yA[4];
  S.fAH[4] = S.fDA[4] * S.airHv[4]; S.fWV[4] = S.fDA[4] * S.yA[4];
  S.fVolA[4] = volAirflow(S.tA[4], S.yA[4], S.fDA[4], S.fWV[4]);
  // AirStream5
  S.fDA[5] = S.fDA[4]; S.airHv[5] = S.tA[5] + (2500 + 1.93 * S.tA[5]) * S.yA[5];
  S.fAH[5] = S.fDA[5] * S.airHv[5]; S.fWV[5] = S.fDA[5] * S.yA[5];
  S.fVolA[5] = volAirflow(S.tA[5], S.yA[5], S.fDA[5], S.fWV[5]);
  // AirStream6
  S.fDA[6] = S.fDA[5] - S.fDA[7]; S.yA[6] = S.yA[5]; S.tA[6] = S.tA[5]; S.dptA[6] = S.dptA[5];
  S.airHv[6] = S.tA[6] + (2500 + 1.93 * S.tA[6]) * S.yA[6];
  S.fAH[6] = S.fDA[6] * S.airHv[6]; S.fWV[6] = S.fDA[6] * S.yA[6];
  S.fVolA[6] = volAirflow(S.tA[6], S.yA[6], S.fDA[6], S.fWV[6]);
  // AirStream7
  S.yA[7] = S.yA[5]; S.tA[7] = S.tA[5]; S.dptA[7] = S.dptA[5];
  S.airHv[7] = S.tA[7] + (2500 + 1.93 * S.tA[7]) * S.yA[7];
  S.fAH[7] = S.fDA[7] * S.airHv[7]; S.fWV[7] = S.fDA[7] * S.yA[7];
  S.fVolA[7] = volAirflow(S.tA[7], S.yA[7], S.fDA[7], S.fWV[7]);
  // AirStream8
  S.fDA[8] = S.fDA[7]; S.yA[8] = S.yA[7]; S.dptA[8] = S.dptA[7];
  if (C.hexOpCheck === true) { S.airHv[8] = S.tA[8] + (2500 + 1.93 * S.tA[8]) * S.yA[8]; }
  else { S.tA[8] = S.tA[7]; S.airHv[8] = S.airHv[7]; }
  S.fAH[8] = S.fDA[8] * S.airHv[8]; S.fWV[8] = S.fDA[8] * S.yA[8];
  S.fVolA[8] = volAirflow(S.tA[8], S.yA[8], S.fDA[8], S.fWV[8]);
  // SludgeStream4
  S.fDS[4] = S.fDS[0]; S.fWS[4] = S.fDS[4] / S.xS[4];
  S.sensH[4] = ((1 - S.xS[4]) * 4.2 + S.xS[4] * 1.5) * S.tS[4]; S.fSH[4] = S.sensH[4] * S.fWS[4];
}

// ============================================================================
//  CONDENSEUR + CHAUFFE-HUILE (heaterCondensor)
// ============================================================================
function heaterCondensor(C) {
  const S = C.S;
  // condenserCalc
  S.fW[0] = ((S.fAH[8] - S.fAH[9]) / 4.18 - (S.fWV[8] - S.fWV[9]) * S.tW[1]) / (S.tW[1] - S.tW[0]);
  S.fW[1] = S.fW[0] + (S.fWV[8] - S.fWV[9]);
  S.waterSHC[0] = 4.18 * S.tW[0]; S.waterSHC[1] = 4.18 * S.tW[1];
  S.fWH[0] = S.fW[0] * 4.18 * S.tW[0]; S.fWH[1] = 4.18 * S.fW[1] * S.tW[1];
  // hexCalc
  const sphOil = (t) => 1807 * t + 3.7 / 2 * t ** 2;
  const densOil = (t) => 979.87 - 0.6843 * t;
  S.fO[4] = (S.wzHInput + S.ezHInput) * 1000 / (sphOil(S.tO[4]) - sphOil(S.tO[5]));
  S.oilHv[4] = sphOil(S.tO[4]) / 1000; S.oilHv[5] = sphOil(S.tO[5]) / 1000;
  S.fO[5] = S.fO[4]; S.fOv[4] = S.fO[4] / densOil(S.tO[4]) * 3600; S.fOv[5] = S.fO[5] / densOil(S.tO[5]) * 3600;
  S.fOH[4] = S.fO[4] * sphOil(S.tO[4]) / 1000; S.fOH[5] = S.fO[5] * sphOil(S.tO[5]) / 1000;
  S.fO[2] = S.ezHInput * 1000 / (sphOil(S.tO[2]) - sphOil(S.tO[3]));
  S.oilHv[2] = sphOil(S.tO[2]) / 1000; S.oilHv[3] = sphOil(S.tO[3]) / 1000;
  S.fO[3] = S.fO[2]; S.fOv[2] = S.fO[2] / densOil(S.tO[2]) * 3600; S.fOv[3] = S.fO[3] / densOil(S.tO[3]) * 3600;
  S.fOH[2] = S.fO[2] * sphOil(S.tO[2]) / 1000; S.fOH[3] = S.fO[3] * sphOil(S.tO[3]) / 1000;
  S.fOv[6] = S.fOv[3] * (S.tO[2] - S.tO[3]) / (S.tO[4] - S.tO[3]); S.tO[6] = S.tO[4];
  S.fO[6] = S.fOv[6] * densOil(S.tO[6]) / 3600; S.fOH[6] = S.fO[6] * sphOil(S.tO[6]) / 1000; S.oilHv[6] = sphOil(S.tO[6]) / 1000;
  S.fO[7] = S.fO[2] - S.fO[6]; S.tO[7] = S.tO[3];
  S.fOv[7] = S.fO[7] / densOil(S.tO[7]) * 3600; S.fOH[7] = S.fO[7] * sphOil(S.tO[7]) / 1000; S.oilHv[7] = sphOil(S.tO[7]) / 1000;
  S.fO[8] = S.fO[3] - S.fO[7]; S.tO[8] = S.tO[3];
  S.fOv[8] = S.fO[8] / densOil(S.tO[8]) * 3600; S.fOH[8] = S.fO[8] * sphOil(S.tO[8]) / 1000; S.oilHv[8] = sphOil(S.tO[8]) / 1000;
  S.fO[0] = S.fO[4] - S.fO[6];
  const sph0 = sphOil(S.tO[0]);
  const c = S.wzHInput * 1000 / S.fO[0] - sph0;
  const a = 3.7 / 2, b = 1807, d = b ** 2 - 4 * a * c;
  S.tO[1] = (Math.sqrt(d) - b) / (2 * a);
  S.fOv[0] = S.fO[0] / densOil(S.tO[0]) * 3600; S.fOH[0] = S.fO[0] * sphOil(S.tO[0]) / 1000; S.oilHv[0] = sphOil(S.tO[0]) / 1000;
  S.fO[1] = S.fO[0]; S.fOv[1] = S.fO[1] / densOil(S.tO[1]) * 3600; S.fOH[1] = S.fO[1] * sphOil(S.tO[1]) / 1000; S.oilHv[1] = sphOil(S.tO[1]) / 1000;
  S.wzOilPump = S.fOv[5]; S.ezOilPump = S.fOv[2];
}

// ============================================================================
//  CHAUFFE-HUILE + BIN (toHeater) — sélection modèle chauffe
// ============================================================================
function toHeater(C, opt) {
  const S = C.S;
  S.totalHInput = (S.wzHInput + S.ezHInput) / (1 - opt.toHLpc);
  const aBTU = S.totalHInput * 3600 / 1000000 * 0.9478;   // MMBTU/h par train
  let toNoSelected = 0;
  for (let i = 0; i < HEATER_CAPACITY.length; i++) {
    if (aBTU <= HEATER_CAPACITY[i]) { toNoSelected = i; break; }
  }
  const binVol_yd3 = opt.dsgnWSF * opt.cakeRT / (1.05) / 1000 * 1.31;
  return {
    heater: {
      totalHInput_MMBTU: aBTU,
      model: HEATER_MODEL[toNoSelected],
      capacity: HEATER_CAPACITY[toNoSelected],
      wzPumpHP: WZ_PUMP_HP[toNoSelected], ezPumpHP: EZ_PUMP_HP[toNoSelected], burnerHP: BURNER_HP[toNoSelected],
      binVol_yd3,
    },
  };
}

// ============================================================================
//  VENTILATEURS (fanSummaryOutput) — calcul des puissances
// ============================================================================
function computeFans(C, opt) {
  const S = C.S;
  const a = opt.fanNo;
  const b1 = opt.vacFlow[opt.modelNoSelected] / (3.28 ** 3 * 60); // cfm -> m3/s
  const pressure = opt.hexOpCheck === true ? opt.fanPressureLoss[1] : opt.fanPressureLoss[0];
  const names = ['Ventilateur air séchage', 'Ventilateur circ. ZC', 'Ventilateur circ. ZF', 'Ventilateur vide'];
  const nFans = [1, a, a, 1];
  const opFlow = [S.fVolA[10], S.fVolA[0] / a, S.fVolA[12] / a, b1];      // m3/s
  const opPressure = [pressure, opt.fanPressureLoss[2], opt.fanPressureLoss[3], opt.vacPressure[opt.modelNoSelected] * 249.1]; // Pa
  const sfAir = opt.fanSafetyFactors[0], sfP = opt.fanSafetyFactors[1];
  const eff = opt.fanSafetyFactors[2], pf = opt.fanSafetyFactors[3];

  return names.map((name, i) => {
    const designFlow = opFlow[i] * sfAir;
    const designPressure = opPressure[i] * sfP;
    const fanCapacity_kW = designFlow * designPressure / (eff * 1000);
    const motorCapacity_kW = fanCapacity_kW * pf;
    // sélection moteur HP (INDEX/MATCH -1 : plus petit HP >= besoin)
    const needHP = motorCapacity_kW / 0.745;
    let selHP = MOTOR_LIST_HP[MOTOR_LIST_HP.length - 1];
    for (const h of MOTOR_LIST_HP) { if (h >= needHP) { selHP = h; break; } }
    const powerConsumption_kW = nFans[i] * opPressure[i] / (eff * 1000) * pf * opFlow[i];
    return {
      name, nFans: nFans[i], opFlow, operatingFlow: opFlow[i], safetyFactorAir: sfAir,
      designFlow, operatingPressure: opPressure[i], safetyFactorPressure: sfP, designPressure,
      efficiency: eff, fanCapacity_kW, powerFactor: pf, motorCapacity_kW, selectedHP: selHP,
      powerConsumption_kW,
    };
  });
}

// ============================================================================
//  EXTRACTION DES FLUX pour affichage (MH Balance)
// ============================================================================
function extractStreams(S) {
  const air = [], sludge = [];
  for (let i = 0; i <= 18; i++) {
    air.push({ id: i, fVolA: S.fVolA[i], fDA: S.fDA[i], fWV: S.fWV[i], yA: S.yA[i],
      dptA: S.dptA[i], tA: S.tA[i], airHv: S.airHv[i], fAH: S.fAH[i] });
  }
  for (let i = 0; i <= 8; i++) {
    sludge.push({ id: i, fWS: S.fWS[i], fDS: S.fDS[i], xS: S.xS[i], mc: 1 - S.xS[i],
      tS: S.tS[i], sensH: S.sensH[i], fSH: S.fSH[i] });
  }
  return { air, sludge };
}

// ============================================================================
//  DÉFAUTS — cas de référence « Seaview » (reproduit le tableur d'origine)
// ============================================================================
const DEFAULT_INPUTS = {
  prjName: "Seaview", prjNo: "5704195001",
  avgDSP: 38590, feedDS: 0.15, productDS: 0.92,
  minTrainNo: 1, dPerW: 7, hPerD: 24, sludgeTemp: 30,
  preHeaterYN: true, siteElev: 1066, cakeRT: 6, pmRemEff: 0.95, dryerPM: 300,
  userModel: "SD8315-IO", trainNoUser: 3,
  dpTemp5: 67, airTemp0: 170, airTemp12: 100,
  deltaTemp5: 50, deltaTemp17: 25,
  waterTemp0: 25, condensateTemp: 50, airTemp9: 30, airTemp8: 80,
  oilTemp0: 200, oilTemp1: 150, oilTemp2: 120, oilTemp3: 105,
  wzUnitHL: 33, ezUnitHL: 10, toHLpc: 0.05, phHLpc: 0.05,
  wzUnitBL: 10, dryerRT: 90, sludgeMC4: 0.55,
  noodleDia: [7.1, 7.1, 7.1, 7.1, 6, 6, 5, 5],
  noodleDen: [1050, 1050, 1050, 1050, 750, 750, 500, 500],
  beltOAR: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  sludgeSAR: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.15, 0.15],
  sludgeOAR: [0.25, 0.25, 0.35, 0.35, 0.45, 0.45, 0.25, 0.25],
  sludgePR: [1.0, 1.0, 1.0, 1.0, 0.3, 0.3, 0.2, 0.2],
  fanSafetyFactors: [1.1, 1.2, 0.6, 1.1],
  fanPressureLoss: [2050, 3974, 500, 500],
  vacFlow: [2030, 2399, 2561, 2729, 2904, 2960, 3144, 3328],
  vacPressure: [11.3, 11.3, 11.3, 11.3, 11.3, 11.3, 11.3, 11.3],
  maxAirV_WZ: 3.2, maxAirV_EZ: 1.6, maxEL_WZ: 38, maxEL_EZ: 10.4,
  maxEF_WZ: 256, maxEF_EZ: 15, maxBL_EZ: 44, maxBedThick: 250,
  maxNozzleLoad: 150,
};

const SCHEMA_VERSION = 1;

// Locale de formatage — pilotée par la langue courante
let LOCALE = "fr-FR";


// ============================================================================
//  UTILITAIRES D'AFFICHAGE
// ============================================================================
const fmt = (v, d = 2) => {
  if (v === undefined || v === null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2);
  return v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
};
const pct = (v, d = 1) => (v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(d)} %`);

const passLabels = (t) =>
  [1, 2, 3, 4].map((n) => `${t.passWZ} #${n}`).concat([1, 2, 3, 4].map((n) => `${t.passEZ} #${n}`));

function tempColor(tv) {
  if (tv === undefined || Number.isNaN(tv)) return "#94a3b8";
  const x = Math.max(0, Math.min(1, (tv - 20) / 160));
  const r = Math.round(37 + x * (217 - 37));
  const g = Math.round(99 + x * (119 - 99));
  const b = Math.round(235 + x * (6 - 235));
  return `rgb(${r},${g},${b})`;
}

// Permet au composant React de piloter la locale de formatage.
function setLocale(l) { LOCALE = l; }

// ============================================================================
//  SAUVEGARDE / CHARGEMENT DE PROJET
// ============================================================================
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slugify(s) {
  return String(s || "projet").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projet";
}

function saveProject(I, lang) {
  const payload = {
    format: "bioco-project", schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(), lang, inputs: I,
  };
  const name = `${slugify(I.prjName)}_${slugify(I.prjNo)}.bioco.json`;
  downloadBlob(JSON.stringify(payload, null, 2), name, "application/json");
}

// Fusionne le fichier chargé avec les défauts : tolère les champs manquants,
// rejette les types incohérents.
function parseProject(raw) {
  const data = JSON.parse(raw);
  const src = data && data.inputs ? data.inputs : data;
  if (!src || typeof src !== "object") throw new Error("shape");
  const merged = { ...DEFAULT_INPUTS };
  let matched = 0;
  for (const k of Object.keys(DEFAULT_INPUTS)) {
    if (!(k in src)) continue;
    const dv = DEFAULT_INPUTS[k], nv = src[k];
    if (Array.isArray(dv)) {
      if (Array.isArray(nv) && nv.length === dv.length && nv.every((x) => typeof x === "number" && Number.isFinite(x))) {
        merged[k] = nv.slice(); matched++;
      }
    } else if (typeof dv === "number") {
      if (typeof nv === "number" && Number.isFinite(nv)) { merged[k] = nv; matched++; }
    } else if (typeof dv === "boolean") {
      if (typeof nv === "boolean") { merged[k] = nv; matched++; }
    } else if (typeof dv === "string") {
      if (typeof nv === "string") { merged[k] = nv; matched++; }
    }
  }
  if (matched < 5) throw new Error("shape");
  return { inputs: merged, lang: data.lang === "en" || data.lang === "fr" ? data.lang : null };
}

// ============================================================================
//  RAPPORT IMPRIMABLE (HTML autonome → impression PDF navigateur)
// ============================================================================
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function tbl(head, rows, opts = {}) {
  const th = head.map((h, i) => `<th class="${i === 0 ? "l" : "r"}">${esc(h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${r.map((c, i) => {
    const cls = i === 0 ? "l" : "r";
    const flag = opts.flagCol === i && typeof c === "object" ? (c.ok ? "ok" : "bad") : "";
    const txt = typeof c === "object" ? c.text : c;
    return `<td class="${cls} ${flag}">${esc(txt)}</td>`;
  }).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function buildReportHTML(R, I, t, lang, mode, checks) {
  // Le rapport ne doit pas dépendre de l'ordre de rendu : on fixe la locale ici.
  LOCALE = lang === "fr" ? "fr-FR" : "en-GB";
  const now = new Date().toLocaleString(LOCALE);
  const PL = passLabels(t);
  const A = R.streams.air, Sl = R.streams.sludge;
  const airRow = (ids, key, d) => ids.map((i) => fmt(A[i][key], d));

  const css = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0f172a; margin:0; padding:16px; font-size:10px; }
  h1 { font-size:17px; margin:0 0 2px; letter-spacing:-.2px; }
  h2 { font-size:12px; margin:16px 0 6px; padding-bottom:3px; border-bottom:1.5px solid #0f172a; }
  h3 { font-size:10.5px; margin:10px 0 4px; color:#334155; }
  .sub { color:#64748b; font-size:10px; }
  .meta { display:flex; gap:24px; flex-wrap:wrap; margin:8px 0 4px; font-size:10px; }
  .meta div span { color:#64748b; }
  .cards { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
  .card { border:1px solid #cbd5e1; border-radius:3px; padding:5px 9px; min-width:110px; }
  .card .k { font-size:8px; text-transform:uppercase; letter-spacing:.4px; color:#64748b; }
  .card .v { font-size:13px; font-weight:600; margin-top:1px; }
  table { width:100%; border-collapse:collapse; margin:4px 0 8px; font-size:9px; }
  th, td { border:1px solid #cbd5e1; padding:2.5px 4px; }
  th { background:#e2e8f0; font-weight:600; }
  td.l, th.l { text-align:left; }
  td.r, th.r { text-align:right; font-variant-numeric:tabular-nums; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  td.ok { background:#dcfce7 !important; font-weight:600; }
  td.bad { background:#fee2e2 !important; font-weight:600; }
  .two { display:flex; gap:14px; }
  .two > div { flex:1; }
  footer { margin-top:14px; padding-top:6px; border-top:1px solid #cbd5e1; color:#64748b; font-size:8.5px; }
  .noprint { margin:0 0 14px; }
  button { font:inherit; padding:8px 16px; border-radius:4px; border:0; background:#0284c7; color:#fff; font-weight:600; cursor:pointer; }
  @media print { .noprint { display:none !important; } body { padding:0; } h2 { break-after:avoid; } table { break-inside:auto; } tr { break-inside:avoid; } }
  `;

  const cards = [
    [t.sModel, R.selection.dryerType], [t.sTrains, R.selection.trainNoSelected],
    [t.sWetPerTrain, `${fmt(R.selection.fWSperTrain, 0)} kg/h`],
    [t.sEvapTotal, `${fmt(R.energy.evapTotal, 0)} kg/h`],
    [t.sHeatInput, `${fmt(R.energy.totalHInput, 0)} kW`],
    [t.sSpecific, `${fmt(R.limits.unitBTU, 0)} BTU/lb`],
    [t.sRatio, fmt(R.energy.evapWZ / R.energy.evapEZ, 2)],
    [t.rHModel, R.heater.model],
  ].map(([k, v]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("");

  const basisRows = [
    [t.fAvgDSP, fmt(I.avgDSP, 0), t.uKgD], [t.fFeedDS, pct(I.feedDS, 0), "%"],
    [t.fProductDS, pct(I.productDS, 0), "%"], [t.fSludgeTemp, fmt(I.sludgeTemp, 0), "°C"],
    [t.fDPerW, I.dPerW, t.uDays], [t.fHPerD, I.hPerD, "h"],
    [t.fMinTrain, I.minTrainNo, "—"], [t.fSiteElev, fmt(I.siteElev, 0), "m"],
    [t.fPreheater, I.preHeaterYN ? t.onSvc : t.offSvc, "—"], [t.fCakeRT, I.cakeRT, "h"],
  ];
  const spRows = [
    [t.fDpt, I.dpTemp5, "°C"], [t.fAirT0, I.airTemp0, "°C"], [t.fDT5, I.deltaTemp5, "°C"],
    [t.fAirT12, I.airTemp12, "°C"], [t.fDT17, I.deltaTemp17, "°C"], [t.fAirT8, I.airTemp8, "°C"],
    [t.fAirT9, I.airTemp9, "°C"], [t.fMC4, pct(I.sludgeMC4, 0), "%"],
    [t.fBL, I.wzUnitBL, "kg/m²"], [t.fRT, I.dryerRT, "min"],
    [t.fWzHL, I.wzUnitHL, "kW/(t/h)"], [t.fEzHL, I.ezUnitHL, "kW/(t/h)"],
    [t.fPhHL, pct(I.phHLpc, 0), "%"], [t.fToHL, pct(I.toHLpc, 0), "%"],
  ];

  const limitRows = checks.map((c) => [c.label, c.value, c.limit, c.unit,
    { text: c.ok ? t.ok : `${t.bad} (${c.fix})`, ok: c.ok }]);

  const wzIds = [0, 1, 2, 3, 18, 4, 5, 6, 7, 8];
  const ezIds = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const airTable = (ids) => tbl(
    [t.thQuantity, ...ids.map((i) => `[${i}]`), t.thUnit],
    [
      [t.rVolFlow, ...airRow(ids, "fVolA", 2), "m³/s"],
      [t.rDryAir, ...airRow(ids, "fDA", 2), "kg/s"],
      [t.rVapour, ...airRow(ids, "fWV", 2), "kg/s"],
      [t.rAbsHum, ...airRow(ids, "yA", 3), "kg/kg"],
      [t.rDewPt, ...airRow(ids, "dptA", 1), "°C"],
      [t.rTemp, ...airRow(ids, "tA", 1), "°C"],
      [t.rEnth, ...airRow(ids, "airHv", 0), "kJ/kg"],
      [t.rEnergy, ...airRow(ids, "fAH", 0), "kW"],
    ]);

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(t.repTitle)} — ${esc(I.prjName)}</title><style>${css}</style></head><body>
<div class="noprint"><button onclick="window.print()">${esc(t.repPrint)}</button></div>

<h1>BIOCO — ${esc(t.repTitle)}</h1>
<div class="sub">${esc(t.appSub)}</div>
<div class="meta">
  <div><span>${esc(t.repProject)} :</span> <b>${esc(I.prjName)}</b></div>
  <div><span>${esc(t.repNo)} :</span> <b>${esc(I.prjNo)}</b></div>
  <div><span>${esc(t.repDate)} :</span> <b>${esc(now)}</b></div>
  <div><span>${esc(t.repMode)} :</span> <b>${esc(mode === "auto" ? t.modeAuto : t.modeUser)}</b></div>
</div>
<div class="cards">${cards}</div>

<h2>${esc(t.limitsTitle)}</h2>
${tbl([t.thCriterion, t.thValue, t.thLimit, t.thUnit, t.thState], limitRows, { flagCol: 4 })}

<h2>${esc(t.basisTitle)} &amp; ${esc(t.energyTitle)}</h2>
<div class="two">
  <div>${tbl([t.thQuantity, t.thTotal, t.thPerTrain], [
    [t.rDS, fmt(R.selection.dsgnDSF, 0), fmt(R.selection.fDSperTrain, 0)],
    [t.rWS, fmt(R.selection.dsgnWSF, 0), fmt(R.selection.fWSperTrain, 0)],
    [t.rProd, fmt(R.selection.finalWSF, 0), fmt(R.selection.fWSprodPerTrain, 0)],
    [t.rEvap, fmt(R.selection.dsgnEvapL, 0), fmt(R.selection.evapLperTrain, 0)],
  ])}</div>
  <div>${tbl([t.thItem, t.thValue, t.thUnit], [
    [t.eHexWz, fmt(R.energy.wzHInput, 0), "kW"],
    [t.eHexEz, fmt(R.energy.ezHInput, 0), "kW"],
    [t.eLossWz, fmt(R.energy.wzHeatLoss, 0), "kW"],
    [t.eLossEz, fmt(R.energy.ezHeatLoss, 0), "kW"],
    [t.eProcess, fmt(R.energy.totalHInput, 0), "kW"],
    [t.eBurner, fmt(R.energy.heaterDuty, 0), "kW"],
  ])}</div>
</div>

<h2>${esc(t.beltTitle)}</h2>
${tbl([t.thQuantity, t.cWzBelt, t.cEzTop, t.cEzBot, t.thUnit], [
    [t.rBeltW, fmt(R.belt.beltW, 2), fmt(R.belt.beltW, 2), fmt(R.belt.beltW, 2), "m"],
    [t.rBeltL, fmt(R.belt.wzBeltL / 1000, 1), fmt(R.belt.ezTopBeltL / 1000, 1), fmt(R.belt.ezBBeltL / 1000, 1), "m"],
    [t.rBeltA, fmt(R.belt.effectArea[0], 1), fmt(R.belt.effectArea[1], 1), fmt(R.belt.effectArea[2], 1), "m²"],
    [t.rBeltV, fmt(R.belt.beltSpeedTop, 1), fmt(R.belt.beltSpeedTop, 1), fmt(R.belt.beltSpeedBottom, 1), "m/h"],
    [t.rRT, fmt(R.belt.wzRT, 1), fmt(R.belt.ezRT_Top, 1), fmt(R.belt.ezRT_Bottom, 1), "min"],
    [t.rThick, fmt(R.belt.layerThickness[0], 0), fmt(R.belt.layerThickness[1], 0), fmt(R.belt.layerThickness[2], 0), "mm"],
    [t.rPoros, fmt(R.belt.porosityFactor[0], 2), fmt(R.belt.porosityFactor[1], 2), fmt(R.belt.porosityFactor[2], 2), "—"],
  ])}

<h2>${esc(t.sludgeStreams)}</h2>
${tbl([t.thQuantity, ...Sl.map((s) => `[${s.id}]`), t.thUnit], [
    [t.rWetFlow, ...Sl.map((s) => fmt(s.fWS, 2)), "kg/s"],
    [t.rDryFlow, ...Sl.map((s) => fmt(s.fDS, 3)), "kg/s"],
    [t.rDryness, ...Sl.map((s) => pct(s.xS, 0)), "%"],
    [t.rTemp, ...Sl.map((s) => fmt(s.tS, 1)), "°C"],
    [t.rEnergy, ...Sl.map((s) => fmt(s.fSH, 1)), "kW"],
  ])}

<h2>${esc(t.airWZ)}</h2>
${airTable(wzIds)}
<h2>${esc(t.airEZ)}</h2>
${airTable(ezIds)}

<h2>${esc(t.htTitle)}</h2>
${tbl([t.thQuantity, ...PL, t.thUnit], [
    [t.rPassA, ...R._raw.passArea.map((v) => fmt(v, 1)), "m²"],
    [t.rVsup, ...R._raw.velToBelt.map((v) => fmt(v, 2)), "m/s"],
    [t.rVsludge, ...R._raw.velThruSludge.map((v) => fmt(v, 2)), "m/s"],
    [t.rRe, ...R._raw.reynoldNo.map((v) => fmt(v, 0)), "—"],
    [t.rNu, ...R._raw.nusseltNo.map((v) => fmt(v, 0)), "—"],
    [t.rK, ...R._raw.heatTransferK.map((v) => fmt(v, 0)), "W/(m²·K)"],
    [t.rKA, ...R._raw.kxA.map((v) => fmt(v, 0)), "W/K"],
    [t.rSf, ...R._raw.safetyFactor.map((v) => fmt(v, 2)), "—"],
  ])}

<h2>${esc(t.fansTitle)} &amp; ${esc(t.heaterTitle)}</h2>
<div class="two">
  <div>${tbl([t.thQuantity, t.fanDry, t.fanWz, t.fanEz, t.fanVac, t.thUnit], [
    [t.rNfans, ...R.fans.map((f) => f.nFans), "—"],
    [t.rOpFlow, ...R.fans.map((f) => fmt(f.operatingFlow, 2)), "m³/s"],
    [t.rDsgnFlow, ...R.fans.map((f) => fmt(f.designFlow, 2)), "m³/s"],
    [t.rOpP, ...R.fans.map((f) => fmt(f.operatingPressure, 0)), "Pa"],
    [t.rMotHP, ...R.fans.map((f) => f.selectedHP), "HP"],
    [t.rCons, ...R.fans.map((f) => fmt(f.powerConsumption_kW, 1)), "kW"],
  ])}</div>
  <div>${tbl([t.thItem, t.thValue, t.thUnit], [
    [t.rNeed, fmt(R.heater.totalHInput_MMBTU, 2), "MMBTU/h"],
    [t.rHModel, R.heater.model, "—"],
    [t.rHCap, fmt(R.heater.capacity, 1), "MMBTU/h"],
    [t.rPumpWz, R.heater.wzPumpHP, "HP"],
    [t.rPumpEz, R.heater.ezPumpHP, "HP"],
    [t.rBurner, R.heater.burnerHP, "HP"],
    [t.rBinVol, fmt(R.heater.binVol_yd3 * 0.7646, 0), "m³"],
    [t.rCondWater, fmt(R.condenser.fW0 * 3.6, 1), "m³/h"],
  ])}</div>
</div>

<h2>${esc(t.repDesignBasis)} &amp; ${esc(t.repSetpoints)}</h2>
<div class="two">
  <div>${tbl([t.thItem, t.thValue, t.thUnit], basisRows)}</div>
  <div>${tbl([t.thItem, t.thValue, t.thUnit], spRows)}</div>
</div>

<footer>${esc(t.repGenerated)} — ${esc(now)}. ${esc(t.footer)}</footer>
<script>try{window.focus();}catch(e){}</script>
</body></html>`;
}

function openReport(html, filename, onBlocked) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  let win = null;
  try { win = window.open(url, "_blank"); } catch (e) { win = null; }
  if (!win) {
    // Pop-up bloqué (fréquent en iframe) → repli sur téléchargement
    URL.revokeObjectURL(url);
    downloadBlob(html, filename, "text/html;charset=utf-8");
    onBlocked();
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

export {
  DRYER_TYPES, DEFAULT_INPUTS, runModel,
  setLocale, fmt, pct, passLabels, tempColor,
  saveProject, parseProject, slugify,
  buildReportHTML, openReport,
};
