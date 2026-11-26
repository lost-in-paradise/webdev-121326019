import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';

test('AC-1: visitor opening /events or /events.html without signing in lands on /login (302)', async () => {
  const agent = request.agent(app);

  const resEvents = await agent.get('/events').redirects(0);
  assert.strictEqual(resEvents.status, 302);
  assert.strictEqual(resEvents.headers.location, '/login');

  const resEventsHtml = await agent.get('/events.html').redirects(0);
  assert.strictEqual(resEventsHtml.status, 302);
  assert.strictEqual(resEventsHtml.headers.location, '/login');
});

test('AC-9: visitor signing in with wrong password sees error, stays on login, no session created', async () => {
  const email = 'wrongpass_test@example.com';
  const password = 'correctpassword';
  const hashedPassword = await bcryptjs.hash(password, 10);
  
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
    [email, hashedPassword, 'member']
  );

  try {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrongpassword' });

    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(res.body, { success: false, error: 'Wrong e-mail or password' });
    assert.strictEqual(res.headers['set-cookie'], undefined);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-10: signing up with new email and password lands on events, creates user with bcrypt hash, session works', async () => {
  const email = 'newsignup_test@example.com';
  const password = 'mypassword123';

  const agent = request.agent(app);

  try {
    const res = await agent
      .post('/api/auth/signup')
      .send({ email, password });

    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { success: true, redirect: '/events' });

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    assert.strictEqual(userResult.rows.length, 1);
    const user = userResult.rows[0];
    assert.strictEqual(user.role, 'member');
    assert.notStrictEqual(user.password_hash, password);
    assert.ok(bcryptjs.compareSync(password, user.password_hash));

    // Test session works with the same agent
    const eventsRes = await agent.get('/events');
    assert.strictEqual(eventsRes.status, 200);
  } finally {
    await deleteUserByEmail(email);
  }
});

after(() => {
  pool.end();
});
