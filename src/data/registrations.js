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
