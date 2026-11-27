import express from 'express';
import { listUsersService, changeUserRoleService } from '../services/admin.js';

const router = express.Router();

router.get('/api/admin/users', async (req, res) => {
  try {
    const users = await listUsersService(req.user.id);
    res.json({ success: true, users });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

router.put('/api/admin/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const result = await changeUserRoleService(req.user.id, req.params.id, role);
    res.json({ success: true, message: result.message });
  } catch (err) {
    let status = 500;
    let errorMessage = 'Internal server error';
    if (err.message === 'You do not have permission') {
      status = 403;
      errorMessage = err.message;
    } else if (
      err.message === 'Invalid user id' ||
      err.message === 'Role must be member or organizer' ||
      err.message === 'You cannot change your own role'
    ) {
      status = 400;
      errorMessage = err.message;
    } else if (err.message === 'User not found') {
      status = 404;
      errorMessage = err.message;
    }
    res.status(status).json({ success: false, error: errorMessage });
  }
});

export default router;
