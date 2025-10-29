// routes/destinationSearchRoutes.js
import express from 'express';
import {
  searchLocations,
  calculateFare,
  createBooking,
  getBooking,
  initializeVehicleTypes
} from '../controllers/destinationController.js'; // Make sure this path is correct

const router = express.Router();

// Search locations
router.get('/search', searchLocations);

// Calculate fare
router.post('/calculate-fare', calculateFare);

// Create booking
router.post('/book-ride', createBooking);

// Get booking by ID
router.get('/booking/:id', getBooking);

// Initialize vehicle types (admin route)
router.post('/initialize-vehicles', initializeVehicleTypes);

export default router;