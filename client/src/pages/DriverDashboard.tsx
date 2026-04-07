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
import { MapPin, Navigation, AlertTriangle, LogOut, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactWebcam from "react-webcam";
import { Map } from "@/components/Map";
import { FixedVehicleTrackingMap } from "@/components/FixedVehicleTrackingMap";

export default function DriverDashboard() {
  const { logout } = useAuth();
  const { emit, subscribe, events } = useSocketHook();
  const { toast } = useToast();
  const { mutateAsync: triggerEmergency, isPending: isTriggering } = useTriggerEmergency();

  // State for GPS status
  const [location, setLocation] = useState<{lat: number, lng: number, accuracy?: number, timestamp?: number} | null>(null);
  const [isRealGPS, setIsRealGPS] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Monitoring Active");
  const [acknowledgmentMessage, setAcknowledgmentMessage] = useState<string | null>(null);
  const [isProcessingEmergency, setIsProcessingEmergency] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [driverNearbyFacilities, setDriverNearbyFacilities] = useState<any[]>([]);
  
  // Enhanced GPS tracking states
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<number | null>(null);
  const [gpsConnectionStatus, setGpsConnectionStatus] = useState<'connecting' | 'connected' | 'weak' | 'lost'>('connecting');
  
  // Real-time Analytics State
  const [currentRisk, setCurrentRisk] = useState<any>(null);
  const [vehicleHealth, setVehicleHealth] = useState<any>(null);
  
  // Real-time trip progress calculation
  const [realTripProgress, setRealTripProgress] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [totalRouteDistance, setTotalRouteDistance] = useState(0);
  
  // Refs
  const webcamRef = useRef<ReactWebcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Helper function to calculate distance between two GPS points (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };

  // Calculate trip progress based on real GPS location
  const calculateTripProgress = (currentLat: number, currentLng: number): number => {
    if (!trip?.startLatitude || !trip?.endLatitude) return 0;
    
    const startLat = parseFloat(trip.startLatitude);
    const startLng = parseFloat(trip.startLongitude);
    const endLat = parseFloat(trip.endLatitude);
    const endLng = parseFloat(trip.endLongitude);
    
    const totalDistance = calculateDistance(startLat, startLng, endLat, endLng);
    const distanceFromStart = calculateDistance(startLat, startLng, currentLat, currentLng);
    
    // Update state for display
    setTotalRouteDistance(totalDistance);
    setDistanceTraveled(distanceFromStart);
    
    // Calculate progress percentage (0-100)
    const progress = Math.min(100, Math.max(0, (distanceFromStart / totalDistance) * 100));
    return progress;
  };

  // Fetch nearby facilities based on current GPS location
  const fetchNearbyFacilities = async (lat: number, lng: number) => {
    try {
      console.log(`🏥 [FACILITIES] Fetching nearby facilities for location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      
      const response = await fetch(`/api/emergency/nearby-facilities?latitude=${lat}&longitude=${lng}`);
      if (response.ok) {
        const facilities = await response.json();
        console.log(`✅ [FACILITIES] Found ${facilities.length} nearby facilities`);
        setDriverNearbyFacilities(facilities);
        return facilities;
      } else {
        console.warn('⚠️ [FACILITIES] Failed to fetch facilities:', response.status);
        return [];
      }
    } catch (error) {
      console.error('❌ [FACILITIES] Error fetching nearby facilities:', error);
      return [];
    }
  };

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

  // REAL GPS TRACKING ONLY - No hardcoded coordinates
  useEffect(() => {
    console.log('🌍 [REAL GPS] Starting real GPS tracking...');
    
    if (!navigator.geolocation) {
      console.error('❌ [REAL GPS] Geolocation not supported by browser');
      toast({ 
        title: "GPS Not Supported", 
        description: "Your browser doesn't support GPS tracking", 
        variant: "destructive" 
      });
      return;
    }

    console.log('📍 [REAL GPS] Requesting driver\'s actual GPS location...');
    
    // Get real GPS location immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const realLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log('✅ [REAL GPS] Driver\'s actual location received:', realLocation);
        setLocation(realLocation);
        setIsRealGPS(true);
        
        toast({ 
          title: "📍 Real GPS Active", 
          description: `Using your actual location: ${realLocation.lat.toFixed(4)}, ${realLocation.lng.toFixed(4)}`,
          duration: 3000
        });
        
        if (trip?.vehicleNumber) {
          console.log('📡 [REAL GPS] Sending driver\'s real location to manager:', {
            vehicleNumber: trip.vehicleNumber,
            location: realLocation
          });
          emit(events.LOCATION_UPDATE, {
            vehicleNumber: trip.vehicleNumber,
            location: realLocation
          });
        }
      },
      (error) => {
        console.error('❌ [REAL GPS] Failed to get real GPS location:', error);
        
        let errorMessage = "Could not access your GPS location.";
        if (error.code === 1) {
          errorMessage = "GPS permission denied. Please allow location access.";
        } else if (error.code === 2) {
          errorMessage = "GPS position unavailable. Check your device settings.";
        } else if (error.code === 3) {
          errorMessage = "GPS request timed out. Please try again.";
        }
        
        toast({ 
          title: "GPS Error", 
          description: errorMessage, 
          variant: "destructive",
          duration: 5000
        });
        
        // Use fallback location only if GPS completely fails
        const fallbackLocation = { lat: 12.9716, lng: 77.5946 }; // Bangalore center
        console.log('⚠️ [REAL GPS] Using fallback location:', fallbackLocation);
        setLocation(fallbackLocation);
        setIsRealGPS(false);
      },
      { 
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0 // Always get fresh location
      }
    );
  }, [trip?.vehicleNumber, emit, events, toast]);

  // Set up continuous GPS tracking with optimized real-time updates
  useEffect(() => {
    if (!navigator.geolocation || !trip?.vehicleNumber) return;

    console.log('🔄 [CONTINUOUS GPS] Setting up real-time GPS tracking...');
    setGpsConnectionStatus('connecting');
    
    // Set up continuous location watching with optimized settings for real-time tracking
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const realLocation = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now()
        };
        
        console.log('🔄 [CONTINUOUS GPS] Real-time location update:', {
          ...realLocation,
          speed: pos.coords.speed,
          heading: pos.coords.heading
        });
        
        // Update location and GPS status
        setLocation(realLocation);
        setIsRealGPS(true);
        setGpsAccuracy(pos.coords.accuracy);
        setLastGpsUpdate(Date.now());
        
        // Calculate real trip progress based on GPS location
        const progress = calculateTripProgress(realLocation.lat, realLocation.lng);
        setRealTripProgress(progress);
        console.log(`📊 [TRIP PROGRESS] Real progress: ${progress.toFixed(1)}% (${distanceTraveled.toFixed(1)}km / ${totalRouteDistance.toFixed(1)}km)`);
        
        // Determine GPS connection quality based on accuracy
        if (pos.coords.accuracy <= 10) {
          setGpsConnectionStatus('connected');
        } else if (pos.coords.accuracy <= 50) {
          setGpsConnectionStatus('weak');
        } else {
          setGpsConnectionStatus('weak');
        }
        
        // Send real GPS to manager dashboard with additional metadata
        emit(events.LOCATION_UPDATE, {
          vehicleNumber: trip.vehicleNumber,
          location: realLocation,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed || 0,
          heading: pos.coords.heading || 0,
          timestamp: Date.now(),
          tripProgress: progress,
          distanceTraveled: distanceTraveled,
          totalDistance: totalRouteDistance
        });
      },
      (error) => {
        console.error('❌ [CONTINUOUS GPS] Watch error:', error);
        setGpsConnectionStatus('lost');
        
        // Try to continue tracking even if one update fails
        toast({
          title: "GPS Warning",
          description: "GPS signal weak, trying to reconnect...",
          variant: "destructive",
          duration: 3000
        });
      },
      { 
        enableHighAccuracy: true,
        timeout: 8000, // Reduced timeout for faster updates
        maximumAge: 2000 // Reduced cache time for more frequent updates (2 seconds)
      }
    );

    return () => {
      if (watchId) {
        console.log('🛑 [CONTINUOUS GPS] Stopping GPS tracking');
        navigator.geolocation.clearWatch(watchId);
        setGpsConnectionStatus('connecting');
      }
    };
  }, [trip?.vehicleNumber, emit, events, toast, distanceTraveled, totalRouteDistance]);

  // Monitor GPS connection health
  useEffect(() => {
    if (!lastGpsUpdate) return;

    const checkGpsHealth = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastGpsUpdate;
      
      if (timeSinceLastUpdate > 15000) { // No update for 15 seconds
        setGpsConnectionStatus('lost');
        console.warn('⚠️ [GPS MONITOR] No GPS updates for 15 seconds');
      } else if (timeSinceLastUpdate > 8000) { // No update for 8 seconds
        setGpsConnectionStatus('weak');
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(checkGpsHealth);
  }, [lastGpsUpdate]);

  // Fetch nearby facilities periodically based on GPS location
  useEffect(() => {
    if (!location || !trip?.vehicleNumber) return;

    // Fetch facilities immediately when location changes
    fetchNearbyFacilities(location.lat, location.lng);

    // Set up periodic facility updates every 30 seconds
    const facilitiesInterval = setInterval(() => {
      if (location) {
        console.log('🔄 [FACILITIES] Periodic update of nearby facilities...');
        fetchNearbyFacilities(location.lat, location.lng);
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(facilitiesInterval);
  }, [location?.lat, location?.lng, trip?.vehicleNumber]); // Re-run when location changes significantly

  // Record a fixed-length emergency clip and return as blob.
  const recordEmergencyClip = (durationMs: number = 10000): Promise<Blob | null> => {
    return new Promise((resolve) => {
      console.log('🎥 [VIDEO] Starting emergency video recording...');
      
      // Check if webcam is ready and has stream
      const webcam = webcamRef.current;
      if (!webcam) {
        console.error('❌ [VIDEO] Webcam ref not available');
        setCameraError('Camera not initialized');
        resolve(null);
        return;
      }

      // Get the stream from webcam
      let stream = webcam.stream;
      
      if (!stream || !stream.active) {
        console.error('❌ [VIDEO] Camera stream not available or inactive');
        setCameraError('Camera stream not ready');
        
        // Try to get stream manually as fallback
        navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }, 
          audio: true 
        })
          .then(newStream => {
            console.log('✅ [VIDEO] Got fallback camera stream');
            setCameraError(null);
            startRecording(newStream, durationMs, resolve);
          })
          .catch(err => {
            console.error('❌ [VIDEO] Failed to get fallback camera stream:', err);
            setCameraError('Camera access failed');
            resolve(null);
          });
        return;
      }

      // Validate stream tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      if (videoTracks.length === 0) {
        console.error('❌ [VIDEO] No video tracks available');
        setCameraError('No video source');
        resolve(null);
        return;
      }

      if (videoTracks[0].readyState !== 'live') {
        console.error('❌ [VIDEO] Video track not live:', videoTracks[0].readyState);
        setCameraError('Video source not ready');
        resolve(null);
        return;
      }

      console.log('✅ [VIDEO] Camera stream validated, starting recording');
      setCameraError(null);
      startRecording(stream, durationMs, resolve);
    });
  };

  const startRecording = (stream: MediaStream, durationMs: number, resolve: (blob: Blob | null) => void) => {
    console.log('🎬 [VIDEO] Initializing MediaRecorder...');
    const chunks: Blob[] = [];
    
    // Enhanced codec support detection
    const supportedTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus", 
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4"
    ];
    
    let selectedType = "video/webm"; // fallback
    for (const type of supportedTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        console.log('✅ [VIDEO] Using codec:', type);
        break;
      }
    }

    const options: MediaRecorderOptions = {
      mimeType: selectedType,
      videoBitsPerSecond: 2500000, // 2.5 Mbps for good quality
      audioBitsPerSecond: 128000   // 128 kbps for audio
    };

    try {
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", ({ data }: BlobEvent) => {
        if (data.size > 0) {
          console.log('📦 [VIDEO] Video chunk received:', data.size, 'bytes');
          chunks.push(data);
        }
      });

      recorder.addEventListener("stop", () => {
        console.log('🛑 [VIDEO] Recording stopped, total chunks:', chunks.length);
        const blob = chunks.length ? new Blob(chunks, { type: selectedType }) : null;
        if (blob) {
          console.log('✅ [VIDEO] Final video blob created:', blob.size, 'bytes');
        } else {
          console.error('❌ [VIDEO] No video data recorded');
        }
        resolve(blob);
      });

      recorder.addEventListener("error", (event) => {
        console.error('❌ [VIDEO] MediaRecorder error:', event);
        setCameraError('Recording failed');
        resolve(null);
      });

      recorder.addEventListener("start", () => {
        console.log('▶️ [VIDEO] Recording started successfully');
        setCameraError(null);
      });

      // Start recording with smaller time slices for better reliability
      recorder.start(500); // 500ms chunks for smoother recording
      console.log('🎥 [VIDEO] Recording started for', durationMs, 'ms');
      
      // Stop recording after specified duration
      setTimeout(() => {
        if (recorder.state === "recording") {
          console.log('⏰ [VIDEO] Stopping recorder after', durationMs, 'ms');
          recorder.stop();
        } else {
          console.warn('⚠️ [VIDEO] Recorder not in recording state:', recorder.state);
          resolve(null);
        }
      }, durationMs);
      
    } catch (error) {
      console.error('❌ [VIDEO] Failed to create MediaRecorder:', error);
      setCameraError('Recording initialization failed');
      resolve(null);
    }
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

  // Initialize camera early and validate stream
  useEffect(() => {
    console.log('📷 [CAMERA] Initializing camera for emergency recording...');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('❌ [CAMERA] MediaDevices not supported');
      setCameraError('Camera not supported');
      return;
    }

    // Request camera permissions and validate stream
    const initializeCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }, 
          audio: true 
        });
        
        console.log('✅ [CAMERA] Camera stream obtained successfully');
        console.log('📊 [CAMERA] Video tracks:', stream.getVideoTracks().length);
        console.log('🎵 [CAMERA] Audio tracks:', stream.getAudioTracks().length);
        
        // Validate tracks
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
          setCameraReady(true);
          setCameraError(null);
          console.log('✅ [CAMERA] Camera ready for emergency recording');
        } else {
          setCameraError('Video track not ready');
          console.error('❌ [CAMERA] Video track not live');
        }
        
        // Don't stop the stream - let ReactWebcam manage it
        
      } catch (error: any) {
        console.error('❌ [CAMERA] Failed to initialize camera:', error);
        
        let errorMessage = "Camera initialization failed";
        if (error.name === 'NotAllowedError') {
          errorMessage = "Camera permission denied";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "No camera found";
        } else if (error.name === 'NotReadableError') {
          errorMessage = "Camera in use by another app";
        }
        
        setCameraError(errorMessage);
        setCameraReady(false);
      }
    };

    // Initialize camera after a short delay to ensure component is mounted
    const timer = setTimeout(initializeCamera, 1000);
    
    return () => clearTimeout(timer);
  }, []); // Run once on mount

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
  
  // Use real GPS-based progress instead of simulation
  const tripProgressPct = Math.max(0, Math.min(100, Math.round(realTripProgress)));
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
    
    // Check camera readiness before proceeding
    if (!cameraReady) {
      toast({ 
        title: "Camera not ready", 
        description: cameraError || "Please wait for camera to initialize.", 
        variant: "destructive" 
      });
      return;
    }
    
    // Prevent multiple rapid clicks
    if (isProcessingEmergency || isEmergencyActive) {
      toast({ title: "Emergency in progress", description: "Please wait for current emergency to process.", variant: "destructive" });
      return;
    }

    console.log('🚨 Emergency button clicked - starting IMMEDIATE video recording');
    
    // Start emergency workflow with immediate video recording
    setIsProcessingEmergency(true);
    setIsEmergencyActive(true);
    setStatusMessage("🚨 Recording emergency video...");

    const clickedAt = Date.now();
    const runEmergencyFlow = async () => {
      try {
        // Start video recording immediately
        console.log('🎥 [EMERGENCY] Starting immediate video recording...');
        const videoPromise = recordEmergencyClip(10000);
        
        // Collect nearby facilities in parallel
        const facilitiesPromise = fetch(
          `/api/emergency/nearby-facilities?latitude=${activeLocation.lat}&longitude=${activeLocation.lng}`
        )
          .then(async (r) => (r.ok ? r.json() : []))
          .catch(() => []);

        // Wait for both video and facilities
        const [videoBlob, facilities] = await Promise.all([videoPromise, facilitiesPromise]);
        
        if (Array.isArray(facilities)) setDriverNearbyFacilities(facilities);

        // Ensure minimum 10 seconds have passed for complete recording
        const elapsed = Date.now() - clickedAt;
        const waitMs = Math.max(0, 10500 - elapsed); // 10.5 seconds to ensure recording completion
        if (waitMs > 0) {
          setStatusMessage("🚨 Finalizing emergency data...");
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
        
        if (videoBlob && videoBlob.size > 0) {
          formData.append("video", videoBlob, "emergency-capture.webm");
          console.log('✅ [EMERGENCY] Video attached to alert:', videoBlob.size, 'bytes');
        } else {
          console.warn('⚠️ [EMERGENCY] No video recorded, sending alert without video');
        }

        await triggerEmergency(formData);

        console.log('✅ Emergency alert sent to manager with video');
        setStatusMessage("🚨 EMERGENCY SENT TO MANAGER - Awaiting decision");
        toast({
          title: "🚨 Emergency Alert Sent!",
          description: videoBlob ? "Video and location shared with manager." : "Location shared with manager (video failed).",
          duration: 4000
        });
      } catch (error: any) {
        console.error('❌ Emergency alert failed:', error);
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

    runEmergencyFlow();
  };

  // Manual GPS refresh function
  const refreshGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS Error", description: "Geolocation not supported", variant: "destructive" });
      return;
    }

    console.log('🔄 [MANUAL GPS] User requested GPS refresh...');
    setIsGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const realLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log('✅ [MANUAL GPS] Fresh real location:', realLocation);
        
        setLocation(realLocation);
        setIsRealGPS(true);
        setIsGettingLocation(false);
        
        toast({ 
          title: "📍 Real GPS Updated", 
          description: `Your actual location: ${realLocation.lat.toFixed(4)}, ${realLocation.lng.toFixed(4)}`,
          duration: 3000 
        });
        
        if (trip?.vehicleNumber) {
          console.log('📡 [MANUAL GPS] Sending refreshed location to manager:', {
            vehicleNumber: trip.vehicleNumber,
            location: realLocation
          });
          emit(events.LOCATION_UPDATE, {
            vehicleNumber: trip.vehicleNumber,
            location: realLocation
          });
        }
      },
      (error) => {
        setIsGettingLocation(false);
        console.error('❌ [MANUAL GPS] Refresh failed:', error);
        
        let errorMessage = "Could not refresh GPS location.";
        if (error.code === 1) {
          errorMessage = "GPS permission denied. Please allow location access.";
        } else if (error.code === 2) {
          errorMessage = "GPS position unavailable. Check your device settings.";
        } else if (error.code === 3) {
          errorMessage = "GPS request timed out. Please try again.";
        }
        
        toast({ 
          title: "GPS Refresh Failed", 
          description: errorMessage,
          variant: "destructive",
          duration: 4000
        });
      },
      { 
        enableHighAccuracy: true,
        timeout: 15000,
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
              <Badge variant="outline" className={`border-slate-500 font-mono text-xs transition-colors ${
                gpsConnectionStatus === 'connected' ? 'text-green-400 border-green-500' :
                gpsConnectionStatus === 'weak' ? 'text-yellow-400 border-yellow-500' :
                gpsConnectionStatus === 'lost' ? 'text-red-400 border-red-500' :
                'text-slate-300'
              }`}>
                <Navigation className={`w-3 h-3 mr-1 ${
                  gpsConnectionStatus === 'connected' ? 'text-green-400' :
                  gpsConnectionStatus === 'weak' ? 'text-yellow-400' :
                  gpsConnectionStatus === 'lost' ? 'text-red-400 animate-pulse' :
                  'text-slate-400'
                }`} />
                <span className="hidden sm:inline">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                <span className="sm:hidden">{location.lat.toFixed(2)}, {location.lng.toFixed(2)}</span>
                <span className={`ml-2 text-xs ${
                  gpsConnectionStatus === 'connected' ? 'text-green-400' :
                  gpsConnectionStatus === 'weak' ? 'text-yellow-400' :
                  gpsConnectionStatus === 'lost' ? 'text-red-400' :
                  'text-blue-400'
                }`}>
                  {gpsConnectionStatus === 'connected' ? 'LIVE' :
                   gpsConnectionStatus === 'weak' ? 'WEAK' :
                   gpsConnectionStatus === 'lost' ? 'LOST' :
                   'CONN'}
                </span>
                {gpsAccuracy && (
                  <span className="ml-1 text-xs text-slate-500">
                    ±{Math.round(gpsAccuracy)}m
                  </span>
                )}
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
                      {/* Real GPS-based distance info */}
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>Traveled: {distanceTraveled.toFixed(1)} km</span>
                        <span>Total: {totalRouteDistance.toFixed(1)} km</span>
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
            {/* Camera Preview - Enhanced with status indicators */}
            <div className="relative rounded-xl overflow-hidden bg-black h-[200px] md:h-[300px] border border-slate-700 shadow-2xl">
              <ReactWebcam
                audio={true}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                muted={true}
                videoConstraints={{
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'user'
                }}
                onUserMedia={() => {
                  console.log('✅ [CAMERA] ReactWebcam stream ready');
                  setCameraReady(true);
                  setCameraError(null);
                }}
                onUserMediaError={(error) => {
                  console.error('❌ [CAMERA] ReactWebcam error:', error);
                  setCameraReady(false);
                  setCameraError('Camera failed to start');
                }}
              />
              <div className="absolute top-2 left-2 md:top-3 md:left-3 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  cameraReady ? 'bg-green-500 animate-pulse' : 
                  cameraError ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                }`} />
                {cameraReady ? 'REC READY' : cameraError ? 'CAM ERROR' : 'LOADING...'}
              </div>
              {cameraError && (
                <div className="absolute bottom-2 left-2 right-2 bg-red-900/80 backdrop-blur px-2 py-1 rounded text-xs text-red-200">
                  {cameraError}
                </div>
              )}
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
