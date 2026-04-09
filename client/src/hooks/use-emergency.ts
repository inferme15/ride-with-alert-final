import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useEmergencies() {
  return useQuery({
    queryKey: ["/api/emergencies"], // Use direct path instead of api.emergency.list.path
    queryFn: async () => {
      console.log('🔍 [EMERGENCY HOOK] Fetching emergencies from /api/emergencies');
      const res = await fetch("/api/emergencies", { credentials: "include" });
      console.log('📡 [EMERGENCY HOOK] Response:', res.status, res.statusText);
      if (!res.ok) {
        console.error('❌ [EMERGENCY HOOK] Failed to fetch emergencies:', res.status);
        throw new Error("Failed to fetch emergencies");
      }
      const data = await res.json();
      console.log('✅ [EMERGENCY HOOK] Emergencies loaded:', data.length);
      return data;
    },
    refetchInterval: 60000, // Reduced to 60s - we have real-time socket updates for emergencies
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
  });
}

export function useTriggerEmergency() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (formData: FormData) => {
      // ENHANCED DEBUG: Log FormData contents before sending
      console.log('🚀 [EMERGENCY HOOK] Sending emergency request to /api/emergency/trigger');
      console.log('📋 [EMERGENCY HOOK] FormData contents:');
      formData.forEach((value, key) => {
        if (value instanceof File) {
          console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      });
      
      try {
        // Note: Trigger uses multipart/form-data for potential video file
        const res = await fetch("/api/emergency/trigger", {
          method: "POST",
          body: formData, // FormData automatically sets correct Content-Type boundary
          credentials: "include",
        });
        
        console.log('📡 [EMERGENCY HOOK] Response received:', {
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
          url: res.url,
          headers: Object.fromEntries(res.headers.entries())
        });
        
        if (!res.ok) {
          const text = await res.text();
          console.error('❌ [EMERGENCY HOOK] Request failed:', text);
          throw new Error(text || "Failed to trigger emergency");
        }
        
        // Trigger endpoint may return 201 (new emergency) or 200 (video-only update).
        const responseData = await res.json();
        console.log('✅ [EMERGENCY HOOK] Success response:', responseData);
        return responseData;
        
      } catch (error: any) {
        console.error('❌ [EMERGENCY HOOK] Network error:', error);
        console.error('❌ [EMERGENCY HOOK] Error details:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack
        });
        throw error;
      }
    },
    onSuccess: () => {
      toast({ 
        title: "EMERGENCY ALERT SENT", 
        description: "Help has been requested. Stay calm.", 
        variant: "destructive",
        duration: 10000 
      });
    },
    onError: (error) => {
      console.error('❌ [EMERGENCY HOOK] Mutation error:', error);
      toast({ 
        title: "ALERT FAILED", 
        description: `Could not send emergency signal: ${error.message}. Please call emergency services directly.`, 
        variant: "destructive",
        duration: Infinity
      });
    }
  });
}

export function useAcknowledgeEmergency() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (emergencyId: number) => {
      console.log('🔍 [ACK EMERGENCY] Acknowledging emergency:', emergencyId);
      const res = await fetch("/api/emergency/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emergencyId }),
        credentials: "include",
      });
      console.log('📡 [ACK EMERGENCY] Response:', res.status, res.statusText);
      if (!res.ok) {
        console.error('❌ [ACK EMERGENCY] Failed:', res.status);
        throw new Error("Failed to acknowledge emergency");
      }
      const data = await res.json();
      console.log('✅ [ACK EMERGENCY] Success:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergencies"] });
      toast({ title: "Acknowledged", description: "Emergency status updated." });
    },
  });
}

export function useApproveRealEmergency() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (emergencyId: number) => {
      console.log('🚨 [REAL EMERGENCY] Approving real emergency:', emergencyId);
      // Use the consolidated approve endpoint because it:
      // - stops active trip
      // - emits stop/ack socket events
      // - sends authority emails
      const res = await fetch("/api/emergency/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emergencyId }),
        credentials: "include",
      });
      console.log('📡 [REAL EMERGENCY] Response:', res.status, res.statusText);
      if (!res.ok) {
        console.error('❌ [REAL EMERGENCY] Failed:', res.status);
        throw new Error("Failed to approve real emergency");
      }
      const data = await res.json();
      console.log('✅ [REAL EMERGENCY] Success - Emails sent to authorities:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergencies"] });
      toast({ 
        title: "Real Emergency Confirmed", 
        description: "Authorities have been notified via email. Emergency services dispatched.",
        variant: "destructive",
        duration: 10000
      });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to Notify Authorities", 
        description: `Could not send emergency alerts: ${error.message}`,
        variant: "destructive",
        duration: 10000
      });
    }
  });
}
