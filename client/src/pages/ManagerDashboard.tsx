import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useVehicles, useDrivers, useTrips, useRegisterVehicle, useRegisterDriver, useAssignTrip, useCompleteTrip, useCancelTrip, useUpdateVehicle, useUpdateDriver, useAvailableDrivers, useAvailableVehicles } from "@/hooks/use-fleet";
import { useEmergencies } from "@/hooks/use-emergency";
import { useSocket as useSocketHook } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Map } from "@/components/Map";
import { FixedVehicleTrackingMap } from "@/components/FixedVehicleTrackingMap";
import { RouteMap } from "@/components/RouteMap";
import { EmergencyAlert } from "@/components/EmergencyAlert";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { LayoutDashboard, Car, Users, LogOut, Radio, AlertOctagon, Settings, ShieldCheck, MapPin, Navigation, Search, Shield, CheckCircle } from "lucide-react";
import { Emergency, Vehicle, Driver } from "@shared/schema";

export default function ManagerDashboard() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("monitoring");
  const { socket, subscribe, events } = useSocketHook();
  const { toast } = useToast();
  
  // Data Fetching
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: availableVehicles } = useAvailableVehicles();
  const { data: availableDrivers } = useAvailableDrivers();
  const { data: trips, refetch: refetchTrips } = useTrips();
  const { data: rawEmergencies, refetch: refetchEmergencies } = useEmergencies();
  const emergencies = rawEmergencies as (Emergency & { driver: Driver; vehicle: Vehicle })[] | undefined;

  // Debug logging
  console.log('[DEBUG] Manager Dashboard - Data state:', {
    vehicles: vehicles?.length || 0,
    drivers: drivers?.length || 0,
    trips: trips?.length || 0,
    emergencies: emergencies?.length || 0,
    tripsData: trips
  });
  
  // Mutations
  const registerVehicle = useRegisterVehicle();
  const registerDriver = useRegisterDriver();
  const assignTrip = useAssignTrip();
  const completeTrip = useCompleteTrip();
  const cancelTrip = useCancelTrip();
  const updateVehicle = useUpdateVehicle();
  const updateDriver = useUpdateDriver();

  // Local State for Forms
  const [newVehicle, setNewVehicle] = useState({ vehicleNumber: "", vehicleType: "Ambulance", fuelCapacity: 50 });
  const [newDriver, setNewDriver] = useState({ 
    driverNumber: "", 
    name: "", 
    phoneNumber: "", 
    email: "",
    licenseNumber: "",
    bloodGroup: "",
    medicalConditions: "",
    emergencyContact: "",
    emergencyContactPhone: ""
  });
  const [assignment, setAssignment] = useState({ vehicleNumber: "", driverNumber: "" });
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editVehicleData, setEditVehicleData] = useState({ vehicleType: "", fuelCapacity: 0 });
  const [editDriverData, setEditDriverData] = useState({ 
    name: "", 
    phoneNumber: "", 
    email: "",
    licenseNumber: "",
    bloodGroup: "",
    medicalConditions: "",
    emergencyContact: "",
    emergencyContactPhone: ""
  });
  
  // Route Analysis State
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [startCoords, setStartCoords] = useState<{lat: number, lng: number} | null>(null);
  const [endCoords, setEndCoords] = useState<{lat: number, lng: number} | null>(null);
  const [analyzedRoutes, setAnalyzedRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [analyzingRoutes, setAnalyzingRoutes] = useState(false);
  const [showRouteAnalysis, setShowRouteAnalysis] = useState(false);
  


  
  // Real-time Emergency Handling
  const [activeEmergency, setActiveEmergency] = useState<(Emergency & { driver: Driver; vehicle: Vehicle }) | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [pausedVehicles, setPausedVehicles] = useState<Set<string>>(new Set());
  const [stoppedVehicles, setStoppedVehicles] = useState<Set<string>>(new Set());
  // REMOVED: All simulation state - using real GPS only
  const [liveNearbyFacilitiesByVehicle, setLiveNearbyFacilitiesByVehicle] = useState<Record<string, any[]>>({});
  const facilitiesFetchAtRef = useRef<Record<string, number>>({});

  // Map Markers Construction with enhanced GPS data
  const [vehicleLocations, setVehicleLocations] = useState<Record<string, { 
    lat: number; 
    lng: number; 
    accuracy?: number; 
    speed?: number; 
    heading?: number; 
    timestamp?: number;
    lastUpdate?: number;
  }>>({});
  
  // Vehicle tracking status
  const [vehicleTrackingStatus, setVehicleTrackingStatus] = useState<Record<string, 'active' | 'inactive' | 'lost'>>({});

  // Socket event listeners for real-time emergency alerts
  useEffect(() => {
    console.log("✅ [MANAGER] Setting up emergency listeners");

    const handleNewEmergency = (emergency: Emergency & { driver: Driver; vehicle: Vehicle }) => {
      console.log("🚨 [MANAGER] New emergency received:", {
        emergencyId: emergency.emergencyId,
        driverName: emergency.driver?.name,
        vehicleNumber: emergency.vehicleNumber,
        status: emergency.status,
        latitude: emergency.latitude,
        longitude: emergency.longitude,
        hasVideo: !!emergency.videoUrl,
        fullEmergency: emergency
      });
      setActiveEmergency(emergency);
      toast({
        title: "🚨 EMERGENCY ALERT",
        description: `${emergency.driver.name} (${emergency.vehicleNumber}) needs help!`,
        variant: "destructive",
        duration: 10000
      });
    };

    const handleEmergencyAcknowledged = (data: any) => {
      console.log("✅ [MANAGER] Emergency acknowledged:", data);
      if (activeEmergency && data.emergencyId === activeEmergency.emergencyId) {
        setActiveEmergency(null);
      }
      // Don't refetch here - socket updates will handle it
    };

    // Use RECEIVE_EMERGENCY event (this is what the server actually emits)
    const unsubscribeEmergency = subscribe(events.RECEIVE_EMERGENCY, handleNewEmergency);
    const unsubscribeAck = subscribe(events.EMERGENCY_ACKNOWLEDGED, handleEmergencyAcknowledged);

    console.log("✅ [MANAGER] Emergency listeners subscribed to:", {
      receiveEmergencyEvent: events.RECEIVE_EMERGENCY,
      emergencyAcknowledgedEvent: events.EMERGENCY_ACKNOWLEDGED
    });

    return () => {
      console.log("🧹 [MANAGER] Cleaning up emergency listeners");
      unsubscribeEmergency?.();
      unsubscribeAck?.();
    };
  }, [subscribe, events, toast, activeEmergency]); // Removed refetchEmergencies to prevent excessive re-renders

  // Geocode address to coordinates
  const geocodeAddress = async (address: string): Promise<{lat: number, lng: number} | null> => {
    try {
      console.log(`🌍 Geocoding address: "${address}"`);
      
      // Using Nominatim (OpenStreetMap) geocoding - free and no API key needed
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            'User-Agent': 'RideWithAlert/1.0'
          }
        }
      );
      
      if (!response.ok) {
        console.error(`❌ Geocoding API error: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      console.log(`🔍 Geocoding response for "${address}":`, data);
      
      if (data && data.length > 0) {
        const coords = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
        console.log(`✅ Geocoded "${address}" to:`, coords);
        return coords;
      }
      
      console.warn(`⚠️ No geocoding results found for: "${address}"`);
      return null;
    } catch (error) {
      console.error("❌ Geocoding error:", error);
      return null;
    }
  };

  // Get current GPS location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setStartCoords(coords);
          setStartLocation(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
          toast({ title: "Location Found", description: "Current GPS location set as start point" });
        },
        (error) => {
          toast({ 
            title: "Location Error", 
            description: "Could not get current location. Please enter manually.", 
            variant: "destructive" 
          });
        }
      );
    } else {
      toast({ 
        title: "Not Supported", 
        description: "Geolocation is not supported by your browser", 
        variant: "destructive" 
      });
    }
  };

  // Analyze routes with safety scoring
  const analyzeRoutes = async () => {
    if (!startLocation || !endLocation) {
      toast({ title: "Missing Information", description: "Please enter both start and destination", variant: "destructive" });
      return;
    }

    setAnalyzingRoutes(true);
    setShowRouteAnalysis(false);

    try {
      // Geocode addresses if not already coordinates
      let start = startCoords;
      let end = endCoords;

      if (!start) {
        start = await geocodeAddress(startLocation);
        if (!start) {
          toast({ title: "Invalid Start Location", description: "Could not find start location", variant: "destructive" });
          setAnalyzingRoutes(false);
          return;
        }
        setStartCoords(start);
      }

      if (!end) {
        end = await geocodeAddress(endLocation);
        if (!end) {
          toast({ title: "Invalid Destination", description: "Could not find destination", variant: "destructive" });
          setAnalyzingRoutes(false);
          return;
        }
        setEndCoords(end);
      }

      // Call route analysis API with location names
      const response = await fetch('/api/safety/analyze-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
          end,
          timestamp: Date.now(),
          startLocationName: startLocation,
          endLocationName: endLocation
        })
      });

      if (!response.ok) {
        throw new Error('Route analysis failed');
      }

      const data = await response.json();
      console.log('🔍 Route analysis response:', {
        routesCount: data.routes?.length || 0,
        firstRoute: data.routes?.[0] ? {
          routeId: data.routes[0].routeId,
          hasGeometry: !!data.routes[0].geometry,
          geometryType: data.routes[0].geometry?.type,
          coordinatesLength: data.routes[0].geometry?.coordinates?.length,
          keys: Object.keys(data.routes[0])
        } : null
      });

      setAnalyzedRoutes(data.routes || []);
      
      // Auto-select the recommended route
      const recommended = data.routes?.find((r: any) => r.isRecommended);
      if (recommended) {
        setSelectedRoute(recommended);
      }

      setShowRouteAnalysis(true);
      toast({ 
        title: "Routes Analyzed", 
        description: `Found ${data.routes?.length || 0} routes with safety scores` 
      });

    } catch (error) {
      console.error("Route analysis error:", error);
      toast({ 
        title: "Analysis Failed", 
        description: "Could not analyze routes. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setAnalyzingRoutes(false);
    }
  };

  // Fetch analytics data - REMOVED
  // const loadVehicleAnalytics = async (vehicleNumber: string) => {
  //   // Analytics functionality removed
  // };

  useEffect(() => {
    // REMOVED: Duplicate emergency listener - handled in separate useEffect above
    // const unsubscribeEmergency = subscribe(events.RECEIVE_EMERGENCY, (data) => {
    // REMOVED: Duplicate emergency handling code
    // ... emergency handling logic moved to separate useEffect above ...

    const unsubscribeLocation = subscribe(events.RECEIVE_LOCATION, (data: { 
      vehicleNumber: string; 
      location: { lat: number; lng: number; accuracy?: number; timestamp?: number }; 
      accuracy?: number; 
      speed?: number; 
      heading?: number; 
      timestamp?: number;
      nearbyFacilities?: any[];
    }) => {
      console.log('🎯 Manager Dashboard received GPS update:', data);
      
      // Update vehicle locations with enhanced data
      setVehicleLocations(prev => ({
        ...prev,
        [data.vehicleNumber]: {
          lat: data.location.lat,
          lng: data.location.lng,
          accuracy: data.accuracy || data.location.accuracy,
          speed: data.speed || 0,
          heading: data.heading || 0,
          timestamp: data.timestamp || data.location.timestamp || Date.now(),
          lastUpdate: Date.now()
        }
      }));
      
      // Facilities must come ONLY from the driver device.
      if (Array.isArray(data.nearbyFacilities)) {
        setLiveNearbyFacilitiesByVehicle(prev => ({
          ...prev,
          [data.vehicleNumber]: data.nearbyFacilities || []
        }));
      }
      
      // Update vehicle tracking status
      setVehicleTrackingStatus(prev => ({
        ...prev,
        [data.vehicleNumber]: 'active'
      }));
      
      // Don't refetch emergencies on every GPS update - too expensive
    });

    // Listen for stop alarm to clear active emergency
    const unsubscribeStopAlarm = subscribe(events.STOP_ALARM, (data) => {
        // Clear if it matches the emergencyId, or if it matches driver/vehicle
      setActiveEmergency((prev) => {
        if (!prev) return prev;
        if (
          !data.emergencyId ||
          data.emergencyId === prev.emergencyId ||
          (data.driverNumber === prev.driverNumber && data.vehicleNumber === prev.vehicleNumber)
        ) {
          return null;
        }
        return prev;
      });
      // Don't refetch emergencies on stop alarm - socket handles updates
    });

    // Listen for trip completion
    const unsubscribeTripCompleted = subscribe('TRIP_COMPLETED', (data) => {
      console.log(`🎯 Trip completed: ${data.vehicleNumber} reached ${data.endLocation}`);
      
      // No simulation cleanup needed - using real GPS only

      // Remove from paused/stopped vehicles
      setPausedVehicles(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.vehicleNumber);
        return newSet;
      });

      setStoppedVehicles(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.vehicleNumber);
        return newSet;
      });

      // Refresh trips data to remove completed trip from UI
      refetchTrips();
    });
    
    return () => {
      // unsubscribeEmergency?.(); // REMOVED: Duplicate emergency listener
      unsubscribeLocation?.();
      unsubscribeStopAlarm?.();
      unsubscribeTripCompleted?.();
    };
  }, [subscribe, events, refetchTrips]); // Removed refetchEmergencies to prevent excessive re-renders

  // Separate effect to check for existing active emergencies (runs only when emergencies data changes)
  useEffect(() => {
    if (emergencies && emergencies.length > 0) {
      const activeEmergencies = emergencies.filter(e => e.status === "ACTIVE");
      if (activeEmergencies.length > 0) {
        // Get the most recent one (already sorted by createdAt desc)
        const mostRecent = activeEmergencies[0];
        if (!activeEmergency) {
          setActiveEmergency(mostRecent);
        }
        // Don't update if we already have an active emergency to prevent blinking
      } else if (activeEmergency) {
        // No active emergencies, clear it
        setActiveEmergency(null);
      }
    } else if (activeEmergency) {
      // No emergencies in list, clear active
      setActiveEmergency(null);
    }
  }, [emergencies]); // Only depend on emergencies data, not activeEmergency

  // Monitor vehicle tracking status
  useEffect(() => {
    const monitorVehicles = setInterval(() => {
      const now = Date.now();
      
      setVehicleTrackingStatus(prev => {
        const updated = { ...prev };
        
        Object.keys(vehicleLocations).forEach(vehicleNumber => {
          const vehicle = vehicleLocations[vehicleNumber];
          if (vehicle.lastUpdate) {
            const timeSinceUpdate = now - vehicle.lastUpdate;
            
            if (timeSinceUpdate > 30000) { // No update for 30 seconds
              updated[vehicleNumber] = 'lost';
            } else if (timeSinceUpdate > 15000) { // No update for 15 seconds
              updated[vehicleNumber] = 'inactive';
            } else {
              updated[vehicleNumber] = 'active';
            }
          }
        });
        
        return updated;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(monitorVehicles);
  }, [vehicleLocations]);

  // REMOVED: Vehicle simulation completely - using real GPS only
  // No automatic vehicle movement - vehicles only move when drivers send real GPS coordinates

  // REMOVED: checkDriverLoginStatus function - no longer needed without simulation

  // REMOVED: calculateDistance function - no longer needed without simulation

  const handleRealEmergency = (emergencyId: number) => {
    const emergency = emergencies?.find(e => e.emergencyId === emergencyId);
    if (emergency) {
      // Stop vehicle simulation completely
      setStoppedVehicles(prev => new Set(prev).add(emergency.vehicleNumber));
      setPausedVehicles(prev => {
        const newSet = new Set(prev);
        newSet.delete(emergency.vehicleNumber);
        return newSet;
      });
    }
  };

  const handleFalseAlarm = (emergencyId: number) => {
    const emergencyVehicleNumber =
      activeEmergency?.emergencyId === emergencyId
        ? activeEmergency.vehicleNumber
        : emergencies?.find((e) => e.emergencyId === emergencyId)?.vehicleNumber;

    if (!emergencyVehicleNumber) return;

    // Resume vehicle simulation from current progress; do not reset position.
    setPausedVehicles(prev => {
      const newSet = new Set(prev);
      newSet.delete(emergencyVehicleNumber);
      return newSet;
    });
  };

  const mapMarkers = [
    // Vehicles with REAL GPS locations only (no fallback coordinates)
    ...(vehicles?.map(v => {
      // Use real GPS location from vehicleLocations (sent by driver devices)
      const realLocation = vehicleLocations[v.vehicleNumber];
      const trackingStatus = vehicleTrackingStatus[v.vehicleNumber] || 'inactive';
      
      // Only show vehicle if we have real GPS data
      if (!realLocation) {
        return null; // Don't show vehicle without real GPS
      }
      
      // Determine vehicle icon based on tracking status
      const vehicleIcon = trackingStatus === 'active' ? '🚗' : 
                         trackingStatus === 'inactive' ? '🟡' : '🔴';
      
      const lastUpdateTime = realLocation.lastUpdate ? 
        new Date(realLocation.lastUpdate).toLocaleTimeString() : 'Unknown';
      
      const speedText = realLocation.speed ? 
        `${Math.round(realLocation.speed * 3.6)} km/h` : '0 km/h'; // Convert m/s to km/h
      
      const accuracyText = realLocation.accuracy ? 
        `±${Math.round(realLocation.accuracy)}m` : 'Unknown';
      
      return {
        id: v.vehicleNumber,
        lat: realLocation.lat,
        lng: realLocation.lng,
        title: `${vehicleIcon} Vehicle: ${v.vehicleNumber}`,
        type: "vehicle" as const,
        details: `Type: ${v.vehicleType} | Status: ${trackingStatus.toUpperCase()} | Speed: ${speedText} | Accuracy: ${accuracyText} | Last Update: ${lastUpdateTime}`,
        trackingStatus
      };
    }).filter(Boolean) || []), // Remove null entries
    // Emergencies override vehicle positions
    ...(emergencies?.filter(e => 
      e.status === "ACTIVE" && 
      e.latitude && 
      e.longitude &&
      e.driver &&
      e.vehicle
    ).map(e => ({
      id: e.emergencyId,
      lat: parseFloat(String(e.latitude)),
      lng: parseFloat(String(e.longitude)),
      title: "🚨 EMERGENCY ALERT",
      type: "emergency" as const,
      details: `Driver: ${e.driver.name} | Vehicle: ${e.vehicle.vehicleNumber} | Time: ${new Date(e.createdAt || e.timestamp || "").toLocaleTimeString()}`
    })) || [])
  ];

  const handleRegisterVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    registerVehicle.mutate(newVehicle, {
      onSuccess: () => setNewVehicle({ vehicleNumber: "", vehicleType: "Ambulance", fuelCapacity: 50 })
    });
  };

  const handleRegisterDriver = (e: React.FormEvent) => {
    e.preventDefault();
    registerDriver.mutate(newDriver, {
      onSuccess: () => setNewDriver({ 
        driverNumber: "", 
        name: "", 
        phoneNumber: "", 
        email: "",
        licenseNumber: "",
        bloodGroup: "",
        medicalConditions: "",
        emergencyContact: "",
        emergencyContactPhone: ""
      })
    });
  };

  const handleAssign = (e: React.FormEvent) => {
    console.log('🚗 handleAssign called - Form submitted');
    e.preventDefault();
    
    console.log('📋 Assignment data:', {
      vehicleNumber: assignment.vehicleNumber,
      driverNumber: assignment.driverNumber,
      hasStartCoords: !!startCoords,
      hasEndCoords: !!endCoords,
      hasSelectedRoute: !!selectedRoute,
      selectedRouteId: selectedRoute?.routeId
    });
    
    if (assignment.vehicleNumber && assignment.driverNumber) {
      // Include route data if available
      const tripData: any = { 
        vehicleNumber: assignment.vehicleNumber, 
        driverNumber: assignment.driverNumber 
      };
      
      // Add location data if route analysis was performed
      if (startCoords && endCoords) {
        tripData.startLocation = startLocation;
        tripData.startLatitude = startCoords.lat;
        tripData.startLongitude = startCoords.lng;
        tripData.endLocation = endLocation;
        tripData.endLatitude = endCoords.lat;
        tripData.endLongitude = endCoords.lng;
        console.log('📍 Added location data to trip');
      }
      
      // Add selected route data if available
      if (selectedRoute) {
        console.log('🔍 Selected route object keys:', Object.keys(selectedRoute));
        console.log('🔍 Selected route geometry:', selectedRoute.geometry);
        console.log('🔍 Selected route sample:', {
          routeId: selectedRoute.routeId,
          hasGeometry: !!selectedRoute.geometry,
          geometryType: selectedRoute.geometry?.type,
          coordinatesLength: selectedRoute.geometry?.coordinates?.length
        });

        tripData.selectedRoute = selectedRoute;
        tripData.routeId = selectedRoute.routeId;
        tripData.routeData = selectedRoute.geometry;
        tripData.safetyMetrics = selectedRoute.safetyMetrics;
        tripData.estimatedTime = selectedRoute.estimatedTime;
        tripData.distance = selectedRoute.distance;
        
        console.log('🚗 Assigning trip with selected route:', {
          routeId: selectedRoute.routeId,
          safetyScore: selectedRoute.safetyMetrics?.overallSafetyScore,
          distance: selectedRoute.distance,
          estimatedTime: selectedRoute.estimatedTime,
          hasGeometry: !!selectedRoute.geometry
        });
      }
      
      console.log('📤 Sending trip data:', tripData);
      
      assignTrip.mutate(tripData, {
        onSuccess: () => {
          console.log('✅ Trip assigned successfully!');
          toast({
            title: "Trip Assigned Successfully! 🚗",
            description: "Driver has been notified via email with login credentials.",
            duration: 5000
          });
          // Reset form
          setAssignment({ vehicleNumber: "", driverNumber: "" });
          setStartLocation("");
          setEndLocation("");
          setStartCoords(null);
          setEndCoords(null);
          setAnalyzedRoutes([]);
          setSelectedRoute(null);
          setShowRouteAnalysis(false);
        },
        onError: (error: any) => {
          console.error('❌ Trip assignment failed:', error);
          
          // Parse detailed error message if available
          let errorMessage = "Could not assign trip. Please try again.";
          
          if (error.message && error.message.includes("already has an active trip")) {
            errorMessage = "Assignment blocked: Driver or vehicle already has an active trip. Please complete existing trips first.";
          }
          
          toast({
            title: "Assignment Failed",
            description: errorMessage,
            variant: "destructive",
            duration: 8000
          });
        }
      });
    } else {
      console.warn('⚠️ Missing required data:', {
        hasVehicle: !!assignment.vehicleNumber,
        hasDriver: !!assignment.driverNumber
      });
      toast({
        title: "Missing Information",
        description: "Please select both vehicle and driver.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold font-display">Mission Control</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              {socket?.connected ? 'System Online' : 'Connecting...'}
            </div>
            <Button variant="outline" size="sm" className="border-slate-300 bg-white" onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white p-1 shadow-sm border border-slate-200">
            <TabsTrigger value="monitoring" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm">
              <Radio className="w-4 h-4 mr-2" /> Live
            </TabsTrigger>
            <TabsTrigger value="fleet" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm">
              <Car className="w-4 h-4 mr-2" /> Fleet
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="data-[state=active]:bg-primary data-[state=active]:text-white">
              <Settings className="w-4 h-4 mr-2" /> Maintenance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)] gap-4 min-h-[600px]">
              {/* Enhanced Map */}
              <div className="order-1 h-[600px] rounded-xl overflow-hidden shadow-md border border-slate-200 relative z-10">
                {trips?.some((t: any) => t.status === "ACTIVE") ? (
                  (() => {
                    const currentTrip = selectedVehicle
                      ? trips?.find((t: any) => t.vehicleNumber === selectedVehicle && t.status === "ACTIVE")
                      : trips?.find((t: any) => t.status === "ACTIVE");

                    if (!currentTrip) {
                      return (
                        <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-600">
                          <div className="text-center">
                            <h3 className="text-lg font-semibold mb-2">No Active Trip For Selected Vehicle</h3>
                            <p className="text-sm">Select a vehicle with an active trip to view live map.</p>
                          </div>
                        </div>
                      );
                    }

                    const mapVehicleNumber = currentTrip.vehicleNumber;
                    const realGPSLocation = vehicleLocations[mapVehicleNumber];
                    
                    return (
                      <FixedVehicleTrackingMap
                        vehicleNumber={mapVehicleNumber}
                        driverName={currentTrip?.driver?.name || "Fleet Overview"}
                        currentLocation={realGPSLocation || { lat: parseFloat(currentTrip.startLatitude || "12.9716"), lng: parseFloat(currentTrip.startLongitude || "77.5946") }}
                        destination={{ lat: parseFloat(currentTrip.endLatitude || "11.0168"), lng: parseFloat(currentTrip.endLongitude || "76.9558") }}
                        isRealGPS={!!realGPSLocation}
                        showRoute={true}
                        showAlternativeRoutes={false}
                        autoFollow={false}
                        simulatedPosition={null}
                        simulationProgress={0}
                        isEmergency={!!emergencies?.some(e => e.vehicleNumber === mapVehicleNumber && e.status === "ACTIVE")}
                        isPaused={false}
                        routeGeometry={currentTrip?.routeGeometry || null}
                        allRoutes={currentTrip?.allRoutes || []}
                        dangerZones={currentTrip?.dangerZones || []}
                        safetyMetrics={currentTrip?.safetyMetrics || null}
                        facilities={liveNearbyFacilitiesByVehicle[mapVehicleNumber] || []}
                      />
                    );
                  })()
                ) : (
                  <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-600">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
                        <MapPin className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">No Active Trips</h3>
                      <p className="text-sm mb-4">Assign trips to vehicles to see real-time tracking</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar */}
              <Card className="order-2 flex flex-col h-[600px] min-w-[300px] relative z-10">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-base">Emergency Alerts</span>
                    <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs font-bold">
                      {emergencies?.filter(e => e.status === "ACTIVE").length || 0}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                  {emergencies?.filter(e => e.status === "ACTIVE").length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                      <ShieldCheck className="w-10 h-10 mb-2" />
                      <p>All clear. No active emergencies.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {emergencies?.filter(e => e.status === "ACTIVE").map(emergency => (
                        <div key={emergency.emergencyId} className="p-4 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer border-l-4 border-red-500" onClick={() => setActiveEmergency(emergency)}>
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-bold text-red-700">Vehicle {emergency.vehicle.vehicleNumber}</h4>
                            <span className="text-xs text-red-500 font-mono">
                              {new Date(emergency.createdAt || "").toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm text-red-700 mb-2">Driver: {emergency.driver.name}</p>
                          <Button size="sm" variant="destructive" className="w-full" onClick={(e) => { e.stopPropagation(); setActiveEmergency(emergency); }}>
                            View Details
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="p-4 border-t border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-2 text-sm uppercase tracking-wide">Active Trips</h3>
                    <div className="space-y-2">
                       {vehicles?.map(v => {
                         const activeTrip = trips?.find((t: any) => t.vehicleNumber === v.vehicleNumber && t.status === "ACTIVE");
                         const isPaused = pausedVehicles.has(v.vehicleNumber);
                         const isStopped = stoppedVehicles.has(v.vehicleNumber);
                         return (
                           <div 
                             key={v.vehicleNumber} 
                             className={`flex items-center justify-between text-sm p-2 rounded hover:bg-slate-50 cursor-pointer ${selectedVehicle === v.vehicleNumber ? 'bg-blue-50 border border-blue-200' : ''}`}
                             onClick={() => setSelectedVehicle(v.vehicleNumber)}
                           >
                             <div className="flex items-center gap-2">
                               <div className={`w-2 h-2 rounded-full ${isStopped ? 'bg-red-500' : isPaused ? 'bg-yellow-500' : activeTrip ? 'bg-green-500' : 'bg-slate-300'}`} />
                              <span className="font-medium text-sm">{v.vehicleNumber}</span>
                             </div>
                            <div className="text-right">
                              <div className="text-sm text-slate-700">
                               {isStopped ? '🛑 Stopped' : isPaused ? '⏸️ Paused' : activeTrip ? `${activeTrip.driver.name}` : 'No Active Trip'}
                           </div>
                              {activeTrip && (
                                <div className="text-xs text-green-600 font-bold mt-1 ml-auto">
                                  📍 Real GPS Tracking
                                </div>
                              )}
                          </div>
                        </div>
                      );
                       })}
                      </div>
                    </div>
                  <div className="p-4 border-t border-slate-100 mt-auto">
                    <h3 className="font-bold text-slate-800 mb-2 text-sm uppercase tracking-wide">Danger Zones</h3>
                    <div className="space-y-2 text-sm">
                      {(trips || [])
                        .filter((t: any) => t.status === "ACTIVE")
                        .flatMap((t: any) => (t.dangerZones || []).slice(0, 1).map((z: any) => ({ trip: t, zone: z })))
                        .slice(0, 4)
                        .map((item: any, idx: number) => (
                          <div key={idx} className="p-2 rounded border border-red-100 bg-red-50">
                            <div className="font-semibold text-red-700">
                              {item.zone?.riskLevel === "critical" ? "CRITICAL" : "HIGH"} - {item.trip.vehicleNumber}
                  </div>
                            <div className="text-slate-700 text-sm">{item.zone?.description || "Accident-prone segment"}</div>
                          </div>
                        ))}
                      {(!(trips || []).some((t: any) => (t.dangerZones || []).length > 0)) && (
                        <p className="text-sm text-slate-500">No high-risk zones in active trips.</p>
                )}
              </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Vehicle Details Dropdown - Clean Design */}
            {selectedVehicle && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      Vehicle {selectedVehicle} Details
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedVehicle(null)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      ✕
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const vehicle = vehicles?.find(v => v.vehicleNumber === selectedVehicle);
                    const activeTrip = trips?.find((t: any) => t.vehicleNumber === selectedVehicle && t.status === "ACTIVE");
                    const dynamicFacilities = selectedVehicle ? (liveNearbyFacilitiesByVehicle[selectedVehicle] || activeTrip?.facilities || []) : [];
                    const hospitalsCount = dynamicFacilities.filter((f: any) => f.type === "hospital").length;
                    const policeCount = dynamicFacilities.filter((f: any) => f.type === "police").length;
                    const fuelCount = dynamicFacilities.filter((f: any) => f.type === "fuel").length;
                    const serviceCount = dynamicFacilities.filter((f: any) => f.type === "service").length;
                    
                    if (!vehicle) return <p>Vehicle not found</p>;
                    
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Trip Details */}
                        <div>
                          <h3 className="font-bold text-blue-800 mb-3">🚗 Trip Information</h3>
                          {activeTrip ? (
                            <div className="space-y-2 text-sm">
                              <p><strong>Driver:</strong> {activeTrip.driver.name}</p>
                              <p><strong>From:</strong> {activeTrip.startLocation}</p>
                              <p><strong>To:</strong> {activeTrip.endLocation}</p>
                              <p><strong>Status:</strong> <span className="text-green-600 font-bold">Active</span></p>
                              <p><strong>Started:</strong> {new Date(activeTrip.createdAt).toLocaleString()}</p>
                            </div>
                          ) : (
                            <p className="text-gray-600">No active trip</p>
                          )}
                        </div>

                        {/* Nearby Facilities */}
                        <div>
                          <h3 className="font-bold text-blue-800 mb-3">🏥 Nearby Facilities</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>🏥 Hospitals:</span>
                              <span className="font-bold">{hospitalsCount} facilities</span>
                            </div>
                            <div className="flex justify-between">
                              <span>🚓 Police:</span>
                              <span className="font-bold">{policeCount} stations</span>
                            </div>
                            <div className="flex justify-between">
                              <span>⛽ Fuel:</span>
                              <span className="font-bold">{fuelCount} stations</span>
                            </div>
                            <div className="flex justify-between">
                              <span>🔧 Service:</span>
                              <span className="font-bold">{serviceCount} centers</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-6">
            {/* Fleet Utilities */}
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-800">
                  <Settings className="w-5 h-5" /> Fleet Utilities
                </CardTitle>
                <CardDescription className="text-orange-700">
                  Administrative tools for fleet management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-orange-300 text-orange-800 hover:bg-orange-100"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/trips/clear-active', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          toast({
                            title: "Active Trips Cleared",
                            description: `Cleared ${result.clearedTrips?.length || 0} active trips`,
                            duration: 3000
                          });
                          // Refresh trips data
                          refetchTrips();
                        } else {
                          throw new Error('Failed to clear trips');
                        }
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to clear active trips",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    Clear Active Trips
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-red-300 text-red-800 hover:bg-red-100"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/emergencies/clear-active', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          toast({
                            title: "Active Emergencies Cleared",
                            description: `Cleared ${result.clearedEmergencies?.length || 0} active emergencies`,
                            duration: 3000
                          });
                          // Refresh emergencies data
                          refetchEmergencies();
                        } else {
                          throw new Error('Failed to clear emergencies');
                        }
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to clear active emergencies",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    Clear Active Emergencies
                  </Button>
                  
                  <Button 
                    variant="destructive" 
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={async () => {
                      if (confirm('⚠️ WARNING: This will delete ALL data (drivers, vehicles, trips, emergencies) and reset the database completely. Are you sure?')) {
                        try {
                          const response = await fetch('/api/database/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include'
                          });
                          
                          if (response.ok) {
                            const result = await response.json();
                            toast({
                              title: "Database Reset Complete! 🔄",
                              description: `Fresh start - All data cleared. You can now register new drivers and vehicles.`,
                              duration: 5000
                            });
                            // Refresh all data
                            refetchTrips();
                            refetchEmergencies();
                            window.location.reload(); // Reload to refresh all data
                          } else {
                            throw new Error('Failed to reset database');
                          }
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to reset database",
                            variant: "destructive"
                          });
                        }
                      }
                    }}
                  >
                    🔄 RESET DATABASE (Fresh Start)
                  </Button>
                </div>
                <div className="text-sm text-orange-600 mt-2">
                  <strong>Reset Database:</strong> Completely clears all data for a fresh start. Use this to remove all existing drivers, vehicles, trips, and emergencies.
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Fleet Maintenance Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {vehicles?.map(v => (
                      <div key={v.id} className="py-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold">{v.vehicleNumber} ({v.vehicleType})</p>
                          <p className="text-sm text-slate-500">Mileage: {v.currentMileage} km | Fuel: {v.currentFuel}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">Last Service: {v.lastServiceDate ? new Date(v.lastServiceDate).toLocaleDateString() : 'Never'}</p>
                          <p className={`text-sm font-bold ${v.nextServiceMileage && v.currentMileage && v.nextServiceMileage - v.currentMileage < 500 ? 'text-red-500' : 'text-green-500'}`}>
                            Next Service: {v.nextServiceMileage} km
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="fleet" className="space-y-4">
            <Tabs defaultValue="drivers" className="space-y-3">
              <div className="sticky top-20 z-20 bg-slate-50/95 backdrop-blur py-1">
                <TabsList className="bg-white p-1 shadow-sm border border-slate-200 h-auto w-full justify-start flex-wrap gap-1">
                  <TabsTrigger value="drivers" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm px-3 py-1.5">Drivers</TabsTrigger>
                  <TabsTrigger value="vehicles" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm px-3 py-1.5">Vehicles</TabsTrigger>
                  <TabsTrigger value="assign-trip" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm px-3 py-1.5">Assign Trip</TabsTrigger>
                  <TabsTrigger value="active-trips" className="data-[state=active]:bg-primary data-[state=active]:text-white text-sm px-3 py-1.5">Active Trips</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="vehicles" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Register Vehicle */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Car className="w-5 h-5" /> Add Vehicle</CardTitle>
                  <CardDescription>Register a new vehicle to the fleet database.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegisterVehicle} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Vehicle Number</Label>
                        <Input 
                          placeholder="AMB-001" 
                          value={newVehicle.vehicleNumber}
                          onChange={e => setNewVehicle({...newVehicle, vehicleNumber: e.target.value})}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fuel Capacity (L)</Label>
                        <Input 
                          type="number" 
                          value={newVehicle.fuelCapacity}
                          onChange={e => setNewVehicle({...newVehicle, fuelCapacity: parseInt(e.target.value)})}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select 
                        value={newVehicle.vehicleType} 
                        onValueChange={val => setNewVehicle({...newVehicle, vehicleType: val})}
                      >
                         <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="Ambulance">Ambulance</SelectItem>
                           <SelectItem value="Police">Police</SelectItem>
                           <SelectItem value="Truck">Truck</SelectItem>
                           <SelectItem value="Car">Car</SelectItem>
                           <SelectItem value="Bus">Bus</SelectItem>
                           <SelectItem value="Van">Van</SelectItem>
                           <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                           <SelectItem value="Fire Truck">Fire Truck</SelectItem>
                           <SelectItem value="Taxi">Taxi</SelectItem>
                           <SelectItem value="Auto Rickshaw">Auto Rickshaw</SelectItem>
                         </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full" disabled={registerVehicle.isPending}>
                      {registerVehicle.isPending ? "Adding..." : "Register Vehicle"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

                  {/* Update Vehicle */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Update Vehicle</CardTitle>
                      <CardDescription>Update existing vehicle information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Select Vehicle to Update</Label>
                          <Select 
                            value={editingVehicle || ""} 
                            onValueChange={(val) => {
                              setEditingVehicle(val);
                              const vehicle = vehicles?.find(v => v.vehicleNumber === val);
                              if (vehicle) {
                                setEditVehicleData({
                                  vehicleType: vehicle.vehicleType,
                                  fuelCapacity: vehicle.fuelCapacity
                                });
                              }
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Choose vehicle to update" /></SelectTrigger>
                            <SelectContent>
                              {vehicles?.map(v => (
                                <SelectItem key={v.vehicleNumber} value={v.vehicleNumber}>
                                  {v.vehicleNumber} ({v.vehicleType})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {editingVehicle && (
                          <form onSubmit={(e) => {
                            e.preventDefault();
                            updateVehicle.mutate({ vehicleNumber: editingVehicle, updates: editVehicleData }, {
                              onSuccess: () => {
                                setEditingVehicle(null);
                                setEditVehicleData({ vehicleType: "", fuelCapacity: 0 });
                              }
                            });
                          }} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Vehicle Type</Label>
                              <Select 
                                value={editVehicleData.vehicleType} 
                                onValueChange={val => setEditVehicleData({...editVehicleData, vehicleType: val})}
                              >
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Ambulance">Ambulance</SelectItem>
                                  <SelectItem value="Police">Police</SelectItem>
                                  <SelectItem value="Truck">Truck</SelectItem>
                                  <SelectItem value="Car">Car</SelectItem>
                                  <SelectItem value="Bus">Bus</SelectItem>
                                  <SelectItem value="Van">Van</SelectItem>
                                  <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                                  <SelectItem value="Fire Truck">Fire Truck</SelectItem>
                                  <SelectItem value="Taxi">Taxi</SelectItem>
                                  <SelectItem value="Auto Rickshaw">Auto Rickshaw</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Fuel Capacity (L)</Label>
                              <Input 
                                type="number" 
                                value={editVehicleData.fuelCapacity}
                                onChange={e => setEditVehicleData({...editVehicleData, fuelCapacity: parseInt(e.target.value)})}
                                required
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={updateVehicle.isPending}>
                                {updateVehicle.isPending ? "Updating..." : "Update Vehicle"}
                              </Button>
                              <Button type="button" variant="outline" onClick={() => {
                                setEditingVehicle(null);
                                setEditVehicleData({ vehicleType: "", fuelCapacity: 0 });
                              }}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="drivers" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Register Driver */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Add Driver</CardTitle>
                  <CardDescription>Create credentials for new driver personnel.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegisterDriver} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Driver Number</Label>
                      <Input 
                        placeholder="DRV-001"
                        value={newDriver.driverNumber}
                        onChange={e => setNewDriver({...newDriver, driverNumber: e.target.value})}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name</Label>
                        <Input 
                          value={newDriver.name}
                          onChange={e => setNewDriver({...newDriver, name: e.target.value})}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input 
                          value={newDriver.phoneNumber}
                          onChange={e => setNewDriver({...newDriver, phoneNumber: e.target.value})}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email Address</Label>
                        <Input 
                          type="email"
                          value={newDriver.email}
                          onChange={e => setNewDriver({...newDriver, email: e.target.value})}
                          placeholder="driver@example.com"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>License Number</Label>
                      <Input 
                        value={newDriver.licenseNumber}
                        onChange={e => setNewDriver({...newDriver, licenseNumber: e.target.value})}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Blood Group</Label>
                        <Input 
                          placeholder="e.g., O+, A+, B-, AB+"
                          value={newDriver.bloodGroup}
                          onChange={e => setNewDriver({...newDriver, bloodGroup: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Medical Conditions</Label>
                        <Input 
                          placeholder="e.g., Diabetes, None"
                          value={newDriver.medicalConditions}
                          onChange={e => setNewDriver({...newDriver, medicalConditions: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Emergency Contact Name</Label>
                        <Input 
                          placeholder="e.g., Wife - Priya"
                          value={newDriver.emergencyContact}
                          onChange={e => setNewDriver({...newDriver, emergencyContact: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Emergency Contact Phone</Label>
                        <Input 
                          placeholder="10-digit phone number"
                          value={newDriver.emergencyContactPhone}
                          onChange={e => setNewDriver({...newDriver, emergencyContactPhone: e.target.value})}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={registerDriver.isPending}>
                      {registerDriver.isPending ? "Creating..." : "Create Profile"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

                  {/* Update Driver */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Update Driver</CardTitle>
                      <CardDescription>Update existing driver information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Select Driver to Update</Label>
                          <Select 
                            value={editingDriver || ""} 
                            onValueChange={(val) => {
                              setEditingDriver(val);
                              const driver = drivers?.find(d => d.driverNumber === val);
                              if (driver) {
                                setEditDriverData({
                                  name: driver.name,
                                  phoneNumber: driver.phoneNumber,
                                  email: driver.email || "",
                                  licenseNumber: driver.licenseNumber,
                                  bloodGroup: driver.bloodGroup || "",
                                  medicalConditions: driver.medicalConditions || "",
                                  emergencyContact: driver.emergencyContact || "",
                                  emergencyContactPhone: driver.emergencyContactPhone || ""
                                });
                              }
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Choose driver to update" /></SelectTrigger>
                            <SelectContent>
                              {drivers?.map(d => (
                                <SelectItem key={d.driverNumber} value={d.driverNumber}>
                                  {d.name} ({d.driverNumber})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {editingDriver && (
                          <form onSubmit={(e) => {
                            e.preventDefault();
                            updateDriver.mutate({ driverNumber: editingDriver, updates: editDriverData }, {
                              onSuccess: () => {
                                setEditingDriver(null);
                                setEditDriverData({ 
                                  name: "", 
                                  phoneNumber: "", 
                                  email: "",
                                  licenseNumber: "",
                                  bloodGroup: "",
                                  medicalConditions: "",
                                  emergencyContact: "",
                                  emergencyContactPhone: ""
                                });
                              }
                            });
                          }} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input 
                                  value={editDriverData.name}
                                  onChange={e => setEditDriverData({...editDriverData, name: e.target.value})}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Phone Number</Label>
                                <Input 
                                  value={editDriverData.phoneNumber}
                                  onChange={e => setEditDriverData({...editDriverData, phoneNumber: e.target.value})}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input 
                                  type="email"
                                  value={editDriverData.email}
                                  onChange={e => setEditDriverData({...editDriverData, email: e.target.value})}
                                  placeholder="driver@example.com"
                                  required
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>License Number</Label>
                              <Input 
                                value={editDriverData.licenseNumber}
                                onChange={e => setEditDriverData({...editDriverData, licenseNumber: e.target.value})}
                                required
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Blood Group</Label>
                                <Input 
                                  placeholder="e.g., O+, A+, B-, AB+"
                                  value={editDriverData.bloodGroup}
                                  onChange={e => setEditDriverData({...editDriverData, bloodGroup: e.target.value})}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Medical Conditions</Label>
                                <Input 
                                  placeholder="e.g., Diabetes, None"
                                  value={editDriverData.medicalConditions}
                                  onChange={e => setEditDriverData({...editDriverData, medicalConditions: e.target.value})}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Emergency Contact Name</Label>
                                <Input 
                                  placeholder="e.g., Wife - Priya"
                                  value={editDriverData.emergencyContact}
                                  onChange={e => setEditDriverData({...editDriverData, emergencyContact: e.target.value})}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Emergency Contact Phone</Label>
                                <Input 
                                  placeholder="10-digit phone number"
                                  value={editDriverData.emergencyContactPhone}
                                  onChange={e => setEditDriverData({...editDriverData, emergencyContactPhone: e.target.value})}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={updateDriver.isPending}>
                                {updateDriver.isPending ? "Updating..." : "Update Driver"}
                              </Button>
                              <Button type="button" variant="outline" onClick={() => {
                                setEditingDriver(null);
                                setEditDriverData({ 
                                  name: "", 
                                  phoneNumber: "", 
                                  email: "",
                                  licenseNumber: "",
                                  bloodGroup: "",
                                  medicalConditions: "",
                                  emergencyContact: "",
                                  emergencyContactPhone: ""
                                });
                              }}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="assign-trip" className="space-y-4">
              {/* Assign Trip */}
                <Card>
                <CardHeader>
                  <CardTitle>🚗 Smart Trip Assignment with Route Analysis</CardTitle>
                  <CardDescription>Assign trips with ML-powered route safety analysis and optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAssign} className="space-y-4">
                    {/* Step 1: Vehicle and Driver Selection */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Select Vehicle</Label>
                        <Select 
                          value={assignment.vehicleNumber} 
                          onValueChange={val => setAssignment({...assignment, vehicleNumber: val})}
                        >
                           <SelectTrigger><SelectValue placeholder="Choose vehicle" /></SelectTrigger>
                           <SelectContent>
                             {availableVehicles?.map(v => (
                               <SelectItem key={v.vehicleNumber} value={v.vehicleNumber}>
                                 {v.vehicleNumber} ({v.vehicleType})
                               </SelectItem>
                             ))}
                             {(!availableVehicles || availableVehicles.length === 0) && (
                               <SelectItem value="" disabled>
                                 No available vehicles (all are on active trips)
                               </SelectItem>
                             )}
                           </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Select Driver</Label>
                        <Select 
                          value={assignment.driverNumber} 
                          onValueChange={val => setAssignment({...assignment, driverNumber: val})}
                        >
                           <SelectTrigger><SelectValue placeholder="Choose driver" /></SelectTrigger>
                           <SelectContent>
                             {availableDrivers?.map(d => (
                               <SelectItem key={d.driverNumber} value={d.driverNumber}>
                                 {d.name} ({d.driverNumber})
                               </SelectItem>
                             ))}
                             {(!availableDrivers || availableDrivers.length === 0) && (
                               <SelectItem value="" disabled>
                                 No available drivers (all are on active trips)
                               </SelectItem>
                             )}
                           </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Step 2: Location Inputs */}
                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Route Information
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {/* Start Location */}
                        <div className="space-y-2">
                          <Label>Start Location</Label>
                          <AddressAutocomplete
                            value={startLocation}
                            onChange={setStartLocation}
                            onCoordinatesChange={setStartCoords}
                            placeholder="Enter start address (e.g., Chennai, Tamil Nadu)"
                            showGpsButton={true}
                            onGpsClick={getCurrentLocation}
                          />
                          <p className="text-xs text-slate-500">
                            💡 Type to see address suggestions or click GPS icon
                          </p>
                        </div>

                        {/* Drop Location */}
                        <div className="space-y-2">
                          <Label>Destination</Label>
                          <AddressAutocomplete
                            value={endLocation}
                            onChange={setEndLocation}
                            onCoordinatesChange={setEndCoords}
                            placeholder="Enter destination address (e.g., Bangalore, Karnataka)"
                          />
                          <p className="text-xs text-slate-500">
                            🗺️ Type detailed address for better accuracy
                          </p>
                        </div>
                      </div>

                      {/* Analyze Routes Button */}
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="w-full"
                        disabled={!assignment.vehicleNumber || !assignment.driverNumber || !startLocation || !endLocation || analyzingRoutes}
                        onClick={analyzeRoutes}
                      >
                        <Search className="w-4 h-4 mr-2" />
                        {analyzingRoutes ? "Analyzing Routes..." : "Analyze Routes & Show Safety Scores"}
                      </Button>
                    </div>

                    {/* Step 3: Route Analysis Results (shown after analysis) */}
                    {showRouteAnalysis && analyzedRoutes.length > 0 && (
                      <div className="space-y-4 border-t pt-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Route Analysis Results
                        </h3>
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800">
                            🔍 Found {analyzedRoutes.length} possible route(s). Select the best route for your trip.
                          </p>
                        </div>

                        {/* Route Map Visualization */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">📍 Route Map</h4>
                          {analyzedRoutes && analyzedRoutes.length > 0 ? (
                            <RouteMap 
                              routes={analyzedRoutes} 
                              selectedRouteId={selectedRoute?.routeId}
                            />
                          ) : (
                            <div className="w-full h-[300px] bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                              <div className="text-center">
                                <MapPin className="w-8 h-8 mx-auto mb-2" />
                                <p>Route map will appear here after analysis</p>
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-slate-500">
                            💡 Green = Recommended Route | Blue = Other Routes | Red Markers = Danger Zones
                          </p>
                        </div>

                        {/* Route Options */}
                        <div className="space-y-3">
                          {analyzedRoutes.map((route, index) => {
                            const isSelected = selectedRoute?.routeId === route.routeId;
                            const isRecommended = route.isRecommended;
                            const safetyScore = route.safetyMetrics.overallSafetyScore;
                            const borderColor = isRecommended ? 'border-green-500' : isSelected ? 'border-blue-500' : 'border-slate-300';
                            const bgColor = isRecommended ? 'bg-green-50' : isSelected ? 'bg-blue-50' : 'bg-slate-50';
                            
                            return (
                              <div 
                                key={route.routeId} 
                                className={`border-2 ${borderColor} rounded-lg p-4 ${bgColor} cursor-pointer transition-all hover:shadow-md`}
                                onClick={() => setSelectedRoute(route)}
                              >
                                {/* Cities on Route */}
                                {route.citiesOnRoute && route.citiesOnRoute.length > 0 && (
                                  <div className="mb-3 bg-white rounded p-3 border border-slate-200">
                                    <div className="text-xs font-semibold text-slate-600 mb-2">🛣️ Route via:</div>
                                    <div className="flex flex-wrap gap-2">
                                      {route.citiesOnRoute.map((city: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded">
                                          <span className="font-medium">{city.name}</span>
                                          {city.distanceFromStart > 0 && (
                                            <span className="text-slate-500">({city.distanceFromStart}km)</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`${isRecommended ? 'bg-green-500' : isSelected ? 'bg-blue-500' : 'bg-slate-400'} text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold`}>
                                      {isRecommended ? '✓' : index + 1}
                                    </div>
                                    <div>
                                      <h4 className={`font-bold ${isRecommended ? 'text-green-900' : 'text-slate-900'}`}>
                                        Route {index + 1} {isRecommended && '(RECOMMENDED)'}
                                      </h4>
                                      <p className="text-sm text-slate-600">
                                        {(route.distance / 1000).toFixed(1)} km • {Math.round(route.estimatedTime / 60)} minutes
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-2xl font-bold ${
                                      safetyScore >= 80 ? 'text-green-600' :
                                      safetyScore >= 60 ? 'text-yellow-600' :
                                      safetyScore >= 40 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                      {safetyScore}/100
                                    </div>
                                    <div className="text-xs text-slate-600">Safety Score</div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                                  <div className="bg-white rounded p-2">
                                    <div className="text-slate-500">Accident Risk</div>
                                    <div className={`font-bold ${route.safetyMetrics.accidentFrequencyScore >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                                      {route.safetyMetrics.accidentFrequencyScore}/100
                                    </div>
                                  </div>
                                  <div className="bg-white rounded p-2">
                                    <div className="text-slate-500">Crime Zones</div>
                                    <div className={`font-bold ${route.safetyMetrics.crimeZoneWeight >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                                      {route.safetyMetrics.crimeZoneWeight}/100
                                    </div>
                                  </div>
                                  <div className="bg-white rounded p-2">
                                    <div className="text-slate-500">Road Quality</div>
                                    <div className={`font-bold ${route.safetyMetrics.roadConditionScore >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                                      {route.safetyMetrics.roadConditionScore}/100
                                    </div>
                                  </div>
                                  <div className="bg-white rounded p-2">
                                    <div className="text-slate-500">Danger Zones</div>
                                    <div className={`font-bold ${route.dangerZones.length === 0 ? 'text-green-600' : route.dangerZones.length <= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                                      {route.dangerZones.length} zone{route.dangerZones.length !== 1 ? 's' : ''}
                                    </div>
                                  </div>
                                </div>

                                {route.dangerZones.length > 0 && (
                                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2">
                                    <p className="text-xs text-yellow-800 font-medium">
                                      ⚠️ {route.dangerZones.length} danger zone{route.dangerZones.length !== 1 ? 's' : ''} detected on this route
                                    </p>
                                  </div>
                                )}

                                {isSelected && (
                                  <div className="mt-3 bg-blue-100 border border-blue-300 rounded p-2">
                                    <p className="text-xs text-blue-800 font-medium flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" />
                                      Selected for trip assignment
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Final Assign Button */}
                    <Button 
                      type="submit" 
                      className="w-full" 
                      size="lg"
                      disabled={assignTrip.isPending || !assignment.vehicleNumber || !assignment.driverNumber || !selectedRoute}
                      onClick={() => console.log('🔘 Button clicked - Form should submit')}
                    >
                      {assignTrip.isPending ? "Assigning Trip..." : selectedRoute ? "Assign Trip with Selected Route" : "Select a Route to Continue"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              </TabsContent>

              <TabsContent value="active-trips" className="space-y-4">
              {/* Active Trips */}
                <Card>
                <CardHeader>
                  <CardTitle>Active Trips</CardTitle>
                  <CardDescription>Manage active trip sessions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {trips?.filter((t: any) => t.status === "ACTIVE").length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No active trips</p>
                    ) : (
                      trips?.filter((t: any) => t.status === "ACTIVE").map((trip: any) => (
                        <div key={trip.tripId} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <p className="font-bold">{trip.driver.name} ({trip.driverNumber})</p>
                            <p className="text-sm text-slate-500">Vehicle: {trip.vehicle.vehicleNumber}</p>
                            <p className="text-xs text-slate-400">Started: {new Date(trip.createdAt || "").toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => cancelTrip.mutate(trip.tripId)}
                              disabled={cancelTrip.isPending || completeTrip.isPending}
                            >
                              {cancelTrip.isPending ? "Cancelling..." : "Cancel Trip"}
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => completeTrip.mutate(trip.tripId)}
                              disabled={completeTrip.isPending || cancelTrip.isPending}
                            >
                              {completeTrip.isPending ? "Completing..." : "Complete Trip"}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>


        </Tabs>
      </main>

      <EmergencyAlert 
        emergency={activeEmergency} 
        onClose={() => setActiveEmergency(null)}
        onRealEmergency={handleRealEmergency}
        onFalseAlarm={handleFalseAlarm}
      />
    </div>
  );
}
