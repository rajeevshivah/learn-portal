// Career goals a student can follow in the tech feed. `words` are used when the
// AI isn't available (or to match a student's own typed goal) — lower-case, matched
// as whole words in the title/summary.
const TRACKS = [
  { id: 'data-science',   label: 'Data Science & Analytics', words: ['data science', 'data scientist', 'data analyst', 'analytics', 'pandas', 'sql', 'power bi', 'tableau', 'excel', 'statistics', 'dashboard', 'kaggle'] },
  { id: 'ai-ml',          label: 'AI / ML / GenAI',         words: ['ai', 'machine learning', 'deep learning', 'llm', 'genai', 'generative ai', 'openai', 'anthropic', 'claude', 'gemini', 'gpt', 'pytorch', 'tensorflow', 'neural', 'agent', 'agents', 'hugging face', 'rag'] },
  { id: 'web',            label: 'Web Development',          words: ['javascript', 'typescript', 'react', 'next.js', 'node', 'node.js', 'frontend', 'backend', 'web', 'css', 'html', 'mern', 'express', 'vue', 'angular', 'svelte', 'django', 'flask', 'api'] },
  { id: 'mobile',         label: 'Mobile App Development',   words: ['android', 'ios', 'flutter', 'react native', 'kotlin', 'swift', 'mobile app', 'play store', 'app store'] },
  { id: 'dsa-placements', label: 'DSA & Placements',         words: ['placement', 'placements', 'hiring', 'layoffs', 'layoff', 'interview', 'campus', 'freshers', 'fresher', 'internship', 'leetcode', 'dsa', 'salary', 'tcs', 'infosys', 'wipro', 'jobs', 'recruitment'] },
  { id: 'cloud-devops',   label: 'Cloud & DevOps',           words: ['aws', 'azure', 'gcp', 'google cloud', 'cloud', 'devops', 'kubernetes', 'docker', 'terraform', 'ci/cd', 'serverless', 'linux'] },
  { id: 'cybersecurity',  label: 'Cybersecurity',            words: ['security', 'cybersecurity', 'vulnerability', 'breach', 'hack', 'hacked', 'malware', 'ransomware', 'phishing', 'cve', 'zero-day', 'ethical hacking'] },
  { id: 'data-engineering', label: 'Data Engineering',       words: ['data engineering', 'spark', 'kafka', 'airflow', 'snowflake', 'databricks', 'etl', 'data pipeline', 'warehouse', 'bigquery', 'postgres', 'mongodb', 'database'] },
  { id: 'java',           label: 'Java & Spring',            words: ['java', 'spring', 'spring boot', 'jvm', 'kotlin'] },
  { id: 'python',         label: 'Python Development',       words: ['python', 'pip', 'fastapi', 'django', 'flask', 'cpython'] },
  { id: 'blockchain',     label: 'Blockchain & Web3',        words: ['blockchain', 'web3', 'crypto', 'ethereum', 'solidity', 'bitcoin', 'smart contract'] },
  { id: 'ui-ux',          label: 'UI / UX Design',           words: ['ui', 'ux', 'figma', 'design system', 'user experience', 'designer'] },
  { id: 'game-dev',       label: 'Game Development',         words: ['game', 'gaming', 'unity', 'unreal', 'godot'] },
  { id: 'embedded-iot',   label: 'Embedded & IoT',           words: ['iot', 'embedded', 'arduino', 'raspberry pi', 'microcontroller', 'semiconductor', 'chip', 'chips'] },
  { id: 'testing',        label: 'Software Testing & QA',    words: ['testing', 'qa', 'selenium', 'playwright', 'automation testing', 'test automation', 'cypress'] },
  { id: 'startups',       label: 'Startups & Product',       words: ['startup', 'startups', 'funding', 'founder', 'product manager', 'saas', 'venture', 'ipo'] },
];
const TRACK_IDS = TRACKS.map(t => t.id);
const labelOf = (id) => TRACKS.find(t => t.id === id)?.label || id;

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRx = (w) => new RegExp(`(^|[^a-z0-9])${escapeRx(w.toLowerCase())}([^a-z0-9]|$)`, 'i');
const matchCount = (text, words) => words.reduce((n, w) => n + (wordRx(w).test(text) ? 1 : 0), 0);

// Fallback tagging without AI: up to 3 tracks with the most keyword hits.
function tracksByKeywords(text) {
  return TRACKS.map(t => ({ id: t.id, n: matchCount(text, t.words) }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.id);
}

module.exports = { TRACKS, TRACK_IDS, labelOf, tracksByKeywords, matchCount, wordRx };
