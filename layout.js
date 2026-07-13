(function () {
  /* ── Sidebar HTML ──────────────────────────────────────────────────── */
  const sidebarHTML = `
    <div class="sidebar-header">
      <div class="sidebar-header-top">
        <div class="sidebar-logo">SD</div>
      </div>
      <div class="sidebar-subtitle">Sludge Dryer Biocon</div>
    </div>
    <ul class="nav-tree">

      <li><span class="nav-chapter-label">Modules</span></li>
      <li><a href="src/M1.html" class="nav-link">M1 — Introduction</a></li>

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
