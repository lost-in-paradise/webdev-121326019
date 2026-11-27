import { pool } from './db.js';

export async function createRegistrationWithClient(client, userId, eventId) {
  const result = await client.query(
    'INSERT INTO registrations (user_id, event_id) VALUES ($1, $2) RETURNING *',
    [userId, eventId]
  );
  return result.rows[0];
}

export async function findRegistrationWithClient(client, userId, eventId) {
  const result = await client.query(
    'SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2',
    [userId, eventId]
  );
  return result.rows[0] || null;
}

export async function countRegistrationsWithClient(client, eventId) {
  const result = await client.query(
    'SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = $1',
    [eventId]
  );
  return result.rows[0].count;
}

export async function deleteRegistrationWithClient(client, userId, eventId) {
  const result = await client.query(
    'DELETE FROM registrations WHERE user_id = $1 AND event_id = $2 RETURNING *',
    [userId, eventId]
  );
  return result.rows[0] || null;
}

export async function findRegistrationsByEventId(eventId) {
  const result = await pool.query(
    `SELECT r.user_id, u.email, r.created_at AS registered_at
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.event_id = $1
     ORDER BY r.created_at ASC`,
    [eventId]
  );
  return result.rows;
}

