import { findUserById, findAllUsers, updateUserRole } from '../data/users.js';

export async function listUsersService(callerUserId) {
  const caller = await findUserById(callerUserId);
  if (!caller || caller.role !== 'admin') {
    throw new Error('You do not have permission');
  }

  return await findAllUsers();
}

export async function changeUserRoleService(callerUserId, targetUserId, newRole) {
  // 1. Caller is admin (403 "You do not have permission")
  const caller = await findUserById(callerUserId);
  if (!caller || caller.role !== 'admin') {
    throw new Error('You do not have permission');
  }

  // 2. User id is a number (400 "Invalid user id")
  const targetId = Number(targetUserId);
  if (!Number.isInteger(targetId)) {
    throw new Error('Invalid user id');
  }

  // 3. Role is member or organizer (400 "Role must be member or organizer")
  if (newRole !== 'member' && newRole !== 'organizer') {
    throw new Error('Role must be member or organizer');
  }

  // 4. Not the admin's own id (400 "You cannot change your own role")
  if (targetId === caller.id) {
    throw new Error('You cannot change your own role');
  }

  // 5. User exists (404 "User not found")
  const targetUser = await findUserById(targetId);
  if (!targetUser) {
    throw new Error('User not found');
  }

  // 6. Update and return "Role updated"
  await updateUserRole(targetId, newRole);
  return { success: true, message: 'Role updated' };
}
