# CLAUDE.md — 260713_Sludge_Dryer_Biocon

Application **BIOCO** : outil de dimensionnement de sécheur à bande pour biosolides (type Biocon Turbo). SPA React + Vite + Tailwind CSS v4, bilingue FR/EN. Portage fidèle d'une feuille Google Sheets + Apps Script d'origine (115 fonctions : psychrométrie, bilans matière/enthalpie, goal-seek imbriqués).

Dépôt GitHub : https://github.com/CRAMPON-ced-steph/Sludge_Dryer.git

## Commandes

```bash
npm run dev       # Serveur de dev Vite avec HMR (port 8081)
npm run build     # Build de production (dist/)
npm run preview   # Prévisualisation du build
```

Pas de framework de test configuré.

## Architecture

```
index.html                   # Page racine (div#root + police Inter)
vite.config.js               # Plugins : @vitejs/plugin-react + @tailwindcss/vite
src/
  main.jsx                   # Point d'entrée : monte <BiocoDryerSizing /> dans #root
  index.css                  # @import "tailwindcss"
  Biocon.jsx                 # UI : composants (Field, Section, Stat, DataTable,
                             #   ProcessDiagram), palettes FIX_*, appli BiocoDryerSizing
  Biocon_fonction.jsx        # Moteur PUR (aucune dépendance React) : constantes des
                             #   modèles de sécheurs, psychrométrie, solveur runModel,
                             #   DEFAULT_INPUTS, formatage (fmt, pct, setLocale),
                             #   sauvegarde/chargement projet, rapport HTML imprimable
  Biocon_traduction.jsx      # STRINGS : toutes les chaînes FR/EN
```

Règles de séparation :
- `Biocon_fonction.jsx` reste **pur** (pas de React, pas de JSX) — il prend un objet `inputs` et renvoie `results` via `runModel(I, mode)` où `mode` vaut `'auto'` (pré-sélection du modèle) ou `'user'` (modèle imposé).
- Les traductions vont dans `Biocon_traduction.jsx` (objet `STRINGS.fr` / `STRINGS.en`) ; les composants reçoivent `t = STRINGS[lang]`.
- La locale de formatage des nombres se change via `setLocale()` (variable module-locale `LOCALE` dans Biocon_fonction.jsx — ne pas la réexposer en mutable).

## Style

Tout le style passe par les classes utilitaires Tailwind directement dans le JSX (palette `slate` pour la structure, `sky`/`violet` pour les modes auto/imposé, `emerald`/`rose` pour conforme/non conforme). Pas de CSS custom hors `src/index.css`.
