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
    `SELECT e.id, e.title, e.starts_at, e.location, e.description, e.capacity, e.status, e.organizer_id,
            (e.capacity - COALESCE(r.reg_count, 0))::int AS free_places
     FROM events e
     LEFT JOIN (
       SELECT event_id, COUNT(*)::int AS reg_count
       FROM registrations
       GROUP BY event_id
     ) r ON r.event_id = e.id
     WHERE e.starts_at > NOW()
     ORDER BY e.starts_at ASC`
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

export async function findEventByIdWithClient(client, id) {
  const result = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
  return result.rows[0] || null;
}
