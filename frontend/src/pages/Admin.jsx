import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import PaymentsTab from './admin/PaymentsTab';
import CoursesTab  from './admin/CoursesTab';
import EpisodesTab from './admin/EpisodesTab';
import StudentsTab from './admin/StudentsTab';
import TechTab from './admin/TechTab';
import SettingsTab from './admin/SettingsTab';
import DoubtsTab   from './admin/DoubtsTab';
import EventsTab   from './admin/EventsTab';
import PollsTab    from './admin/PollsTab';
import TodayTab    from './admin/TodayTab';
import RefundsTab  from './admin/RefundsTab';

const API = import.meta.env.VITE_API_URL;

const TABS = [
  { id: 'today',    label: 'Today' },
  { id: 'payments', label: 'Payments' },
  { id: 'refunds',  label: 'Refunds' },
  { id: 'courses',  label: 'Courses' },
  { id: 'episodes', label: 'Episodes' },
  { id: 'events',   label: 'Live & Workshops' },
  { id: 'polls',    label: 'Polls & Ideas' },
  { id: 'doubts',   label: 'Doubts' },
  { id: 'students', label: 'Students' },
  { id: 'tech',     label: 'Tech feed' },
  { id: 'settings', label: 'Settings' },
];

export default function Admin() {
  const navigate = useNavigate();
  // Tab lives in the URL (?tab=events) so refresh and the back button keep your place.
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'today';
  const setTab = (id) => setParams(id === 'today' ? {} : { tab: id });
  const [pendingCount, setPendingCount] = useState(0);
  const [doubtCount, setDoubtCount] = useState(0);
  const [eventPendingCount, setEventPendingCount] = useState(0);
  const [refundCount, setRefundCount] = useState(0);
  const refreshRefunds = () => {
    axios.get(`${API}/refunds/admin`, { params: { status: 'open' } })
      .then(({ data }) => setRefundCount(data.length))
      .catch(() => {});
  };

  const refreshPending = () => {
    axios.get(`${API}/payments/pending`)
      .then(({ data }) => setPendingCount(data.length))
      .catch(() => {});
  };
  const refreshDoubts = () => {
    axios.get(`${API}/questions/unanswered`)
      .then(({ data }) => setDoubtCount(data.length))
      .catch(() => {});
  };

  const refreshEventPending = () => {
    axios.get(`${API}/events/admin/pending`)
      .then(({ data }) => setEventPendingCount(data.length))
      .catch(() => {});
  };

  useEffect(() => { refreshPending(); refreshDoubts(); refreshEventPending(); refreshRefunds(); }, []);

  return (
    <div className="page">
      <div className="container section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Admin panel</h1>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/roadmaps')}>Roadmaps &amp; Promotions</button>
        </div>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'today' && pendingCount + eventPendingCount + doubtCount + refundCount > 0 && <span className="tab-count">{pendingCount + eventPendingCount + doubtCount + refundCount}</span>}
              {t.id === 'refunds' && refundCount > 0 && <span className="tab-count">{refundCount}</span>}
              {t.id === 'payments' && pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
              {t.id === 'doubts' && doubtCount > 0 && <span className="tab-count">{doubtCount}</span>}
              {t.id === 'events' && eventPendingCount > 0 && <span className="tab-count">{eventPendingCount}</span>}
            </button>
          ))}
        </div>

        {tab === 'today'    && <TodayTab goTo={setTab} onChange={() => { refreshPending(); refreshEventPending(); refreshDoubts(); refreshRefunds(); }} />}
        {tab === 'refunds'  && <RefundsTab onChange={refreshRefunds} />}
        {tab === 'payments' && <PaymentsTab onChange={refreshPending} />}
        {tab === 'courses'  && <CoursesTab />}
        {tab === 'episodes' && <EpisodesTab />}
        {tab === 'events'   && <EventsTab onChange={refreshEventPending} />}
        {tab === 'polls'    && <PollsTab />}
        {tab === 'doubts'   && <DoubtsTab onChange={refreshDoubts} />}
        {tab === 'students' && <StudentsTab />}
        {tab === 'tech'     && <TechTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
