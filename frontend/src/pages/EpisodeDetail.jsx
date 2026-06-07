import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

const fileIcons = {
  pdf:  '📄',
  docx: '📝',
  pptx: '📊',
  zip:  '📦',
  txt:  '📃',
};

export default function EpisodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/episodes/${id}`)
      .then(res => setEpisode(res.data))
      .catch(() => navigate('/episodes'))
      .finally(() => setLoading(false));
  }, [id]);

const handleDownload = async (file) => {
  try {
    const response = await fetch(file.url);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.label}.${file.fileType}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch {
    window.open(file.url, '_blank');
  }
};

  if (loading) return <div style={styles.loading}>Loading...</div>;
  if (!episode) return null;

  return (
    <div style={styles.page}>
      <div style={styles.content}>

        {/* Back button */}
        <button style={styles.back} onClick={() => navigate('/episodes')}>
          ← Back to all episodes
        </button>

        {/* Episode header */}
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <span style={styles.epBadge}>Episode {episode.episodeNumber}</span>
            <span style={styles.phaseBadge}>{episode.phase}</span>
            {episode.duration && <span style={styles.duration}>⏱ {episode.duration}</span>}
          </div>
          <h1 style={styles.title}>{episode.title}</h1>
          {episode.description && <p style={styles.desc}>{episode.description}</p>}

          {/* Watch on YouTube button */}
          {episode.youtubeUrl && (
            <a href={episode.youtubeUrl} target="_blank" rel="noreferrer" style={styles.ytBtn}>
              ▶ Watch on YouTube
            </a>
          )}
        </div>

        {/* Files section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            📥 Downloads
            <span style={styles.fileCount}>{episode.files?.length} files</span>
          </h2>

          {episode.files?.length === 0 ? (
            <p style={styles.noFiles}>Files will be uploaded soon. Check back after watching the video.</p>
          ) : (
            <div style={styles.fileGrid}>
              {episode.files?.map(file => (
                <div key={file._id} style={styles.fileCard}>
                  <div style={styles.fileIcon}>
                    {fileIcons[file.fileType] || '📄'}
                  </div>
                  <div style={styles.fileInfo}>
                    <p style={styles.fileLabel}>{file.label}</p>
                    <p style={styles.fileMeta}>
                      {file.fileType?.toUpperCase()}
                      {file.size && ` · ${file.size}`}
                    </p>
                  </div>
                  <button
                    style={styles.dlBtn}
                    onClick={() => handleDownload(file)}
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        {episode.tags?.length > 0 && (
          <div style={styles.tags}>
            {episode.tags.map(tag => (
              <span key={tag} style={styles.tag}>#{tag}</span>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0f1e', fontFamily: 'Arial, sans-serif' },
  loading: { color: '#6B8CAE', textAlign: 'center', paddingTop: '100px', fontFamily: 'Arial, sans-serif' },
  content: { maxWidth: '800px', margin: '0 auto', padding: '32px 24px' },
  back: { background: 'none', border: 'none', color: '#4A9EFF', cursor: 'pointer', fontSize: '14px', marginBottom: '24px', padding: 0 },
  header: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '28px', marginBottom: '24px' },
  headerTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' },
  epBadge: { background: '#1e3a5f', color: '#4A9EFF', fontSize: '13px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' },
  phaseBadge: { background: '#0F2318', color: '#4CAF7D', fontSize: '12px', padding: '4px 12px', borderRadius: '20px' },
  duration: { color: '#6B8CAE', fontSize: '13px' },
  title: { color: '#FFFFFF', fontSize: '24px', fontWeight: '700', marginBottom: '10px', lineHeight: '1.3' },
  desc: { color: '#8899AA', fontSize: '15px', lineHeight: '1.6', marginBottom: '20px' },
  ytBtn: { display: 'inline-block', background: '#FF0000', color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' },
  section: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '24px', marginBottom: '16px' },
  sectionTitle: { color: '#FFFFFF', fontSize: '18px', fontWeight: '600', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' },
  fileCount: { background: '#1e3a5f', color: '#4A9EFF', fontSize: '12px', padding: '2px 10px', borderRadius: '20px', fontWeight: '400' },
  noFiles: { color: '#4A6A8A', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  fileGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fileCard: { display: 'flex', alignItems: 'center', gap: '14px', background: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '14px 16px' },
  fileIcon: { fontSize: '24px', flexShrink: 0 },
  fileInfo: { flex: 1 },
  fileLabel: { color: '#FFFFFF', fontSize: '15px', fontWeight: '500', marginBottom: '3px' },
  fileMeta: { color: '#4A6A8A', fontSize: '12px' },
  dlBtn: { background: '#1e3a5f', color: '#4A9EFF', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', flexShrink: 0 },
  tags: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' },
  tag: { background: '#111827', color: '#4A6A8A', border: '1px solid #1e3a5f', fontSize: '12px', padding: '4px 10px', borderRadius: '20px' },
};
