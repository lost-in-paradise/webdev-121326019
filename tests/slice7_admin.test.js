import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { deleteEventById } from '../src/data/events.js';

test('AC-34: admin opens /admin/users sees every user with e-mail, role and created date, and no rows change in users', async () => {
  const adminEmail = 'ac34_admin@example.com';
  const memEmail = 'ac34_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [memEmail, hashedPassword, 'member']);

  const agentAdmin = request.agent(app);

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;

    const res = await agentAdmin.get('/api/admin/users');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(Array.isArray(res.body.users), true);
    assert.strictEqual(res.body.users.length, countBefore);

    for (const u of res.body.users) {
      assert.ok(u.id);
      assert.ok(u.email);
      assert.ok(u.role);
      assert.ok(u.created_at);
      assert.strictEqual(u.password_hash, undefined);
      assert.strictEqual(u.google_id, undefined);
    }

    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    assert.strictEqual(countAfter, countBefore);
  } finally {
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-35: admin changes member role to organizer sees "Role updated", user row in users now has role organizer, and no other row changes', async () => {
  const adminEmail = 'ac35_admin@example.com';
  const mem1Email = 'ac35_mem1@example.com';
  const mem2Email = 'ac35_mem2@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const mem1Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem1Email, hashedPassword, 'member']);
  const mem2Res = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [mem2Email, hashedPassword, 'member']);
  const mem1Id = mem1Res.rows[0].id;
  const mem2Id = mem2Res.rows[0].id;

  const agentAdmin = request.agent(app);

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    const res = await agentAdmin.put(`/api/admin/users/${mem1Id}/role`).send({ role: 'organizer' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Role updated');

    const updatedUser = (await pool.query('SELECT role FROM users WHERE id = $1', [mem1Id])).rows[0];
    assert.strictEqual(updatedUser.role, 'organizer');

    // Verify second user's role is unchanged
    const secondUser = (await pool.query('SELECT role FROM users WHERE id = $1', [mem2Id])).rows[0];
    assert.strictEqual(secondUser.role, 'member');
  } finally {
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(mem1Email);
    await deleteUserByEmail(mem2Email);
  }
});

test('AC-36: user whose role was changed gets new permissions on next request without signing in again', async () => {
  const adminEmail = 'ac36_admin@example.com';
  const targetEmail = 'ac36_user@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const targetRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [targetEmail, hashedPassword, 'member']);
  const targetId = targetRes.rows[0].id;

  const agentAdmin = request.agent(app);
  const agentTarget = request.agent(app);
  let eventId;

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });
    await agentTarget.post('/api/auth/login').send({ email: targetEmail, password: 'password123' });

    // 1. Promote member to organizer
    const promoRes = await agentAdmin.put(`/api/admin/users/${targetId}/role`).send({ role: 'organizer' });
    assert.strictEqual(promoRes.status, 200);

    // 2. Target user without signing in again creates an event
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentTarget.post('/api/events').send({
      title: 'AC-36 Event',
      starts_at: futureDate,
      location: 'Room 36',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.success, true);
    eventId = createRes.body.event.id;

    // 3. Demote user back to member
    const demoRes = await agentAdmin.put(`/api/admin/users/${targetId}/role`).send({ role: 'member' });
    assert.strictEqual(demoRes.status, 200);

    // 4. Target user without signing in again tries to create an event -> 403
    const failCreateRes = await agentTarget.post('/api/events').send({
      title: 'AC-36 Fail Event',
      starts_at: futureDate,
      location: 'Room 36 Fail',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(failCreateRes.status, 403);
    assert.strictEqual(failCreateRes.body.error, 'You do not have permission');
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(targetEmail);
  }
});

test('AC-37: admin who submits role other than member or organizer (including admin) sees "Role must be member or organizer", no row changes in users', async () => {
  const adminEmail = 'ac37_admin@example.com';
  const memEmail = 'ac37_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const memId = memRes.rows[0].id;

  const agentAdmin = request.agent(app);

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    // Submit 'admin'
    const resAdmin = await agentAdmin.put(`/api/admin/users/${memId}/role`).send({ role: 'admin' });
    assert.strictEqual(resAdmin.status, 400);
    assert.strictEqual(resAdmin.body.error, 'Role must be member or organizer');

    // Submit invalid role
    const resInvalid = await agentAdmin.put(`/api/admin/users/${memId}/role`).send({ role: 'superadmin' });
    assert.strictEqual(resInvalid.status, 400);
    assert.strictEqual(resInvalid.body.error, 'Role must be member or organizer');

    // Non-numeric user id
    const resBadId = await agentAdmin.put('/api/admin/users/abc/role').send({ role: 'organizer' });
    assert.strictEqual(resBadId.status, 400);
    assert.strictEqual(resBadId.body.error, 'Invalid user id');

    const userRow = (await pool.query('SELECT role FROM users WHERE id = $1', [memId])).rows[0];
    assert.strictEqual(userRow.role, 'member');
  } finally {
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-38: admin who tries to change their own role sees "You cannot change your own role", and their row in users still has role admin', async () => {
  const adminEmail = 'ac38_admin@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const adminRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [adminEmail, hashedPassword, 'admin']);
  const adminId = adminRes.rows[0].id;

  const agentAdmin = request.agent(app);

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    const res = await agentAdmin.put(`/api/admin/users/${adminId}/role`).send({ role: 'member' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'You cannot change your own role');

    const adminRow = (await pool.query('SELECT role FROM users WHERE id = $1', [adminId])).rows[0];
    assert.strictEqual(adminRow.role, 'admin');
  } finally {
    await deleteUserByEmail(adminEmail);
  }
});

test('AC-39: admin who changes role of user id that does not exist sees "User not found", and no row changes in users', async () => {
  const adminEmail = 'ac39_admin@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);

  const agentAdmin = request.agent(app);

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;

    const res = await agentAdmin.put('/api/admin/users/999999/role').send({ role: 'organizer' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'User not found');

    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    assert.strictEqual(countAfter, countBefore);
  } finally {
    await deleteUserByEmail(adminEmail);
  }
});

test('AC-40: member or organizer who opens /admin/users or tries to change a role sees "You do not have permission", and no row changes in users', async () => {
  const memEmail = 'ac40_mem@example.com';
  const orgEmail = 'ac40_org@example.com';
  const targetEmail = 'ac40_target@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [memEmail, hashedPassword, 'member']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  const targetRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [targetEmail, hashedPassword, 'member']);
  const targetId = targetRes.rows[0].id;

  const agentMem = request.agent(app);
  const agentOrg = request.agent(app);

  try {
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    // Member attempts
    const memGet = await agentMem.get('/api/admin/users');
    assert.strictEqual(memGet.status, 403);
    assert.strictEqual(memGet.body.error, 'You do not have permission');

    const memPut = await agentMem.put(`/api/admin/users/${targetId}/role`).send({ role: 'organizer' });
    assert.strictEqual(memPut.status, 403);
    assert.strictEqual(memPut.body.error, 'You do not have permission');

    // Organizer attempts
    const orgGet = await agentOrg.get('/api/admin/users');
    assert.strictEqual(orgGet.status, 403);
    assert.strictEqual(orgGet.body.error, 'You do not have permission');

    const orgPut = await agentOrg.put(`/api/admin/users/${targetId}/role`).send({ role: 'organizer' });
    assert.strictEqual(orgPut.status, 403);
    assert.strictEqual(orgPut.body.error, 'You do not have permission');

    // Target user unchanged
    const targetRow = (await pool.query('SELECT role FROM users WHERE id = $1', [targetId])).rows[0];
    assert.strictEqual(targetRow.role, 'member');
  } finally {
    await deleteUserByEmail(memEmail);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(targetEmail);
  }
});

test('AC-41: organizer demoted to member keeps their events in events with same organizer_id and all their registrations rows, but sees "You do not have permission" when trying to edit or cancel them', async () => {
  const adminEmail = 'ac41_admin@example.com';
  const orgEmail = 'ac41_org@example.com';
  const memEmail = 'ac41_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const orgId = orgRes.rows[0].id;
  const memId = memRes.rows[0].id;

  const agentAdmin = request.agent(app);
  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    // Organizer creates event
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'AC-41 Event',
      starts_at: futureDate,
      location: 'Hall 41',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    await agentMem.post(`/api/events/${eventId}/signup`);

    // Admin demotes organizer to member
    const demoRes = await agentAdmin.put(`/api/admin/users/${orgId}/role`).send({ role: 'member' });
    assert.strictEqual(demoRes.status, 200);

    // Event row in events keeps organizer_id
    const eventRow = (await pool.query('SELECT organizer_id, status FROM events WHERE id = $1', [eventId])).rows[0];
    assert.strictEqual(eventRow.organizer_id, orgId);

    // Registrations rows kept
    const regRows = (await pool.query('SELECT * FROM registrations WHERE event_id = $1', [eventId])).rows;
    assert.strictEqual(regRows.length, 1);
    assert.strictEqual(regRows[0].user_id, memId);

    // Demoted user tries to edit event -> 403
    const editRes = await agentOrg.put(`/api/events/${eventId}`).send({
      title: 'AC-41 Modified',
      starts_at: futureDate,
      location: 'Hall 41 Modified',
      description: 'Desc',
      capacity: 5
    });
    assert.strictEqual(editRes.status, 403);
    assert.strictEqual(editRes.body.error, 'You do not have permission');

    // Demoted user tries to cancel event -> 403
    const cancelRes = await agentOrg.post(`/api/events/${eventId}/cancel`);
    assert.strictEqual(cancelRes.status, 403);
    assert.strictEqual(cancelRes.body.error, 'You do not have permission');
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-42: member with sign-ups who is promoted to organizer keeps their rows in registrations', async () => {
  const adminEmail = 'ac42_admin@example.com';
  const orgEmail = 'ac42_org@example.com';
  const memEmail = 'ac42_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);
  const orgRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [orgEmail, hashedPassword, 'organizer']);
  const memRes = await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [memEmail, hashedPassword, 'member']);
  const memId = memRes.rows[0].id;

  const agentAdmin = request.agent(app);
  const agentOrg = request.agent(app);
  const agentMem = request.agent(app);
  let eventId;

  try {
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentMem.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    // Organizer creates event
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const createRes = await agentOrg.post('/api/events').send({
      title: 'AC-42 Event',
      starts_at: futureDate,
      location: 'Hall 42',
      description: 'Desc',
      capacity: 5
    });
    eventId = createRes.body.event.id;

    // Member signs up
    const signupRes = await agentMem.post(`/api/events/${eventId}/signup`);
    assert.strictEqual(signupRes.status, 201);

    // Admin promotes member to organizer
    const promoRes = await agentAdmin.put(`/api/admin/users/${memId}/role`).send({ role: 'organizer' });
    assert.strictEqual(promoRes.status, 200);

    // Registrations row kept
    const regRows = (await pool.query('SELECT * FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, memId])).rows;
    assert.strictEqual(regRows.length, 1);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-43: visitor who is not signed in and opens /admin/users lands on /login (302)', async () => {
  const res = await request(app).get('/admin/users').redirects(0);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

after(() => { pool.end(); });
