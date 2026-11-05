import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// Cancellation & Refund Policy. Public page (Razorpay checks it), linked from
// the footer and from every payment screen.

export const SUPPORT_EMAIL = 'rajeev@rajeevshivah.me';
const UPDATED = '5 November 2026';

export default function RefundPolicy() {
  useEffect(() => { document.title = 'Cancellation & Refund Policy · codeWithShivah'; }, []);
  const mail = (subject) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="page container policy">
      <header className="policy-head">
        <h1>Cancellation &amp; Refund Policy</h1>
        <p className="policy-meta">Last updated {UPDATED}. Applies to everything bought on learn.rajeevshivah.me, run by Rajeev Shivah (codeWithShivah).</p>
      </header>

      <section className="policy-glance" aria-label="Summary">
        <div className="policy-row">
          <span className="policy-k">Live program</span>
          <span>Registration is final. Not for you after Class 1? Full refund if you ask within 24 hours of it ending.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">Recorded course</span>
          <span>Full refund within 3 days of buying, if you’ve opened 2 lessons or fewer.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">Payment mistakes</span>
          <span>Double payment, wrong amount or a rejected UPI payment: always refunded.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">Refund time</span>
          <span>Processed within 5 to 7 working days, back to the way you paid.</span>
        </div>
      </section>

      <section>
        <h2>Live programs</h2>
        <p>Live programs are classes taught live on Google Meet, with recordings and notes added to your account after each class.</p>
        <h3>Your seat is confirmed when you register</h3>
        <p>
          Registration is final, and we don’t refund cancellations before the program starts.
          Seats are limited, and every seat you take is one we close for someone else.
        </p>
        <h3>The first-class guarantee</h3>
        <p>
          Attend Class 1. If the program isn’t right for you, email us within <strong>24 hours after Class 1 ends</strong> and
          we’ll refund the full amount. No reasons needed. Your access ends when the refund is processed.
        </p>
        <p>
          The guarantee is for programs with two or more classes. A paid workshop with a single class can’t be refunded
          after you register, unless we cancel it.
        </p>
        <p>
          If you register after Class 1 has already happened, the 24 hours start when the first live class after your
          registration ends.
        </p>
        <h3>After that</h3>
        <p>
          Once the 24 hours have passed, there are no refunds. If you miss a class, the recording and notes stay in your
          account for the whole program, so you can catch up any time.
        </p>
        <h3>If we change or cancel classes</h3>
        <ul>
          <li><strong>We cancel the whole program:</strong> everyone gets a full refund.</li>
          <li><strong>We move a class:</strong> it happens at the new time, and the recording is added as usual. No refund.</li>
          <li><strong>We cancel more than a quarter of the classes</strong> without making them up: you get a refund for the classes you didn’t get, in proportion to the price.</li>
        </ul>
      </section>

      <section>
        <h2>Recorded courses</h2>
        <p>
          A recorded course (including class-recording packs) unlocks in full as soon as you pay. You can ask for a full refund
          within <strong>3 days of purchase</strong>, as long as you’ve opened <strong>2 lessons or fewer</strong>. After that,
          refunds aren’t available, because the whole course has been delivered.
        </p>
      </section>

      <section>
        <h2>Payment problems</h2>
        <p>These are always refunded in full, whatever the timing:</p>
        <ul>
          <li>You were charged twice for the same program or course.</li>
          <li>You paid more than the listed price.</li>
          <li>You paid by UPI, but we couldn’t verify the payment and rejected the request. If the money did leave your account, send us the UTR and we’ll either confirm your seat or refund you.</li>
          <li>Money was deducted but the payment failed. Razorpay usually returns these on its own within 5 to 7 working days. If it hasn’t, write to us.</li>
        </ul>
      </section>

      <section>
        <h2>When refunds aren’t given</h2>
        <ul>
          <li>Requests after the windows above.</li>
          <li>Accounts that shared the class link, recordings, notes or login with others. We remove access in that case, without a refund.</li>
          <li>Free programs and free courses, since nothing was paid.</li>
        </ul>
        <p>Seats and courses belong to one account and can’t be transferred to someone else.</p>
      </section>

      <section>
        <h2>How to ask for a refund</h2>
        <ol>
          <li>
            Email <a href={mail('Refund request')}>{SUPPORT_EMAIL}</a> from the email you signed in with.
          </li>
          <li>Tell us the program or course name, and the payment ID (Razorpay) or UTR (UPI).</li>
          <li>We reply within 2 working days, and process approved refunds within 5 to 7 working days.</li>
        </ol>
        <p>
          Refunds go back to the way you paid: card, netbanking or UPI through Razorpay, or to the same UPI ID for direct UPI
          payments. Your bank may take a few more days to show the money.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy. The version shown on the day you paid applies to that payment.
        </p>
      </section>

      <footer className="policy-foot">
        <span>Questions? <a href={mail('Question about refunds')}>{SUPPORT_EMAIL}</a></span>
        <Link to="/">Back to codeWithShivah</Link>
      </footer>
    </div>
  );
}

// Short line under every Pay button.
export function RefundNote({ kind = 'live', classes = 2 }) {
  const text = kind === 'course'
    ? 'Full refund within 3 days if you’ve opened 2 lessons or fewer. '
    : classes > 1
      ? 'Not for you after Class 1? Full refund if you ask within 24 hours. '
      : 'Registration for a single-class workshop is final. ';
  return (
    <p className="refund-note">
      {text}
      <Link to="/refund-policy" target="_blank" rel="noopener">Refund policy</Link>
    </p>
  );
}
