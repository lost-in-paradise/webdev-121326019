import { pool } from './db.js';

export async function createEvent({ title, startsAt, location, description, capacity, status = 'active', organizerId }) {
  const result = await pool.query(
    'INSERT INTO events (title, starts_at, location, description, capacity, status, organizer_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [title, startsAt, location, description, capacity, status, organizerId]
  );
  return result.rows[0];
}

export async function findUpcomingEvents() {
  const result = await pool.query(
    'SELECT id, title, starts_at, location, description, capacity, status, organizer_id FROM events WHERE starts_at > NOW() ORDER BY starts_at ASC'
  );
  return result.rows;
}

export async function deleteEventById(id) {
  await pool.query('DELETE FROM events WHERE id = $1', [id]);
}

export async function findEventById(id) {
  const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
  return result.rows[0] || null;
}
