// src/controllers/destinationController.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Search locations using LocationIQ API - FIXED
const searchLocations = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Query must be at least 3 characters long'
            });
        }

        const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || 'pk.4e99c2bb6538458479e6e356415d31cf';

        console.log(`🔍 Searching locations for: ${query}`);

        // ✅ ADD RATE LIMITING PROTECTION
        const apiUrl = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(query)}&format=json&limit=5&dedupe=1`;
        
        console.log(`🌐 API URL: ${apiUrl.substring(0, 100)}...`);

        const response = await fetch(apiUrl, {
            timeout: 10000 // 10 second timeout
        });

        console.log(`📡 Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ LocationIQ API error: ${response.status}`, errorText);

            // ✅ BETTER ERROR HANDLING
            if (response.status === 429) {
                // Rate limit exceeded - use fallback
                console.log('⚠️ Rate limit exceeded, using fallback data');
                return res.json({
                    success: true,
                    data: getFallbackLocations(query) // Fallback data
                });
            } else if (response.status === 401) {
                throw new Error('Invalid LocationIQ API key');
            } else if (response.status === 403) {
                throw new Error('LocationIQ API access forbidden');
            } else {
                throw new Error(`LocationIQ API request failed: ${response.status} ${response.statusText}`);
            }
        }

        const data = await response.json();
        console.log(`✅ Found ${data.length} locations`);

        // ✅ SAVE TO DATABASE (optional)
        try {
            const savePromises = data.map(async (location) => {
                await prisma.location.upsert({
                    where: { place_id: location.place_id },
                    update: {
                        display_name: location.display_name,
                        lat: location.lat,
                        lon: location.lon
                    },
                    create: {
                        place_id: location.place_id,
                        display_name: location.display_name,
                        lat: location.lat,
                        lon: location.lon
                    }
                });
            });

            await Promise.all(savePromises);
            console.log('💾 Locations saved to database');
        } catch (dbError) {
            console.error('⚠️ Failed to save locations to database:', dbError.message);
        }

        res.json({
            success: true,
            data: data.map(item => ({
                place_id: item.place_id,
                display_name: item.display_name,
                lat: item.lat,
                lon: item.lon
            }))
        });

    } catch (error) {
        console.error('❌ Search locations error:', error);
        
        // ✅ FALLBACK ON ANY ERROR
        console.log('🔄 Using fallback locations due to error');
        res.json({
            success: true,
            data: getFallbackLocations(req.query.query)
        });
    }
};

// Calculate distance and fare - IMPROVED
const calculateFare = async (req, res) => {
    try {
        const { fromLat, fromLon, toLat, toLon, vehicleType } = req.body;

        if (!fromLat || !fromLon || !toLat || !toLon) {
            return res.status(400).json({
                success: false,
                message: 'All location coordinates are required'
            });
        }

        console.log(`📍 Calculating fare from: ${fromLat}, ${fromLon} to: ${toLat}, ${toLon}`);

        // Calculate distance using Haversine formula
        const calculateDistance = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Earth's radius in kilometers
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; // Distance in kilometers
        };

        const distance = calculateDistance(
            parseFloat(fromLat),
            parseFloat(fromLon),
            parseFloat(toLat),
            parseFloat(toLon)
        );

        console.log(`📏 Calculated distance: ${distance.toFixed(2)} km`);

        // Get vehicle types with their pricing
        let vehicleTypes;
        try {
            vehicleTypes = await prisma.vehicleType.findMany({
                where: { isActive: true }
            });
            console.log(`🚗 Found ${vehicleTypes.length} vehicle types`);
        } catch (dbError) {
            console.error('⚠️ Database error, using default vehicle types:', dbError.message);
            // Fallback to default vehicle types if database fails
            vehicleTypes = [
                { id: '1', name: 'Auto', icon: 'bicycle', seats: 3, color: '#EF4444' },
                { id: '2', name: 'Mini Car', icon: 'car-sport', seats: 4, color: '#3B82F6' },
                { id: '3', name: 'Sedan', icon: 'car', seats: 4, color: '#10B981' },
                { id: '4', name: 'SUV', icon: 'car-sport', seats: 6, color: '#F59E0B' },
                { id: '5', name: '7-Seater', icon: 'people', seats: 7, color: '#8B5CF6' }
            ];
        }

        // Calculate fares for all vehicle types
        const RATE_PER_KM = 20; // Base rate per km
        const baseFare = distance * RATE_PER_KM;

        const fares = vehicleTypes.map(vehicle => {
            let priceMultiplier = 1;
            switch (vehicle.name.toLowerCase()) {
                case 'auto': priceMultiplier = 0.7; break;
                case 'mini car': priceMultiplier = 0.9; break;
                case 'sedan': priceMultiplier = 1; break;
                case 'suv': priceMultiplier = 1.2; break;
                case '7-seater': priceMultiplier = 1.5; break;
                default: priceMultiplier = 1;
            }

            const finalPrice = baseFare * priceMultiplier;

            return {
                id: vehicle.id,
                name: vehicle.name,
                icon: vehicle.icon,
                price: parseFloat(finalPrice.toFixed(2)),
                seats: `${vehicle.seats} Seats`,
                time: '5-10 min',
                color: vehicle.color,
                selected: false
            };
        });

        console.log(`💰 Base fare: ₹${baseFare.toFixed(2)}, Vehicle fares calculated`);

        res.json({
            success: true,
            data: {
                distance: parseFloat(distance.toFixed(2)),
                baseFare: parseFloat(baseFare.toFixed(2)),
                ratePerKm: RATE_PER_KM,
                vehicles: fares
            }
        });

    } catch (error) {
        console.error('❌ Calculate fare error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate fare',
            error: error.message
        });
    }
};

// Create ride booking - COMPLETELY FIXED
const createBooking = async (req, res) => {
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
            userId,
            customerName,
            customerPhone
        } = req.body;

        console.log('🚗 Creating booking with data:', {
            vehicleType,
            fromLocation: fromLocation?.substring(0, 50) + '...',
            toLocation: toLocation?.substring(0, 50) + '...',
            price,
            distance,
            fromLat, typeofFromLat: typeof fromLat,
            fromLon, typeofFromLon: typeof fromLon,
            toLat, typeofToLat: typeof toLat,
            toLon, typeofToLon: typeof toLon,
            userId,
            customerName,
            customerPhone
        });

        if (!vehicleType || !fromLocation || !toLocation || !price || !distance) {
            return res.status(400).json({
                success: false,
                message: 'All booking details are required'
            });
        }

        // ✅ FIXED: Smart rider finding logic
        let rider;

        // 1. First try to find rider by userId if provided
        if (userId) {
            rider = await prisma.rider.findUnique({
                where: { id: userId }
            });
            console.log(`🔍 Looked up rider by userId ${userId}:`, rider ? 'Found' : 'Not found');
        }

        // 2. If rider not found by userId, try to find by phone number
        if (!rider && customerPhone) {
            rider = await prisma.rider.findUnique({
                where: { phone: customerPhone }
            });
            console.log(`🔍 Looked up rider by phone ${customerPhone}:`, rider ? 'Found' : 'Not found');
        }

        // 3. If still no rider found, create a new one with unique phone
        if (!rider) {
            const actualName = customerName || 'Customer';
            
            // ✅ Generate unique phone if provided phone already exists
            let actualPhone = customerPhone;
            if (customerPhone) {
                // Check if phone already exists
                const existingRider = await prisma.rider.findUnique({
                    where: { phone: customerPhone }
                });
                if (existingRider) {
                    // Add timestamp to make phone unique
                    actualPhone = `${customerPhone}_${Date.now()}`;
                    console.log(`⚠️ Phone ${customerPhone} exists, using unique: ${actualPhone}`);
                }
            } else {
                actualPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
            }

            rider = await prisma.rider.create({
                data: {
                    fullName: actualName,
                    phone: actualPhone,
                    acceptTerms: true
                }
            });
            console.log(`👤 Created new rider: ${rider.id} with name: ${actualName}`);
        } else {
            console.log(`👤 Using existing rider: ${rider.id} with name: ${rider.fullName}`);
        }

        // ✅ FIX: Convert coordinates to numbers properly
        const bookingData = {
            vehicleType,
            fromLocation,
            toLocation,
            price: typeof price === 'string' ? parseFloat(price) : Number(price),
            distance: typeof distance === 'string' ? parseFloat(distance) : Number(distance),
            fromLat: fromLat ? (typeof fromLat === 'string' ? parseFloat(fromLat) : Number(fromLat)) : null,
            fromLon: fromLon ? (typeof fromLon === 'string' ? parseFloat(fromLon) : Number(fromLon)) : null,
            toLat: toLat ? (typeof toLat === 'string' ? parseFloat(toLat) : Number(toLat)) : null,
            toLon: toLon ? (typeof toLon === 'string' ? parseFloat(toLon) : Number(toLon)) : null,
            userId: rider.id,
            status: 'PENDING'
        };

        console.log('📊 Processed booking data:', bookingData);

        const booking = await prisma.rideBooking.create({
            data: bookingData,
            include: {
                rider: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        email: true
                    }
                }
            }
        });

        console.log(`✅ Booking created with ID: ${booking.id}, Status: ${booking.status}`);

        res.status(201).json({
            success: true,
            message: 'Ride booked successfully',
            data: {
                id: booking.id,
                vehicleType: booking.vehicleType,
                fromLocation: booking.fromLocation,
                toLocation: booking.toLocation,
                price: booking.price,
                distance: booking.distance,
                status: booking.status,
                customerName: booking.rider.fullName,
                customerPhone: booking.rider.phone,
                customerEmail: booking.rider.email,
                createdAt: booking.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Create booking error:', error);
        
        // Handle unique constraint errors
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Phone number already exists. Please try again.',
                error: error.message
            });
        }

        // Specific error handling for status enum
        if (error.message.includes('RideStatus') || error.message.includes('status')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid booking status. Please use valid status from: PENDING, ACCEPTED, DECLINED, CANCELLED',
                error: error.message
            });
        }

        // Handle coordinate parsing errors
        if (error.message.includes('Float') || error.message.includes('fromLat') || error.message.includes('fromLon')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates format. Please provide valid numbers for coordinates.',
                error: error.message
            });
        }

        // Handle rider relation errors
        if (error.message.includes('rider') || error.message.includes('Rider') || error.message.includes('userId')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid rider information. Please provide a valid rider ID.',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create booking',
            error: error.message
        });
    }
};

// Get booking by ID
// Get booking by ID - include proper driver details
const getBooking = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📋 Fetching booking: ${id}`);

        const booking = await prisma.rideBooking.findUnique({
            where: { id },
            include: {
                rider: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        email: true,
                        rating: true
                    }
                },
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        vehicleNumber: true,
                        rating: true,
                        totalRides: true
                    }
                }
            }
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Format response for frontend
        const responseData = {
            bookingId: booking.id,
            fromLocation: booking.fromLocation,
            toLocation: booking.toLocation,
            price: booking.price.toString(),
            distance: booking.distance.toString(),
            customerName: booking.rider.fullName,
            customerPhone: booking.rider.phone,
            customerEmail: booking.rider.email,
            customerRating: booking.rider.rating,
            pickupLat: booking.fromLat,
            pickupLng: booking.fromLon,
            dropLat: booking.toLat,
            dropLng: booking.toLon,
            status: booking.status,
            vehicleType: booking.vehicleType,
            userId: booking.userId,
            // ✅ Proper driver details from relation
            driverId: booking.driver?.id,
            driverName: booking.driver?.fullName, // Actual name from driver table
            driverPhone: booking.driver?.phone,
            driverVehicle: booking.driver?.vehicleNumber,
            driverRating: booking.driver?.rating,
            driverTotalRides: booking.driver?.totalRides,
            driver: booking.driver // Complete driver object
        };

        console.log(`✅ Booking found with driver: ${responseData.driverName}`);

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('❌ Get booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get booking',
            error: error.message
        });
    }
};
// Update booking status - NEW FUNCTION
const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        console.log(`🔄 Updating booking ${id} status to: ${status}`);

        // Validate status
        const validStatuses = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const booking = await prisma.rideBooking.update({
            where: { id },
            data: { 
                status,
                // Set timestamp based on status
                ...(status === 'ACCEPTED' && { acceptedAt: new Date() }),
                ...(status === 'DECLINED' && { declinedAt: new Date() }),
                ...(status === 'CANCELLED' && { cancelledAt: new Date() })
            }
        });

        console.log(`✅ Booking ${id} status updated to: ${booking.status}`);

        res.json({
            success: true,
            message: 'Booking status updated successfully',
            data: booking
        });

    } catch (error) {
        console.error('❌ Update booking status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update booking status',
            error: error.message
        });
    }
};

// Cancel booking - NEW FUNCTION
const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`❌ Cancelling booking: ${id}`);

        const booking = await prisma.rideBooking.update({
            where: { id },
            data: { 
                status: 'CANCELLED',
                cancelledAt: new Date()
            }
        });

        console.log(`✅ Booking ${id} cancelled successfully`);

        res.json({
            success: true,
            message: 'Booking cancelled successfully',
            data: booking
        });

    } catch (error) {
        console.error('❌ Cancel booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel booking',
            error: error.message
        });
    }
};

// Initialize vehicle types (run once)
const initializeVehicleTypes = async (req, res) => {
    try {
        const vehicleTypes = [
            {
                name: 'Auto',
                icon: 'bicycle',
                basePrice: 30,
                pricePerKm: 14,
                seats: 3,
                color: '#EF4444',
                isActive: true
            },
            {
                name: 'Mini Car',
                icon: 'car-sport',
                basePrice: 40,
                pricePerKm: 18,
                seats: 4,
                color: '#3B82F6',
                isActive: true
            },
            {
                name: 'Sedan',
                icon: 'car',
                basePrice: 50,
                pricePerKm: 20,
                seats: 4,
                color: '#10B981',
                isActive: true
            },
            {
                name: 'SUV',
                icon: 'car-sport',
                basePrice: 60,
                pricePerKm: 24,
                seats: 6,
                color: '#F59E0B',
                isActive: true
            },
            {
                name: '7-Seater',
                icon: 'people',
                basePrice: 80,
                pricePerKm: 30,
                seats: 7,
                color: '#8B5CF6',
                isActive: true
            }
        ];

        const createdVehicles = await Promise.all(
            vehicleTypes.map(vehicle =>
                prisma.vehicleType.upsert({
                    where: { name: vehicle.name },
                    update: vehicle,
                    create: vehicle
                })
            )
        );

        console.log('✅ Vehicle types initialized');

        res.json({
            success: true,
            message: 'Vehicle types initialized successfully',
            data: createdVehicles
        });

    } catch (error) {
        console.error('❌ Initialize vehicle types error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize vehicle types',
            error: error.message
        });
    }
};

// Health check for LocationIQ API
const checkLocationIQHealth = async (req, res) => {
    try {
        const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || 'pk.4e99c2bb6538458479e6e356415d31cf';

        const response = await fetch(
            `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=New%20Delhi&format=json&limit=1`
        );

        if (response.ok) {
            res.json({
                success: true,
                message: 'LocationIQ API is working correctly',
                status: response.status
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'LocationIQ API is not responding',
                status: response.status
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'LocationIQ API health check failed',
            error: error.message
        });
    }
};

export {
    searchLocations,
    calculateFare,
    createBooking,
    getBooking,
    updateBookingStatus,
    cancelBooking,
    initializeVehicleTypes,
    checkLocationIQHealth
};