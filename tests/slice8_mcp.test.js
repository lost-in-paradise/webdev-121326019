import test, { after } from 'node:test';
import assert from 'node:assert';
import bcryptjs from 'bcryptjs';
import { pool } from '../src/data/db.js';
import { deleteUserByEmail } from '../src/data/users.js';
import { deleteEventById } from '../src/data/events.js';
import { getUpcomingEvents } from '../src/services/events.js';
import { get_event, list_upcoming_events, list_event_registrations } from '../src/mcp/tools.js';

test('AC-44: calling get_event with the id of an existing event returns its title and description, and no rows change', async () => {
  const orgEmail = 'ac44_org@example.com';
  const memEmail = 'ac44_mem@example.com';
  let eventId;
  try {
    const orgRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'organizer') RETURNING id", [orgEmail]);
    const memRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'member') RETURNING id", [memEmail]);
    const orgId = orgRes.rows[0].id;
    const memId = memRes.rows[0].id;

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const eventRes = await pool.query(
      "INSERT INTO events (title, starts_at, location, description, capacity, organizer_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      ['Chess Championship', futureDate, 'Hall A', 'Annual club chess tournament', 20, orgId]
    );
    eventId = eventRes.rows[0].id;

    const countUsersBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    const countEventsBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    const countRegsBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations')).rows[0].count;

    const res = await get_event(memId, { event_id: eventId });
    assert.strictEqual(res.isError, false);
    assert.ok(res.text.includes('Chess Championship'));
    assert.ok(res.text.includes('Annual club chess tournament'));
    assert.strictEqual(res.title, 'Chess Championship');
    assert.strictEqual(res.description, 'Annual club chess tournament');

    const countUsersAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    const countEventsAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM events')).rows[0].count;
    const countRegsAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations')).rows[0].count;

    assert.strictEqual(countUsersAfter, countUsersBefore);
    assert.strictEqual(countEventsAfter, countEventsBefore);
    assert.strictEqual(countRegsAfter, countRegsBefore);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(memEmail);
  }
});

test('AC-45: calling get_event with an id that does not exist returns "Event not found"', async () => {
  const memEmail = 'ac45_mem@example.com';
  try {
    const memRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'member') RETURNING id", [memEmail]);
    const memId = memRes.rows[0].id;

    const res = await get_event(memId, { event_id: 999999999 });
    assert.strictEqual(res.isError, true);
    assert.strictEqual(res.text, 'Event not found');
    assert.strictEqual(res.content[0].text, 'Event not found');
  } finally {
    await deleteUserByEmail(memEmail);
  }
});

test('AC-46: calling list_upcoming_events returns the same events, in the same order and with the same free places, as /events', async () => {
  const orgEmail = 'ac46_org@example.com';
  let eventId1;
  let eventId2;
  try {
    const orgRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'organizer') RETURNING id", [orgEmail]);
    const orgId = orgRes.rows[0].id;

    const date1 = new Date(Date.now() + 100000000).toISOString();
    const date2 = new Date(Date.now() + 200000000).toISOString();

    const ev1Res = await pool.query(
      "INSERT INTO events (title, starts_at, location, description, capacity, organizer_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      ['Event Alpha', date1, 'Room 101', 'First upcoming event', 15, orgId]
    );
    eventId1 = ev1Res.rows[0].id;

    const ev2Res = await pool.query(
      "INSERT INTO events (title, starts_at, location, description, capacity, organizer_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      ['Event Beta', date2, 'Room 102', 'Second upcoming event', 25, orgId]
    );
    eventId2 = ev2Res.rows[0].id;

    const serviceEvents = await getUpcomingEvents();
    const res = await list_upcoming_events(orgId, {});

    assert.strictEqual(res.isError, false);
    assert.strictEqual(res.events.length, serviceEvents.length);

    for (let i = 0; i < serviceEvents.length; i++) {
      assert.strictEqual(res.events[i].title, serviceEvents[i].title);
      assert.strictEqual(res.events[i].free_places, serviceEvents[i].free_places);
      assert.ok(res.text.includes(serviceEvents[i].title));
      assert.ok(res.text.includes(String(serviceEvents[i].free_places)));
    }
  } finally {
    if (eventId1) await deleteEventById(eventId1);
    if (eventId2) await deleteEventById(eventId2);
    await deleteUserByEmail(orgEmail);
  }
});

test('AC-47: calling list_event_registrations as organizer or admin returns email and sign-up date, no password hash', async () => {
  const orgEmail = 'ac47_org@example.com';
  const adminEmail = 'ac47_admin@example.com';
  const mem1Email = 'ac47_mem1@example.com';
  const mem2Email = 'ac47_mem2@example.com';
  const passwordHash = await bcryptjs.hash('supersecretpassword', 10);
  let eventId;
  try {
    const orgRes = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'organizer') RETURNING id", [orgEmail, passwordHash]);
    const adminRes = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id", [adminEmail, passwordHash]);
    const mem1Res = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'member') RETURNING id", [mem1Email, passwordHash]);
    const mem2Res = await pool.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'member') RETURNING id", [mem2Email, passwordHash]);

    const orgId = orgRes.rows[0].id;
    const adminId = adminRes.rows[0].id;
    const mem1Id = mem1Res.rows[0].id;
    const mem2Id = mem2Res.rows[0].id;

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const eventRes = await pool.query(
      "INSERT INTO events (title, starts_at, location, description, capacity, organizer_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      ['Hackathon', futureDate, 'Main Lab', 'Annual hackathon', 10, orgId]
    );
    eventId = eventRes.rows[0].id;

    await pool.query("INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)", [mem1Id, eventId]);
    await pool.query("INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)", [mem2Id, eventId]);

    // Test as Organizer
    const resOrg = await list_event_registrations(orgId, { event_id: eventId });
    assert.strictEqual(resOrg.isError, false);
    assert.ok(resOrg.text.includes(mem1Email));
    assert.ok(resOrg.text.includes(mem2Email));
    assert.ok(!resOrg.text.includes(passwordHash));
    assert.ok(!resOrg.text.includes('supersecretpassword'));
    assert.ok(!resOrg.text.includes('password_hash'));

    // Test as Admin
    const resAdmin = await list_event_registrations(adminId, { event_id: eventId });
    assert.strictEqual(resAdmin.isError, false);
    assert.ok(resAdmin.text.includes(mem1Email));
    assert.ok(resAdmin.text.includes(mem2Email));
    assert.ok(!resAdmin.text.includes(passwordHash));
    assert.ok(!resAdmin.text.includes('supersecretpassword'));
    assert.ok(!resAdmin.text.includes('password_hash'));
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(orgEmail);
    await deleteUserByEmail(adminEmail);
    await deleteUserByEmail(mem1Email);
    await deleteUserByEmail(mem2Email);
  }
});

test('AC-48: calling list_event_registrations as a member or non-owner organizer returns "You do not have permission", and no rows change', async () => {
  const ownerOrgEmail = 'ac48_owner@example.com';
  const otherOrgEmail = 'ac48_other@example.com';
  const memEmail = 'ac48_mem@example.com';
  const attendeeEmail = 'ac48_attendee@example.com';
  let eventId;
  try {
    const ownerRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'organizer') RETURNING id", [ownerOrgEmail]);
    const otherOrgRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'organizer') RETURNING id", [otherOrgEmail]);
    const memRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'member') RETURNING id", [memEmail]);
    const attendeeRes = await pool.query("INSERT INTO users (email, role) VALUES ($1, 'member') RETURNING id", [attendeeEmail]);

    const ownerId = ownerRes.rows[0].id;
    const otherOrgId = otherOrgRes.rows[0].id;
    const memId = memRes.rows[0].id;
    const attendeeId = attendeeRes.rows[0].id;

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const eventRes = await pool.query(
      "INSERT INTO events (title, starts_at, location, description, capacity, organizer_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      ['Secret Meeting', futureDate, 'Room 5', 'Private discussion', 10, ownerId]
    );
    eventId = eventRes.rows[0].id;

    await pool.query("INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)", [attendeeId, eventId]);

    const countRegsBefore = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations')).rows[0].count;

    // Test as Member
    const resMem = await list_event_registrations(memId, { event_id: eventId });
    assert.strictEqual(resMem.isError, true);
    assert.strictEqual(resMem.text, 'You do not have permission');
    assert.strictEqual(resMem.content[0].text, 'You do not have permission');

    // Test as Other Organizer
    const resOtherOrg = await list_event_registrations(otherOrgId, { event_id: eventId });
    assert.strictEqual(resOtherOrg.isError, true);
    assert.strictEqual(resOtherOrg.text, 'You do not have permission');
    assert.strictEqual(resOtherOrg.content[0].text, 'You do not have permission');

    const countRegsAfter = (await pool.query('SELECT COUNT(*)::int AS count FROM registrations')).rows[0].count;
    assert.strictEqual(countRegsAfter, countRegsBefore);
  } finally {
    if (eventId) await deleteEventById(eventId);
    await deleteUserByEmail(ownerOrgEmail);
    await deleteUserByEmail(otherOrgEmail);
    await deleteUserByEmail(memEmail);
    await deleteUserByEmail(attendeeEmail);
  }
});

after(() => { pool.end(); });
