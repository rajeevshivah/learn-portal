import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// Cancellation & Refund Policy. Public page (Razorpay checks it), linked from
// the footer and from every payment screen. Refunds are requested from the
// Refunds page in the student's account; email is the fallback.

export const SUPPORT_EMAIL = 'rajeev@rajeevshivah.me';
const UPDATED = '5 November 2026';

export default function RefundPolicy() {
  useEffect(() => { document.title = 'Cancellation & Refund Policy · codeWithShivah'; }, []);
  const mail = (subject) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="page container policy">
      <header className="policy-head">
        <h1>Cancellation &amp; Refund Policy</h1>
        <p className="policy-meta">
          Last updated {UPDATED}. Applies to everything bought on learn.rajeevshivah.me, run by Rajeev Shivah (codeWithShivah).
          All times are Indian Standard Time (IST).
        </p>
      </header>

      <section className="policy-glance" aria-label="Summary">
        <div className="policy-row">
          <span className="policy-k">Live program</span>
          <span>Registration is final. Not for you after Class 1? Ask within 24 hours of Class 1’s scheduled end for a full refund.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">Recorded course</span>
          <span>Ask within 72 hours of your access unlocking for a full refund.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">Payment mistakes</span>
          <span>Double payment, extra amount or a rejected UPI payment: always refunded.</span>
        </div>
        <div className="policy-row">
          <span className="policy-k">How to ask</span>
          <span>From the <Link to="/refunds">Refunds</Link> page in your account. The time you send the request decides.</span>
        </div>
      </section>

      <section>
        <h2>Live programs</h2>
        <p>Live programs are classes taught live on Google Meet, with recordings and notes added to your account after each class.</p>

        <h3>Your seat is confirmed when you register</h3>
        <p>
          Registration is final. We don’t accept cancellations before the program starts, and a refund request sent
          before Class 1 has ended isn’t accepted. Seats are limited, and every seat you take is one we close for
          someone else.
        </p>

        <h3>The first-class guarantee</h3>
        <p>
          After Class 1, if the program isn’t right for you, ask within the refund window below and we’ll refund
          the full amount you paid. You don’t need to give a reason, and it doesn’t matter whether you attended Class 1.
        </p>

        <h3>The refund window, exactly</h3>
        <ul>
          <li>
            <strong>It opens</strong> at Class 1’s scheduled end time: its start time plus its listed duration, as shown in
            the program schedule on this site.
          </li>
          <li><strong>It closes</strong> exactly 24 hours later.</li>
          <li>
            <strong>Example:</strong> Class 1 is on 6 November from 8:00 PM, listed as 90 minutes. The window runs from
            6 November, 9:30 PM to 7 November, 9:30 PM.
          </li>
          <li>If the class runs longer than listed, the scheduled end time still counts.</li>
          <li>If we move Class 1 to a new date or time, the window follows the new schedule.</li>
          <li>
            <strong>Joined late?</strong> If your seat was confirmed after Class 1, your window is 24 hours from the
            scheduled end of the first class held after your seat was confirmed.
          </li>
          <li>
            If your seat was confirmed after the last class, you’re buying the recordings, and the recorded-course rule
            below applies, counted from your confirmation time.
          </li>
        </ul>

        <h3>Single-class workshops</h3>
        <p>
          The guarantee is for programs with two or more classes. A paid workshop with a single class can’t be refunded
          after you register, unless we cancel it.
        </p>

        <h3>After the window</h3>
        <p>
          Once the window has closed, there are no refunds. If you miss a class, its recording and notes stay in your
          account for the whole program, so you can catch up any time.
        </p>

        <h3>If we change or cancel classes</h3>
        <ul>
          <li><strong>We cancel the whole program:</strong> everyone gets a full refund. You don’t need to ask.</li>
          <li><strong>We move a class:</strong> it happens at the new time, and the recording is added as usual. No refund.</li>
          <li>
            <strong>We cancel more than a quarter of the classes</strong> without making them up: you can ask for a refund
            for the classes you didn’t get, in proportion to the price.
          </li>
        </ul>
      </section>

      <section>
        <h2>Recorded courses</h2>
        <p>
          A recorded course, including class-recording packs, unlocks in full as soon as your access is confirmed. You can
          ask for a full refund within <strong>72 hours of your access unlocking</strong>, however much of it you’ve watched.
        </p>
        <ul>
          <li>For an online payment (Razorpay), the 72 hours start at the time of payment.</li>
          <li>For a direct UPI payment, they start when we approved it and your course opened, not when you sent the money.</li>
        </ul>
        <p>
          <strong>Example:</strong> your UPI payment is approved on 6 November at 11:00 AM. You can ask until
          9 November, 11:00 AM.
        </p>
        <p>After the 72 hours, refunds aren’t available.</p>
      </section>

      <section>
        <h2>Payment problems</h2>
        <p>These are refunded in full whatever the timing, as long as you report them within 30 days of the payment:</p>
        <ul>
          <li>You were charged twice for the same program or course. We refund the extra payment.</li>
          <li>You paid more than the listed price. We refund the difference.</li>
          <li>
            You paid by UPI, but we couldn’t verify the payment and rejected the request. If the money did leave your
            account, report it with the UTR, and we’ll either confirm your seat or refund you.
          </li>
          <li>
            Money was deducted but the payment failed. Razorpay usually returns these on its own within 5 to 7 working days.
            If it hasn’t, report it.
          </li>
        </ul>
      </section>

      <section>
        <h2>How to ask for a refund</h2>
        <ol>
          <li>Sign in and open <Link to="/refunds">Refunds</Link>. On a phone it’s under <strong>More</strong>; on a laptop, tap your photo at the top right.</li>
          <li>
            You’ll see everything you’ve paid for, with the exact time each refund window opens and closes. While a window is
            open, tap <strong>Request a refund</strong>.
          </li>
          <li>For a direct UPI payment, enter the UPI ID you paid from. The refund goes back there.</li>
          <li>Send it. You can follow the request on the same page, and withdraw it while it’s still waiting.</li>
        </ol>
        <p>
          For a payment problem, use <strong>Report a payment problem</strong> on the same page and tell us what happened.
        </p>

        <h3>What counts as your request time</h3>
        <ul>
          <li>The moment you send the request from the Refunds page, in IST. The page records it, and that’s the time we use.</li>
          <li>The page only lets you ask while your window is open, so you’ll always know where you stand.</li>
        </ul>

        <h3>Can’t sign in?</h3>
        <p>
          If you can’t open your account, email <a href={mail('Refund request')}>{SUPPORT_EMAIL}</a> with the subject
          <strong> Refund request: (program or course name)</strong>. Include your name, the email you sign in with, the
          program or course, and your Razorpay payment ID (starts with <code>pay_</code>) or 12-digit UPI UTR. For email
          requests, the time your email reaches us counts.
        </p>

        <h3>What doesn’t count as a request</h3>
        <ul>
          <li>Messages on WhatsApp, Instagram, YouTube or Telegram, in the class chat, on calls, or in doubt threads on this site.</li>
          <li>A request for a live program before Class 1 has ended.</li>
          <li>Requests after the window closes, even by a few minutes.</li>
        </ul>
      </section>

      <section>
        <h2>What happens next</h2>
        <ul>
          <li>We reply within 2 working days to confirm or explain.</li>
          <li>Approved refunds are processed within 5 to 7 working days.</li>
          <li>
            We refund the amount you actually paid. If you used a discount or offer price, that discounted amount is refunded.
          </li>
          <li>
            The money goes back the way you paid: card, netbanking or UPI through Razorpay, or to the same UPI ID for a
            direct UPI payment. Your bank may take a few more days to show it.
          </li>
          <li>Your access to the program or course, its recordings and notes ends when the refund is processed.</li>
        </ul>
      </section>

      <section>
        <h2>When refunds aren’t given</h2>
        <ul>
          <li>Requests sent outside the windows above.</li>
          <li>Live programs: requests sent before Class 1 has ended, and single-class workshops after registration.</li>
          <li>Accounts that shared the class link, recordings, notes or login with others. We remove access in that case, without a refund.</li>
          <li>Free programs and free courses, since nothing was paid.</li>
        </ul>
        <p>Seats and courses belong to one account and can’t be transferred to someone else.</p>
      </section>

      <section>
        <h2>Payment disputes</h2>
        <p>
          Please email us before raising a dispute or chargeback with your bank. Most issues are sorted within a day.
          If a chargeback is raised, your access is paused until it’s resolved.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>We may update this policy. The version shown on the day you paid applies to that payment.</p>
      </section>

      <footer className="policy-foot">
        <span>Ask for a refund from <Link to="/refunds">Refunds</Link>. Questions: <a href={mail('Question about refunds')}>{SUPPORT_EMAIL}</a></span>
        <Link to="/">Back to codeWithShivah</Link>
      </footer>
    </div>
  );
}

// Short line under every Pay button.
export function RefundNote({ kind = 'live', classes = 2 }) {
  const text = kind === 'course'
    ? 'Not for you? Full refund if you ask within 72 hours. '
    : classes > 1
      ? 'Not for you after Class 1? Ask within 24 hours of it ending for a full refund. '
      : 'Registration for a single-class workshop is final. ';
  return (
    <p className="refund-note">
      {text}
      <Link to="/refund-policy" target="_blank" rel="noopener">Refund policy</Link>
    </p>
  );
}
