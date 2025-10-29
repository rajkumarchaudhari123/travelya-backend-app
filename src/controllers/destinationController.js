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
        console.log(`🔑 Using LocationIQ key: ${LOCATIONIQ_KEY.substring(0, 10)}...`);

        const apiUrl = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(query)}&format=json&limit=5`;
        console.log(`🌐 API URL: ${apiUrl}`);

        const response = await fetch(apiUrl);

        console.log(`📡 Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ LocationIQ API error: ${response.status}`, errorText);

            // More specific error handling
            if (response.status === 401) {
                throw new Error('Invalid LocationIQ API key');
            } else if (response.status === 403) {
                throw new Error('LocationIQ API access forbidden');
            } else if (response.status === 429) {
                throw new Error('LocationIQ API rate limit exceeded');
            } else {
                throw new Error(`LocationIQ API request failed: ${response.status} ${response.statusText}`);
            }
        }

        const data = await response.json();
        console.log(`✅ Found ${data.length} locations`);

        // Save searched locations to database (optional - can be skipped if failing)
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
            // Continue even if database save fails
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
        res.status(500).json({
            success: false,
            message: 'Failed to search locations',
            error: error.message,
            details: 'Please check your LocationIQ API key and internet connection'
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

// Create ride booking - IMPROVED
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
            userId
        } = req.body;

        console.log('🚗 Creating booking with data:', {
            vehicleType,
            fromLocation: fromLocation?.substring(0, 50) + '...',
            toLocation: toLocation?.substring(0, 50) + '...',
            price,
            distance
        });

        if (!vehicleType || !fromLocation || !toLocation || !price || !distance) {
            return res.status(400).json({
                success: false,
                message: 'All booking details are required'
            });
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
                status: 'confirmed'
            }
        });

        console.log(`✅ Booking created with ID: ${booking.id}`);

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
                createdAt: booking.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Create booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create booking',
            error: error.message
        });
    }
};

// Get booking by ID
const getBooking = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📋 Fetching booking: ${id}`);

        const booking = await prisma.rideBooking.findUnique({
            where: { id }
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            data: booking
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
    initializeVehicleTypes,
    checkLocationIQHealth
};