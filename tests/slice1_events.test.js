import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { createEvent, deleteEventById } from '../src/data/events.js';

test('AC-2: signed in user sees upcoming events with title, date, and free places', async () => {
  const email = 'ac2_user@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const eventTitle = 'AC-2 Test Singing Event';
  const startsAt = new Date(Date.now() + 3600000 * 24).toISOString();
  const event = await createEvent({
    title: eventTitle,
    startsAt,
    location: 'Studio A',
    description: 'Test description',
    capacity: 10,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.get('/api/events');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const found = res.body.events.find(e => e.id === event.id);
    assert.ok(found);
    assert.strictEqual(found.title, eventTitle);
    assert.strictEqual(found.free_places, 10);
    assert.ok(found.starts_at);
  } finally {
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-7: deleting an event row removes it from /api/events', async () => {
  const email = 'ac7_user@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const eventTitle = 'AC-7 Deletable Event';
  const startsAt = new Date(Date.now() + 3600000 * 24).toISOString();
  const event = await createEvent({
    title: eventTitle,
    startsAt,
    location: 'Studio B',
    description: 'Test description',
    capacity: 5,
    organizerId: userId
  });
  const eventId = event.id;

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    // Verify it exists in API
    let res = await agent.get('/api/events');
    assert.ok(res.body.events.some(e => e.id === eventId));

    // Delete event using saved eventId
    await deleteEventById(eventId);

    // Verify it is gone after reload / API request
    res = await agent.get('/api/events');
    assert.strictEqual(res.body.events.some(e => e.id === eventId), false);
  } finally {
    await deleteEventById(eventId);
    await deleteUserByEmail(email);
  }
});

test('AC-8: past event is missing and upcoming events are listed soonest first', async () => {
  const email = 'ac8_user@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const now = Date.now();
  const pastEvent = await createEvent({
    title: 'AC-8 Past Event',
    startsAt: new Date(now - 3600000 * 24).toISOString(),
    location: 'Studio C',
    description: 'Past',
    capacity: 10,
    organizerId: userId
  });

  const laterEvent = await createEvent({
    title: 'AC-8 Later Event',
    startsAt: new Date(now + 3600000 * 48).toISOString(),
    location: 'Studio C',
    description: 'Later',
    capacity: 10,
    organizerId: userId
  });

  const soonerEvent = await createEvent({
    title: 'AC-8 Sooner Event',
    startsAt: new Date(now + 3600000 * 12).toISOString(),
    location: 'Studio C',
    description: 'Sooner',
    capacity: 10,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.get('/api/events');
    assert.strictEqual(res.status, 200);

    const eventIds = res.body.events.map(e => e.id);
    
    // Past event should be missing
    assert.strictEqual(eventIds.includes(pastEvent.id), false);

    // Sooner should come before Later
    const soonerIdx = eventIds.indexOf(soonerEvent.id);
    const laterIdx = eventIds.indexOf(laterEvent.id);
    assert.notStrictEqual(soonerIdx, -1);
    assert.notStrictEqual(laterIdx, -1);
    assert.ok(soonerIdx < laterIdx);
  } finally {
    await deleteEventById(pastEvent.id);
    await deleteEventById(laterEvent.id);
    await deleteEventById(soonerEvent.id);
    await deleteUserByEmail(email);
  }
});

after(() => {
  pool.end();
});
