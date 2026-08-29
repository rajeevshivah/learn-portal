import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function SettingsTab() {
  const [form, setForm] = useState({ upiId: '', upiName: '', paymentNote: '' });
  const [qrUrl, setQrUrl] = useState('');          // uploaded custom QR (overrides generated)
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  useEffect(() => {
    axios.get(`${API}/settings`).then(({ data }) => {
      setForm({ upiId: data.upiId || '', upiName: data.upiName || '', paymentNote: data.paymentNote || '' });
      setQrUrl(data.paymentQrUrl || '');
    }).catch(() => setToast('Could not load settings'));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await axios.put(`${API}/settings`, form);
      setToast('Settings saved');
    } catch (err) {
      setToast(err.response?.data?.message || 'Save failed');
    } finally { setBusy(false); }
  };

  const uploadQr = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setToast('Please choose an image file'); return; }
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/settings/payment-qr`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQrUrl(data.paymentQrUrl || '');
      setToast('QR uploaded ✓ — students will now see your own QR');
    } catch (err) {
      setToast(err.response?.data?.message || 'QR upload failed');
    } finally { setUploadingQr(false); }
  };

  const removeQr = async () => {
    if (!window.confirm('Remove your uploaded QR? Students will see the auto-generated QR instead.')) return;
    try {
      const { data } = await axios.delete(`${API}/settings/payment-qr`);
      setQrUrl(data.paymentQrUrl || '');
      setToast('Custom QR removed — using generated QR now');
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not remove QR');
    }
  };

  const testLink = form.upiId
    ? `upi://pay?pa=${encodeURIComponent(form.upiId)}&pn=${encodeURIComponent(form.upiName || 'codeWithShivah')}&am=1&cu=INR&tn=Test`
    : '';

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>UPI payment settings</h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Students pay directly to this UPI ID. If you upload your own QR below, students see that;
          otherwise a QR is generated automatically from your UPI ID.
        </p>

        <div className="field"><label className="label">UPI ID *</label>
          <input className="input" value={form.upiId} onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} placeholder="yourname@okaxis" /></div>
        <div className="field"><label className="label">Display name (shown in UPI apps)</label>
          <input className="input" value={form.upiName} onChange={e => setForm(f => ({ ...f, upiName: e.target.value }))} placeholder="codeWithShivah" /></div>
        <div className="field"><label className="label">Note shown on payment page</label>
          <textarea className="textarea" value={form.paymentNote} onChange={e => setForm(f => ({ ...f, paymentNote: e.target.value }))} /></div>

        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>

      {/* ── Custom QR upload ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Your own payment QR (recommended)</h2>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Upload the QR from your PhonePe / Google Pay / bank app. Your own QR works reliably across
          every UPI app — the auto-generated one can fail for some users. When set, this replaces the
          generated QR everywhere students pay. Students still enter the amount themselves.
        </p>

        {qrUrl ? (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div className="qr-box" style={{ display: 'inline-block' }}>
              <img src={qrUrl} alt="Payment QR" style={{ width: 200, height: 200, objectFit: 'contain', display: 'block' }} />
            </div>
            <p className="small" style={{ color: 'var(--success)', marginTop: 10 }}>✓ Your QR is live for all payments</p>
          </div>
        ) : (
          <p className="small muted" style={{ marginBottom: 14 }}>No custom QR uploaded — using the generated QR.</p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
            {uploadingQr ? 'Uploading…' : (qrUrl ? 'Replace QR' : 'Upload QR image')}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingQr}
              onChange={e => uploadQr(e.target.files[0])} />
          </label>
          {qrUrl && <button className="btn btn-ghost btn-sm" onClick={removeQr}>Remove custom QR</button>}
        </div>
      </div>

      {testLink && !qrUrl && (
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <p className="small muted" style={{ marginBottom: 12 }}>Test QR (₹1) — scan with your own UPI app to verify the ID is correct before going live</p>
          <div className="qr-box"><QRCodeSVG value={testLink} size={150} level="M" /></div>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
