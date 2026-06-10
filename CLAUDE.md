# CLAUDE.md — 260607_Hazardous

Cours Hazardous Waste : 30 modules HTML dans `src/` (M1.html … M30.html).

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
