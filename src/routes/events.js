import express from 'express';
import { getUpcomingEvents } from '../services/events.js';

const router = express.Router();

router.get('/api/events', async (req, res) => {
  try {
    const events = await getUpcomingEvents();
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
