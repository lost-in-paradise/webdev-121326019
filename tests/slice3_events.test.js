import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { createEvent, deleteEventById } from '../src/data/events.js';

test('AC-17: member opening event details sees title, date, time, location, description, free places, and registration status', async () => {
  const email = 'ac17_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const startsAt = new Date(Date.now() + 3600000 * 24).toISOString();
  const event = await createEvent({
    title: 'AC-17 Event',
    startsAt,
    location: 'Studio A',
    description: 'Test Description',
    capacity: 5,
    organizerId: userId
  });

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.get(`/api/events/${event.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.event.title, 'AC-17 Event');
    assert.strictEqual(res.body.event.location, 'Studio A');
    assert.strictEqual(res.body.event.description, 'Test Description');
    assert.strictEqual(res.body.event.capacity, 5);
    assert.strictEqual(res.body.event.free_places, 5);
    assert.strictEqual(res.body.event.is_registered, false);
  } finally {
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-18: member who withdraws from upcoming event sees "You have withdrawn", row removed from registrations, free places increase by 1', async () => {
  const email = 'ac18_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-18 Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  // Sign up first
  await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [userId, event.id]);

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.delete(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'You have withdrawn');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
      [userId, event.id]
    );
    assert.strictEqual(regResult.rows.length, 0);

    const eventRes = await agent.get(`/api/events/${event.id}`);
    assert.strictEqual(eventRes.body.event.free_places, 5);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email);
  }
});

test('AC-19: member tries to withdraw from an event that has already started sees 400 and message, row stays in registrations', async () => {
  const email = 'ac19_member@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'member']
  );
  const userId = userResult.rows[0].id;

  const event = await createEvent({
    title: 'AC-19 Past Event',
    startsAt: new Date(Date.now() - 3600000).toISOString(), // in the past
    location: 'Studio A',
    description: 'Desc',
    capacity: 5,
    organizerId: userId
  });

  await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [userId, event.id]);

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const res = await agent.delete(`/api/events/${event.id}/signup`);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'This event has already started');

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

test('AC-20: withdraw from full event increases free places to 1, checked via GET /api/events/:id before/after withdrawal, then another member signs up', async () => {
  const email1 = 'ac20_mem1@example.com';
  const email2 = 'ac20_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const u1 = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email1, hashedPassword, 'member']
  );
  const u2 = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email2, hashedPassword, 'member']
  );
  const id1 = u1.rows[0].id;
  const id2 = u2.rows[0].id;

  const event = await createEvent({
    title: 'AC-20 Event',
    startsAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    location: 'Studio A',
    description: 'Desc',
    capacity: 1,
    organizerId: id1
  });

  // Member 1 signs up, making it full
  await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [id1, event.id]);

  const agent1 = request.agent(app);
  const agent2 = request.agent(app);

  try {
    await agent1.post('/api/auth/login').send({ email: email1, password: 'password123' });
    await agent2.post('/api/auth/login').send({ email: email2, password: 'password123' });

    // Check free places before withdrawal (should be 0)
    const detailBefore = await agent1.get(`/api/events/${event.id}`);
    assert.strictEqual(detailBefore.body.event.free_places, 0);

    // Member 1 withdraws
    const withdrawRes = await agent1.delete(`/api/events/${event.id}/signup`);
    assert.strictEqual(withdrawRes.status, 200);

    // Check free places right after withdrawal, before member 2 signs up (should be 1)
    const detailAfter = await agent1.get(`/api/events/${event.id}`);
    assert.strictEqual(detailAfter.body.event.free_places, 1);

    // Member 2 signs up
    const signupRes = await agent2.post(`/api/events/${event.id}/signup`);
    assert.strictEqual(signupRes.status, 201);
    assert.strictEqual(signupRes.body.message, 'You are signed up');

    const regResult = await pool.query(
      'SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2',
      [event.id, id2]
    );
    assert.strictEqual(regResult.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
    await deleteEventById(event.id);
    await deleteUserByEmail(email1);
    await deleteUserByEmail(email2);
  }
});

after(() => {
  pool.end();
});
