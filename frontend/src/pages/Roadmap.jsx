import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const SITE = 'https://learn.rajeevshivah.me';

export default function Roadmap() {
  const { slug } = useParams();
  const [data, setData]       = useState(null);
  const [promos, setPromos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    axios.get(`${API}/roadmaps/public/${slug}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.message || 'Roadmap not found'))
      .finally(() => setLoading(false));

    // Featured promotions for this page (course/webinar). Independent call —
    // if it fails or is empty, the page still works with its static funnel.
    axios.get(`${API}/promotions/public/for-roadmap/${slug}`)
      .then(r => setPromos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPromos([]));
  }, [slug]);

  const handleDownload = async () => {
    // count the download (fire and forget)
    axios.post(`${API}/roadmaps/public/${slug}/download`).catch(() => {});
    const filename = `${data.title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')}-Roadmap.pdf`;
    try {
      const response = await fetch(data.pdfUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(data.pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const fmtDate = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  };

  if (loading) return <div style={s.page}><p style={s.muted}>Loading...</p></div>;

  if (error) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brand}><span style={{color:'#4A9EFF',fontWeight:700}}>codeWith</span><span style={{color:'#fff',fontWeight:700}}>Shivah</span></div>
        <h1 style={s.title}>Roadmap unavailable</h1>
        <p style={s.muted}>{error}</p>
        <a href={`${SITE}/courses`} style={s.ghostBtn}>Browse courses →</a>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes promoPulse {
        0%   { box-shadow: 0 0 0 0 rgba(255,77,77,0.6); }
        70%  { box-shadow: 0 0 0 8px rgba(255,77,77,0); }
        100% { box-shadow: 0 0 0 0 rgba(255,77,77,0); }
      }`}</style>
      {/* HERO — the magnet */}
      <div style={s.hero}>
        <div style={s.brand}><span style={{color:'#4A9EFF',fontWeight:700}}>codeWith</span><span style={{color:'#fff',fontWeight:700}}>Shivah</span></div>
        <span style={s.tag}>FREE ROADMAP</span>
        <h1 style={s.title}>{data.title}</h1>
        {data.description && <p style={s.desc}>{data.description}</p>}
        <button onClick={handleDownload} style={s.downloadBtn}>⬇ Download the PDF</button>
        <p style={s.subtle}>No signup needed — yours to keep.</p>
      </div>

      {/* FEATURED PROMOTIONS — what's live right now (admin-controlled) */}
      {promos.length > 0 && (
        <div style={s.promoWrap}>
          <h2 style={s.promoHeading}>
            {promos.some(p => p.kind === 'event')
              ? <><span style={s.pulseDot} /> HAPPENING NOW</>
              : <>✨ FEATURED FOR YOU</>}
          </h2>
          <div style={s.promoList}>
            {promos.map(p => (
              <a key={p.id} href={`${SITE}${p.href}`} style={s.promoCard}
                 onMouseEnter={e => { e.currentTarget.style.borderColor = '#4A9EFF'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                 onMouseLeave={e => { e.currentTarget.style.borderColor = '#24304F'; e.currentTarget.style.transform = 'none'; }}>
                <div style={s.promoThumbWrap}>
                  {p.thumbnail
                    ? <img src={p.thumbnail} alt="" style={s.promoThumb} />
                    : <div style={{...s.promoThumb, ...s.promoThumbFallback}}>{p.kind === 'event' ? '🎥' : '📚'}</div>}
                  {p.kind === 'event' && <span style={s.promoRibbon}>● LIVE</span>}
                </div>
                <div style={s.promoBody}>
                  <div style={s.promoKind}>
                    {p.kind === 'event' ? 'LIVE WEBINAR' : 'COURSE'}
                    {p.kind === 'event' && p.startsAt && <span style={s.promoWhen}> · {fmtDate(p.startsAt)}</span>}
                  </div>
                  <h3 style={s.promoTitle}>{p.headline}</h3>
                  {p.subtext && <p style={s.promoText}>{p.subtext}</p>}
                  <span style={s.promoCtaRow}>
                    <span style={s.promoCta}>{p.ctaLabel} →</span>
                    {p.isPaid
                      ? <span style={s.promoPrice}>₹{p.price}</span>
                      : <span style={s.promoFree}>FREE</span>}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* FUNNEL — static fallback / always-on context */}
      <div style={s.funnel}>
        <h2 style={s.funnelTitle}>While you're here…</h2>
        <p style={s.funnelLead}>
          This roadmap is just the map. The full journey — structured episodes, notes, code
          and resources — lives inside the learning portal.
        </p>

        <div style={s.cards}>
          <div style={s.fcard}>
            <div style={s.ficon}>📚</div>
            <h3 style={s.fcardTitle}>Structured courses</h3>
            <p style={s.fcardText}>Episode-by-episode paths from basics to job-ready, organized by phase.</p>
          </div>
          <div style={s.fcard}>
            <div style={s.ficon}>📝</div>
            <h3 style={s.fcardTitle}>Notes &amp; resources</h3>
            <p style={s.fcardText}>Downloadable PDFs, practice tasks and code for every lesson.</p>
          </div>
          <div style={s.fcard}>
            <div style={s.ficon}>📈</div>
            <h3 style={s.fcardTitle}>Track your progress</h3>
            <p style={s.fcardText}>Join a course, mark lessons done, and see how far you've come.</p>
          </div>
        </div>

        {/* primary CTA */}
        {data.course ? (
          <a href={`${SITE}/courses/${data.course.slug}`} style={s.ctaBtn}>
            Explore the {data.course.title} course →
          </a>
        ) : (
          <a href={`${SITE}/courses`} style={s.ctaBtn}>
            Explore all courses →
          </a>
        )}
        <p style={s.subtle}>Free to start. Sign in with Google.</p>
      </div>

      <p style={s.footer}>learn.rajeevshivah.me · codeWithShivah</p>
    </div>
  );
}

const s = {
  page: { minHeight:'100vh', background:'#0a0f1e', fontFamily:'Arial, sans-serif', color:'#fff' },
  brand: { fontSize:'18px', marginBottom:'24px' },
  hero: { maxWidth:'620px', margin:'0 auto', padding:'56px 24px 40px', textAlign:'center' },
  tag: { display:'inline-block', background:'#0F2318', color:'#4CAF7D', fontSize:'12px', fontWeight:700, letterSpacing:'1px', padding:'5px 14px', borderRadius:'20px', marginBottom:'18px' },
  title: { fontSize:'32px', fontWeight:800, marginBottom:'14px', lineHeight:1.2 },
  desc: { color:'#8899AA', fontSize:'16px', lineHeight:1.6, marginBottom:'28px' },
  downloadBtn: { background:'#4A9EFF', color:'#fff', border:'none', padding:'15px 34px', borderRadius:'12px', fontSize:'17px', fontWeight:700, cursor:'pointer' },
  subtle: { color:'#4A6A8A', fontSize:'13px', marginTop:'12px' },

  // Promotions
  promoWrap: { maxWidth:'640px', margin:'0 auto', padding:'8px 24px 8px' },
  promoHeading: { display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', fontSize:'13px', fontWeight:800, color:'#FF7A7A', textAlign:'center', letterSpacing:'1.5px', marginBottom:'18px' },
  pulseDot: { display:'inline-block', width:'9px', height:'9px', borderRadius:'50%', background:'#FF4D4D', boxShadow:'0 0 0 0 rgba(255,77,77,0.6)', animation:'promoPulse 1.6s infinite' },
  promoList: { display:'flex', flexDirection:'column', gap:'14px' },
  promoCard: { display:'flex', gap:'16px', background:'linear-gradient(135deg, #141d33, #0f1626)', border:'1px solid #24304F', borderRadius:'16px', padding:'16px', textDecoration:'none', alignItems:'stretch', transition:'border-color .2s, transform .2s', boxShadow:'0 4px 18px rgba(0,0,0,0.25)' },
  promoThumbWrap: { position:'relative', flexShrink:0 },
  promoThumb: { width:'132px', height:'99px', borderRadius:'12px', objectFit:'cover', display:'block' },
  promoThumbFallback: { display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px', background:'radial-gradient(120px 80px at 50% 0%, #14335a, #0d2036)' },
  promoRibbon: { position:'absolute', top:'8px', left:'8px', display:'inline-flex', alignItems:'center', gap:'4px', background:'rgba(255,45,45,0.92)', color:'#fff', fontSize:'10px', fontWeight:800, letterSpacing:'0.5px', padding:'3px 8px', borderRadius:'6px' },
  promoBody: { flex:1, minWidth:0, display:'flex', flexDirection:'column' },
  promoKind: { fontSize:'11px', fontWeight:700, color:'#4A9EFF', letterSpacing:'0.5px' },
  promoWhen: { color:'#8899AA', fontWeight:600 },
  promoTitle: { fontSize:'18px', fontWeight:700, color:'#fff', margin:'5px 0 6px', lineHeight:1.25, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
  promoText: { fontSize:'13px', color:'#8899AA', lineHeight:1.45, margin:'0 0 12px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
  promoCtaRow: { display:'flex', alignItems:'center', gap:'10px', marginTop:'auto' },
  promoCta: { fontSize:'14px', fontWeight:700, color:'#4CAF7D' },
  promoPrice: { background:'rgba(255,159,69,0.14)', color:'#FF9F45', fontSize:'13px', fontWeight:800, padding:'3px 10px', borderRadius:'999px' },
  promoFree: { background:'rgba(76,175,125,0.14)', color:'#4CAF7D', fontSize:'13px', fontWeight:800, padding:'3px 10px', borderRadius:'999px' },

  funnel: { background:'#0c1424', borderTop:'1px solid #1e3a5f', padding:'48px 24px', marginTop:'24px' },
  funnelTitle: { fontSize:'22px', fontWeight:700, textAlign:'center', marginBottom:'10px' },
  funnelLead: { color:'#8899AA', fontSize:'15px', lineHeight:1.6, textAlign:'center', maxWidth:'560px', margin:'0 auto 36px' },
  cards: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'16px', maxWidth:'760px', margin:'0 auto 36px' },
  fcard: { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'12px', padding:'22px', textAlign:'center' },
  ficon: { fontSize:'28px', marginBottom:'10px' },
  fcardTitle: { fontSize:'16px', fontWeight:600, marginBottom:'8px' },
  fcardText: { color:'#6B8CAE', fontSize:'13px', lineHeight:1.5 },
  ctaBtn: { display:'block', maxWidth:'420px', margin:'0 auto', background:'#4A9EFF', color:'#fff', textDecoration:'none', padding:'15px', borderRadius:'12px', fontSize:'16px', fontWeight:700, textAlign:'center' },
  ghostBtn: { display:'inline-block', color:'#4A9EFF', textDecoration:'none', marginTop:'14px', fontSize:'14px' },
  card: { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'16px', padding:'40px', maxWidth:'460px', margin:'80px auto', textAlign:'center' },
  muted: { color:'#6B8CAE', fontSize:'14px', textAlign:'center', paddingTop:'40px' },
  footer: { color:'#4A6A8A', fontSize:'12px', textAlign:'center', padding:'28px' },
};
