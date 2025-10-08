// routes/driverRoutes.js
import express from 'express';
import { registerDriver } from '../controllers/driverController.js';

const router = express.Router();

// POST route to register a driver
router.post('/register', registerDriver);

export default router;
