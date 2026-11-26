import bcrypt from 'bcryptjs';
import { 
  findUserByEmail, 
  findUserById, 
  findUserByGoogleId, 
  createUser, 
  updateUserGoogleId 
} from '../data/users.js';

export async function registerUser(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error('E-mail already in use');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ email, passwordHash, role: 'member' });
  return user;
}

export async function authenticateUser(email, password) {
  if (!email || !password) {
    throw new Error('Wrong e-mail or password');
  }
  const user = await findUserByEmail(email);
  if (!user || !user.password_hash) {
    throw new Error('Wrong e-mail or password');
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new Error('Wrong e-mail or password');
  }
  return user;
}

export async function signInWithGoogle({ googleId, email, verified }) {
  const existingByGoogle = await findUserByGoogleId(googleId);
  if (existingByGoogle) {
    return existingByGoogle;
  }

  if (!verified) {
    throw new Error('Your Google address is not verified.');
  }

  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail) {
    await updateUserGoogleId(existingByEmail.id, googleId);
    return await findUserById(existingByEmail.id);
  }

  const newUser = await createUser({ email, googleId, role: 'member' });
  return newUser;
}
