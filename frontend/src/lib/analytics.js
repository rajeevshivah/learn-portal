// Google Analytics 4 loader.
// Reads the Measurement ID from VITE_GA_ID. If it's not set (e.g. local dev),
// nothing loads and no tracking happens — so local testing stays clean.

export function initGA() {
  const GA_ID = import.meta.env.VITE_GA_ID;
  if (!GA_ID) return;                 // no ID = no tracking (local/dev)
  if (window.__gaLoaded) return;      // guard against double-init
  window.__gaLoaded = true;

  // inject the gtag script
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
}

// Call on route changes so GA4 records page views in this single-page app.
export function trackPageView(path) {
  if (!window.gtag) return;
  window.gtag('event', 'page_view', { page_path: path });
}
