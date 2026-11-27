import express from 'express';
import { getUpcomingEvents, signUpForEvent, getEventDetails, withdrawFromEvent, createEventService, updateEventService, cancelEventService, getEventSignups, removeMemberFromEvent } from '../services/events.js';

const router = express.Router();

router.get('/api/me', (req, res) => {
  res.json({
    success: true,
    user: {
      email: req.user.email,
      role: req.user.role
    }
  });
});

router.get('/api/events', async (req, res) => {
  try {
    const events = await getUpcomingEvents();
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/api/events/:id', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const event = await getEventDetails(req.user.id, eventId);
    res.json({ success: true, event });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.post('/api/events/:id/signup', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const registration = await signUpForEvent(req.user.id, eventId);
    res.status(201).json({ success: true, message: 'You are signed up', registration });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    } else if (err.message === 'This event has already started') {
      status = 400;
      errorMessage = err.message;
    } else if (err.message === 'You are already signed up' || err.message === 'This event is full' || err.message === 'This event has been cancelled') {
      status = 409;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.delete('/api/events/:id/signup', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const result = await withdrawFromEvent(req.user.id, eventId);
    res.json({ success: true, message: result.message });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    } else if (err.message === 'This event has already started') {
      status = 400;
      errorMessage = err.message;
    } else if (err.message === 'You are not signed up') {
      status = 409;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.post('/api/events', async (req, res) => {
  try {
    const { title, starts_at, location, description, capacity } = req.body;
    const event = await createEventService(req.user.id, {
      title,
      startsAt: starts_at,
      location,
      description,
      capacity
    });
    res.status(201).json({ success: true, event });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (
      err.message === 'Limit must be at least 1' ||
      err.message === 'Title must not be empty' ||
      err.message === 'Location must not be empty' ||
      err.message === 'Description must not be empty' ||
      err.message === 'Start time must be in the future'
    ) {
      status = 400;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.put('/api/events/:id', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const { title, starts_at, location, description, capacity } = req.body;
    const event = await updateEventService(req.user.id, eventId, {
      title,
      startsAt: starts_at,
      location,
      description,
      capacity
    });
    res.json({ success: true, event });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    } else if (
      err.message === 'This event has already started' ||
      err.message === 'Limit must be at least 1' ||
      err.message === 'Title must not be empty' ||
      err.message === 'Location must not be empty' ||
      err.message === 'Description must not be empty' ||
      err.message === 'Start time must be in the future'
    ) {
      status = 400;
      errorMessage = err.message;
    } else if (
      err.message === 'Limit cannot be lower than the number of sign-ups' ||
      err.message === 'This event has been cancelled'
    ) {
      status = 409;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.post('/api/events/:id/cancel', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const event = await cancelEventService(req.user.id, eventId);
    res.json({ success: true, event });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    } else if (err.message === 'This event has already started') {
      status = 400;
      errorMessage = err.message;
    } else if (err.message === 'This event has been cancelled') {
      status = 409;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.get('/api/events/:id/signups', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ success: false, error: 'Invalid event id' });
  }
  try {
    const signups = await getEventSignups(req.user.id, eventId);
    res.json({ success: true, signups });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.delete('/api/events/:id/signups/:memberId', async (req, res) => {
  const eventId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(eventId) || !Number.isInteger(memberId)) {
    return res.status(400).json({ success: false, error: 'Invalid id' });
  }
  try {
    const result = await removeMemberFromEvent(req.user.id, eventId, memberId);
    res.json({ success: true, message: result.message });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (err.message === 'Event not found') {
      status = 404;
      errorMessage = err.message;
    } else if (err.message === 'This event has already started') {
      status = 400;
      errorMessage = err.message;
    } else if (
      err.message === 'This event has been cancelled' ||
      err.message === 'Member is not signed up'
    ) {
      status = 409;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

export default router;
