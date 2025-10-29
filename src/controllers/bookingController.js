import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Create Booking
export const createBooking = async (req, res) => {
  try {
    const {
      vehicleType,
      fromLocation,
      toLocation,
      price,
      distance,
      fromLat,
      fromLon,
      toLat,
      toLon,
      userId
    } = req.body;

    if (!vehicleType || !fromLocation || !toLocation || !price || !distance) {
      return res.status(400).json({ success: false, message: "All booking details are required" });
    }

    const booking = await prisma.rideBooking.create({
      data: {
        vehicleType,
        fromLocation,
        toLocation,
        price: parseFloat(price),
        distance: parseFloat(distance),
        fromLat: fromLat || null,
        fromLon: fromLon || null,
        toLat: toLat || null,
        toLon: toLon || null,
        userId: userId || null,
        status: "confirmed"
      }
    });

    res.status(201).json({
      success: true,
      message: "Ride booked successfully",
      data: booking
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create booking", error: error.message });
  }
};

// Get Booking by ID
export const getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.rideBooking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to get booking", error: error.message });
  }
};

// Initialize Vehicle Types
export const initializeVehicleTypes = async (req, res) => {
  try {
    const vehicleTypes = [
      { name: "Auto", icon: "bicycle", basePrice: 30, pricePerKm: 14, seats: 3, color: "#EF4444", isActive: true },
      { name: "Mini Car", icon: "car-sport", basePrice: 40, pricePerKm: 18, seats: 4, color: "#3B82F6", isActive: true },
      { name: "Sedan", icon: "car", basePrice: 50, pricePerKm: 20, seats: 4, color: "#10B981", isActive: true },
      { name: "SUV", icon: "car-sport", basePrice: 60, pricePerKm: 24, seats: 6, color: "#F59E0B", isActive: true },
      { name: "7-Seater", icon: "people", basePrice: 80, pricePerKm: 30, seats: 7, color: "#8B5CF6", isActive: true }
    ];

    const created = await Promise.all(
      vehicleTypes.map(v => prisma.vehicleType.upsert({ where: { name: v.name }, update: v, create: v }))
    );

    res.json({ success: true, message: "Vehicle types initialized", data: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initialize vehicles", error: error.message });
  }
};
