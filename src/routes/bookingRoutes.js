import express from "express";
import { createBooking, getBooking, initializeVehicleTypes } from "../controllers/bookingController.js";

const router = express.Router();

router.post("/create", createBooking);          // Create booking
router.get("/:id", getBooking);                // Get booking by ID
router.post("/init-vehicles", initializeVehicleTypes); // Initialize vehicle types

export default router;
