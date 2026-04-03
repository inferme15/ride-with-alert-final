import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket as useSocketHook } from "@/hooks/use-socket";
import { useTriggerEmergency } from "@/hooks/use-emergency";
import { useCurrentTrip } from "@/hooks/use-fleet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { EnhancedTrip } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Video, AlertTriangle, LogOut, Fuel, Wrench, CheckCircle, Menu, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactWebcam from "react-webcam";
import { Map } from "@/components/Map";
import { FixedVehicleTrackingMap } from "@/components/FixedVehicleTrackingMap";

export default function DriverDashboard() {
  const { logout } = useAuth();
  const { socket, emit, subscribe, events } = useSocketHook();
  const { toast } = useToast();
  const { mutateAsync: triggerEmergency, isPending: isTriggering } = useTriggerEmergency();
  const isMobile = useIsMobile();

  // Mobile-specific state
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'camera' | 'info'>('map');

  // State for GPS status
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isRealGPS, setIsRealGPS] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Monitoring Active");
  const [acknowledgmentMessage, setAcknowledgmentMessage] = useState<string | null>(null);
  const [isProcessingEmergency, setIsProcessingEmergency] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [driverNearbyFacilities, setDriverNearbyFacilities] = useState<any[]>([]);
  
  // Real-time Analytics State
  const [currentRisk, setCurrentRisk] = useState<any>(null);
  const [vehicleHealth, setVehicleHealth] = useState<any>(null);
  
  // Refs
  const webcamRef = useRef<ReactWebcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Fetch current trip info with faster loading
  const { data: tripData, isLoading: tripLoading } = useCurrentTrip();
  const trip = tripData as EnhancedTrip | undefined;
  const getActiveVehicleLocation = () => {
    if (simulatedPosition && simulatedPosition.length === 2) {
      return { lat: simulatedPosition[0], lng: simulatedPosition[1] };
    }
    if (location) return location;
    if (trip?.startLatitude && trip?.startLongitude) {
      return { lat: parseFloat(trip.startLatitude), lng: parseFloat(trip.startLongitude) };
    }
    return null;
  };

  // ENHANCED GPS DEBUGGING: Force your exact location for testing
  useEffect(() => {
    console.log('[GPS DEBUG] Starting GPS tracking...');
    
    // Set your exact coordinates immediately for testing
    const yourLocation = { lat: 12.981218, lng: 77.691087 };
    console.log('[FORCE LOCATION] Setting your exact location:', yourLocation);
    setLocation(yourLocation);
    setIsRealGPS(true);
    
    if (trip?.vehicleNumber) {
      console.log('[GPS DEBUG] Emitting location update for vehicle:', trip.vehicleNumber);
      emit(events.LOCATION_UPDATE, {
        vehicleNumber: trip.vehicleNumber,
        location: yourLocation
      });
    }
    
    // Also try to get real GPS
    if (navigator.geolocation) {
      console.log('[GPS DEBUG] Requesting real GPS location...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const realLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log('[GPS DEBUG] Real GPS location received:', realLocation);
          setLocation(realLocation);
          setIsRealGPS(true);
          
          if (trip?.vehicleNumber) {
            console.log('[GPS DEBUG] Emitting real GPS update for vehicle:', trip.vehicleNumber);
            emit(events.LOCATION_UPDATE, {
              vehicleNumber: trip.vehicleNumber,
              location: realLocation
            });
          }
        },
        (error) => {
          console.error('[GPS DEBUG] GPS error:', error);
          console.log('[GPS DEBUG] Using fallback location');
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.error('[GPS DEBUG] Geolocation not supported');
    }
  }, [trip?.vehicleNumber, emit, events]);
  useEffect(() => {
    if (!navigator.geolocation) {
      toast({ title: "GPS Error", description: "Geolocation not supported by browser", variant: "destructive" });
      setLocation({ lat: 11.0168, lng: 76.9558 });
      setIsRealGPS(false);
      return;
    }

    // Force fresh GPS location (no cache)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(newLoc);
        setIsRealGPS(true);
        console.log("Fresh GPS location:", newLoc);
        
        // Remove GPS toast notification
        
        if (trip?.vehicleNumber) {
          console.log('📍 Driver Dashboard sending initial GPS update:', {
            vehicleNumber: trip.vehicleNumber,
            location: newLoc
          });
          emit(events.LOCATION_UPDATE, {
            vehicleNumber: trip.vehicleNumber,
            location: newLoc
          });
        }
      },
      (err) => {
        console.error("GPS error:", err);
        
        // Try again with lower accuracy if high accuracy fails
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocation(newLoc);
            setIsRealGPS(true);
            // Remove low accuracy toast notification
            
            if (trip?.vehicleNumber) {
              emit(events.LOCATION_UPDATE, {
                vehicleNumber: trip.vehicleNumber,
                location: newLoc
              });
            }
          },
          (err2) => {
            console.error("GPS retry failed:", err2);
            // Remove GPS failed toast - just use demo location silently
            setLocation({ lat: 12.9716, lng: 77.5946 }); // Bangalore default
            setIsRealGPS(false);
          },
          { 
            enableHighAccuracy: false, // Lower accuracy retry
            timeout: 10000,
            maximumAge: 0 // Force fresh location
          }
        );
      },
      { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0 // Force fresh location, no cache
      }
    );

    // Set up location watching
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(newLoc);
        setIsRealGPS(true);
        
        if (trip?.vehicleNumber) {
          console.log('📍 Driver Dashboard sending continuous GPS update:', {
            vehicleNumber: trip.vehicleNumber,
            location: newLoc
          });
          emit(events.LOCATION_UPDATE, {
            vehicleNumber: trip.vehicleNumber,
            location: newLoc
          });
        }
      },
      (err) => {
        console.error("GPS watch error:", err);
      },
      { 
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0 // Always get fresh location
      }
    );

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [trip, emit, events, toast]);

  // Record a fixed-length emergency clip and return as blob.
  const recordEmergencyClip = (durationMs: number = 10000): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const stream = webcamRef.current?.stream;
      if (!stream) {
        resolve(null);
        return;
      }

      const chunks: Blob[] = [];
      const options: MediaRecorderOptions = {
        mimeType: "video/webm;codecs=vp8,opus"
      };

      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = "video/webm";
      }

      try {
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.addEventListener("dataavailable", ({ data }: BlobEvent) => {
          if (data.size > 0) chunks.push(data);
        });

        recorder.addEventListener("stop", () => {
          resolve(chunks.length ? new Blob(chunks, { type: "video/webm" }) : null);
        });

        recorder.start(1000);
        setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, durationMs);
      } catch (error) {
        console.error("Failed to record emergency clip:", error);
        resolve(null);
      }
    });
  };

  // Listen for simulated position updates from manager
  useEffect(() => {
    if (!trip?.vehicleNumber) return;
    
    const unsubscribePosition = subscribe('VEHICLE_POSITION_UPDATE', (data: any) => {
      if (data.vehicleNumber === trip.vehicleNumber && data.position) {
        setSimulatedPosition(data.position);
        setSimulationProgress(typeof data.progress === "number" ? data.progress : 0);
        if (Array.isArray(data.nearbyFacilities)) {
          setDriverNearbyFacilities(data.nearbyFacilities);
        }
      }
    });

    const unsubscribeTripCompleted = subscribe('TRIP_COMPLETED', (data: any) => {
      if (data.vehicleNumber === trip.vehicleNumber) {
        // Check if trip was stopped due to emergency or actually completed
        if (data.reason === 'EMERGENCY_STOP') {
          setStatusMessage("🛑 Trip Stopped - Emergency Response Active");
          toast({
            title: "Trip Stopped Due to Emergency 🚨",
            description: "Your trip has been stopped for emergency response. Stay safe!",
            variant: "destructive",
            duration: 8000
          });
        } else {
          setStatusMessage("🎯 Trip Completed! You have reached your destination.");
          toast({
            title: "Trip Completed! 🎉",
            description: data.message || "You have successfully reached your destination!",
            variant: "default",
            duration: 10000
          });
        }
        setTimeout(() => {
          logout();
        }, 1500);
      }
    });

    return () => {
      unsubscribePosition?.();
      unsubscribeTripCompleted?.();
    };
  }, [subscribe, trip?.vehicleNumber, toast, logout]);

  // Listen for acknowledgment
  useEffect(() => {
    const unsubscribe = subscribe(events.RECEIVE_ACKNOWLEDGEMENT, (data) => {
      if (!trip?.driverNumber || !trip?.vehicleNumber) return;
      const isForThisDriver =
        data?.driverNumber === trip.driverNumber ||
        data?.vehicleNumber === trip.vehicleNumber;
      if (!isForThisDriver) return;

      setAcknowledgmentMessage(data.message || "Emergency acknowledged by manager");
      setIsEmergencyActive(false);
      setIsProcessingEmergency(false);

      if (data?.outcome === "FALSE_ALARM") {
        setStatusMessage("False alarm acknowledged. Trip continues.");
      } else if (data?.outcome === "REAL_EMERGENCY") {
        setStatusMessage("Real emergency approved. Trip stopped.");
      } else {
        setStatusMessage("Emergency acknowledged by manager");
      }
    });

    const unsubscribeStopAlarm = subscribe(events.STOP_ALARM, () => {
      // Alarm stopped, but don't change emergency state
    });

    const unsubscribeEmergencyAcknowledged = subscribe(events.EMERGENCY_ACKNOWLEDGED, (data) => {
      if (!trip?.driverNumber || !trip?.vehicleNumber) return;
      const isForThisDriver =
        data?.driverNumber === trip.driverNumber ||
        data?.vehicleNumber === trip.vehicleNumber;
      if (!isForThisDriver) return;

      setIsEmergencyActive(false);
      setIsProcessingEmergency(false);
    });

    // Listen for trip completion
    const unsubscribeTripCompleted = subscribe('TRIP_COMPLETED', (data) => {
      if (trip && data.tripId === trip.tripId) {
        // Check if trip was stopped due to emergency or actually completed
        if (data.reason === 'EMERGENCY_STOP') {
          setStatusMessage("🛑 Trip Stopped - Emergency Response Active");
          toast({
            title: "Trip Stopped Due to Emergency 🚨",
            description: "Your trip has been stopped for emergency response. Stay safe!",
            variant: "destructive"
          });
        } else {
          setStatusMessage(`🎯 Trip Completed! Reached ${data.endLocation}`);
          toast({
            title: "🎉 Trip Completed!",
            description: `Congratulations! You have successfully reached ${data.endLocation}`,
            variant: "default"
          });
        }
        setTimeout(() => {
          logout();
        }, 1500);
      }
    });

    return () => {
      unsubscribe?.();
      unsubscribeStopAlarm?.();
      unsubscribeEmergencyAcknowledged?.();
      unsubscribeTripCompleted?.();
    };
  }, [subscribe, events, trip?.driverNumber, trip?.vehicleNumber, trip?.tripId, toast, logout]);

  // Request camera permissions early but don't block loading
  useEffect(() => {
    // Don't wait for trip data to request camera permissions
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // Request permissions in background, don't block UI
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(() => {
          console.log("Camera and microphone access granted");
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          // Don't show error toast immediately, only when needed
        });
    }
  }, []); // Remove trip dependency for faster loading

  // Fetch real-time analytics every 30 seconds
  useEffect(() => {
    if (trip?.vehicleNumber && location) {
      const fetchRealTimeAnalytics = async () => {
        try {
          // Get risk prediction
          const riskRes = await fetch(`/api/ai/predict-risk/${trip.vehicleNumber}`);
          if (riskRes.ok) {
            const riskData = await riskRes.json();
            setCurrentRisk(riskData);
          }

          // Get vehicle health
          const healthRes = await fetch(`/api/analytics/predictive-maintenance?vehicleNumber=${trip.vehicleNumber}`);
          if (healthRes.ok) {
            const healthData = await healthRes.json();
            setVehicleHealth(healthData);
          }
        } catch (error) {
          console.error("Error fetching analytics:", error);
        }
      };

      fetchRealTimeAnalytics();
      const interval = setInterval(fetchRealTimeAnalytics, 30000); // Every 30 seconds

      return () => clearInterval(interval);
    }
  }, [trip, location]);

  const normalizeFacilityType = (type: string) => {
    const t = (type || "").toLowerCase();
    if (t === "fuel_station") return "fuel";
    if (t === "service_center") return "service";
    if (t === "fire_station") return "fire";
    if (t === "clinic" || t === "ambulance_station") return "hospital";
    return t;
  };
  const hospitalsCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "hospital").length;
  const policeCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "police").length;
  const fuelCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "fuel").length;
  const serviceCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "service").length;
  const pharmacyCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "pharmacy").length;
  const fireCount = driverNearbyFacilities.filter((f: any) => normalizeFacilityType(f.type) === "fire").length;
  const shortCity = (value?: string) => {
    if (!value) return "Unknown";
    const first = value.split(",")[0]?.trim();
    return first || value;
  };
  const tripProgressPct = Math.max(0, Math.min(100, Math.round(simulationProgress * 100)));
  const safetyScore = Math.round(trip?.safetyMetrics?.overallSafetyScore || 0);

  const handleEmergencyClick = () => {
    const activeLocation = getActiveVehicleLocation();
    if (!activeLocation) {
      toast({ title: "Waiting for GPS", description: "Cannot send alert without location.", variant: "destructive" });
      return;
    }
    if (!trip?.driverNumber || !trip?.vehicleNumber) {
      toast({ title: "Trip not active", description: "Cannot send SOS without an active trip.", variant: "destructive" });
      return;
    }
    
    // Prevent multiple rapid clicks
    if (isProcessingEmergency || isEmergencyActive) {
      toast({ title: "Emergency in progress", description: "Please wait for current emergency to process.", variant: "destructive" });
      return;
    }

    console.log('🚨 Emergency button clicked - sending IMMEDIATE alert to manager');
    
    // Start timed emergency workflow:
    // 0-10s: capture video + nearby facilities
    // 11s: send alert payload to manager
    setIsProcessingEmergency(true);
    setIsEmergencyActive(true);
    setStatusMessage("🚨 Capturing 10s emergency evidence...");

    const clickedAt = Date.now();
    const runTimedFlow = async () => {
      try {
        // Collect nearby facilities during evidence capture window.
        const facilitiesPromise = fetch(
          `/api/emergency/nearby-facilities?latitude=${activeLocation.lat}&longitude=${activeLocation.lng}`
        )
          .then(async (r) => (r.ok ? r.json() : []))
          .catch(() => []);

        const videoBlob = await recordEmergencyClip(10000);
        const facilities = await facilitiesPromise;
        if (Array.isArray(facilities)) setDriverNearbyFacilities(facilities);

        // Wait until 11th second to notify manager.
        const elapsed = Date.now() - clickedAt;
        const waitMs = Math.max(0, 11000 - elapsed);
        if (waitMs > 0) {
          setStatusMessage("🚨 Preparing alert for manager review...");
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        const formData = new FormData();
        formData.append('driverNumber', trip.driverNumber);
        formData.append('vehicleNumber', trip.vehicleNumber);
        formData.append('latitude', activeLocation.lat.toString());
        formData.append('longitude', activeLocation.lng.toString());
        formData.append('location', JSON.stringify({ latitude: activeLocation.lat, longitude: activeLocation.lng }));
        formData.append('emergencyType', 'SOS_BUTTON');
        formData.append('description', 'Driver pressed SOS button - Manager review required');
        if (videoBlob) {
          formData.append("video", videoBlob, "emergency-capture.webm");
        }

        await triggerEmergency(formData);

        console.log('✅ Timed emergency alert sent to manager');
        setStatusMessage("🚨 EMERGENCY SENT TO MANAGER - Awaiting decision");
        toast({
          title: "🚨 Emergency Alert Sent!",
          description: "Video and location shared with manager for review.",
          duration: 4000
        });
      } catch (error: any) {
        console.error('❌ Timed emergency alert failed:', error);
        setIsEmergencyActive(false);
        setIsProcessingEmergency(false);
        setStatusMessage("Monitoring Active");
        toast({
          title: "Emergency Failed",
          description: error?.message || "Failed to send alert. Please try again.",
          variant: "destructive"
        });
      }
    };

    runTimedFlow();
  };

  // Manual GPS refresh function
  const refreshGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS Error", description: "Geolocation not supported", variant: "destructive" });
      return;
    }

    setIsGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log(`[GPS REFRESH] Real location: ${newLoc.lat}, ${newLoc.lng}`);
        setLocation(newLoc);
        setIsRealGPS(true);
        setIsGettingLocation(false);
        
        toast({ 
          title: "📍 GPS Updated", 
          description: `Lat: ${newLoc.lat.toFixed(4)}, Lng: ${newLoc.lng.toFixed(4)}`,
          duration: 3000 
        });
        
        if (trip?.vehicleNumber) {
          emit(events.LOCATION_UPDATE, {
            vehicleNumber: trip.vehicleNumber,
            location: newLoc
          });
        }
      },
      (err) => {
        setIsGettingLocation(false);
        // Remove GPS failed toast - handle silently
        console.log("GPS refresh failed, keeping current location");
      },
      { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0 // Force fresh location
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans">
      {tripLoading ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-slate-400">Loading driver dashboard...</p>
          </div>
        </div>
      ) : (
        <>
          <header className="bg-slate-950/95 backdrop-blur p-3 md:p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 z-40">
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight font-display">RideWithAlert</h1>
              <p className="text-xs md:text-sm text-slate-400">Driver Console</p>
            </div>
            <Button variant="outline" size="sm" className="text-slate-100 border-slate-600 bg-slate-900 hover:bg-slate-800" onClick={() => logout()}>
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </header>

          <main className="flex-grow p-2 md:p-4">
        {/* Status Bar - Mobile Optimized */}
        <div className={`p-3 md:p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between shadow-lg transition-colors duration-500 mb-3 md:mb-4 ${isEmergencyActive ? 'bg-red-900/50 border-red-500 animate-pulse' : acknowledgmentMessage ? 'bg-green-900/50 border-green-500' : 'bg-slate-800 border-slate-700'}`}>
          <div className="flex items-center gap-3 mb-2 md:mb-0">
             <div className={`w-3 h-3 rounded-full ${isEmergencyActive ? 'bg-red-500' : acknowledgmentMessage ? 'bg-green-500' : 'bg-green-500'}`} />
             <span className="font-bold text-sm md:text-base lg:text-lg">{statusMessage}</span>
             {acknowledgmentMessage && (
               <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
             )}
          </div>
          {location && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Badge variant="outline" className="border-slate-500 text-slate-300 font-mono text-xs">
                <Navigation className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                <span className="sm:hidden">{location.lat.toFixed(2)}, {location.lng.toFixed(2)}</span>
                <span className={`ml-2 text-xs ${isRealGPS ? 'text-green-400' : 'text-blue-400'}`}>
                  {isRealGPS ? 'LIVE' : 'DEMO'}
                </span>
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={refreshGPS}
                disabled={isGettingLocation}
                className="h-6 px-2 text-xs text-slate-400 hover:text-white"
              >
                {isGettingLocation ? "..." : "📍"}
              </Button>
            </div>
          )}
        </div>

        {/* Real-time Analytics Widgets - Mobile Responsive */}
        {trip && (currentRisk || vehicleHealth) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
            
            {/* RISK LEVEL WIDGET */}
            {currentRisk && (
              <Card className={`bg-slate-800 border ${
                currentRisk.riskLevel === 'CRITICAL' ? 'border-red-500' :
                currentRisk.riskLevel === 'HIGH' ? 'border-orange-500' :
                currentRisk.riskLevel === 'MEDIUM' ? 'border-yellow-500' :
                'border-green-500'
              }`}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Current Risk Level</p>
                      <p className={`text-xl md:text-2xl font-bold ${
                        currentRisk.riskLevel === 'CRITICAL' ? 'text-red-500' :
                        currentRisk.riskLevel === 'HIGH' ? 'text-orange-500' :
                        currentRisk.riskLevel === 'MEDIUM' ? 'text-yellow-500' :
                        'text-green-500'
                      }`}>
                        {currentRisk.riskLevel}
                      </p>
                      <p className="text-xs md:text-sm text-slate-400">
                        Score: {currentRisk.riskScore.toFixed(0)}/100
                      </p>
                    </div>
                    <div className="text-3xl md:text-4xl">
                      {currentRisk.riskLevel === 'CRITICAL' ? '🔴' :
                       currentRisk.riskLevel === 'HIGH' ? '🟠' :
                       currentRisk.riskLevel === 'MEDIUM' ? '🟡' : '🟢'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VEHICLE HEALTH WIDGET */}
            {vehicleHealth && (
              <Card className="bg-slate-800 border border-slate-700">
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Vehicle Health</p>
                      <p className="text-xl md:text-2xl font-bold text-white">
                        {vehicleHealth.maintenanceScore}/100
                      </p>
                      <p className="text-xs md:text-sm text-slate-400">
                        {vehicleHealth.maintenanceScore > 70 ? '⚠️ Service Soon' :
                         vehicleHealth.maintenanceScore > 50 ? '✓ Good' : '✓ Excellent'}
                      </p>
                    </div>
                    <div className="text-3xl md:text-4xl">🔧</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Main Content - Mobile Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 min-h-[600px] md:min-h-[800px]">
          
          {/* Mobile: Emergency Button First (Most Important) */}
          <div className="lg:hidden">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="flex flex-col items-center gap-4 p-4">
                <Button
                  onClick={handleEmergencyClick}
                  disabled={isTriggering || isEmergencyActive || isProcessingEmergency}
                  className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full font-black shadow-2xl transition-all duration-200 transform active:scale-95 border-4 touch-manipulation mobile-emergency-button ${
                    isEmergencyActive || isProcessingEmergency
                      ? "bg-slate-700 text-slate-300 border-slate-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 text-white border-red-800 hover:border-red-700 shadow-red-900/60"
                  }`}
                >
                  {isTriggering ? (
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-xs">SENDING...</span>
                    </div>
                  ) : isEmergencyActive ? (
                    <div className="flex flex-col items-center">
                      <AlertTriangle className="w-10 h-10 mb-1 animate-bounce" />
                      <span className="text-sm leading-tight">EMERGENCY</span>
                      <span className="text-xs leading-tight">ACTIVE</span>
                    </div>
                  ) : isProcessingEmergency ? (
                    <div className="flex flex-col items-center">
                      <AlertTriangle className="w-10 h-10 mb-1" />
                      <span className="text-xs leading-tight">ALERT SENT</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <AlertTriangle className="w-10 h-10 mb-1" />
                      <span className="text-sm leading-tight">EMERGENCY</span>
                      <span className="text-xs leading-tight">SOS</span>
                    </div>
                  )}
                </Button>
                <p className="text-center text-xs text-slate-300 uppercase tracking-wider">
                  Press only for genuine emergency
                </p>
                <div className={`w-full rounded-lg border p-2 text-xs font-semibold text-center ${
                  isProcessingEmergency || isEmergencyActive
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                }`}>
                  {isProcessingEmergency || isEmergencyActive ? "Emergency in progress" : "System ready"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Left Column - Trip Info & Controls */}
          <div className="lg:col-span-3 space-y-3 md:space-y-4">
            {/* Trip Info Card */}
            {trip && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-lg">Active Trip</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Driver</p>
                    <p className="text-sm font-bold text-white">{trip.driver.name}</p>
                    <p className="text-sm text-slate-400">({trip.driverNumber})</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Vehicle</p>
                    <p className="text-lg font-bold text-white">{trip.vehicle.vehicleNumber}</p>
                    <p className="text-sm text-slate-400">{trip.vehicle.vehicleType}</p>
                  </div>
                  
                  {/* Trip Route Details - simplified */}
                  <div className="pt-2 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-2">Route</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <p className="text-sm text-white">{shortCity(trip.startLocation ?? undefined)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <p className="text-sm text-white">{shortCity(trip.endLocation ?? undefined)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-cyan-300 mt-2">
                      {shortCity(trip.startLocation ?? undefined)} {"->"} {shortCity(trip.endLocation ?? undefined)}
                    </p>
                    <div className="mt-2">
                      <div className="flex justify-between text-sm text-slate-300">
                        <span>Trip Progress</span>
                        <span>{tripProgressPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded mt-1">
                        <div className="h-2 bg-emerald-500 rounded" style={{ width: `${tripProgressPct}%` }} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-slate-300">Safety Score</span>
                      <Badge className={`${safetyScore >= 80 ? "bg-green-600" : safetyScore >= 60 ? "bg-yellow-600" : "bg-red-600"} text-white`}>
                        {safetyScore}/100
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Fuel</span>
                      <span className="text-lg font-bold text-white">{trip.vehicle.currentFuel || 0}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Range</span>
                      <span className="text-sm font-bold text-white">
                        ~{Math.round(((trip.vehicle.currentFuel || 0) / 100) * trip.vehicle.fuelCapacity * 10)} km
                      </span>
                    </div>
                  </div>
                  
                  {/* Trip Status */}
                  <div className="pt-2 border-t border-slate-700">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Status</span>
                      <span className="text-sm font-bold text-green-400">{trip.status}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Started: {trip.createdAt ? new Date(trip.createdAt).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Nearby Facilities */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Nearby Facilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-slate-300 grid grid-cols-2 gap-2">
                  <div>🏥 Hospitals ({hospitalsCount})</div>
                  <div>🚔 Police ({policeCount})</div>
                  <div>⛽ Fuel ({fuelCount})</div>
                  <div>🔧 Service ({serviceCount})</div>
                  <div>💊 Pharmacy ({pharmacyCount})</div>
                  <div>🚒 Fire ({fireCount})</div>
                </div>
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  {driverNearbyFacilities.slice(0, 4).map((f: any, index: number) => {
                    const t = normalizeFacilityType(f.type);
                    const icon = t === "hospital" ? "🏥" : t === "police" ? "🚔" : t === "service" ? "🔧" : t === "fire" ? "🚒" : "📍";
                    return (
                      <div key={`${f.name}-${index}`} className="text-sm">
                        <p className="text-white font-medium">{icon} {f.name}</p>
                        <p className="text-slate-400 text-sm">
                          {Number(f.distance || 0).toFixed(1)} km {f.phoneNumber ? `• ${f.phoneNumber}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center Column - Camera & Map */}
          <div className="lg:col-span-6 space-y-3 md:space-y-4">
            {/* Camera Preview - Smaller on mobile */}
            <div className="relative rounded-xl overflow-hidden bg-black h-[200px] md:h-[300px] border border-slate-700 shadow-2xl">
              <ReactWebcam
                audio={true}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                muted={true}
              />
              <div className="absolute top-2 left-2 md:top-3 md:left-3 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> REC READY
              </div>
            </div>

            {/* Enhanced Map with Facilities */}
            <div className="h-[400px] md:h-[600px] rounded-xl overflow-hidden border border-slate-700 relative z-10">
               {trip && trip.status === "ACTIVE" && (trip.startLatitude && trip.startLongitude) ? (
                 (() => {
                   console.log('[DEBUG] Driver Dashboard - Trip data:', {
                     tripId: trip.tripId,
                     hasRouteGeometry: !!trip.routeGeometry,
                     routeGeometryType: trip.routeGeometry?.type,
                     routeCoordinatesLength: trip.routeGeometry?.coordinates?.length,
                     dangerZonesCount: trip.dangerZones?.length || 0,
                     facilitiesCount: trip.facilities?.length || 0,
                     hasSafetyMetrics: !!trip.safetyMetrics
                   });
                   
                   return (
                     <FixedVehicleTrackingMap
                       vehicleNumber={trip.vehicleNumber}
                       driverName={trip.driver.name}
                       currentLocation={(() => {
                         console.log('[MAP DEBUG] location state:', location);
                         console.log('[MAP DEBUG] isRealGPS:', isRealGPS);
                         const mapLocation = location || { lat: 12.9716, lng: 77.5946 };
                         console.log('[MAP DEBUG] Using location for map:', mapLocation);
                         return mapLocation;
                       })()} // Use real GPS location with fallback
                       destination={{ lat: parseFloat(trip.endLatitude || trip.startLatitude), lng: parseFloat(trip.endLongitude || trip.startLongitude) }}
                       isRealGPS={isRealGPS}
                       showRoute={true}
                       showAlternativeRoutes={false}
                      autoFollow={false}
                       simulatedPosition={null} // No simulation - use real GPS only
                       simulationProgress={0} // No simulation progress
                       isEmergency={isEmergencyActive}
                       isPaused={isEmergencyActive}
                       // Add route data from backend - INCLUDING ALL ROUTES
                       routeGeometry={trip.routeGeometry || null}
                       allRoutes={trip.allRoutes || []} // All routes from analysis
                       dangerZones={trip.dangerZones || []}
                       safetyMetrics={trip.safetyMetrics || undefined}
                      facilities={driverNearbyFacilities.length ? driverNearbyFacilities : (trip.facilities || [])}
                     />
                   );
                 })()
               ) : location ? (
                 <Map center={[location.lat, location.lng]} zoom={15} markers={[{
                   id: 1, lat: location.lat, lng: location.lng, title: "My Location", type: "vehicle"
                 }]} />
               ) : (
                 <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500">
                   <MapPin className="w-6 h-6 mr-2 animate-bounce" /> Acquiring GPS...
                 </div>
               )}
            </div>
          </div>

          {/* Right Column - Emergency actions (Desktop Only) */}
          <div className="hidden lg:block lg:col-span-3">
            <div className="lg:sticky lg:top-24 space-y-4 relative z-10">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-lg">Emergency Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <Button
                    onClick={handleEmergencyClick}
                    disabled={isTriggering || isEmergencyActive || isProcessingEmergency}
                    className={`w-44 h-44 min-w-[176px] min-h-[176px] rounded-full font-black shadow-2xl transition-all duration-200 transform active:scale-95 border-8 touch-manipulation ${
                      isEmergencyActive || isProcessingEmergency
                        ? "bg-slate-700 text-slate-300 border-slate-600 cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700 text-white border-red-800 hover:border-red-700 shadow-red-900/60"
                    }`}
                  >
                    {isTriggering ? (
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
                        <span className="text-sm">SENDING...</span>
                      </div>
                    ) : isEmergencyActive ? (
                      <div className="flex flex-col items-center">
                        <AlertTriangle className="w-14 h-14 mb-2 animate-bounce" />
                        <span className="text-lg leading-tight">EMERGENCY</span>
                        <span className="text-base leading-tight">ACTIVE</span>
                      </div>
                    ) : isProcessingEmergency ? (
                      <div className="flex flex-col items-center">
                        <AlertTriangle className="w-14 h-14 mb-2" />
                        <span className="text-base leading-tight">ALERT SENT</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <AlertTriangle className="w-14 h-14 mb-2" />
                        <span className="text-lg leading-tight">EMERGENCY</span>
                        <span className="text-base leading-tight">SOS</span>
                      </div>
                    )}
                  </Button>
                  <p className="text-center text-sm text-slate-300 uppercase tracking-wider">
                    Press only for a genuine emergency
                  </p>
                  <div className={`w-full rounded-lg border p-3 text-sm font-semibold text-center ${
                    isProcessingEmergency || isEmergencyActive
                      ? "border-amber-500 bg-amber-500/10 text-amber-300"
                      : "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  }`}>
                    {isProcessingEmergency || isEmergencyActive ? "Emergency workflow in progress" : "System ready"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
        </>
      )}
    </div>
  );
}
