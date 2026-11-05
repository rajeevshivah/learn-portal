// File types lessons accept: documents plus code, notebooks and datasets.
// Keep in sync with the admin upload pickers (frontend/src/lib/fileTypes.js).
const LESSON_FILE_TYPES = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'zip',
  'ipynb', 'py', 'csv', 'json', 'xlsx', 'xls', 'sql',
  'js', 'jsx', 'ts', 'html', 'css', 'java', 'c', 'cpp', 'h', 'r',
];
module.exports = { LESSON_FILE_TYPES };
