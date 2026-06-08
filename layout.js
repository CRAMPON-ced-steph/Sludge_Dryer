(function () {
  /* ── Sidebar HTML ──────────────────────────────────────────────────── */
  const sidebarHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">CNAM</div>
      <div class="sidebar-subtitle">Thèse de doctorat</div>
    </div>
    <ul class="nav-tree">
      <li><a href="garde.html"  class="nav-link nav-top">Page de garde</a></li>
      <li><a href="resume.html"    class="nav-link nav-top">Résumé / Abstract</a></li>
      <li><a href="preambule.html" class="nav-link nav-top">Préambule</a></li>
      <li><a href="toc.html"       class="nav-link nav-top">Table des matières</a></li>
      <li><a href="intro.html"     class="nav-link nav-top">Introduction</a></li>

      <li class="nav-section">
        <span class="nav-chapter-label">Chapitre 1</span>
        <a href="chap1.html" class="nav-link">Panorama du traitement des boues</a>
      </li>
      <li class="nav-section">
        <span class="nav-chapter-label">Chapitre 2</span>
        <a href="chap2.html" class="nav-link">Modélisation du procédé</a>
      </li>
      <li class="nav-section">
        <span class="nav-chapter-label">Chapitre 3</span>
        <a href="chap3.html" class="nav-link">Validations expérimentales</a>
      </li>
      <li class="nav-section">
        <span class="nav-chapter-label">Chapitre 4</span>
        <a href="chap4.html" class="nav-link">Réglementaire &amp; énergétique</a>
      </li>

      <li><a href="concl.html"  class="nav-link nav-top">Conclusion générale</a></li>
      <li><a href="annexe.html" class="nav-link nav-top">Annexes</a></li>
      <li><a href="biblio.html" class="nav-link nav-top">Bibliographie</a></li>
    </ul>
    <div class="sidebar-footer">
      <button class="btn-pdf" onclick="window.print()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exporter en PDF
      </button>
    </div>`;

  /* ── Inject sidebar ────────────────────────────────────────────────── */
  const sidebar = document.createElement('nav');
  sidebar.id = 'sidebar';
  sidebar.innerHTML = sidebarHTML;

  /* ── Inject hamburger button ───────────────────────────────────────── */
  const toggle = document.createElement('button');
  toggle.id = 'menu-toggle';
  toggle.setAttribute('aria-label', 'Ouvrir le menu');
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

  /* Close sidebar when clicking outside on mobile */
  document.addEventListener('click', function (e) {
    if (window.innerWidth <= 800 &&
        !sidebar.contains(e.target) &&
        e.target !== toggle) {
      sidebar.classList.remove('open');
    }
  });
})();
