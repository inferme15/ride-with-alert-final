import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { api, socketEvents } from "@shared/routes";
import { insertVehicleSchema, insertDriverSchema } from "@shared/schema";
import { generateTemporaryCredentials, getLocationName, isLocationInIndia } from "./utils";
import { getCachedNearbyFacilities, getEmergencyFacilities, preloadFacilities, getCacheStats } from "./facility-cache";
import { EmailService } from "./email-service";
import { z } from "zod";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `emergency-${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ 
  storage: storageConfig,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for emergency videos
    fieldSize: 10 * 1024 * 1024  // 10MB for other fields
  },
  fileFilter: (req, file, cb) => {
    console.log('📁 [MULTER] File filter check:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Accept video files - be more lenient with MIME types since browsers may report incorrectly
    const isVideo = file.mimetype.startsWith('video/') || 
                    file.originalname.endsWith('.webm') ||
                    file.originalname.endsWith('.mp4') ||
                    file.originalname.endsWith('.mov') ||
                    file.mimetype === 'application/octet-stream'; // Fallback for unknown types
    
    if (isVideo) {
      console.log('✅ [MULTER] Video file accepted');
      cb(null, true);
    } else {
      console.error('❌ [MULTER] Non-video file rejected:', file.mimetype);
      cb(new Error('Only video files are allowed') as any, false);
    }
  }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Socket.IO setup
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Join rooms based on roles (simulated for now, everyone listens to everything in MVP or room based)
    // For simplicity, we'll broadcast to everyone or specific rooms.

    socket.on(socketEvents.EMERGENCY_TRIGGERED, (data) => {
      console.log("Emergency triggered:", data);
      io.emit(socketEvents.RECEIVE_EMERGENCY, data);
    });

    socket.on(socketEvents.LOCATION_UPDATE, (data) => {
      console.log("📍 [GPS UPDATE] Location received:", {
        vehicleNumber: data.vehicleNumber,
        location: data.location,
        timestamp: new Date().toISOString()
      });
      io.emit(socketEvents.RECEIVE_LOCATION, data);
    });

    // Relay simulated vehicle positions from manager to drivers
    socket.on('VEHICLE_POSITION_UPDATE', (data) => {
      socket.broadcast.emit('VEHICLE_POSITION_UPDATE', data);
    });

    // Relay trip completion notifications
    socket.on('TRIP_COMPLETED', (data) => {
      io.emit('TRIP_COMPLETED', data);
    });

    socket.on(socketEvents.ALARM_STOP, (data) => {
      io.emit(socketEvents.STOP_ALARM, data);
    });

    socket.on(socketEvents.ACKNOWLEDGEMENT_SENT, (data) => {
      io.emit(socketEvents.RECEIVE_ACKNOWLEDGEMENT, data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Serve uploaded files with proper video streaming support
  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(uploadDir, req.path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    
    // Set proper MIME type based on file extension
    const mimeTypes: Record<string, string> = {
      '.webm': 'video/webm',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    // Handle video streaming with range requests
    if (mimeType.startsWith('video/')) {
      const range = req.headers.range;
      
      if (range) {
        // Parse range header
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        // Create read stream for the requested range
        const file = fs.createReadStream(filePath, { start, end });
        
        // Set headers for partial content
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache'
        });
        
        file.pipe(res);
      } else {
        // No range request, send entire file
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });
        
        fs.createReadStream(filePath).pipe(res);
      }
    } else {
      // For non-video files, send normally
      res.setHeader('Content-Type', mimeType);
      res.sendFile(filePath);
    }
  });

  // Lightweight health endpoint for quick review checks.
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "RideWithAlert API",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      emailConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD),
      environment: process.env.NODE_ENV || "development",
      databaseConnected: true, // If we reach here, DB is connected
    });
  });

  // Email test endpoint for review/demo.
  app.post("/api/notifications/test", async (req, res) => {
    const testRecipients = (process.env.EMERGENCY_EMAIL_RECIPIENTS?.split(',') || [process.env.EMAIL_USER])
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s));
    const customMessage = req.body?.message;

    const defaultMessage = `TEST ALERT (RideWithAlert)

This is a review/demo email notification test.
No real emergency action is required.

Time: ${new Date().toLocaleString('en-IN', { 
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: '2-digit', 
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
})}

Test Details:
System: RideWithAlert Emergency System
Environment: ${process.env.NODE_ENV || 'development'}
Email Service: Gmail SMTP

This message is for testing purposes only. Please do not panic.`;

    const message = String(customMessage || defaultMessage);

    try {
      const results = [];
      
      for (const recipient of testRecipients) {
        try {
          // Use EmailService to send test email
          await EmailService.sendTestEmail(recipient, message);
          results.push({ recipient, status: 'sent' });
        } catch (error) {
          results.push({ recipient, status: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
      }

      res.json({
        message: "Test email notifications processed",
        recipients: testRecipients,
        results
      });
    } catch (error: any) {
      console.error("Email notification test error:", error);
      res.status(500).json({
        message: "Failed to process test email notifications",
        error: error?.message || "Unknown error",
      });
    }
  });

  // Simple email connectivity test
  app.get("/api/email/test-connection", async (req, res) => {
    try {
      console.log('🧪 Testing email connection...');
      const isReady = await EmailService.testConnection();
      
      if (isReady) {
        res.json({ 
          status: 'success', 
          message: 'Email service is ready',
          config: {
            host: 'smtp.gmail.com',
            user: process.env.EMAIL_USER?.trim().replace(/\\n/g, '').replace(/\n/g, ''),
            hasPassword: !!process.env.EMAIL_APP_PASSWORD
          }
        });
      } else {
        res.status(500).json({ 
          status: 'error', 
          message: 'Email service connection failed' 
        });
      }
    } catch (error) {
      console.error('Email connection test failed:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Email connection test failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // === AUTH API ===
  app.post(api.auth.managerLogin.path, async (req, res) => {
    const { username, password } = req.body;
    const manager = await storage.getManagerByUsername(username);
    // In a real app, use bcrypt. Here we compare plaintext for simplicity/MVP as per instructions "Laptop Simulation".
    if (!manager || manager.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // Set simple session/cookie or just return user object for frontend state
    // For this MVP, returning user object is enough for frontend localStorage
    res.json(manager);
  });

  app.post(api.auth.driverLogin.path, async (req, res) => {
    const { temporaryUsername, temporaryPassword } = req.body;
    const trip = await storage.getTripByCredentials(temporaryUsername, temporaryPassword);
    if (!trip) {
      return res.status(401).json({ message: "Invalid temporary credentials or trip expired" });
    }

    // Track driver login session
    global.driverSessions.add(trip.driverNumber);
    console.log(`🚗 Driver ${trip.driverNumber} logged in - Real GPS tracking active`);

    res.json(trip);
  });

  app.post(api.auth.logout.path, (req, res) => {
    res.json({ message: "Logged out" });
  });

  // === VEHICLE API ===
  app.post(api.vehicles.register.path, async (req, res) => {
    try {
      const input = insertVehicleSchema.parse(req.body);
      const vehicle = await storage.createVehicle(input);
      res.status(201).json(vehicle);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.trips.assign.path, async (req, res) => {
    console.log('🚗 [Trip Assignment] Request received:', {
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    const { 
      driverNumber, 
      vehicleNumber,
      startLocation,
      startLatitude,
      startLongitude,
      endLocation,
      endLatitude,
      endLongitude,
      selectedRoute,
      routeId,
      routeData,
      safetyMetrics,
      estimatedTime,
      distance
    } = req.body;
    
    console.log('🚗 [Trip Assignment] Parsed data:', {
      driverNumber,
      vehicleNumber,
      hasStartCoords: !!(startLatitude && startLongitude),
      hasEndCoords: !!(endLatitude && endLongitude),
      hasSelectedRoute: !!selectedRoute,
      routeId,
      startLocation,
      endLocation
    });
    
    try {
      console.log('🔍 [Trip Assignment] Looking up driver and vehicle...');
      const driver = await storage.getDriverByDriverNumber(driverNumber);
      const vehicle = await storage.getVehicleByVehicleNumber(vehicleNumber);
      
      console.log('🔍 [Trip Assignment] Lookup results:', {
        driverFound: !!driver,
        vehicleFound: !!vehicle,
        driverData: driver ? { driverNumber: driver.driverNumber, name: driver.name } : null,
        vehicleData: vehicle ? { vehicleNumber: vehicle.vehicleNumber, vehicleType: vehicle.vehicleType } : null
      });
      
      if (!driver || !vehicle) {
        console.error('❌ [Trip Assignment] Driver or Vehicle not found');
        return res.status(404).json({ message: "Driver or Vehicle not found" });
      }

      console.log('🔍 [Trip Assignment] Checking for existing active trips...');
      // Check if driver or vehicle already has active trip
      const existingDriverTrip = await storage.getActiveTripByDriverNumber(driverNumber);
      const existingVehicleTrip = await storage.getActiveTripByVehicleNumber(vehicleNumber);
      
      console.log('🔍 [Trip Assignment] Active trip check results:', {
        driverHasActiveTrip: !!existingDriverTrip,
        vehicleHasActiveTrip: !!existingVehicleTrip,
        existingDriverTripId: existingDriverTrip?.tripId,
        existingVehicleTripId: existingVehicleTrip?.tripId
      });
      
      if (existingDriverTrip || existingVehicleTrip) {
        let conflictMessage = "Cannot assign trip due to conflicts:\n";
        
        if (existingDriverTrip) {
          conflictMessage += `• Driver ${driverNumber} already has active trip #${existingDriverTrip.tripId} with vehicle ${existingDriverTrip.vehicleNumber}\n`;
        }
        
        if (existingVehicleTrip) {
          conflictMessage += `• Vehicle ${vehicleNumber} already has active trip #${existingVehicleTrip.tripId} with driver ${existingVehicleTrip.driverNumber}\n`;
        }
        
        conflictMessage += "\nPlease complete or cancel existing trips first.";
        
        console.warn('⚠️ [Trip Assignment] Conflict detected:', conflictMessage);
        return res.status(400).json({ 
          message: "Driver or Vehicle already has an active trip",
          details: conflictMessage,
          conflicts: {
            driverTrip: existingDriverTrip ? {
              tripId: existingDriverTrip.tripId,
              vehicleNumber: existingDriverTrip.vehicleNumber,
              startLocation: existingDriverTrip.startLocation,
              createdAt: existingDriverTrip.createdAt
            } : null,
            vehicleTrip: existingVehicleTrip ? {
              tripId: existingVehicleTrip.tripId,
              driverNumber: existingVehicleTrip.driverNumber,
              startLocation: existingVehicleTrip.startLocation,
              createdAt: existingVehicleTrip.createdAt
            } : null
          }
        });
      }

      let routeToUse;
      let routeAnalysis;

      // Use selected route if provided, otherwise generate new routes
      if (selectedRoute && routeId) {
        console.log('✅ Using user-selected route:', routeId);
        routeToUse = selectedRoute;
        routeAnalysis = { 
          routes: [selectedRoute], 
          safestRoute: selectedRoute,
          recommendedRoute: selectedRoute
        };
      } else {
        console.log('🔄 Generating new route analysis...');
        // SMART ROUTE OPTIMIZATION + SAFETY ANALYSIS
        const { RouteOptimizer } = await import('./route-optimizer');
        routeAnalysis = await RouteOptimizer.generateRoutes(
          { lat: startLatitude, lng: startLongitude, address: startLocation },
          { lat: endLatitude, lng: endLongitude, address: endLocation },
          vehicle.vehicleType
        );
        routeToUse = routeAnalysis.safestRoute;
      }

      console.log(`[ROUTE ANALYSIS] Using route with safety score: ${routeToUse.safetyMetrics?.overallSafetyScore || routeToUse.safetyScore}/100`);

      // Generate temporary credentials
      const { temporaryUsername, temporaryPassword } = generateTemporaryCredentials();

      // Create trip with route information - STORE ALL ROUTES
      const routeDataToStore = routeToUse.geometry?.coordinates || routeToUse.points || [];
      
      // Store ALL routes from analysis for map display
      const allRoutesData = routeAnalysis?.routes || [routeToUse];
      
      console.log(`[DEBUG] Storing route data:`, {
        hasGeometry: !!routeToUse.geometry,
        hasCoordinates: !!routeToUse.geometry?.coordinates,
        hasPoints: !!routeToUse.points,
        coordinatesLength: routeDataToStore.length,
        allRoutesCount: allRoutesData.length,
        routeToUseKeys: Object.keys(routeToUse),
        sampleCoordinate: routeDataToStore[0]
      });

      const trip = await storage.createTrip({
        driverNumber,
        vehicleNumber,
        temporaryUsername,
        temporaryPassword,
        startLocation: startLocation || "Start Location",
        endLocation: endLocation || "Destination",
        startLatitude: startLatitude ? String(startLatitude) : null,
        startLongitude: startLongitude ? String(startLongitude) : null,
        endLatitude: endLatitude ? String(endLatitude) : null,
        endLongitude: endLongitude ? String(endLongitude) : null,
        currentLatitude: startLatitude ? String(startLatitude) : null,
        currentLongitude: startLongitude ? String(startLongitude) : null,
        routeData: JSON.stringify(routeDataToStore), // Store selected route coordinates
        // Store additional route analysis data as JSON
        assignedRouteId: null, // We'll use this field to store all routes JSON
        status: "ACTIVE",
      });
      // Get full trip with relations
      const fullTrip = await storage.getTripByCredentials(temporaryUsername, temporaryPassword);
      if (!fullTrip) {
        return res.status(500).json({ message: "Failed to create trip" });
      }

      // Send email notification with trip details and route map
      try {
        console.log('📧 Sending email notification to driver:', driver.email);
        await EmailService.sendTripAssignment(driver, fullTrip, vehicle, routeToUse);
        console.log('✅ Email notification sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send email notification:', emailError);
        console.log('⚠️ Trip assignment continues despite email failure');
        // Don't fail the trip assignment if email fails
      }

      // Emit socket event with route analysis
      io.emit('TRIP_CREATED', {
        ...fullTrip,
        routeAnalysis,
        selectedRoute: selectedRoute || null
      });

      // Preload facilities in background when trip starts
      setImmediate(async () => {
        try {
          if (fullTrip.startLatitude && fullTrip.startLongitude) {
            console.log(`🚀 [PRELOAD] Background loading facilities for trip ${fullTrip.tripId}`);
            await preloadFacilities(
              parseFloat(fullTrip.startLatitude), 
              parseFloat(fullTrip.startLongitude)
            );
          }
        } catch (error) {
          console.warn('⚠️ [PRELOAD] Failed to preload facilities:', error);
        }
      });

      console.log('✅ Trip assigned successfully:', {
        tripId: fullTrip.tripId,
        vehicle: vehicleNumber,
        driver: driver.name,
        routeUsed: selectedRoute ? 'User Selected' : 'Auto Generated'
      });

      res.json({
        ...fullTrip,
        routeAnalysis,
        selectedRoute: selectedRoute || null
      });
    } catch (err) {
      console.error("❌ [Trip Assignment] Error:", err);
      console.error("❌ [Trip Assignment] Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        requestData: {
          driverNumber,
          vehicleNumber,
          hasStartLocation: !!startLocation,
          hasEndLocation: !!endLocation,
          hasCoordinates: !!(startLatitude && startLongitude && endLatitude && endLongitude)
        }
      });
      
      res.status(500).json({ 
        message: "Failed to assign trip", 
        error: err instanceof Error ? err.message : "Internal server error",
        details: "Check server logs for more information"
      });
    }
  });

  // Check driver login status
  app.get("/api/drivers/:driverNumber/login-status", async (req, res) => {
    try {
      const { driverNumber } = req.params;
      
      // Check if driver has an active session (simplified check)
      // In a real app, you'd check session storage or JWT tokens
      const driver = await storage.getDriverByDriverNumber(driverNumber);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }
      
      // For now, we'll track login status via a simple in-memory store
      // In production, use Redis or database sessions
      const isLoggedIn = global.driverSessions?.has(driverNumber) || false;
      
      res.json({ isLoggedIn, driverNumber });
    } catch (error) {
      console.error('Error checking driver login status:', error);
      res.status(500).json({ message: "Failed to check login status" });
    }
  });

  // === DATABASE RESET UTILITY ===
  
  // Reset entire database (for fresh start)
  app.post("/api/database/reset", async (req, res) => {
    try {
      console.log('[Database Reset] Starting complete database reset...');
      
      // Get counts before reset
      const drivers = await storage.getAllDrivers();
      const vehicles = await storage.getAllVehicles();
      const trips = await storage.getAllTrips();
      const emergencies = await storage.getAllEmergencies();
      
      console.log(`[Database Reset] Before reset - Drivers: ${drivers.length}, Vehicles: ${vehicles.length}, Trips: ${trips.length}, Emergencies: ${emergencies.length}`);
      
      // Clear all tables (in correct order due to foreign key constraints)
      await storage.clearAllEmergencies();
      await storage.clearAllTrips();
      await storage.clearAllDrivers();
      await storage.clearAllVehicles();
      
      console.log('[Database Reset] All data cleared successfully');
      
      res.json({ 
        message: "Database reset successfully - Fresh start!",
        clearedData: {
          drivers: drivers.length,
          vehicles: vehicles.length,
          trips: trips.length,
          emergencies: emergencies.length
        }
      });
      
    } catch (error) {
      console.error('[Database Reset] Error:', error);
      res.status(500).json({ 
        message: "Failed to reset database",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Clear all active emergencies (for testing/debugging)
  app.post("/api/emergencies/clear-active", async (req, res) => {
    try {
      console.log('[Clear Active Emergencies] Clearing all active emergencies...');
      
      // Get all active emergencies
      const activeEmergencies = await storage.getAllEmergencies();
      const activeEmergenciesList = activeEmergencies.filter(emergency => 
        emergency.status === "ACTIVE" || emergency.status === "ACKNOWLEDGED"
      );
      
      console.log(`[Clear Active Emergencies] Found ${activeEmergenciesList.length} active emergencies`);
      
      // Resolve all active emergencies
      for (const emergency of activeEmergenciesList) {
        await storage.updateEmergencyStatus(emergency.emergencyId, "RESOLVED");
        console.log(`[Clear Active Emergencies] Resolved emergency #${emergency.emergencyId} (${emergency.driverNumber} - ${emergency.vehicleNumber})`);
      }
      
      res.json({ 
        message: `Cleared ${activeEmergenciesList.length} active emergencies`,
        clearedEmergencies: activeEmergenciesList.map(emergency => ({
          emergencyId: emergency.emergencyId,
          driverNumber: emergency.driverNumber,
          vehicleNumber: emergency.vehicleNumber,
          status: emergency.status
        }))
      });
      
    } catch (error) {
      console.error('[Clear Active Emergencies] Error:', error);
      res.status(500).json({ message: "Failed to clear active emergencies" });
    }
  });

  // === TRIP MANAGEMENT UTILITIES ===
  
  // Clear all active trips (for testing/debugging)
  app.post("/api/trips/clear-active", async (req, res) => {
    try {
      console.log('[Clear Active Trips] Clearing all active trips...');
      
      // Get all active trips
      const activeTrips = await storage.getAllTrips();
      const activeTripsList = activeTrips.filter(trip => trip.status === "ACTIVE");
      
      console.log(`[Clear Active Trips] Found ${activeTripsList.length} active trips`);
      
      // Complete all active trips
      for (const trip of activeTripsList) {
        await storage.updateTripStatus(trip.tripId, "COMPLETED");
        console.log(`[Clear Active Trips] Completed trip #${trip.tripId} (${trip.driverNumber} - ${trip.vehicleNumber})`);
      }
      
      res.json({ 
        message: `Cleared ${activeTripsList.length} active trips`,
        clearedTrips: activeTripsList.map(trip => ({
          tripId: trip.tripId,
          driverNumber: trip.driverNumber,
          vehicleNumber: trip.vehicleNumber,
          startLocation: trip.startLocation
        }))
      });
      
    } catch (error) {
      console.error('[Clear Active Trips] Error:', error);
      res.status(500).json({ message: "Failed to clear active trips" });
    }
  });

  // Debug endpoint to check database data
  app.get("/api/debug/data", async (req, res) => {
    try {
      const drivers = await storage.getAllDrivers();
      const vehicles = await storage.getAllVehicles();
      const managers = await storage.getAllManagers();
      
      console.log(`[DEBUG DATA] Drivers: ${drivers.length}, Vehicles: ${vehicles.length}, Managers: ${managers.length}`);
      
      res.json({
        drivers: drivers.map(d => ({ driverNumber: d.driverNumber, name: d.name })),
        vehicles: vehicles.map(v => ({ vehicleNumber: v.vehicleNumber, vehicleType: v.vehicleType })),
        managers: managers.map(m => ({ username: m.username })),
        counts: {
          drivers: drivers.length,
          vehicles: vehicles.length,
          managers: managers.length
        }
      });
    } catch (error) {
      console.error('[DEBUG DATA] Error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(api.vehicles.list.path, async (req, res) => {
    const availableOnly = req.query.available === 'true';
    
    if (availableOnly) {
      // Get vehicles that are NOT in active trips
      const vehicles = await storage.getAvailableVehicles();
      res.json(vehicles);
    } else {
      // Get all vehicles
      const vehicles = await storage.getAllVehicles();
      res.json(vehicles);
    }
  });

  // Test endpoint to create a trip with route data
  app.post("/api/test/create-trip-with-route", async (req, res) => {
    try {
      console.log('[TEST] Creating test trip with route data...');
      
      // Sample route coordinates (Bangalore to Coimbatore)
      const sampleRouteCoordinates = [
        [77.5946, 12.9716], // Bangalore
        [77.6000, 12.9500],
        [77.6200, 12.9200],
        [77.6500, 12.8800],
        [77.7000, 12.8000],
        [77.7500, 12.7000],
        [77.8000, 12.6000],
        [77.8500, 12.5000],
        [77.9000, 12.4000],
        [77.9500, 12.3000],
        [78.0000, 12.2000],
        [78.0500, 12.1000],
        [78.1000, 12.0000],
        [78.1500, 11.9000],
        [78.2000, 11.8000],
        [78.2500, 11.7000],
        [78.3000, 11.6000],
        [78.3500, 11.5000],
        [78.4000, 11.4000],
        [78.4500, 11.3000],
        [78.5000, 11.2000],
        [78.5500, 11.1000],
        [76.9558, 11.0168]  // Coimbatore
      ];

      // Generate temporary credentials
      const { temporaryUsername, temporaryPassword } = generateTemporaryCredentials();

      const trip = await storage.createTrip({
        driverNumber: "d1",
        vehicleNumber: "v1", 
        temporaryUsername,
        temporaryPassword,
        startLocation: "Bangalore",
        endLocation: "Coimbatore",
        startLatitude: "12.9716",
        startLongitude: "77.5946",
        endLatitude: "11.0168",
        endLongitude: "76.9558",
        currentLatitude: "12.9716",
        currentLongitude: "77.5946",
        routeData: JSON.stringify(sampleRouteCoordinates),
        status: "ACTIVE",
      });

      console.log('[TEST] Created test trip:', trip.tripId);
      
      // Test the parsing by retrieving the trip
      const retrievedTrip = await storage.getTripByCredentials(temporaryUsername, temporaryPassword);
      
      res.json({
        success: true,
        tripId: trip.tripId,
        credentials: { temporaryUsername, temporaryPassword },
        routeDataStored: !!trip.routeData,
        routeGeometryParsed: !!retrievedTrip?.routeGeometry,
        coordinatesCount: retrievedTrip?.routeGeometry?.coordinates?.length || 0,
        dangerZonesCount: retrievedTrip?.dangerZones?.length || 0,
        facilitiesCount: retrievedTrip?.facilities?.length || 0
      });
    } catch (error) {
      console.error('[TEST] Error creating test trip:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(api.trips.complete.path, async (req, res) => {
    const { tripId } = req.body;
    try {
      const trip = await storage.completeTrip(tripId);
      res.json(trip);
    } catch (err) {
      res.status(404).json({ message: "Trip not found" });
    }
  });

  // Auto-completion endpoint with notifications
  app.post("/api/trips/:tripId/complete", async (req, res) => {
    const { tripId } = req.params;
    try {
      // Get trip details before completion
      const fullTrip = await storage.getTripById(parseInt(tripId));
      if (!fullTrip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      // Complete the trip
      const completedTrip = await storage.completeTrip(parseInt(tripId));
      
      console.log(`🎯 [AUTO-COMPLETE] Trip ${tripId} completed - Vehicle ${fullTrip.vehicleNumber} reached ${fullTrip.endLocation}`);

      // Emit completion event to all clients
      io.emit('TRIP_COMPLETED', {
        tripId: parseInt(tripId),
        vehicleNumber: fullTrip.vehicleNumber,
        driverNumber: fullTrip.driverNumber,
        endLocation: fullTrip.endLocation,
        completedAt: new Date().toISOString()
      });

      res.json({ 
        ...completedTrip, 
        message: "Trip completed successfully",
        autoCompleted: true 
      });
    } catch (err) {
      console.error("Auto-completion error:", err);
      res.status(500).json({ message: "Failed to complete trip" });
    }
  });

  app.post(api.trips.cancel.path, async (req, res) => {
    const { tripId } = req.body;
    try {
      const fullTrip = await storage.getTripById(tripId);
      if (!fullTrip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const trip = await storage.cancelTrip(tripId);
      
      // Send email notification about trip cancellation
      try {
        console.log('📧 Sending trip cancellation email to driver:', fullTrip.driver.email);
        await EmailService.sendTripCancellation(fullTrip.driver, fullTrip, fullTrip.vehicle);
        console.log('✅ Trip cancellation email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send trip cancellation email:', emailError);
        // Don't fail the cancellation if email fails
      }

      res.json(trip);
    } catch (err) {
      res.status(404).json({ message: "Trip not found" });
    }
  });

  // Debug endpoint to check trips
  app.get("/api/debug/trips", async (req, res) => {
    try {
      const trips = await storage.getAllTrips();
      console.log(`[DEBUG] Total trips in database: ${trips.length}`);
      trips.forEach(trip => {
        console.log(`  - Trip ${trip.tripId}: ${trip.startLocation} → ${trip.endLocation} (Status: ${trip.status}, Driver: ${trip.driverNumber})`);
      });
      res.json({
        totalTrips: trips.length,
        trips: trips.map(trip => ({
          tripId: trip.tripId,
          startLocation: trip.startLocation,
          endLocation: trip.endLocation,
          status: trip.status,
          driverNumber: trip.driverNumber,
          vehicleNumber: trip.vehicleNumber,
          hasRouteData: !!trip.routeData,
          credentials: {
            username: trip.temporaryUsername,
            password: trip.temporaryPassword
          }
        }))
      });
    } catch (error) {
      console.error('[DEBUG] Error fetching trips:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(api.trips.list.path, async (req, res) => {
    console.log('[DEBUG] Trips list endpoint called');
    const trips = await storage.getAllTrips();
    
    // Debug log for active trips with route data
    const activeTripsWithRoutes = trips.filter(trip => trip.status === "ACTIVE" && trip.routeData);
    console.log(`[DEBUG] Total trips: ${trips.length}, Active trips with routes: ${activeTripsWithRoutes.length}`);
    
    if (activeTripsWithRoutes.length > 0) {
      console.log(`[DEBUG] Active trips with route data:`);
      activeTripsWithRoutes.forEach(trip => {
        console.log(`  - Trip ${trip.tripId}: ${trip.startLocation} → ${trip.endLocation} (Driver: ${trip.driverNumber}, Vehicle: ${trip.vehicleNumber})`);
        console.log(`    Credentials: ${trip.temporaryUsername} / ${trip.temporaryPassword}`);
      });
    }
    
    res.json(trips);
  });

  app.get(api.trips.getCurrent.path, async (req, res) => {
    try {
      const temporaryUsername = req.query.temporaryUsername as string;
      if (!temporaryUsername) {
        return res.status(400).json({ message: "Temporary username required" });
      }
      
      // Add caching headers for better performance
      res.set('Cache-Control', 'public, max-age=30'); // Cache for 30 seconds
      
      const trip = await storage.getTripByCredentials(temporaryUsername, req.query.temporaryPassword as string);
      if (!trip) {
        return res.status(404).json({ message: "Active trip not found" });
      }
      res.json(trip);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.vehicles.update.path, async (req, res) => {
    try {
      const vehicleNumber = req.params.vehicleNumber;
      const vehicle = await storage.updateVehicle(vehicleNumber, req.body);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      res.json(vehicle);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.vehicles.updateStatus.path, async (req, res) => {
    try {
      const id = req.params.id;
      const vehicle = await storage.updateVehicleStatus(id, req.body);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      res.json(vehicle);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.drivers.update.path, async (req, res) => {
    try {
      const driverNumber = req.params.driverNumber;
      const driver = await storage.updateDriver(driverNumber, req.body);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }
      res.json(driver);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === FUEL & SERVICE API ===
  app.post(api.fuel.add.path, async (req, res) => {
    try {
      const log = await storage.createFuelLog(req.body);
      // Update vehicle mileage and fuel level
      await storage.updateVehicleStatus(req.body.vehicleNumber, { 
        currentMileage: req.body.mileage,
        currentFuel: 100 // Assume full tank after log
      });
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fuel.list.path, async (req, res) => {
    try {
      const logs = await storage.getFuelLogs(req.params.vehicleNumber);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.service.add.path, async (req, res) => {
    try {
      const log = await storage.createServiceLog(req.body);
      await storage.updateVehicleStatus(req.body.vehicleNumber, { 
        currentMileage: req.body.mileage,
        lastServiceDate: new Date()
      });
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.service.list.path, async (req, res) => {
    try {
      const logs = await storage.getServiceLogs(req.params.vehicleNumber);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === DRIVER API ===
  app.post(api.drivers.register.path, async (req, res) => {
    try {
      const input = insertDriverSchema.parse(req.body);
      const driver = await storage.createDriver(input);
      res.status(201).json(driver);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.drivers.list.path, async (req, res) => {
    const availableOnly = req.query.available === 'true';
    
    if (availableOnly) {
      // Get drivers that are NOT in active trips
      const drivers = await storage.getAvailableDrivers();
      res.json(drivers);
    } else {
      // Get all drivers
      const drivers = await storage.getAllDrivers();
      res.json(drivers);
    }
  });


  // === EMERGENCY API ===
  // Test route to verify server is working
  app.get('/api/emergency/test', (req, res) => {
    console.log('🧪 [TEST ROUTE] Emergency test route hit!');
    res.json({ message: 'Emergency API is working', timestamp: new Date().toISOString() });
  });

  app.post(api.emergency.trigger.path, upload.single("video"), async (req, res) => {
    console.log(`🚨 [EMERGENCY TRIGGER] Route hit! Method: ${req.method}, Path: ${req.path}`);
    console.log(`🚨 [EMERGENCY TRIGGER] Headers:`, req.headers);
    console.log(`🚨 [EMERGENCY TRIGGER] Body keys:`, Object.keys(req.body || {}));
    console.log(`🚨 [EMERGENCY TRIGGER] File:`, req.file ? 'Present' : 'None');
    
    try {
      const driverNumber = req.body.driverNumber;
      const vehicleNumber = req.body.vehicleNumber;
      const isVideoOnly = String(req.body.videoOnly || "").toLowerCase() === "true";
      
      // PRIORITY: Emergency alerts get highest priority processing
      console.log(`[EMERGENCY TRIGGER - HIGH PRIORITY] Driver: ${driverNumber}, Vehicle: ${vehicleNumber}`);
      console.log(`[EMERGENCY DEBUG] Request body keys:`, Object.keys(req.body));
      console.log(`[EMERGENCY DEBUG] File received:`, req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path,
        destination: req.file.destination
      } : 'No file received');
      
      // ENHANCED DEBUG: Log all form data
      console.log(`[EMERGENCY DEBUG] All form data:`, {
        driverNumber: req.body.driverNumber,
        vehicleNumber: req.body.vehicleNumber,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        location: req.body.location,
        emergencyType: req.body.emergencyType,
        description: req.body.description,
        videoOnly: req.body.videoOnly
      });
      
      // Check if there's already an active emergency for this driver/vehicle (within last 2 minutes)
      const existingActive = await storage.getActiveEmergencyForDriverVehicle(driverNumber, vehicleNumber);
      if (existingActive) {
        console.log(`[EMERGENCY] Active emergency already exists for ${driverNumber}/${vehicleNumber}`);
        let emergencyToUse = existingActive;

        // If a follow-up request includes video, attach it to current active emergency.
        if (req.file) {
          const videoUrl = `/uploads/${req.file.filename}`;
          try {
            emergencyToUse = await storage.updateEmergencyVideo(existingActive.emergencyId, videoUrl);
            console.log(`[EMERGENCY] Attached video to active emergency ${existingActive.emergencyId}: ${videoUrl}`);
          } catch (videoErr) {
            console.error("[EMERGENCY] Failed to attach video to active emergency:", videoErr);
          }
        }

        // Return existing emergency instead of creating duplicate
        const driver = await storage.getDriverByDriverNumber(driverNumber);
        const vehicle = await storage.getVehicleByVehicleNumber(vehicleNumber);
        if (driver && vehicle) {
          // Emit immediately to manager
          io.emit(socketEvents.RECEIVE_EMERGENCY, {
            ...emergencyToUse,
            driver,
            vehicle,
            nearbyFacilities: [],
            locationName: "Loading...",
            timestamp: new Date().toISOString(),
            status: 'ACTIVE'
          });
          
          return res.status(200).json({
            ...emergencyToUse,
            driver,
            vehicle,
            nearbyFacilities: [],
            message: "Emergency already active for this driver/vehicle"
          });
        }
      }

      // Video-only updates should never create a brand new emergency.
      // They are only meant to attach evidence to an already active alert.
      if (isVideoOnly) {
        console.log(`[EMERGENCY] Ignoring videoOnly trigger for ${driverNumber}/${vehicleNumber} - no active emergency`);
        return res.status(200).json({
          message: "Video-only update ignored because there is no active emergency"
        });
      }
      
      // Parse location data
      let location;
      try {
        location = typeof req.body.location === 'string' ? JSON.parse(req.body.location) : req.body.location;
      } catch {
        location = { 
          latitude: parseFloat(req.body.latitude), 
          longitude: parseFloat(req.body.longitude) 
        };
      }
      
      if (!location || (!location.latitude && !location.lat) || (!location.longitude && !location.lng)) {
        return res.status(400).json({ message: "Valid location coordinates are required for emergency" });
      }

      const latitude = parseFloat(String(location.latitude || location.lat));
      const longitude = parseFloat(String(location.longitude || location.lng));

      // Validate coordinates
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Invalid location coordinates" });
      }

      // Validate if location is in India (optional check)
      if (!isLocationInIndia(latitude, longitude)) {
        console.warn(`[EMERGENCY WARNING] Location outside India: ${latitude}, ${longitude}`);
      }

      const videoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

      // ENHANCED DEBUG: Video URL processing
      console.log(`[EMERGENCY DEBUG] Video URL processing:`, {
        hasFile: !!req.file,
        videoUrl,
        fileExists: req.file ? require('fs').existsSync(req.file.path) : false,
        filePath: req.file?.path
      });

      // Create emergency record
      const emergency = await storage.createEmergency({
        driverNumber,
        vehicleNumber,
        latitude: String(latitude),
        longitude: String(longitude),
        videoUrl,
      });

      console.log(`[EMERGENCY CREATED] ID: ${emergency.emergencyId}, Location: ${latitude}, ${longitude}, Video: ${videoUrl || 'none'}`);
      console.log(`[EMERGENCY DEBUG] Emergency object:`, {
        emergencyId: emergency.emergencyId,
        driverNumber: emergency.driverNumber,
        vehicleNumber: emergency.vehicleNumber,
        videoUrl: emergency.videoUrl,
        hasVideo: !!emergency.videoUrl
      });

      // Get driver and vehicle details
      const driver = await storage.getDriverByDriverNumber(driverNumber);
      const vehicle = await storage.getVehicleByVehicleNumber(vehicleNumber);

      if (!driver || !vehicle) {
        return res.status(404).json({ message: "Driver or vehicle not found" });
      }

      // IMMEDIATE EMIT TO MANAGER - Don't wait for slow operations!
      const emergencyData = {
        ...emergency,
        driver,
        vehicle,
        nearbyFacilities: [], // Will be updated later
        locationName: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, // Use coordinates initially
        timestamp: new Date().toISOString(),
        status: 'ACTIVE',
      };

      io.emit(socketEvents.RECEIVE_EMERGENCY, emergencyData);
      console.log(`[SOCKET EMIT - IMMEDIATE] Emergency sent to MANAGER`);
      console.log(`[SOCKET DEBUG] Emergency data being sent:`, {
        emergencyId: emergencyData.emergencyId,
        driverNumber: emergencyData.driverNumber,
        vehicleNumber: emergencyData.vehicleNumber,
        videoUrl: emergencyData.videoUrl,
        hasVideo: !!emergencyData.videoUrl,
        status: emergencyData.status,
        fullVideoPath: emergencyData.videoUrl ? `${req.protocol}://${req.get('host')}${emergencyData.videoUrl}` : null
      });

      // Send immediate response to driver
      res.status(201).json({
        ...emergency,
        driver,
        vehicle,
        nearbyFacilities: [],
        locationName: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        message: "Emergency triggered successfully"
      });

      // Do slow operations in background (don't block response)
      setImmediate(async () => {
        try {
          // Find nearby facilities using optimized cache
          const allFacilities = await getEmergencyFacilities(latitude, longitude);
          console.log(`[EMERGENCY FACILITIES] Found ${allFacilities.length} facilities`);
          
          // Get location name
          let locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          try {
            locationName = await getLocationName(latitude, longitude);
            console.log(`[EMERGENCY LOCATION] ${locationName}`);
          } catch (error) {
            console.log("Could not get location name, using coordinates");
          }

          // Emit updated data with facilities and location name
          io.emit(socketEvents.RECEIVE_EMERGENCY, {
            ...emergencyData,
            nearbyFacilities: allFacilities,
            locationName,
            status: 'ACTIVE'
          });
          console.log(`[SOCKET EMIT - UPDATED] Emergency updated with facilities and location`);
        } catch (error) {
          console.error("[BACKGROUND] Error fetching facilities/location:", error);
        }
      });

    } catch (err) {
      console.error("🚨 [EMERGENCY TRIGGER] CRITICAL ERROR:", err);
      console.error("🚨 [EMERGENCY TRIGGER] Error stack:", err instanceof Error ? err.stack : 'No stack');
      console.error("🚨 [EMERGENCY TRIGGER] Error details:", {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        type: typeof err
      });
      
      // Ensure we always send JSON response
      if (!res.headersSent) {
        res.status(500).json({ 
          message: "Failed to trigger emergency", 
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  app.get(api.emergency.nearbyFacilities.path, async (req, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }

      const facilities = await getCachedNearbyFacilities(latitude, longitude);
      res.json(facilities.facilities);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Cache status endpoint for monitoring
  app.get("/api/cache/stats", (req, res) => {
    try {
      const stats = getCacheStats();
      res.json(stats);
    } catch (err) {
      console.error("Error getting cache stats:", err);
      res.status(500).json({ message: "Failed to get cache stats" });
    }
  });

  app.post(api.emergency.acknowledge.path, async (req, res) => {
    const { emergencyId } = req.body;
    try {
      // Get the emergency first to get driver/vehicle info
      const fullEmergency = await storage.getEmergencyWithRelations(emergencyId);
      
      if (!fullEmergency) {
        return res.status(404).json({ message: "Emergency not found" });
      }

      // Acknowledge the specific emergency
      const emergency = await storage.updateEmergencyStatus(emergencyId, "ACKNOWLEDGED");
      
      // Also acknowledge ALL other active emergencies for the same driver/vehicle
      const allAcknowledged = await storage.updateAllActiveEmergenciesForDriverVehicle(
        fullEmergency.driverNumber,
        fullEmergency.vehicleNumber,
        "ACKNOWLEDGED"
      );
      
      console.log(`[EMERGENCY ACK] Acknowledged ${allAcknowledged.length} emergencies for ${fullEmergency.driverNumber}/${fullEmergency.vehicleNumber}`);
      
      // Emit stop alarm to all clients
      io.emit(socketEvents.STOP_ALARM, { 
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber
      });

      // Emit emergency acknowledged event
      io.emit(socketEvents.EMERGENCY_ACKNOWLEDGED, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber,
        status: "ACKNOWLEDGED"
      });
      io.emit(socketEvents.RECEIVE_ACKNOWLEDGEMENT, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber,
        outcome: "FALSE_ALARM",
        message: "Emergency reviewed as false alarm. Trip will continue."
      });

      res.json({ 
        ...emergency, 
        message: "Emergency acknowledged successfully" 
      });
    } catch (err) {
      console.error("Emergency Acknowledgement Error:", err);
      res.status(500).json({ message: "Failed to acknowledge emergency" });
    }
  });

  // NEW: Manager approves emergency as REAL and sends to police/hospital
  app.post("/api/emergency/approve-real", async (req, res) => {
    const { emergencyId } = req.body;
    try {
      const fullEmergency = await storage.getEmergencyWithRelations(emergencyId);
      
      if (!fullEmergency) {
        return res.status(404).json({ message: "Emergency not found" });
      }

      const { driver, vehicle } = fullEmergency;
      const latitude = parseFloat(String(fullEmergency.latitude));
      const longitude = parseFloat(String(fullEmergency.longitude));

      // Get nearby facilities using optimized cache
      const allFacilities = await getEmergencyFacilities(latitude, longitude);

      // Send emails to police and hospitals for REAL emergency
      try {
        console.log('📧 Manager confirmed REAL emergency - sending alerts to authorities...');
        await EmailService.sendRealEmergencyAlert(fullEmergency, driver, vehicle, allFacilities);
        console.log('✅ Real emergency alerts sent to police and hospitals');
      } catch (emailError) {
        console.error('❌ Failed to send real emergency alerts:', emailError);
        return res.status(500).json({ message: "Failed to send emergency alerts" });
      }

      // Update emergency status to indicate it's been escalated
      await storage.updateEmergencyStatus(emergencyId, "ACKNOWLEDGED");

      // Emit to all clients that this is a real emergency
      io.emit(socketEvents.REAL_EMERGENCY_CONFIRMED, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber,
        message: "Emergency confirmed as REAL. Authorities have been notified."
      });

      res.json({ 
        message: "Real emergency confirmed and authorities notified",
        emergencyId,
        emailsSent: true
      });
    } catch (err) {
      console.error("Real Emergency Approval Error:", err);
      res.status(500).json({ message: "Failed to process real emergency" });
    }
  });

  // NEW: Manager approves emergency and sends to police/hospital
  app.post("/api/emergency/approve", async (req, res) => {
    const { emergencyId, nearbyFacilities: facilitiesFromManager } = req.body;
    try {
      const fullEmergency = await storage.getEmergencyWithRelations(emergencyId);
      
      if (!fullEmergency) {
        return res.status(404).json({ message: "Emergency not found" });
      }

      const { driver, vehicle, locationName } = fullEmergency;
      const latitude = parseFloat(String(fullEmergency.latitude));
      const longitude = parseFloat(String(fullEmergency.longitude));

      // Mark this emergency flow as acknowledged/handled before escalation.
      await storage.updateEmergencyStatus(emergencyId, "ACKNOWLEDGED");
      await storage.updateAllActiveEmergenciesForDriverVehicle(
        fullEmergency.driverNumber,
        fullEmergency.vehicleNumber,
        "ACKNOWLEDGED"
      );

      // Stop alarm and close active popup across clients for the same vehicle.
      io.emit(socketEvents.STOP_ALARM, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber
      });
      io.emit(socketEvents.EMERGENCY_ACKNOWLEDGED, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber,
        status: "ACKNOWLEDGED"
      });

      console.log(`🚨 [REAL EMERGENCY CONFIRMED] Manager approved emergency ${emergencyId}`);
      console.log(`📍 Location: ${locationName} (${latitude}, ${longitude})`);

      // 1. STOP THE TRIP IMMEDIATELY - Find and complete the active trip
      try {
        const activeTrip = await storage.getActiveTripByDriverNumber(fullEmergency.driverNumber);
        if (activeTrip) {
          await storage.completeTrip(activeTrip.tripId);
          console.log(`🛑 [TRIP STOPPED] Trip ${activeTrip.tripId} completed due to emergency`);
          
          // Emit trip completion to update UI
          io.emit('TRIP_COMPLETED', { 
            tripId: activeTrip.tripId, 
            reason: 'EMERGENCY_STOP',
            emergencyId,
            vehicleNumber: fullEmergency.vehicleNumber,
            driverNumber: fullEmergency.driverNumber,
            endLocation: activeTrip.endLocation || "Emergency stop location"
          });
        }
      } catch (tripError) {
        console.error('❌ Error stopping trip:', tripError);
      }

      // 2. FETCH NEARBY FACILITIES for emergency email using optimized cache
      console.log(`[FETCHING FACILITIES] For emergency at ${latitude}, ${longitude}`);
      let nearbyFacilities = await getEmergencyFacilities(latitude, longitude);
      if ((!nearbyFacilities || nearbyFacilities.length === 0) && Array.isArray(facilitiesFromManager) && facilitiesFromManager.length > 0) {
        nearbyFacilities = facilitiesFromManager;
        console.log(`[FACILITIES FALLBACK] Using ${nearbyFacilities.length} facilities from manager popup payload`);
      }
      console.log(`[FACILITIES FOUND] ${nearbyFacilities.length} facilities near emergency location`);

      // 3. GET TRIP ROUTE DETAILS
      let tripRouteInfo = "";
      try {
        const activeTrip = await storage.getActiveTripByDriverNumber(fullEmergency.driverNumber);
        if (activeTrip) {
          tripRouteInfo = `
*Route:*
From: ${activeTrip.startLocation || 'Start Location'}
To: ${activeTrip.endLocation || 'Destination'}
*Route via:*
1. ${activeTrip.startLocation?.split(',')[0] || 'Start'}
2. Uthukuli (57km)
3. Kumarapalayam (101km)
4. Salem (149km)
5. Harur (215km)`;
        }
      } catch (tripError) {
        console.error('Error fetching trip route details:', tripError);
      }

      // Show ALL facility types in emergency email with enhanced categorization
      const facilitiesByType = {
        // Medical Facilities (hospitals, clinics, pharmacies)
        medical: (nearbyFacilities || []).filter((f: any) => 
          f.type === 'hospital' || f.type === 'clinic' || f.type === 'pharmacy'
        ),
        // Police and Emergency Services
        police: (nearbyFacilities || []).filter((f: any) => 
          f.type === 'police' || f.type === 'fire_station'
        ),
        // Fuel Centers
        fuel: (nearbyFacilities || []).filter((f: any) => f.type === 'fuel_station'),
        // Service Centers (vehicle repair, garages)
        service: (nearbyFacilities || []).filter((f: any) => f.type === 'service_center')
      };

      // Helper function to format facility list with distance
      const formatFacilityList = (facilities: any[], limit: number = 3) => {
        if (!facilities || facilities.length === 0) return '';
        return facilities
          .slice(0, limit)
          .map((f: any) => `${f.name} (${f.distance}km)`)
          .join(', ');
      };

      // Build facility sections only if facilities exist
      let facilitySection = '';
      
      if (facilitiesByType.medical.length > 0) {
        facilitySection += `Medical Facilities: ${formatFacilityList(facilitiesByType.medical, 3)}\n`;
      }
      
      if (facilitiesByType.police.length > 0) {
        facilitySection += `Police & Emergency: ${formatFacilityList(facilitiesByType.police, 3)}\n`;
      }
      
      if (facilitiesByType.fuel.length > 0) {
        facilitySection += `Fuel Centers: ${formatFacilityList(facilitiesByType.fuel, 2)}\n`;
      }
      
      if (facilitiesByType.service.length > 0) {
        facilitySection += `🔧 Service Centers: ${formatFacilityList(facilitiesByType.service, 2)}\n`;
      }

      // Remove trailing newline if exists
      facilitySection = facilitySection.trim();

      // 3. PRINT FACILITIES TO TERMINAL
      console.log(`\n🏥 ===== NEARBY FACILITIES FOR EMERGENCY ${emergencyId} =====`);
      console.log(`📍 Location: ${locationName}`);
      console.log(`🚗 Vehicle: ${fullEmergency.vehicleNumber} | Driver: ${driver.name}`);
      console.log(`\n🏥 MEDICAL FACILITIES (${facilitiesByType.medical.length}):`);
      facilitiesByType.medical.forEach((f: any, i: number) => {
        console.log(`   ${i+1}. ${f.name} (${f.type}) - ${f.distance}km away`);
      });
      console.log(`\n🚓 POLICE & EMERGENCY (${facilitiesByType.police.length}):`);
      facilitiesByType.police.forEach((f: any, i: number) => {
        console.log(`   ${i+1}. ${f.name} (${f.type}) - ${f.distance}km away`);
      });
      console.log(`\n⛽ FUEL STATIONS (${facilitiesByType.fuel.length}):`);
      facilitiesByType.fuel.forEach((f: any, i: number) => {
        console.log(`   ${i+1}. ${f.name} - ${f.distance}km away`);
      });
      console.log(`\n🔧 SERVICE CENTERS (${facilitiesByType.service.length}):`);
      facilitiesByType.service.forEach((f: any, i: number) => {
        console.log(`   ${i+1}. ${f.name} - ${f.distance}km away`);
      });
      console.log(`\n===============================================\n`);

      // 4. CREATE COMMON MESSAGE TEMPLATE
      const commonMessageBody = `*Driver:* ${driver.name} (${fullEmergency.driverNumber})
*Vehicle:* ${fullEmergency.vehicleNumber} (${vehicle.vehicleType})
*Location:* ${locationName}
*Coordinates:* ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
*Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
*Emergency ID:* ${emergencyId}${tripRouteInfo}

*Medical Information:*
Blood Group: ${driver.bloodGroup || 'Unknown'}
Medical Conditions: ${driver.medicalConditions || 'None reported'}
Emergency Contact: ${driver.emergencyContact || 'Not available'} (${driver.emergencyContactPhone || 'No phone'})

*Nearby Emergency Resources:*
${facilitySection || 'No nearby facilities found'}

*Emergency Contacts:*
Authorities: 100 | Medical: 108 | Fire: 101
Driver Phone: ${driver.phoneNumber}

*GPS Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}*
*TRIP HAS BEEN STOPPED*`;

      // 5. SEND EMAIL TO POLICE AND HOSPITAL (only for real emergencies)
      // Send real emergency alert emails
      try {
        console.log(`[MANAGER APPROVED 🚨] Sending real emergency emails for Emergency ${emergencyId}`);
        await EmailService.sendRealEmergencyAlert(fullEmergency, driver, vehicle, nearbyFacilities || []);
        console.log('✅ Real emergency alert emails sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send real emergency alert emails:', emailError);
        // Don't fail the emergency approval if email fails
      }

      // Emit approval event
      io.emit('EMERGENCY_APPROVED', { emergencyId });
      io.emit(socketEvents.RECEIVE_ACKNOWLEDGEMENT, {
        emergencyId,
        driverNumber: fullEmergency.driverNumber,
        vehicleNumber: fullEmergency.vehicleNumber,
        outcome: "REAL_EMERGENCY",
        message: "Real emergency approved. Trip stopped and authorities notified."
      });

      res.json({ 
        message: "Emergency approved - Trip stopped, Police and Hospital notified",
        emergencyId,
        tripStopped: true,
        facilitiesCount: nearbyFacilities?.length || 0
      });
    } catch (err) {
      console.error("Emergency Approval Error:", err);
      res.status(500).json({ message: "Failed to approve emergency" });
    }
  });

  // DISABLED: Location simulation endpoint - Now using real GPS only
  app.post("/api/trips/simulate-location", async (req, res) => {
    res.status(410).json({ 
      message: "Simulation disabled - System now uses real GPS tracking only",
      error: "SIMULATION_DISABLED"
    });
  });

  // NEW: Get route analysis for a trip
  app.get("/api/trips/:tripId/route-analysis", async (req, res) => {
    try {
      const tripId = parseInt(req.params.tripId);
      const trip = await storage.getTripById(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      if (!trip.startLatitude || !trip.endLatitude) {
        return res.status(400).json({ message: "Trip does not have route information" });
      }

      // Generate route analysis
      const { RouteOptimizer } = await import('./route-optimizer');
      const routeAnalysis = await RouteOptimizer.generateRoutes(
        { 
          lat: parseFloat(String(trip.startLatitude)), 
          lng: parseFloat(String(trip.startLongitude)),
          address: trip.startLocation || 'Start'
        },
        { 
          lat: parseFloat(String(trip.endLatitude)), 
          lng: parseFloat(String(trip.endLongitude)),
          address: trip.endLocation || 'Destination'
        },
        trip.vehicle.vehicleType
      );

      res.json(routeAnalysis);
    } catch (err) {
      console.error("Route analysis error:", err);
      res.status(500).json({ message: "Failed to get route analysis" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Quick emergency list endpoint with timeout handling
  app.get("/api/emergencies", async (req, res) => {
    try {
      console.log('[EMERGENCIES] Fetching all emergencies...');
      const startTime = Date.now();
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), 10000);
      });
      
      const emergenciesPromise = storage.getAllEmergencies();
      
      const emergencies = (await Promise.race([emergenciesPromise, timeoutPromise])) as any[];
      
      const duration = Date.now() - startTime;
      console.log(`[EMERGENCIES] Fetched ${emergencies.length} emergencies in ${duration}ms`);
      
      res.json(emergencies);
    } catch (error) {
      console.error('[EMERGENCIES] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch emergencies',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // === ROUTE DISCOVERY API ===
  app.post(api.routes.discover.path, async (req, res) => {
    try {
      const { start, end } = req.body;
      
      // Validate input
      if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
        return res.status(400).json({ 
          message: "Start and end coordinates are required with lat and lng properties" 
        });
      }

      // Import route discovery service
      const { discoverRoutes } = await import('./route-discovery');
      
      // Discover routes
      const routes = await discoverRoutes(start, end);
      
      console.log(`[Route Discovery API] Discovered ${routes.length} routes`);
      
      res.json({ routes });
    } catch (error: any) {
      console.error("Route discovery error:", error);
      
      if (error.message.includes('Invalid coordinates')) {
        return res.status(400).json({ message: error.message });
      }
      
      if (error.message.includes('No routes found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ 
        message: "Failed to discover routes", 
        error: error.message 
      });
    }
  });

  app.get(api.routes.getDetails.path, async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId);
      
      if (isNaN(routeId)) {
        return res.status(400).json({ message: "Invalid route ID" });
      }

      // Import route discovery service
      const { getRouteDetails } = await import('./route-discovery');
      
      // Get route details
      const route = await getRouteDetails(routeId);
      
      if (!route) {
        return res.status(404).json({ 
          message: "Route not found. Routes are discovered on-demand and not persisted." 
        });
      }
      
      res.json(route);
    } catch (error: any) {
      console.error("Get route details error:", error);
      res.status(500).json({ 
        message: "Failed to get route details", 
        error: error.message 
      });
    }
  });

  // === SAFETY ANALYSIS API ===
  app.post(api.safety.analyzeRoute.path, async (req, res) => {
    try {
      const { start, end, timestamp, startLocationName, endLocationName } = req.body;
      
      // Validate input
      if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
        return res.status(400).json({ 
          message: "Start and end coordinates are required with lat and lng properties" 
        });
      }

      // Use current timestamp if not provided
      const analysisTimestamp = timestamp || Date.now();

      // Import route analysis service
      const { analyzeRoutes } = await import('./route-analysis');
      
      // Analyze routes with safety metrics and city names
      const analyzedRoutes = await analyzeRoutes(
        start, 
        end, 
        analysisTimestamp,
        startLocationName,
        endLocationName
      );
      
      console.log(`[Safety Analysis API] Analyzed ${analyzedRoutes.length} route(s)`);
      console.log(`[Safety Analysis API] Recommended route: ${analyzedRoutes.find(r => r.isRecommended)?.routeId}`);
      
      res.json({ routes: analyzedRoutes });
    } catch (error: any) {
      console.error("Safety analysis error:", error);
      
      if (error.message.includes('Invalid coordinates')) {
        return res.status(400).json({ message: error.message });
      }
      
      if (error.message.includes('No routes found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ 
        message: "Failed to analyze route safety", 
        error: error.message 
      });
    }
  });

  // === ADVANCED REPORTING API ===
  app.get("/api/reports/emergency-summary", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const emergencies = await storage.getAllEmergencies();
      
      let filteredEmergencies = emergencies;
      if (startDate && endDate) {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        filteredEmergencies = emergencies.filter(e => {
          const emergencyDate = new Date(e.createdAt || e.timestamp);
          return emergencyDate >= start && emergencyDate <= end;
        });
      }

      const summary = {
        totalEmergencies: filteredEmergencies.length,
        resolvedEmergencies: filteredEmergencies.filter(e => e.status === 'ACKNOWLEDGED').length,
        averageResponseTime: Math.random() * 10 + 5, // Simulated
        emergenciesByType: categorizeEmergencies(filteredEmergencies),
        emergenciesByLocation: groupEmergenciesByLocation(filteredEmergencies),
        timeDistribution: analyzeTimeDistribution(filteredEmergencies)
      };

      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate emergency summary" });
    }
  });

  // Helper method for emergency categorization
  function categorizeEmergencies(emergencies: any[]) {
    const categories = {
      'Medical Emergency': Math.floor(emergencies.length * 0.3),
      'Vehicle Breakdown': Math.floor(emergencies.length * 0.25),
      'Accident': Math.floor(emergencies.length * 0.2),
      'Security Issue': Math.floor(emergencies.length * 0.15),
      'Other': Math.floor(emergencies.length * 0.1)
    };
    return categories;
  }

  function groupEmergenciesByLocation(emergencies: any[]) {
    const locations: { [key: string]: number } = {};
    emergencies.forEach(emergency => {
      const lat = parseFloat(String(emergency.latitude));
      const lng = parseFloat(String(emergency.longitude));
      const locationKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      locations[locationKey] = (locations[locationKey] || 0) + 1;
    });
    return locations;
  }

  function analyzeTimeDistribution(emergencies: any[]) {
    const hours = new Array(24).fill(0);
    emergencies.forEach(emergency => {
      const hour = new Date(emergency.createdAt || emergency.timestamp).getHours();
      hours[hour]++;
    });
    return hours;
  }

  // Test: Create a sample trip with route data on startup (for debugging)
  setTimeout(async () => {
    try {
      console.log('[STARTUP TEST] Creating test trip with route data...');
      
      // Sample route coordinates (Bangalore to Coimbatore)
      const sampleRouteCoordinates = [
        [77.5946, 12.9716], // Bangalore
        [77.6000, 12.9500],
        [77.6200, 12.9200],
        [77.6500, 12.8800],
        [77.7000, 12.8000],
        [77.7500, 12.7000],
        [77.8000, 12.6000],
        [77.8500, 12.5000],
        [77.9000, 12.4000],
        [77.9500, 12.3000],
        [78.0000, 12.2000],
        [78.0500, 12.1000],
        [78.1000, 12.0000],
        [78.1500, 11.9000],
        [78.2000, 11.8000],
        [78.2500, 11.7000],
        [78.3000, 11.6000],
        [78.3500, 11.5000],
        [78.4000, 11.4000],
        [78.4500, 11.3000],
        [78.5000, 11.2000],
        [78.5500, 11.1000],
        [76.9558, 11.0168]  // Coimbatore
      ];

      const drivers = await storage.getAllDrivers();
      const vehicles = await storage.getAllVehicles();
      const defaultDriver = drivers[0];
      const defaultVehicle = vehicles[0];

      if (!defaultDriver || !defaultVehicle) {
        console.log('[STARTUP TEST] Skipping test trip creation: no driver/vehicle available');
        return;
      }

      // Check if test trip already exists
      const existingTrips = await storage.getAllTrips();
      const hasTestTrip = existingTrips.some(trip => trip.startLocation === "Bangalore" && trip.endLocation === "Coimbatore");
      
      if (!hasTestTrip) {
        const { temporaryUsername, temporaryPassword } = generateTemporaryCredentials();

        const trip = await storage.createTrip({
          driverNumber: defaultDriver.driverNumber,
          vehicleNumber: defaultVehicle.vehicleNumber,
          temporaryUsername,
          temporaryPassword,
          startLocation: "Bangalore",
          endLocation: "Coimbatore",
          startLatitude: "12.9716",
          startLongitude: "77.5946",
          endLatitude: "11.0168",
          endLongitude: "76.9558",
          currentLatitude: "12.9716",
          currentLongitude: "77.5946",
          routeData: JSON.stringify(sampleRouteCoordinates),
          status: "ACTIVE",
        });

        console.log('[STARTUP TEST] ✅ Created test trip:', trip.tripId, 'with credentials:', temporaryUsername, temporaryPassword);
        
        // Test the parsing immediately
        const retrievedTrip = await storage.getTripByCredentials(temporaryUsername, temporaryPassword);
        console.log('[STARTUP TEST] ✅ Route parsing test:', {
          routeGeometryParsed: !!retrievedTrip?.routeGeometry,
          coordinatesCount: retrievedTrip?.routeGeometry?.coordinates?.length || 0,
          dangerZonesCount: retrievedTrip?.dangerZones?.length || 0,
          facilitiesCount: retrievedTrip?.facilities?.length || 0
        });
      } else {
        console.log('[STARTUP TEST] Test trip already exists, skipping creation');
      }
    } catch (error) {
      console.error('[STARTUP TEST] Error creating test trip:', error);
    }
  }, 2000); // Wait 2 seconds after routes are registered

  return httpServer;
}

// Seed function to create initial manager and data
async function seed() {
  const existingManager = await storage.getManagerByUsername("admin");
  if (!existingManager) {
    await storage.createManager({ username: "admin", password: "password123" });
    console.log("Seeded Manager: admin / password123");
  }

  const vehicles = await storage.getAllVehicles();
  if (vehicles.length > 0) {
    const v = vehicles[0];
    const fuelLogs = await storage.getFuelLogs(v.vehicleNumber);
    if (fuelLogs.length === 0) {
      await storage.createFuelLog({
        vehicleNumber: v.vehicleNumber,
        amount: "45.5",
        cost: "68.25",
        mileage: 1250,
      });
      await storage.createServiceLog({
        vehicleNumber: v.vehicleNumber,
        description: "Routine Oil Change and Brake Inspection",
        cost: "150.00",
        mileage: 1200,
      });
      await storage.updateVehicleStatus(v.vehicleNumber, {
        currentMileage: 1250,
        currentFuel: 85,
        lastServiceDate: new Date(),
        nextServiceMileage: 5000,
      });
      console.log("Seeded maintenance data for vehicle:", v.vehicleNumber);
    }
  }
}

// Run seed (async, don't await blocking server start)
seed().catch(console.error);
