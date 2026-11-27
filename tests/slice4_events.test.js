import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { deleteEventById } from '../src/data/events.js';

test('AC-21: organizer submits valid new event with limit of 10, sees it in GET /api/events, row with capacity = 10 in events', async () => {
  const email = 'ac21_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'organizer']
  );
  const orgId = userResult.rows[0].id;

  const agent = request.agent(app);
  let createdEventId;
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const res = await agent.post('/api/events').send({
      title: 'AC-21 Event',
      starts_at: futureDate,
      location: 'Hall A',
      description: 'Test desc',
      capacity: 10
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.event.capacity, 10);
    assert.strictEqual(res.body.event.organizer_id, orgId);
    createdEventId = res.body.event.id;

    // Check GET /api/events
    const listRes = await agent.get('/api/events');
    assert.strictEqual(listRes.status, 200);
    const found = listRes.body.events.find(e => e.id === createdEventId);
    assert.ok(found);
    assert.strictEqual(found.title, 'AC-21 Event');
    assert.strictEqual(found.capacity, 10);
  } finally {
    if (createdEventId) await deleteEventById(createdEventId);
    await deleteUserByEmail(email);
  }
});

test('AC-22: organizer submits new event with limit of 0 or less sees "Limit must be at least 1", no new row in events', async () => {
  const email = 'ac22_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, hashedPassword, 'organizer']
  );

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const res = await agent.post('/api/events').send({
      title: 'AC-22 Event',
      starts_at: futureDate,
      location: 'Hall A',
      description: 'Test desc',
      capacity: 0
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Limit must be at least 1');

    const checkRes = await pool.query('SELECT * FROM events WHERE title = $1', ['AC-22 Event']);
    assert.strictEqual(checkRes.rows.length, 0);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-23: organizer submits new event with empty title or past start time sees message naming invalid field, no row in events', async () => {
  const email = 'ac23_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, hashedPassword, 'organizer']
  );

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    // Empty title
    const res1 = await agent.post('/api/events').send({
      title: '',
      starts_at: futureDate,
      location: 'Hall A',
      description: 'Test desc',
      capacity: 5
    });
    assert.strictEqual(res1.status, 400);
    assert.strictEqual(res1.body.error, 'Title must not be empty');

    // Past start time
    const res2 = await agent.post('/api/events').send({
      title: 'AC-23 Past Event',
      starts_at: pastDate,
      location: 'Hall A',
      description: 'Test desc',
      capacity: 5
    });
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.body.error, 'Start time must be in the future');

    const checkRes = await pool.query('SELECT * FROM events WHERE title IN ($1, $2)', ['', 'AC-23 Past Event']);
    assert.strictEqual(checkRes.rows.length, 0);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-24: member who tries to create an event sees "You do not have permission", no rows change in events', async () => {
  const email = 'ac24_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, hashedPassword, 'member']
  );

  const agent = request.agent(app);
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const countBefore = await pool.query('SELECT COUNT(*) FROM events');

    const res = await agent.post('/api/events').send({
      title: 'AC-24 Member Event',
      starts_at: futureDate,
      location: 'Hall A',
      description: 'Test desc',
      capacity: 5
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'You do not have permission');

    const countAfter = await pool.query('SELECT COUNT(*) FROM events');
    assert.strictEqual(countBefore.rows[0].count, countAfter.rows[0].count);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-25: admin submits valid new event sees it in GET /api/events, new row appears in events with admin id as organizer_id', async () => {
  const email = 'ac25_admin@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const userResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hashedPassword, 'admin']
  );
  const adminId = userResult.rows[0].id;

  const agent = request.agent(app);
  let createdEventId;
  try {
    await agent.post('/api/auth/login').send({ email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const res = await agent.post('/api/events').send({
      title: 'AC-25 Admin Event',
      starts_at: futureDate,
      location: 'Hall B',
      description: 'Admin event desc',
      capacity: 20
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.event.capacity, 20);
    assert.strictEqual(res.body.event.organizer_id, adminId);
    createdEventId = res.body.event.id;

    const listRes = await agent.get('/api/events');
    assert.strictEqual(listRes.status, 200);
    const found = listRes.body.events.find(e => e.id === createdEventId);
    assert.ok(found);
    assert.strictEqual(found.title, 'AC-25 Admin Event');
  } finally {
    if (createdEventId) await deleteEventById(createdEventId);
    await deleteUserByEmail(email);
  }
});

after(() => {
  pool.end();
});
