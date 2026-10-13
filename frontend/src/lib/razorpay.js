import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

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
      s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the payment window. Check your internet and try again.')); };
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

/**
 * Open Razorpay checkout and resolve once the backend has confirmed the payment.
 *   kind  : 'course' | 'event'
 *   id    : course._id / event._id
 *   extra : event form fields { phone, college, expectation }
 * Resolves with the backend reply ({ status:'active', ... }).
 * Rejects with Error('cancelled') if the student closes the window.
 */
export async function payWithRazorpay({ kind, id, extra = {} }) {
  await loadRazorpay();
  const { data: order } = await axios.post(`${API}/rzp/order`, { kind, id, ...extra });

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#4A9EFF' },
      handler: async (resp) => {
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
      // Razorpay keeps the window open so the student can retry;
      // we only surface the reason if they close it.
      console.warn('Razorpay payment failed:', r?.error?.description);
    });

    rzp.open();
  });
}
