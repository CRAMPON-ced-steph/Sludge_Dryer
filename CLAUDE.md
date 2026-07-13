# CLAUDE.md — 260713_Sludge_Dryer_Biocon

Cours Sludge Dryer Biocon (séchage des boues) : modules HTML dans `src/` (M1.html, M2.html, …).

Projet basé sur la même ossature que le cours Hazardous Waste : `index.html` (page d'accueil + sidebar), `layout.js` (sidebar injectée dans les modules), `nav.js`, `styles.css`, `src/garde.html` (page de garde), `src/toc.html` (sommaire). Les sources LaTeX éventuelles vont dans `tex/FR/` et sont converties via `convertAllTexToHtml.js` ou `convert_latex_to_html.py` ; les images vont dans `images/M<n>/`.

Pour ajouter un module : créer `src/M<n>.html` sur le modèle de `src/M1.html`, puis mettre à jour les listes de modules dans `index.html`, `layout.js` et `src/toc.html`.

Dépôt GitHub : https://github.com/CRAMPON-ced-steph/Sludge_Dryer.git

## Style des tableaux

Tout tableau généré dans ce projet doit utiliser la présentation suivante, identique aux tableaux existants dans `src/M1.html` :

```html
<div class="table-container">
  <table>
    <thead>
      <tr>
        <th>Colonne 1</th>
        <th>Colonne 2</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Valeur</td>
        <td>Valeur</td>
      </tr>
    </tbody>
  </table>
</div>
```

Le CSS de `src/M*.html` définit le rendu :
- En-têtes (`th`) : gradient violet `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`, texte blanc
- Cellules (`td`) : fond blanc, bordure basse `#ddd`, padding 15px
- Hover sur les lignes : fond `#f5f5f5`
- Ombre portée sur le tableau : `box-shadow: 0 2px 8px rgba(0,0,0,0.1)`

Ne jamais utiliser de styles inline sur les `<th>` ou `<td>` — tout passe par les classes CSS existantes.
