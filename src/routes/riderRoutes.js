import express from 'express';  // Import express
import { registerRider } from '../controllers/riderController.js';  // Import the registerRider controller

const router = express.Router();

// POST route to register a rider
router.post('/rider', registerRider);

export default router;
