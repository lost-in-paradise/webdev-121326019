import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { deleteEventById } from '../src/data/events.js';

test('AC-26: organizer edits event title and location, sees new values on GET /api/events/:id, same events row updated, registrations unchanged', async () => {
  const orgEmail = 'ac26_org@example.com';
  const memEmail = 'ac26_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  const orgResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [orgEmail, hashedPassword, 'organizer']
  );
  const orgId = orgResult.rows[0].id;
  const memResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [memEmail, hashedPassword, 'member']
  );
  const memId = memResult.rows[0].id;

  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Original Title',
      starts_at: futureDate,
      location: 'Original Location',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    await agentMem.post(`/api/events/${eventId}/signup`);

    // Edit event
    const editRes = await agentOrg.put(`/api/events/${eventId}`).send({
      title: 'Updated Title',
      starts_at: futureDate,
      location: 'Updated Location',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(editRes.status, 200);
    assert.strictEqual(editRes.body.event.title, 'Updated Title');
    assert.strictEqual(editRes.body.event.location, 'Updated Location');

    // Check GET /api/events/:id
    const detailsRes = await agentOrg.get(`/api/events/${eventId}`);
    assert.strictEqual(detailsRes.status, 200);
    assert.strictEqual(detailsRes.body.event.title, 'Updated Title');
    assert.strictEqual(detailsRes.body.event.location, 'Updated Location');
    assert.strictEqual(detailsRes.body.event.can_manage, true);

    // Check registrations unchanged
    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId]);
    assert.strictEqual(regCheck.rows.length, 1);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-27: organizer who lowers event limit below number of sign-ups sees "Limit cannot be lower than the number of sign-ups", capacity unchanged', async () => {
  const orgEmail = 'ac27_org@example.com';
  const mem1Email = 'ac27_mem1@example.com';
  const mem2Email = 'ac27_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [mem1Email, hashedPassword, 'member']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [mem2Email, hashedPassword, 'member']);

  const agentOrg = request.agent(app);
  const agentMem1 = request.agent(app);
  const agentMem2 = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem1.post('/api/auth/login').send({ email: mem1Email, password: 'password123' });
    await agentMem2.post('/api/auth/login').send({ email: mem2Email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Event Limit Test',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    await agentMem1.post(`/api/events/${eventId}/signup`);
    await agentMem2.post(`/api/events/${eventId}/signup`);

    // Try to lower capacity to 1 (2 signups exist)
    const editRes = await agentOrg.put(`/api/events/${eventId}`).send({
      title: 'Event Limit Test',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 1
    });

    assert.strictEqual(editRes.status, 409);
    assert.strictEqual(editRes.body.success, false);
    assert.strictEqual(editRes.body.error, 'Limit cannot be lower than the number of sign-ups');

    const eventCheck = await pool.query('SELECT capacity FROM events WHERE id = $1', [eventId]);
    assert.strictEqual(eventCheck.rows[0].capacity, 5);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(mem1Email);
    await deleteUserByEmail(mem2Email);
  }
});

test('AC-28: organizer who cancels event sees status cancelled, registrations kept', async () => {
  const orgEmail = 'ac28_org@example.com';
  const memEmail = 'ac28_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const memId = memRes.rows[0].id;

  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Cancel Event Test',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    await agentMem.post(`/api/events/${eventId}/signup`);

    const cancelRes = await agentOrg.post(`/api/events/${eventId}/cancel`);
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.event.status, 'cancelled');

    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId]);
    assert.strictEqual(regCheck.rows.length, 1);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-29: member who tries to sign up for cancelled event sees "This event has been cancelled", no new row in registrations', async () => {
  const orgEmail = 'ac29_org@example.com';
  const memEmail = 'ac29_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [memEmail, hashedPassword, 'member']);

  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Cancelled Signup Test',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    await agentOrg.post(`/api/events/${eventId}/cancel`);

    const signupRes = await agentMem.post(`/api/events/${eventId}/signup`);
    assert.strictEqual(signupRes.status, 409);
    assert.strictEqual(signupRes.body.error, 'This event has been cancelled');

    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1', [eventId]);
    assert.strictEqual(regCheck.rows.length, 0);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-30: organizer who tries to edit or cancel another event sees "You do not have permission", no rows change', async () => {
  const org1Email = 'ac30_org1@example.com';
  const org2Email = 'ac30_org2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [org1Email, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [org2Email, hashedPassword, 'organizer']);

  const agentOrg1 = request.agent(app);
  const agentOrg2 = request.agent(app);
  let eventId;

  try {
    await agentOrg1.post('/api/auth/login').send({ email: org1Email, password: 'password123' });
    await agentOrg2.post('/api/auth/login').send({ email: org2Email, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg1.post('/api/events').send({
      title: 'Org1 Event',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Org2 tries to edit
    const editRes = await agentOrg2.put(`/api/events/${eventId}`).send({
      title: 'Hijacked Title',
      starts_at: futureDate,
      location: 'New Hall',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(editRes.status, 403);
    assert.strictEqual(editRes.body.error, 'You do not have permission');

    // Org2 tries to cancel
    const cancelRes = await agentOrg2.post(`/api/events/${eventId}/cancel`);
    assert.strictEqual(cancelRes.status, 403);
    assert.strictEqual(cancelRes.body.error, 'You do not have permission');

    const eventCheck = await pool.query('SELECT title, status FROM events WHERE id = $1', [eventId]);
    assert.strictEqual(eventCheck.rows[0].title, 'Org1 Event');
    assert.strictEqual(eventCheck.rows[0].status, 'active');
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(org1Email);
    await deleteUserByEmail(org2Email);
  }
});

test('Admin can edit another organizer event, and editing/cancelling cancelled event returns 409', async () => {
  const orgEmail = 'admin_test_org@example.com';
  const adminEmail = 'admin_test_admin@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);

  const agentOrg = request.agent(app);
  const agentAdmin = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Org Event for Admin',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Admin edits event
    const adminEditRes = await agentAdmin.put(`/api/events/${eventId}`).send({
      title: 'Admin Edited Title',
      starts_at: futureDate,
      location: 'Admin Hall',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(adminEditRes.status, 200);
    assert.strictEqual(adminEditRes.body.event.title, 'Admin Edited Title');

    // Admin cancels event
    await agentAdmin.post(`/api/events/${eventId}/cancel`);

    // Try editing already cancelled event -> 409
    const editCancelledRes = await agentAdmin.put(`/api/events/${eventId}`).send({
      title: 'Try Again',
      starts_at: futureDate,
      location: 'Hall',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(editCancelledRes.status, 409);
    assert.strictEqual(editCancelledRes.body.error, 'This event has been cancelled');

    // Try cancelling already cancelled event -> 409
    const cancelCancelledRes = await agentAdmin.post(`/api/events/${eventId}/cancel`);
    assert.strictEqual(cancelCancelledRes.status, 409);
    assert.strictEqual(cancelCancelledRes.body.error, 'This event has been cancelled');
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(adminEmail);
  }
});

after(() => {
  pool.end();
});
