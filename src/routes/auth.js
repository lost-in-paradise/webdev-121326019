import express from 'express';
import crypto from 'crypto';
import { registerUser, authenticateUser, signInWithGoogle } from '../services/auth.js';
import { getGoogleAuthUrl, getGoogleUser } from '../services/google.js';

const router = express.Router();

const KNOWN_ERRORS = new Set([
  'Wrong e-mail or password',
  'E-mail already in use',
  'Email and password are required'
]);

router.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await registerUser(email, password);
    
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
      req.session.userId = user.id;
      res.status(201).json({ success: true, redirect: '/events' });
    });
  } catch (err) {
    const msg = KNOWN_ERRORS.has(err.message) ? err.message : 'Internal server error';
    const status = KNOWN_ERRORS.has(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await authenticateUser(email, password);
    
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
      req.session.userId = user.id;
      res.json({ success: true, redirect: '/events' });
    });
  } catch (err) {
    const msg = KNOWN_ERRORS.has(err.message) ? err.message : 'Internal server error';
    const status = KNOWN_ERRORS.has(err.message) ? 401 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, redirect: '/login' });
  });
});

router.get('/auth/google', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(getGoogleAuthUrl(state));
  } catch (err) {
    res.redirect('/login?error=google_failed');
  }
});

router.get('/auth/google/callback', async (req, res) => {
  const { state, code } = req.query;
  if (!state || !req.session.oauthState || state !== req.session.oauthState) {
    delete req.session.oauthState;
    return res.redirect('/login?error=invalid_state');
  }
  delete req.session.oauthState;

  try {
    const googleUser = await getGoogleUser(code);
    const user = await signInWithGoogle(googleUser);

    req.session.regenerate((err) => {
      if (err) {
        return res.redirect('/login?error=google_failed');
      }
      req.session.userId = user.id;
      res.redirect('/events');
    });
  } catch (err) {
    if (err.message === 'Your Google address is not verified.') {
      return res.redirect('/login?error=unverified');
    }
    res.redirect('/login?error=google_failed');
  }
});

export default router;
