import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// Shown when the Razorpay window can't load (e.g. countries Razorpay blocks).
// Edit this line to change the help text students see.
export const PAYMENT_HELP_TEXT =
  "The payment window couldn't load. If you're outside India, message us on WhatsApp or Instagram (codeWithShivah) and we'll register you manually.";

// How long to wait before offering a way out of a stuck payment window
const STUCK_AFTER_MS = 15000;

let scriptPromise = null;
let configPromise = null;

// Load Razorpay's checkout script once, only when needed
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => {
        scriptPromise = null;
        const err = new Error('stuck');
        reject(err);
      };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

// Is online payment switched on in the backend? (cached per page load)
export function getRzpConfig() {
  if (!configPromise) {
    configPromise = axios.get(`${API}/rzp/config`)
      .then(r => r.data)
      .catch(() => { configPromise = null; return { enabled: false }; });
  }
  return configPromise;
}

// Only hand Razorpay a phone number it will read correctly: a plain Indian mobile.
// Anything else (foreign numbers, typos) → leave blank so the student types it
// in Razorpay's own field with the right country code.
function cleanIndianMobile(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
  return m ? m[1] : '';
}

// Small banner on top of Razorpay's overlay, offered only if the window
// seems stuck. If the window is actually working, the student ignores it.
function showStuckBanner(onClose) {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'alert');
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'z-index:2147483647', 'background:#111827', 'color:#fff',
    'border:1px solid #4A9EFF', 'border-radius:12px', 'padding:12px 14px',
    'display:flex', 'gap:12px', 'align-items:center', 'max-width:92vw',
    'font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,.45)',
  ].join(';');

  const msg = document.createElement('span');
  msg.textContent = 'Payment window not loading?';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Close & get help';
  btn.style.cssText = 'background:#4A9EFF;color:#0a0f1e;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer;white-space:nowrap';
  btn.onclick = onClose;

  bar.appendChild(msg);
  bar.appendChild(btn);
  document.body.appendChild(bar);
  return () => bar.remove();
}

/**
 * Open Razorpay checkout and resolve once the backend has confirmed the payment.
 *   kind  : 'course' | 'event'
 *   id    : course._id / event._id
 *   extra : event form fields { phone, college, expectation }
 * Resolves with the backend reply ({ status:'active', ... }).
 * Rejects with:
 *   Error('cancelled') — student closed the window
 *   Error('stuck')     — window couldn't load; show PAYMENT_HELP_TEXT
 */
export async function payWithRazorpay({ kind, id, extra = {} }) {
  await loadRazorpay();
  const { data: order } = await axios.post(`${API}/rzp/order`, { kind, id, ...extra });

  return new Promise((resolve, reject) => {
    let settled = false;
    let removeBanner = null;
    let stuckTimer = null;

    // A working Razorpay window talks to this page via postMessage.
    // A blocked one (e.g. HTTP 406 for some countries) never does.
    let windowAlive = false;
    const onMessage = (e) => {
      if (typeof e.origin === 'string' && e.origin.endsWith('razorpay.com')) {
        windowAlive = true;
        clearTimeout(stuckTimer);
        if (removeBanner) { removeBanner(); removeBanner = null; }
      }
    };
    window.addEventListener('message', onMessage);

    const cleanup = () => {
      clearTimeout(stuckTimer);
      window.removeEventListener('message', onMessage);
      if (removeBanner) { removeBanner(); removeBanner = null; }
    };
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(v);
    };

    const contact = cleanIndianMobile(order.prefill?.contact);

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: {
        name: order.prefill?.name || '',
        email: order.prefill?.email || '',
        ...(contact ? { contact } : {}),
      },
      theme: { color: '#4A9EFF' },
      handler: async (resp) => {
        cleanup();
        try {
          const { data } = await axios.post(`${API}/rzp/verify`, resp);
          done(resolve, data);
        } catch (err) {
          done(reject, new Error(
            err.response?.data?.message ||
            'Payment received but confirmation is delayed. Refresh in a minute — access will unlock automatically.'
          ));
        }
      },
      modal: {
        ondismiss: () => done(reject, new Error('cancelled')),
      },
    });

    rzp.on('payment.failed', (r) => {
      // Razorpay keeps the window open so the student can retry another method.
      console.warn('Razorpay payment failed:', r?.error?.description);
    });

    rzp.open();

    // If the window still hasn't come alive after 15s, offer a way out.
    stuckTimer = setTimeout(() => {
      if (settled || windowAlive) return;
      removeBanner = showStuckBanner(() => {
        done(reject, new Error('stuck'));
        try { rzp.close(); } catch (e) { /* window may never have rendered */ }
      });
    }, STUCK_AFTER_MS);
  });
}
