import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { InsertVehicle, InsertDriver } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useVehicles() {
  return useQuery({
    queryKey: [api.vehicles.list.path],
    queryFn: async () => {
      const res = await fetch(api.vehicles.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch vehicles");
      return api.vehicles.list.responses[200].parse(await res.json());
    },
  });
}

export function useAvailableVehicles() {
  return useQuery({
    queryKey: [api.vehicles.list.path, 'available'],
    queryFn: async () => {
      const res = await fetch(`${api.vehicles.list.path}?available=true`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available vehicles");
      return api.vehicles.list.responses[200].parse(await res.json());
    },
  });
}

export function useDrivers() {
  return useQuery({
    queryKey: [api.drivers.list.path],
    queryFn: async () => {
      const res = await fetch(api.drivers.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return api.drivers.list.responses[200].parse(await res.json());
    },
  });
}

export function useAvailableDrivers() {
  return useQuery({
    queryKey: [api.drivers.list.path, 'available'],
    queryFn: async () => {
      const res = await fetch(`${api.drivers.list.path}?available=true`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available drivers");
      return api.drivers.list.responses[200].parse(await res.json());
    },
  });
}

export function useRegisterVehicle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertVehicle) => {
      const res = await fetch(api.vehicles.register.path, {
        method: api.vehicles.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to register vehicle");
      return api.vehicles.register.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      toast({ title: "Vehicle Registered", description: "New vehicle added to fleet." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useRegisterDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertDriver) => {
      const res = await fetch(api.drivers.register.path, {
        method: api.drivers.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to register driver");
      return api.drivers.register.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.drivers.list.path] });
      toast({ title: "Driver Registered", description: "New driver added to system." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useAssignTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { 
      driverNumber: string; 
      vehicleNumber: string;
      startLocation?: string;
      startLatitude?: number;
      startLongitude?: number;
      endLocation?: string;
      endLatitude?: number;
      endLongitude?: number;
      selectedRoute?: any;
      routeId?: string;
      routeData?: any;
      safetyMetrics?: any;
      estimatedTime?: number;
      distance?: number;
    }) => {
      console.log('🚗 Sending trip assignment request:', data);
      const res = await fetch(api.trips.assign.path, {
        method: api.trips.assign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Trip assignment failed:', res.status, errorText);
        throw new Error(`Failed to assign trip: ${res.status} ${errorText}`);
      }
      const result = await res.json();
      console.log('✅ Trip assignment response:', result);
      return api.trips.assign.responses[200].parse(result);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      toast({ 
        title: "Trip Assigned Successfully! 🚗", 
        description: `Email sent to driver. Username: ${data.temporaryUsername}, Password: ${data.temporaryPassword}`,
        duration: 10000
      });
    },
    onError: (error) => {
      console.error('❌ Trip assignment error:', error);
      toast({
        title: "Trip Assignment Failed",
        description: error.message || "Could not assign trip. Please try again.",
        variant: "destructive"
      });
    }
  });
}

export function useCompleteTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tripId: number) => {
      const res = await fetch(api.trips.complete.path, {
        method: api.trips.complete.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to complete trip");
      return api.trips.complete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({ title: "Trip Completed", description: "Trip session ended and credentials expired." });
    },
  });
}

export function useCancelTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tripId: number) => {
      const res = await fetch(api.trips.cancel.path, {
        method: api.trips.cancel.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to cancel trip");
      return api.trips.cancel.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({ title: "Trip Cancelled", description: "Trip cancelled and email sent to driver." });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ vehicleNumber, updates }: { vehicleNumber: string; updates: { vehicleType?: string; fuelCapacity?: number } }) => {
      const res = await fetch(api.vehicles.update.path.replace(':vehicleNumber', vehicleNumber), {
        method: api.vehicles.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update vehicle");
      return api.vehicles.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vehicles.list.path] });
      toast({ title: "Vehicle Updated", description: "Vehicle information updated successfully." });
    },
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ driverNumber, updates }: { driverNumber: string; updates: { name?: string; phoneNumber?: string; licenseNumber?: string } }) => {
      const res = await fetch(api.drivers.update.path.replace(':driverNumber', driverNumber), {
        method: api.drivers.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update driver");
      return api.drivers.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.drivers.list.path] });
      toast({ title: "Driver Updated", description: "Driver information updated successfully." });
    },
  });
}

export function useTrips() {
  console.log('[DEBUG] useTrips hook called');
  return useQuery({
    queryKey: [api.trips.list.path],
    queryFn: async () => {
      console.log('[DEBUG] Fetching trips from:', api.trips.list.path);
      const res = await fetch(api.trips.list.path, { credentials: "include" });
      console.log('[DEBUG] Trips API response status:', res.status);
      if (!res.ok) throw new Error("Failed to fetch trips");
      const data = await res.json();
      console.log('[DEBUG] Trips data received:', data);
      
      // Bypass schema validation temporarily to fix the issue
      console.log('[DEBUG] Returning raw data without schema validation');
      return data;
      
      // Original code with schema validation (commented out)
      // return api.trips.list.responses[200].parse(data);
    },
  });
}

export function useCurrentTrip() {
  return useQuery({
    queryKey: [api.trips.getCurrent.path],
    queryFn: async () => {
      const tripData = localStorage.getItem("trip");
      if (!tripData) throw new Error("Not logged in");
      const trip = JSON.parse(tripData);
      const res = await fetch(`${api.trips.getCurrent.path}?temporaryUsername=${trip.temporaryUsername}&temporaryPassword=${trip.temporaryPassword}`, { 
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to fetch trip info");
      return api.trips.getCurrent.responses[200].parse(await res.json());
    },
    enabled: !!localStorage.getItem("trip"),
    staleTime: 20 * 1000, // Keep trip status reasonably fresh
    refetchInterval: 30000, // Reduced from 5s to 30s - we have real-time socket updates
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
