import express from 'express';
import { registerUser, authenticateUser } from '../services/auth.js';

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

export default router;
