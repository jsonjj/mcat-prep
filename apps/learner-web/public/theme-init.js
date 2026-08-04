// Set theme before first paint to avoid a flash.
//
// This lives in a same-origin file (not an inline <script>) so it satisfies the
// strict learner CSP `script-src 'self'` without needing 'unsafe-inline' or a
// build-specific hash. Loaded as a render-blocking script in <head>, it still
// runs before first paint, so the no-flash behavior is unchanged.
(function () {
  try {
    // Default to the light "Evidence Atlas" look; dark only if explicitly chosen.
    var t = localStorage.getItem('mc.theme');
    var d = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
