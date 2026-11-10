// Startup only: one owner for cleanup, no replay listeners or minimum animation duration.
(function () {
  var splash = document.getElementById('app-splash');
  var launch = window.__tingyuLaunch || {};
  var hiding = false, fading = false, timer, removal;
  function finish() {
    clearTimeout(timer); clearTimeout(removal);
    if (splash) splash.remove();
    splash = null;
  }
  window.__tingyuFinishSplash = finish;
  // Also used when a cold deep link opens the web stage, which cannot fade with its cover.
  window.__tingyuFadeSplash = function () {
    if (!splash || fading) return;
    fading = true;
    clearTimeout(timer);
    var reduced = launch.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { finish(); return; }
    splash.classList.add('is-hiding');
    splash.addEventListener('transitionend', function (event) {
      if (event.target === splash && event.propertyName === 'opacity') finish();
    });
    removal = setTimeout(finish, 320);
  };
  window.__tingyuHideSplash = function () {
    if (!splash || hiding) return;
    hiding = true;
    if (launch.show && launch.native && window.TingyuLaunch) {
      // Native fades the retained WebView over the prepared Compose page, then calls finish.
      window.TingyuLaunch.ready();
      return;
    }
    window.__tingyuFadeSplash();
  };
  // Transparent OBS/wallpaper entrances and warm Android documents never show branding.
  var params = new URLSearchParams(location.search);
  if (launch.show === false || params.get('obs') === '1' || location.pathname === '/obs' || params.get('splash') === '0') {
    finish();
    if (launch.native && window.TingyuLaunch) window.TingyuLaunch.ready();
    return;
  }
  // Failure guard only; it does not hold a successful launch for twelve seconds.
  timer = setTimeout(function () {
    if (!splash || (hiding && !launch.native)) return;
    splash.innerHTML = '<div class="center"><div class="brand">启动超时</div><button type="button">点击重新加载</button></div>';
    splash.querySelector('button').addEventListener('click', function () { location.reload(); });
  }, 12000);
})();
