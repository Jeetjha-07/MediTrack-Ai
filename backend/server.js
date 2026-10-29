require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./src/config/db');
const api = require('./src/routes/api');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  name: 'meditrack.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }
}));
app.use(morgan('dev'));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/api/health', (req,res) => res.json({ ok:true, app:'MediTrack AI' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Unexpected server error.' });
});
const port = Number(process.env.PORT || 4000);
connectDB().then(() => app.listen(port, () => console.log(`MediTrack AI running at http://localhost:${port}`))).catch(err => {
  console.error('Could not start application:', err.message);
  process.exit(1);
});
