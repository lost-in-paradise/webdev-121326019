import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const password = 'password123';
  const passwordHash = await bcrypt.hash(password, 10);
  console.log(`Seeded users password: ${password}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const users = [
      { email: 'member@club.test', role: 'member' },
      { email: 'organizer@club.test', role: 'organizer' },
      { email: 'admin@club.test', role: 'admin' }
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
        [u.email, passwordHash, u.role]
      );
    }

    const orgResult = await client.query('SELECT id FROM users WHERE email = $1', ['organizer@club.test']);
    const organizerId = orgResult.rows[0].id;

    const eventTitles = [
      'Past Singing Night',
      'Upcoming Jazz Jam',
      'Upcoming Choir Practice',
      'Upcoming Acoustic Open Mic'
    ];

    for (const title of eventTitles) {
      await client.query('DELETE FROM events WHERE title = $1', [title]);
    }

    const now = new Date();
    const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const futureDate1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const futureDate2 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const futureDate3 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const events = [
      { title: 'Past Singing Night', starts_at: pastDate, location: 'Room 101', description: 'A past event that has already occurred.', capacity: 20 },
      { title: 'Upcoming Jazz Jam', starts_at: futureDate1, location: 'Music Hall', description: 'Improv jazz session for members.', capacity: 15 },
      { title: 'Upcoming Choir Practice', starts_at: futureDate2, location: 'Auditorium', description: 'Preparing for the winter concert.', capacity: 30 },
      { title: 'Upcoming Acoustic Open Mic', starts_at: futureDate3, location: 'Coffee Lounge', description: 'Unplugged performances.', capacity: 10 }
    ];

    for (const ev of events) {
      await client.query(
        `INSERT INTO events (title, starts_at, location, description, capacity, status, organizer_id)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [ev.title, ev.starts_at, ev.location, ev.description, ev.capacity, organizerId]
      );
    }

    await client.query('COMMIT');
    console.log('Database seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
