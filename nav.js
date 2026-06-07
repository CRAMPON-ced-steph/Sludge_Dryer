(function () {
  var sidebar = document.getElementById('sidebar');
  var toggle  = document.getElementById('menu-toggle');
  if (!sidebar || !toggle) return;

  toggle.addEventListener('click', function () {
    sidebar.classList.toggle('open');
  });

  document.addEventListener('click', function (e) {
    if (window.innerWidth <= 800 &&
        !sidebar.contains(e.target) &&
        e.target !== toggle) {
      sidebar.classList.remove('open');
    }
  });
})();
