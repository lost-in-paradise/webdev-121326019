import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { createEvent, deleteEventById } from '../src/data/events.js';

test('AC-31: organizer opens sign-up list for their event, sees exactly the members registered, no rows change in events or registrations', async () => {
  const orgEmail = 'ac31_org@example.com';
  const mem1Email = 'ac31_mem1@example.com';
  const mem2Email = 'ac31_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const mem1Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem1Email, hashedPassword, 'member']);
  const mem2Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem2Email, hashedPassword, 'member']);
  const orgId = orgRes.rows[0].id;
  const mem1Id = mem1Res.rows[0].id;
  const mem2Id = mem2Res.rows[0].id;

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
      title: 'AC-31 Event',
      starts_at: futureDate,
      location: 'Hall A',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Both members sign up
    await agentMem1.post(`/api/events/${eventId}/signup`);
    await agentMem2.post(`/api/events/${eventId}/signup`);

    const eventsCountBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    const regCountBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = $1', [eventId])).rows[0].count;

    // Organizer opens sign-up list
    const res = await agentOrg.get(`/api/events/${eventId}/signups`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.signups.length, 2);

    const emails = res.body.signups.map(s => s.email);
    assert.ok(emails.includes(mem1Email));
    assert.ok(emails.includes(mem2Email));

    const eventsCountAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    const regCountAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = $1', [eventId])).rows[0].count;

    assert.strictEqual(eventsCountAfter, eventsCountBefore);
    assert.strictEqual(regCountAfter, regCountBefore);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(mem1Email);
    await deleteUserByEmail(mem2Email);
  }
});

test('AC-32: organizer removes member from sign-ups list of upcoming event, member no longer in list, row deleted from registrations, free places increase by 1', async () => {
  const orgEmail = 'ac32_org@example.com';
  const memEmail = 'ac32_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const orgId = orgRes.rows[0].id;
  const memId = memRes.rows[0].id;

  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'AC-32 Event',
      starts_at: futureDate,
      location: 'Hall B',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    await agentMem.post(`/api/events/${eventId}/signup`);

    // Check free places before removal
    const detailsBefore = await agentOrg.get(`/api/events/${eventId}`);
    assert.strictEqual(detailsBefore.body.event.free_places, 4);

    // Organizer removes member
    const removeRes = await agentOrg.delete(`/api/events/${eventId}/signups/${memId}`);
    assert.strictEqual(removeRes.status, 200);
    assert.strictEqual(removeRes.body.success, true);
    assert.strictEqual(removeRes.body.message, 'Member removed');

    // Member no longer in signups list
    const signupsRes = await agentOrg.get(`/api/events/${eventId}/signups`);
    assert.strictEqual(signupsRes.status, 200);
    assert.strictEqual(signupsRes.body.signups.length, 0);

    // Row deleted from registrations
    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId]);
    assert.strictEqual(regCheck.rows.length, 0);

    // Free places increased by 1 (back to 5)
    const detailsAfter = await agentOrg.get(`/api/events/${eventId}`);
    assert.strictEqual(detailsAfter.body.event.free_places, 5);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-33: organizer tries to see sign-up list or remove member from event not their own, gets 403 "You do not have permission", no rows change', async () => {
  const org1Email = 'ac33_org1@example.com';
  const org2Email = 'ac33_org2@example.com';
  const memEmail = 'ac33_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const org1Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [org1Email, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [org2Email, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const org1Id = org1Res.rows[0].id;
  const memId = memRes.rows[0].id;

  const agentOrg1 = request.agent(app);
  const agentOrg2 = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg1.post('/api/auth/login').send({ email: org1Email, password: 'password123' });
    await agentOrg2.post('/api/auth/login').send({ email: org2Email, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg1.post('/api/events').send({
      title: 'AC-33 Event',
      starts_at: futureDate,
      location: 'Hall C',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    await agentMem.post(`/api/events/${eventId}/signup`);

    // Org2 tries to see sign-up list
    const getRes = await agentOrg2.get(`/api/events/${eventId}/signups`);
    assert.strictEqual(getRes.status, 403);
    assert.strictEqual(getRes.body.error, 'You do not have permission');

    // Org2 tries to remove member
    const delRes = await agentOrg2.delete(`/api/events/${eventId}/signups/${memId}`);
    assert.strictEqual(delRes.status, 403);
    assert.strictEqual(delRes.body.error, 'You do not have permission');

    // Check no rows changed in events or registrations
    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId]);
    assert.strictEqual(regCheck.rows.length, 1);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(org1Email);
    await deleteUserByEmail(org2Email);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-24: member tries to open event sign-up list, gets 403 "You do not have permission", no rows change', async () => {
  const orgEmail = 'ac24_open_org@example.com';
  const memEmail = 'ac24_open_mem@example.com';
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
      title: 'AC-24 Open List Event',
      starts_at: futureDate,
      location: 'Room 1',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member attempts to open sign-up list
    const res = await agentMem.get(`/api/events/${eventId}/signups`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'You do not have permission');
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-24: member tries to remove another member, gets 403 "You do not have permission", no rows change in events or registrations', async () => {
  const orgEmail = 'ac24_rm_org@example.com';
  const mem1Email = 'ac24_rm_mem1@example.com';
  const mem2Email = 'ac24_rm_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  const mem1Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem1Email, hashedPassword, 'member']);
  const mem2Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem2Email, hashedPassword, 'member']);
  const mem2Id = mem2Res.rows[0].id;

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
      title: 'AC-24 Remove Member Event',
      starts_at: futureDate,
      location: 'Room 2',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Mem2 signs up
    await agentMem2.post(`/api/events/${eventId}/signup`);

    // Mem1 tries to remove Mem2
    const res = await agentMem1.delete(`/api/events/${eventId}/signups/${mem2Id}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'You do not have permission');

    // Registration unchanged
    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, mem2Id]);
    assert.strictEqual(regCheck.rows.length, 1);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(mem1Email);
    await deleteUserByEmail(mem2Email);
  }
});

test('Admin can see sign-up list and remove member from another organizer event', async () => {
  const orgEmail = 'admin_signups_org@example.com';
  const adminEmail = 'admin_signups_admin@example.com';
  const memEmail = 'admin_signups_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const memId = memRes.rows[0].id;

  const agentOrg = request.agent(app);
  const agentAdmin = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Admin Managed Event',
      starts_at: futureDate,
      location: 'Hall Admin',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    await agentMem.post(`/api/events/${eventId}/signup`);

    // Admin sees sign-up list
    const signupsRes = await agentAdmin.get(`/api/events/${eventId}/signups`);
    assert.strictEqual(signupsRes.status, 200);
    assert.strictEqual(signupsRes.body.signups.length, 1);
    assert.strictEqual(signupsRes.body.signups[0].email, memEmail);

    // Admin removes member
    const removeRes = await agentAdmin.delete(`/api/events/${eventId}/signups/${memId}`);
    assert.strictEqual(removeRes.status, 200);
    assert.strictEqual(removeRes.body.message, 'Member removed');

    // Registration row deleted
    const regCheck = await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId]);
    assert.strictEqual(regCheck.rows.length, 0);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('Organizer cannot remove member from started event (400), cancelled event (409), or member not signed up (409)', async () => {
  const orgEmail = 'edge_signups_org@example.com';
  const memEmail = 'edge_signups_mem@example.com';
  const nonSignedUpEmail = 'edge_signups_nonsigned@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const nonSignedRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [nonSignedUpEmail, hashedPassword, 'member']);
  const orgId = orgRes.rows[0].id;
  const memId = memRes.rows[0].id;
  const nonSignedId = nonSignedRes.rows[0].id;

  const agentOrg = request.agent(app);
  let futureEventId;
  let pastEventId;

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    // 1. Future event
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'Future Event For Edges',
      starts_at: futureDate,
      location: 'Hall Edge',
      description: 'Desc',
      capacity: 5
    });
    futureEventId = createRes.body.event.id;

    // Sign up member
    await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [memId, futureEventId]);

    // Member not signed up -> 409
    const notSignedRes = await agentOrg.delete(`/api/events/${futureEventId}/signups/${nonSignedId}`);
    assert.strictEqual(notSignedRes.status, 409);
    assert.strictEqual(notSignedRes.body.error, 'Member is not signed up');

    // Cancel event then try to remove member -> 409
    await agentOrg.post(`/api/events/${futureEventId}/cancel`);
    const cancelledRemoveRes = await agentOrg.delete(`/api/events/${futureEventId}/signups/${memId}`);
    assert.strictEqual(cancelledRemoveRes.status, 409);
    assert.strictEqual(cancelledRemoveRes.body.error, 'This event has been cancelled');

    // 2. Started event in the past
    const pastEvent = await createEvent({
      title: 'Past Event For Edges',
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      location: 'Past Hall',
      description: 'Desc',
      capacity: 5,
      organizerId: orgId
    });
    pastEventId = pastEvent.id;

    await pool.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [memId, pastEventId]);

    const pastRemoveRes = await agentOrg.delete(`/api/events/${pastEventId}/signups/${memId}`);
    assert.strictEqual(pastRemoveRes.status, 400);
    assert.strictEqual(pastRemoveRes.body.error, 'This event has already started');
  } finally {
    if (futureEventId) await deleteEventById(futureEventId);
    if (pastEventId) await deleteEventById(pastEventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
    await deleteUserByEmail(nonSignedUpEmail);
  }
});

after(() => { pool.end(); });