// File types a lesson accepts (keep in sync with backend/config/fileTypes.js)
export const LESSON_FILE_TYPES = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'zip',
  'ipynb', 'py', 'csv', 'json', 'xlsx', 'xls', 'sql',
  'js', 'jsx', 'ts', 'html', 'css', 'java', 'c', 'cpp', 'h', 'r',
];
export const LESSON_ACCEPT = LESSON_FILE_TYPES.map(t => `.${t}`).join(',');

// What a student sees next to each file
const KIND = {
  pdf: 'PDF', doc: 'Word', docx: 'Word', ppt: 'Slides', pptx: 'Slides', txt: 'Text', md: 'Text', zip: 'ZIP',
  ipynb: 'Notebook', py: 'Python', csv: 'Data', json: 'Data', xlsx: 'Excel', xls: 'Excel', sql: 'SQL',
  js: 'Code', jsx: 'Code', ts: 'Code', html: 'Code', css: 'Code', java: 'Code', c: 'Code', cpp: 'Code', h: 'Code', r: 'Code',
};
export const fileExt = (f) => String(f.originalName || f.fileType || '').split('.').pop().toLowerCase();
export const fileKind = (f) => KIND[fileExt(f)] || 'File';

export const LINK_ACTION = { colab: 'Open in Colab', github: 'Open on GitHub', drive: 'Open in Drive', kaggle: 'Open on Kaggle', link: 'Open link' };
export const LINK_KIND = { colab: 'Colab', github: 'GitHub', drive: 'Drive', kaggle: 'Kaggle', link: 'Link' };
