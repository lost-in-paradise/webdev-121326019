import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import { findUserById } from './data/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is missing');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true }
  })
);

// Serve login assets without requireAuth
app.use('/login-assets', express.static(path.join(rootDir, 'public/login-assets')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(rootDir, 'public/login.html'));
});

// Auth API routes
app.use(authRoutes);

// requireAuth middleware
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const user = await findUserById(req.session.userId);
    if (!user) {
      return req.session.destroy(() => {
        if (req.accepts('html')) {
          return res.redirect('/login');
        }
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Event API routes
app.use(requireAuth, eventRoutes);

// Protected static files
app.use(requireAuth, express.static(path.join(rootDir, 'public')));

app.get('/events', requireAuth, (req, res) => {
  res.sendFile(path.join(rootDir, 'public/events.html'));
});

app.get('/event', requireAuth, (req, res) => {
  res.sendFile(path.join(rootDir, 'public/event.html'));
});

app.get('/event-details', requireAuth, (req, res) => {
  res.sendFile(path.join(rootDir, 'public/event-details.html'));
});

app.get('/event-signups', requireAuth, (req, res) => {
  res.sendFile(path.join(rootDir, 'public/event-signups.html'));
});

app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/events');
  }
  res.redirect('/login');
});

export { app, requireAuth };
