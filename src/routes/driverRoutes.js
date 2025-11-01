// routes/driverRoutes.js
import express from 'express';
import upload from '../middlewares/multer.js'; // ✅ Add this line
import { registerDriver } from '../controllers/driverController.js';

const router = express.Router();

// ✅ POST route to register a driver with file uploads
router.post(
  '/register',
  upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'licenseDoc', maxCount: 1 },
    { name: 'rcDoc', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  registerDriver
);

export default router;
