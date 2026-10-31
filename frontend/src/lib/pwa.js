import { useEffect, useState } from 'react';

// ── Install-as-app support ──
// Chrome/Edge/Android fire `beforeinstallprompt` once, early. We keep it so the
// "Install the app" button can show the native prompt later. iPhones never fire
// it, so they get "Add to Home Screen" instructions instead.

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });

  // Service worker only in production builds — never during local dev.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* app works without it */ });
    });
  }
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
  const installed = typeof window !== 'undefined' && standalone();

  return {
    installed,
    isIos,
    canInstall: Boolean(deferred) && !installed,
    prompt: async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* dismissed */ }
      deferred = null;
      notify();
    },
  };
}
