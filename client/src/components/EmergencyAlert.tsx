import { useEffect, useRef, useState } from "react";
import { AlertTriangle, MapPin, Video, CheckCircle, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Emergency, type Vehicle, type Driver } from "@shared/schema";
import { useAcknowledgeEmergency } from "@/hooks/use-emergency";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";

interface EmergencyAlertProps {
  emergency: (Emergency & { driver: Driver; vehicle: Vehicle }) | null;
  onClose: () => void;
  onRealEmergency?: (emergencyId: number) => void;
  onFalseAlarm?: (emergencyId: number) => void;
}

interface AlarmState {
  interval?: NodeJS.Timeout;
  audioContext?: AudioContext;
}

export function EmergencyAlert({ emergency, onClose, onRealEmergency, onFalseAlarm }: EmergencyAlertProps) {
  const alarmRef = useRef<AlarmState>({});
  const { mutate: acknowledge, isPending } = useAcknowledgeEmergency();
  const [isOpen, setIsOpen] = useState(false);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [decisionCountdown, setDecisionCountdown] = useState(0);
  const [showVideoSection, setShowVideoSection] = useState(true);
  const { subscribe, events } = useSocket();
  const { toast } = useToast();

  useEffect(() => {
    if (emergency && emergency.status === "ACTIVE" && !isOpen) {
      setIsOpen(true);
      setIsAlarmPlaying(true);
      // Play alarm sound - create a beeping alarm using Web Audio API
      const playAlarm = () => {
        if (!alarmRef.current.interval) {
          // Create a simple beeping alarm using Web Audio API
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          
          const beep = () => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
          };
          
          beep();
          const beepInterval = setInterval(beep, 500);
          
          // Store interval ID and context for cleanup
          alarmRef.current.interval = beepInterval;
          alarmRef.current.audioContext = audioContext;
        }
      };
      
      playAlarm();
    } else if (!emergency || emergency.status === "ACKNOWLEDGED") {
      // Close dialog and stop alarm
      setIsOpen(false);
      setIsAlarmPlaying(false);
      // Stop alarm
      if (alarmRef.current.interval) {
        clearInterval(alarmRef.current.interval);
        alarmRef.current.interval = undefined;
      }
      if (alarmRef.current.audioContext) {
        alarmRef.current.audioContext.close().catch(() => {});
        alarmRef.current.audioContext = undefined;
      }
      if (!emergency) {
        onClose();
      }
    }

    return () => {
      if (alarmRef.current.interval) {
        clearInterval(alarmRef.current.interval);
        alarmRef.current.interval = undefined;
      }
      if (alarmRef.current.audioContext) {
        alarmRef.current.audioContext.close().catch(() => {});
        alarmRef.current.audioContext = undefined;
      }
    };
  }, [emergency?.emergencyId, emergency?.status, isOpen, onClose]); // More specific dependencies

  // Deterministic decision window:
  // SOS pipeline sends manager alert at ~11s.
  // Manager decision is enabled at ~23s => 12s after popup opens.
  useEffect(() => {
    if (!emergency || emergency.status !== "ACTIVE" || !isOpen) {
      setDecisionCountdown(0);
      return;
    }

    const unlockAt = Date.now() + 12000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setDecisionCountdown(remaining);
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [emergency?.emergencyId, emergency?.status, isOpen]);

  useEffect(() => {
    const unsubscribe = subscribe(events.STOP_ALARM, (data) => {
      if (!data.emergencyId || data.emergencyId === emergency?.emergencyId) {
        setIsAlarmPlaying(false);
        setIsOpen(false);
        if (alarmRef.current.interval) {
          clearInterval(alarmRef.current.interval);
          alarmRef.current.interval = undefined;
        }
        if (alarmRef.current.audioContext) {
          alarmRef.current.audioContext.close().catch(() => {});
          alarmRef.current.audioContext = undefined;
        }
        // Close the dialog
        onClose();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [subscribe, events, emergency, onClose]);

  // Prevent multiple alerts for same emergency
  useEffect(() => {
    if (emergency && emergency.status === "ACKNOWLEDGED") {
      setIsOpen(false);
      setIsAlarmPlaying(false);
      onClose();
    }
  }, [emergency?.status, onClose]);

  const handleRealEmergency = async () => {
    if (!emergency || isPending) return;
    
    // Stop alarm immediately
    setIsAlarmPlaying(false);
    if (alarmRef.current.interval) {
      clearInterval(alarmRef.current.interval);
      alarmRef.current.interval = undefined;
    }
    if (alarmRef.current.audioContext) {
      alarmRef.current.audioContext.close().catch(() => {});
      alarmRef.current.audioContext = undefined;
    }
    
    // Close dialog immediately
    setIsOpen(false);
    onClose();
    
    // Real emergency flow: stop trip + notify police/hospital in backend.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/emergency/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: emergency.emergencyId,
          nearbyFacilities: (emergency as any).nearbyFacilities || []
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to approve emergency");
      }

      toast({
        title: "Real Emergency Confirmed",
        description: "Trip stopped. Police and Hospital notified.",
        variant: "default"
      });
      onRealEmergency?.(emergency.emergencyId);
      setIsOpen(false);
      onClose();
    } catch (error) {
      console.error("Failed to process real emergency:", error);
      setIsAlarmPlaying(true);
      toast({
        title: "Approval Failed",
        description: "Could not process real emergency. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleFalseAlarm = () => {
    if (!emergency || isPending) return;
    
    // Stop alarm immediately
    setIsAlarmPlaying(false);
    if (alarmRef.current.interval) {
      clearInterval(alarmRef.current.interval);
      alarmRef.current.interval = undefined;
    }
    if (alarmRef.current.audioContext) {
      alarmRef.current.audioContext.close().catch(() => {});
      alarmRef.current.audioContext = undefined;
    }
    
    // Acknowledge as false alarm (no SMS sent)
    acknowledge(emergency.emergencyId, {
      onSuccess: () => {
        toast({
          title: "False Alarm Acknowledged",
          description: "Trip will continue. No alerts sent to authorities.",
          variant: "default"
        });
        onFalseAlarm?.(emergency.emergencyId);
        setIsOpen(false);
        onClose();
      },
      onError: () => {
        setIsAlarmPlaying(true);
      }
    });
  };

  const handleStopAlarmOnly = () => {
    setIsAlarmPlaying(false);
    if (alarmRef.current.interval) {
      clearInterval(alarmRef.current.interval);
      alarmRef.current.interval = undefined;
    }
    if (alarmRef.current.audioContext) {
      alarmRef.current.audioContext.close().catch(() => {});
      alarmRef.current.audioContext = undefined;
    }
  };

  if (!emergency) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`sm:max-w-2xl border-4 border-red-500 shadow-2xl shadow-red-500/50 bg-white ${emergency.status === "ACTIVE" ? "emergency-pulse-twice" : ""}`}>
        <DialogHeader>
          <div className="flex items-center gap-4 text-red-600 mb-4">
            <AlertTriangle className="w-12 h-12 animate-bounce" />
            <div>
              <DialogTitle className="text-3xl font-black uppercase tracking-wider">
                Emergency Alert!
              </DialogTitle>
              <DialogDescription className="text-lg font-medium text-red-500">
                Immediate attention required for Vehicle {emergency.vehicle.vehicleNumber}
              </DialogDescription>
              <div className="mt-2 text-sm font-semibold">
                {isAlarmPlaying ? "🔊 Alarm Active" : "🔇 Alarm Muted"}
              </div>
              {decisionCountdown > 0 && (
                <div className="mt-1 text-sm font-semibold text-amber-700">
                  Decision enabled in {decisionCountdown}s
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Location
              </h4>
              {(emergency as any).locationName && (
                <p className="text-base font-semibold text-slate-800 mb-2">
                  {(emergency as any).locationName}
                </p>
              )}
              <p className="text-sm text-slate-600 font-mono">
                Lat: {parseFloat(String(emergency.latitude)).toFixed(6)}
                <br />
                Lng: {parseFloat(String(emergency.longitude)).toFixed(6)}
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-700 mb-2">Driver Details</h4>
              <p className="text-lg font-semibold">{emergency.driver.name}</p>
              <p className="text-sm text-slate-500">Driver Number: {emergency.driverNumber}</p>
              <p className="text-sm text-slate-500">Phone: {emergency.driver.phoneNumber}</p>
              <p className="text-sm text-slate-500">License: {emergency.driver.licenseNumber}</p>
            </div>
            
            {(emergency as any).nearbyFacilities && (emergency as any).nearbyFacilities.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-700 mb-3">🏥 Nearby Emergency Resources</h4>
                <div className="space-y-3">
                  {(() => {
                    const facilities = (emergency as any).nearbyFacilities;
                    const categorized = {
                      medical: facilities.filter((f: any) => f.type === 'hospital' || f.type === 'clinic' || f.type === 'pharmacy'),
                      police: facilities.filter((f: any) => f.type === 'police' || f.type === 'fire_station'),
                      fuel: facilities.filter((f: any) => f.type === 'fuel_station'),
                      service: facilities.filter((f: any) => f.type === 'service_center')
                    };

                    return (
                      <>
                        {categorized.medical.length > 0 && (
                          <div>
                            <p className="font-semibold text-green-700 text-sm mb-1">🏥 Medical Facilities</p>
                            {categorized.medical.slice(0, 3).map((facility: any, idx: number) => (
                              <div key={idx} className="text-xs ml-4 mb-1">
                                <span className="font-medium">{facility.name}</span>
                                <span className="text-slate-500 ml-2">({facility.distance}km)</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {categorized.police.length > 0 && (
                          <div>
                            <p className="font-semibold text-blue-700 text-sm mb-1">🚓 Police & Emergency</p>
                            {categorized.police.slice(0, 3).map((facility: any, idx: number) => (
                              <div key={idx} className="text-xs ml-4 mb-1">
                                <span className="font-medium">{facility.name}</span>
                                <span className="text-slate-500 ml-2">({facility.distance}km)</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {categorized.fuel.length > 0 && (
                          <div>
                            <p className="font-semibold text-orange-700 text-sm mb-1">⛽ Fuel Centers</p>
                            {categorized.fuel.slice(0, 2).map((facility: any, idx: number) => (
                              <div key={idx} className="text-xs ml-4 mb-1">
                                <span className="font-medium">{facility.name}</span>
                                <span className="text-slate-500 ml-2">({facility.distance}km)</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {categorized.service.length > 0 && (
                          <div>
                            <p className="font-semibold text-purple-700 text-sm mb-1">🔧 Service Centers</p>
                            {categorized.service.slice(0, 2).map((facility: any, idx: number) => (
                              <div key={idx} className="text-xs ml-4 mb-1">
                                <span className="font-medium">{facility.name}</span>
                                <span className="text-slate-500 ml-2">({facility.distance}km)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowVideoSection((prev) => !prev)}
            >
              {showVideoSection ? "Hide Video Section" : "Show Video Section"}
            </Button>
            {showVideoSection && (
              <div className="bg-black rounded-xl overflow-hidden aspect-video relative flex items-center justify-center group">
                {emergency.videoUrl ? (
              <>
                <video 
                  src={emergency.videoUrl.startsWith('http') ? emergency.videoUrl : `${window.location.origin}${emergency.videoUrl}`}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    console.error("❌ [VIDEO DISPLAY] Video playback error:", e);
                    console.log("🔍 [VIDEO DEBUG] Video URL:", emergency.videoUrl);
                    console.log("🔍 [VIDEO DEBUG] Full URL:", emergency.videoUrl?.startsWith('http') ? emergency.videoUrl : `${window.location.origin}${emergency.videoUrl}`);
                    console.log("🔍 [VIDEO DEBUG] Emergency object:", emergency);
                  }}
                  onLoadStart={() => {
                    console.log("📺 [VIDEO DISPLAY] Video loading started");
                    console.log("🔍 [VIDEO DEBUG] Loading URL:", emergency.videoUrl?.startsWith('http') ? emergency.videoUrl : `${window.location.origin}${emergency.videoUrl}`);
                  }}
                  onLoadedData={() => {
                    console.log("✅ [VIDEO DISPLAY] Video data loaded successfully");
                  }}
                  onCanPlay={() => {
                    console.log("▶️ [VIDEO DISPLAY] Video can play");
                  }}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    console.log("📊 [VIDEO DISPLAY] Video metadata loaded:", {
                      duration: video.duration,
                      videoWidth: video.videoWidth,
                      videoHeight: video.videoHeight,
                      readyState: video.readyState
                    });
                  }}
                >
                  <source 
                    src={emergency.videoUrl.startsWith('http') ? emergency.videoUrl : `${window.location.origin}${emergency.videoUrl}`}
                    type="video/webm"
                  />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  <Video className="w-3 h-3 inline mr-1" />
                  Emergency Recording
                </div>
              </>
            ) : (
              <div className="text-white text-center">
                <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-red-500 animate-spin mx-auto mb-4" />
                <p className="text-sm font-semibold">Recording 30s... collecting evidence</p>
                <div className="w-40 h-2 rounded bg-white/20 mx-auto mt-3">
                  <div className="h-2 w-2/3 bg-red-500 rounded animate-pulse" />
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {(() => { console.log("⚠️ [VIDEO DEBUG] No video URL available:", { emergency, videoUrl: emergency.videoUrl }); return null; })()}
                  Debug: No video URL in emergency data
                </div>
              </div>
            )}
            
            {emergency.status === "ACTIVE" && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded animate-pulse">
                LIVE
              </div>
            )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-4 flex-col sm:flex-row">
          <Button 
            variant="outline" 
            onClick={handleStopAlarmOnly}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full sm:w-auto"
            disabled={!isAlarmPlaying}
          >
            {isAlarmPlaying ? "🔇 Mute Alarm" : "🔇 Alarm Muted"}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              size="lg" 
              variant="outline"
              className="flex-1 sm:flex-none text-base font-bold border-yellow-500 text-yellow-700 hover:bg-yellow-50"
              onClick={handleFalseAlarm}
              disabled={isPending || emergency.status === "ACKNOWLEDGED" || decisionCountdown > 0}
            >
              {isPending ? "Processing..." : (
                <>
                  <AlertOctagon className="w-5 h-5 mr-2" />
                  False Alarm
                </>
              )}
            </Button>
            <Button 
              size="lg" 
              variant="destructive" 
              className="flex-1 sm:flex-none text-base font-bold shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all"
              onClick={handleRealEmergency}
              disabled={isPending || emergency.status === "ACKNOWLEDGED" || decisionCountdown > 0}
            >
              {isPending ? "Processing..." : emergency.status === "ACKNOWLEDGED" ? (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Confirmed
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Real Emergency
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
