import { pool } from './db.js';

export async function findUserByEmail(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return result.rows[0] || null;
}

export async function updateUserGoogleId(userId, googleId) {
  await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, userId]);
}

export async function createUser({ email, passwordHash = null, googleId = null, role = 'member' }) {
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, google_id, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at, password_hash, google_id',
    [email, passwordHash, googleId, role]
  );
  return result.rows[0];
}

export async function deleteUserByEmail(email) {
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
}

export async function findAllUsers() {
  const result = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY id ASC');
  return result.rows;
}

export async function updateUserRole(id, role) {
  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at',
    [role, id]
  );
  return result.rows[0] || null;
}
