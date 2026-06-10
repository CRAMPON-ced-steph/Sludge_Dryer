(function () {
  /* ── Sidebar HTML ──────────────────────────────────────────────────── */
  const sidebarHTML = `
    <div class="sidebar-header">
      <div class="sidebar-header-top">
        <div class="sidebar-logo">HW</div>
      </div>
      <div class="sidebar-subtitle">Hazardous Waste Courses</div>
    </div>
    <ul class="nav-tree">

      <li><span class="nav-chapter-label">Déchets dangereux</span></li>
      <li><a href="src/M1.html" class="nav-link">M1 — Les différents types de déchets</a></li>
      <li><a href="src/M2.html" class="nav-link">M2 — Collecte et traitement des déchets dangereux</a></li>
      <li><a href="src/M3.html" class="nav-link">M3 — Incinération et environnement</a></li>
      <li><a href="src/M4.html" class="nav-link">M4 — Réception, stockage et préparation</a></li>

      <li><span class="nav-chapter-label">Incinérateur</span></li>
      <li><a href="src/M5.html" class="nav-link">M5 — Combustion</a></li>
      <li><a href="src/M6.html" class="nav-link">M6 — Contrôle et fonctionnement</a></li>
      <li><a href="src/M7.html" class="nav-link">M7 — Systèmes d'alimentation</a></li>
      <li><a href="src/M8.html" class="nav-link">M8 — Épuration des fumées</a></li>
      <li><a href="src/M9.html" class="nav-link">M9 — Résidus solides et eaux usées</a></li>
      <li><a href="src/M10.html" class="nav-link">M10 — Mesure des émissions</a></li>

      <li><span class="nav-chapter-label">Chaudière et vapeur</span></li>
      <li><a href="src/M11.html" class="nav-link">M11 — Généralités chaudières</a></li>
      <li><a href="src/M12.html" class="nav-link">M12 — Chaudières de récupération</a></li>
      <li><a href="src/M13.html" class="nav-link">M13 — Sécurité chaudières</a></li>
      <li><a href="src/M14.html" class="nav-link">M14 — Traitement de l'eau</a></li>
      <li><a href="src/M15.html" class="nav-link">M15 — Turbines et alternateurs</a></li>

      <li><span class="nav-chapter-label">Électricité</span></li>
      <li><a href="src/M16.html" class="nav-link">M16 — Bases de l'électricité</a></li>
      <li><a href="src/M17.html" class="nav-link">M17 — Circuits et mesures</a></li>
      <li><a href="src/M18.html" class="nav-link">M18 — Moteurs électriques</a></li>
      <li><a href="src/M19.html" class="nav-link">M19 — Distribution électrique</a></li>
      <li><a href="src/M20.html" class="nav-link">M20 — Automatismes</a></li>

      <li><span class="nav-chapter-label">Instrumentation</span></li>
      <li><a href="src/M21.html" class="nav-link">M21 — Capteurs et mesures</a></li>
      <li><a href="src/M22.html" class="nav-link">M22 — Régulation</a></li>
      <li><a href="src/M23.html" class="nav-link">M23 — Supervision</a></li>

      <li><span class="nav-chapter-label">Sécurité et environnement</span></li>
      <li><a href="src/M24.html" class="nav-link">M24 — Sécurité industrielle</a></li>
      <li><a href="src/M25.html" class="nav-link">M25 — Risques chimiques</a></li>
      <li><a href="src/M26.html" class="nav-link">M26 — Incendie et explosion</a></li>
      <li><a href="src/M27.html" class="nav-link">M27 — Réglementation ICPE</a></li>
      <li><a href="src/M28.html" class="nav-link">M28 — Gestion des déchets ultimes</a></li>
      <li><a href="src/M29.html" class="nav-link">M29 — Impacts environnementaux</a></li>
      <li><a href="src/M30.html" class="nav-link">M30 — Bilan et perspectives</a></li>

    </ul>`;

  /* ── Inject sidebar ────────────────────────────────────────────────── */
  const sidebar = document.createElement('nav');
  sidebar.id = 'sidebar';
  sidebar.innerHTML = sidebarHTML;

  /* ── Inject hamburger button ───────────────────────────────────────── */
  const toggle = document.createElement('button');
  toggle.id = 'menu-toggle';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '&#9776;';

  /* Insert before all other body children */
  document.body.insertBefore(toggle,  document.body.firstChild);
  document.body.insertBefore(sidebar, document.body.firstChild);

  /* ── Active link ───────────────────────────────────────────────────── */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#sidebar .nav-link').forEach(function (link) {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });

  /* ── Menu toggle (mobile) ──────────────────────────────────────────── */
  toggle.addEventListener('click', function () {
    sidebar.classList.toggle('open');
    toggle.setAttribute(
      'aria-label',
      sidebar.classList.contains('open') ? 'Fermer le menu' : 'Ouvrir le menu'
    );
  });

  document.addEventListener('click', function (e) {
    if (window.innerWidth <= 800 &&
        !sidebar.contains(e.target) &&
        e.target !== toggle) {
      sidebar.classList.remove('open');
    }
  });
})();
