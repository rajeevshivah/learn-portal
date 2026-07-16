const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/courses',   require('./routes/courses'));
app.use('/api/roadmaps',  require('./routes/roadmaps'));
app.use('/api/episodes',  require('./routes/episodes'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/progress',  require('./routes/progress'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check
app.get('/', (req, res) => res.json({ message: 'Learn Portal API running' }));

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));

// Global error handler (asyncHandler forwards async errors here)
app.use((err, req, res, next) => {
  if (err.name === 'CastError')       return res.status(400).json({ message: 'Invalid id' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.code === 11000)             return res.status(409).json({ message: 'Duplicate entry' });
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
