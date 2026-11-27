import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcryptjs from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import {
  setPosterStub,
  resetPosterStub,
  wasPosterModelCalled,
  setPosterTimeout,
  resetPosterTimeout
} from '../src/services/poster.js';

const samplePngBase64 = Buffer.from('fake png image data').toString('base64');

test('AC-49: An organizer or the admin who uploads a poster on /event sees the title, start time and location the model suggested filled into the form, and no new row appears in events', async () => {
  const orgEmail = 'ac49_org@example.com';
  const adminEmail = 'ac49_admin@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);

  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [adminEmail, hashedPassword, 'admin']);

  const agentOrg = request.agent(app);
  const agentAdmin = request.agent(app);

  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agentOrg.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });
    await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'password123' });

    setPosterStub(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: 'Chess Tournament',
                      starts_at: '2026-12-10T18:00:00Z',
                      location: 'Club Hall'
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    });

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;

    // 1. Organizer upload
    const resOrg = await agentOrg.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });
    assert.strictEqual(resOrg.status, 200);
    assert.strictEqual(resOrg.body.success, true);
    assert.strictEqual(resOrg.body.title, 'Chess Tournament');
    assert.strictEqual(resOrg.body.starts_at, '2026-12-10T18:00:00Z');
    assert.strictEqual(resOrg.body.location, 'Club Hall');
    assert.strictEqual(resOrg.body.note, '');
    assert.strictEqual(wasPosterModelCalled(), true);

    const countAfterOrg = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    assert.strictEqual(countAfterOrg, countBefore);

    // 2. Admin upload
    const resAdmin = await agentAdmin.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });
    assert.strictEqual(resAdmin.status, 200);
    assert.strictEqual(resAdmin.body.success, true);
    assert.strictEqual(resAdmin.body.title, 'Chess Tournament');
    assert.strictEqual(resAdmin.body.starts_at, '2026-12-10T18:00:00Z');
    assert.strictEqual(resAdmin.body.location, 'Club Hall');
    assert.strictEqual(resAdmin.body.note, '');

    const countAfterAdmin = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    assert.strictEqual(countAfterAdmin, countBefore);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(adminEmail);
  }
});

test('AC-50: When GEMINI_API_KEY is missing, an organizer who uploads a poster sees "Could not read the poster. Please type the details", the fields stay empty, and the model is not called', async () => {
  const orgEmail = 'ac50_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);

  const agent = request.agent(app);
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await agent.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    setPosterStub(async () => {
      throw new Error('Model should not be called');
    });

    const res = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.title, '');
    assert.strictEqual(res.body.starts_at, '');
    assert.strictEqual(res.body.location, '');
    assert.strictEqual(res.body.note, 'Could not read the poster. Please type the details');
    assert.strictEqual(wasPosterModelCalled(), false);
  } finally {
    if (savedKey !== undefined) {
      process.env.GEMINI_API_KEY = savedKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
  }
});

test('AC-51: When the model does not answer within 10 seconds, the organizer sees "Could not read the poster. Please type the details", and no new row appears in events', async () => {
  const orgEmail = 'ac51_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);

  const agent = request.agent(app);
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agent.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    setPosterTimeout(50);
    setPosterStub((url, options) => {
      return new Promise((resolve, reject) => {
        if (options.signal.aborted) {
          return reject(options.signal.reason);
        }
        options.signal.addEventListener('abort', () => {
          reject(options.signal.reason);
        });
      });
    });

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;

    const res = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.title, '');
    assert.strictEqual(res.body.starts_at, '');
    assert.strictEqual(res.body.location, '');
    assert.strictEqual(res.body.note, 'Could not read the poster. Please type the details');

    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    assert.strictEqual(countAfter, countBefore);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterTimeout();
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
  }
});

test('AC-52: When the model answers with a 429 or another error, the organizer sees "Could not read the poster. Please type the details", and no new row appears in events', async () => {
  const orgEmail = 'ac52_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);

  const agent = request.agent(app);
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agent.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;

    // Test 429 Rate Limit
    setPosterStub(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate limited' })
    }));

    const res429 = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res429.status, 200);
    assert.strictEqual(res429.body.success, true);
    assert.strictEqual(res429.body.title, '');
    assert.strictEqual(res429.body.starts_at, '');
    assert.strictEqual(res429.body.location, '');
    assert.strictEqual(res429.body.note, 'Could not read the poster. Please type the details');

    // Test 500 Provider Server Error
    setPosterStub(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'backend failure' })
    }));

    const res500 = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res500.status, 200);
    assert.strictEqual(res500.body.success, true);
    assert.strictEqual(res500.body.title, '');
    assert.strictEqual(res500.body.starts_at, '');
    assert.strictEqual(res500.body.location, '');
    assert.strictEqual(res500.body.note, 'Could not read the poster. Please type the details');

    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    assert.strictEqual(countAfter, countBefore);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
  }
});

test('AC-53: When the model answers with something that is not valid JSON, the organizer sees "Could not read the poster. Please type the details", and no new row appears in events', async () => {
  const orgEmail = 'ac53_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);

  const agent = request.agent(app);
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agent.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    setPosterStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Sorry, this is plain text and not valid JSON at all.' }
              ]
            }
          }
        ]
      })
    }));

    const countBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;

    const res = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.title, '');
    assert.strictEqual(res.body.starts_at, '');
    assert.strictEqual(res.body.location, '');
    assert.strictEqual(res.body.note, 'Could not read the poster. Please type the details');

    const countAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    assert.strictEqual(countAfter, countBefore);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
  }
});

test('AC-54: A member who tries to upload a poster sees "You do not have permission", and the model is not called', async () => {
  const memEmail = 'ac54_mem@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [memEmail, hashedPassword, 'member']);

  const agent = request.agent(app);
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agent.post('/api/auth/login').send({ email: memEmail, password: 'password123' });

    setPosterStub(async () => {
      throw new Error('Model should not be called');
    });

    const res = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'You do not have permission');
    assert.strictEqual(wasPosterModelCalled(), false);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(memEmail);
  }
});

test('AC-55: An organizer who uploads a file that is not a PNG or JPEG, or is larger than 4 MB, sees "Upload a PNG or JPEG image under 4 MB", and the model is not called', async () => {
  const orgEmail = 'ac55_org@example.com';
  const hashedPassword = await bcryptjs.hash('password123', 10);
  await pool.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [orgEmail, hashedPassword, 'organizer']);

  const agent = request.agent(app);
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-api-key';

  try {
    await agent.post('/api/auth/login').send({ email: orgEmail, password: 'password123' });

    setPosterStub(async () => {
      throw new Error('Model should not be called');
    });

    // 1. Invalid MIME type (GIF)
    const resMime = await agent.post('/api/events/poster').send({
      image: samplePngBase64,
      mimeType: 'image/gif'
    });

    assert.strictEqual(resMime.status, 400);
    assert.strictEqual(resMime.body.success, false);
    assert.strictEqual(resMime.body.error, 'Upload a PNG or JPEG image under 4 MB');
    assert.strictEqual(wasPosterModelCalled(), false);

    // 2. Larger than 4 MB (4 * 1024 * 1024 + 1 bytes)
    const largeBuffer = Buffer.alloc(4 * 1024 * 1024 + 1);
    const largeBase64 = largeBuffer.toString('base64');

    const resSize = await agent.post('/api/events/poster').send({
      image: largeBase64,
      mimeType: 'image/png'
    });

    assert.strictEqual(resSize.status, 400);
    assert.strictEqual(resSize.body.success, false);
    assert.strictEqual(resSize.body.error, 'Upload a PNG or JPEG image under 4 MB');
    assert.strictEqual(wasPosterModelCalled(), false);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    resetPosterStub();
    await deleteUserByEmail(orgEmail);
  }
});

after(() => { pool.end(); });
