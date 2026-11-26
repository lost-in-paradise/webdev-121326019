import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { setGoogleStubs } from '../src/services/google.js';

beforeEach(() => {
  setGoogleStubs(null, null);
});

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

    const eventsRes = await agent.get('/events');
    assert.strictEqual(eventsRes.status, 200);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-3: A visitor whose verified Google address matches no account clicks "Sign in with Google" on /login, lands on /events, and one new row appears in users with that e-mail, the Google id, role member', async () => {
  const email = 'google_new@example.com';
  const googleId = 'g_id_333';

  await deleteUserByEmail(email);

  setGoogleStubs(
    async () => ({ googleId, email, verified: true }),
    (state) => `http://localhost:3000/auth/google/callback?code=fakecode&state=${state}`
  );

  const agent = request.agent(app);
  try {
    const initRes = await agent.get('/auth/google').redirects(0);
    assert.strictEqual(initRes.status, 302);
    const redirectUrl = initRes.headers.location;
    const urlObj = new URL(redirectUrl, 'http://localhost:3000');
    const state = urlObj.searchParams.get('state');

    const cbRes = await agent.get(`/auth/google/callback?code=fakecode&state=${state}`).redirects(0);
    assert.strictEqual(cbRes.status, 302);
    assert.strictEqual(cbRes.headers.location, '/events');

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    assert.strictEqual(userRes.rows.length, 1);
    const u = userRes.rows[0];
    assert.strictEqual(u.google_id, googleId);
    assert.strictEqual(u.role, 'member');
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-4: A member with a local account signs in with Google for the first time using the same verified address, lands on /events, their existing users row now has the Google id, and no new row appears in users', async () => {
  const email = 'local_link@example.com';
  const googleId = 'g_id_444';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await deleteUserByEmail(email);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [email, hashedPassword, 'member']);

  const countBeforeRes = await pool.query('SELECT COUNT(*) FROM users');
  const countBefore = parseInt(countBeforeRes.rows[0].count, 10);

  setGoogleStubs(
    async () => ({ googleId, email, verified: true }),
    (state) => `http://localhost:3000/auth/google/callback?code=fakecode&state=${state}`
  );

  const agent = request.agent(app);
  try {
    const initRes = await agent.get('/auth/google').redirects(0);
    const state = new URL(initRes.headers.location, 'http://localhost:3000').searchParams.get('state');

    const cbRes = await agent.get(`/auth/google/callback?code=fakecode&state=${state}`).redirects(0);
    assert.strictEqual(cbRes.status, 302);
    assert.strictEqual(cbRes.headers.location, '/events');

    const countAfterRes = await pool.query('SELECT COUNT(*) FROM users');
    const countAfter = parseInt(countAfterRes.rows[0].count, 10);
    assert.strictEqual(countAfter, countBefore);

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    assert.strictEqual(userRes.rows.length, 1);
    assert.strictEqual(userRes.rows[0].google_id, googleId);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-5: A user whose Google id is already stored signs in with Google and lands on /events as the same account, and the number of rows in users is unchanged', async () => {
  const email = 'existing_google@example.com';
  const googleId = 'g_id_555';

  await deleteUserByEmail(email);
  await pool.query('INSERT INTO users (email, google_id, role) VALUES ($1, $2, $3)', [email, googleId, 'member']);

  const countBeforeRes = await pool.query('SELECT COUNT(*) FROM users');
  const countBefore = parseInt(countBeforeRes.rows[0].count, 10);

  setGoogleStubs(
    async () => ({ googleId, email, verified: true }),
    (state) => `http://localhost:3000/auth/google/callback?code=fakecode&state=${state}`
  );

  const agent = request.agent(app);
  try {
    const initRes = await agent.get('/auth/google').redirects(0);
    const state = new URL(initRes.headers.location, 'http://localhost:3000').searchParams.get('state');

    const cbRes = await agent.get(`/auth/google/callback?code=fakecode&state=${state}`).redirects(0);
    assert.strictEqual(cbRes.status, 302);
    assert.strictEqual(cbRes.headers.location, '/events');

    const countAfterRes = await pool.query('SELECT COUNT(*) FROM users');
    const countAfter = parseInt(countAfterRes.rows[0].count, 10);
    assert.strictEqual(countAfter, countBefore);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('AC-6: A visitor whose Google address is not verified sees "Your Google address is not verified.", stays on /login, and no row is created or changed in users', async () => {
  const email = 'unverified_google@example.com';
  const googleId = 'g_id_666';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await deleteUserByEmail(email);
  // Also create a local account with the same e-mail first
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [email, hashedPassword, 'member']);

  const countBeforeRes = await pool.query('SELECT COUNT(*) FROM users');
  const countBefore = parseInt(countBeforeRes.rows[0].count, 10);

  setGoogleStubs(
    async () => ({ googleId, email, verified: false }),
    (state) => `http://localhost:3000/auth/google/callback?code=fakecode&state=${state}`
  );

  const agent = request.agent(app);
  try {
    const initRes = await agent.get('/auth/google').redirects(0);
    const state = new URL(initRes.headers.location, 'http://localhost:3000').searchParams.get('state');

    const cbRes = await agent.get(`/auth/google/callback?code=fakecode&state=${state}`).redirects(0);
    assert.strictEqual(cbRes.status, 302);
    assert.strictEqual(cbRes.headers.location, '/login?error=unverified');

    const countAfterRes = await pool.query('SELECT COUNT(*) FROM users');
    const countAfter = parseInt(countAfterRes.rows[0].count, 10);
    assert.strictEqual(countAfter, countBefore);

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    assert.strictEqual(userRes.rows.length, 1);
    assert.strictEqual(userRes.rows[0].google_id, null);
  } finally {
    await deleteUserByEmail(email);
  }
});

after(() => {
  pool.end();
});
