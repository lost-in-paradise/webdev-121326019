import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { createEvent, deleteEventById } from '../src/data/events.js';

test('AC-11: member signs up for upcoming event with free places sees "You are signed up" and 1 row in registrations', async () => {
  const email = 'ac11_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-11 Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'You are signed up');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
      [userId, event.id]
    );
    assert.strictEqual(regResult.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-12: member signs up for full event sees "This event is full" and no registration row', async () => {
  const email1 = 'ac12_org@example.com';
  const email2 = 'ac12_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const orgResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email1, hashedPassword, 'organizer']
  );
  const orgId = orgResult.rows[0].id;

  const memResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email2, hashedPassword, 'member']
  );
  const memId = memResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-12 Full Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 1,
    organizerId: orgId
  });
  // Add a registration so it's full
  await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [orgId, event.id]);

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email: email2, password: 'password123' });

    const res = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'This event is full');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
      [memId, event.id]
    );
    assert.strictEqual(regResult.rows.length, 0);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email1);
    await deleteUserByEmail(email2);
  }
});

test('AC-13: member signing up twice for same event sees "You are already signed up" and count stays 1', async () => {
  const email = 'ac13_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-13 Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    // First signup
    const res1 = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res1.status, 201);

    // Second signup
    const res2 = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error, 'You are already signed up');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1',
      [event.id]
    );
    assert.strictEqual(regResult.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-14: two different members submit sign-ups concurrently for last place', async () => {
  const email1 = 'ac14_mem1@example.com';
  const email2 = 'ac14_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const u1 = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email1, hashedPassword, 'member']
  );
  const u2 = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email2, hashedPassword, 'member']
  );

  const event = await createEvent({
    title: 'AC-14 Concurrent Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 1,
    organizerId: u1.rows[0].id
  });

  const agent1 = request.agent(app);
  const agent2 = request.agent(app);

  try {
    await agent1.post('/api/auth/login').send({ email: email1, password: 'password123' });
    await agent2.post('/api/auth/login').send({ email: email2, password: 'password123' });

    const [res1, res2] = await Promise.all([
      agent1.post(`/api/events/${event.id}/signup`),
      agent2.post(`/api/events/${event.id}/signup`)
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepStrictEqual(statuses, [201, 409]);

    const messages = [res1.body.error || res1.body.message, res2.body.error || res2.body.message];
    assert.ok(messages.includes('You are signed up'));
    assert.ok(messages.includes('This event is full'));

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1',
      [event.id]
    );
    assert.strictEqual(regResult.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email1);
    await deleteUserByEmail(email2);
  }
});

test('AC-15: member tries to sign up for event that has already started sees 400 and message', async () => {
  const email = 'ac15_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-15 Past Event',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'This event has already started');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1',
      [event.id]
    );
    assert.strictEqual(regResult.rows.length, 0);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-16: organizer or admin tries to sign up sees 403 "You do not have permission"', async () => {
  const email = 'ac16_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'organizer']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-16 Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'You do not have permission');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1',
      [event.id]
    );
    assert.strictEqual(regResult.rows.length, 0);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

after(() => {
  pool.end();
});
