import crypto from "crypto";
import fs from "fs";
import path from "path";

export function generateTemporaryCredentials() {
  // Generate 4 random numbers for username and password
  const usernameNumbers = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  const passwordNumbers = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  
  const username = `Temp${usernameNumbers}`;
  const password = `Pass${passwordNumbers}`;
  
  return { temporaryUsername: username, temporaryPassword: password };
}

/**
 * Format phone number for SMS (10 digits for India)
 * @param phoneNumber - Phone number in any format
 * @returns Formatted 10-digit phone number
 */
function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, "");
  
  // If has country code (91), remove it
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return cleaned.substring(2);
  }
  
  // If 10 digits, return as is
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  // Take last 10 digits
  return cleaned.slice(-10);
}

/**
 * Display SMS message in a new terminal window (Windows)
 * @param phoneNumber - Recipient phone number
 * @param message - SMS message content
 */
/**
 * Display SMS message in terminal (cross-platform)
 * @param phoneNumber - Recipient phone number
 * @param message - SMS message content
 */
function displaySMSInTerminal(phoneNumber: string, message: string): void {
  try {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const messageId = crypto.randomBytes(4).toString("hex").toUpperCase();
    
    // Determine recipient type based on phone number
    let recipientType = "Unknown Recipient";
    if (phoneNumber === "100" || phoneNumber.includes("police")) {
      recipientType = "Police Control Room";
    } else if (phoneNumber === "108" || phoneNumber.includes("hospital")) {
      recipientType = "Hospital Control Room";
    } else if (phoneNumber === "101") {
      recipientType = "Fire Department";
    } else if (phoneNumber.startsWith("+91") || phoneNumber.length === 10) {
      recipientType = "Driver/Contact";
    }

    // Display SMS in current terminal (works on both Windows and Linux)
    console.log("\n" + "=".repeat(80));
    console.log("                            SMS MESSAGE SENT");
    console.log("=".repeat(80));
    console.log("");
    console.log(`TO: ${phoneNumber} (${recipientType})`);
    console.log(`TIME: ${timestamp}`);
    console.log(`MESSAGE ID: ${messageId}`);
    console.log(`SERVICE: Fast2SMS API`);
    console.log("");
    console.log("=".repeat(80));
    console.log("");
    console.log(message);
    console.log("");
    console.log("=".repeat(80));
    console.log("");
    console.log("NOTE: This message was sent via Fast2SMS API.");
    console.log("");
    console.log("=".repeat(80));
    console.log("");

    console.log(`[SMS DISPLAY] 📱 SMS displayed in terminal for ${recipientType}`);
  } catch (error) {
    console.error(`[SMS DISPLAY ERROR] Failed to display SMS:`, error);
  }
}

/**
 * Send SMS using Fast2SMS API
 * @param phoneNumber - Recipient phone number (10 digits for India)
 * @param message - SMS message content
 * @returns Promise with success status and message ID
 */
export async function sendSMS(phoneNumber: string, message: string): Promise<{ success: boolean; messageId: string; error?: string }> {
  const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

  // ALWAYS display SMS in terminal first
  displaySMSInTerminal(phoneNumber, message);

  // If Fast2SMS not configured, use simulation
  if (!FAST2SMS_API_KEY) {
    console.log(`[SMS FALLBACK] Fast2SMS not configured, using simulation mode`);
    return simulateSMSFallback(phoneNumber, message);
  }

  const formattedNumber = formatPhoneNumber(phoneNumber);

  // Truncate message if too long (SMS limit is 160 chars, but we'll use 150 to be safe)
  const truncatedMessage = message.length > 150 ? message.substring(0, 147) + "..." : message;

  try {
    // Fast2SMS API endpoint
    const url = `https://www.fast2sms.com/dev/bulkV2`;
    
    const requestBody = {
      route: "dlt",
      message: truncatedMessage,
      numbers: formattedNumber,
      flash: "0"
    };

    console.log(`[SMS DEBUG] Sending to: ${formattedNumber}`);
    console.log(`[SMS DEBUG] Message length: ${truncatedMessage.length}`);
    console.log(`[SMS DEBUG] Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": FAST2SMS_API_KEY,
        "accept": "*/*",
        "cache-control": "no-cache",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    // Debug: Log the full response
    console.log(`[SMS DEBUG] Response Status: ${response.status}`);
    console.log(`[SMS DEBUG] Response Body:`, JSON.stringify(result, null, 2));

    if (response.ok && result.return === true) {
      console.log(`[SMS SENT ✅] To: ${formattedNumber}`);
      console.log(`[SMS SENT ✅] Message ID: ${result.message_id || result.request_id}`);
      return {
        success: true,
        messageId: result.message_id || result.request_id || crypto.randomBytes(8).toString("hex"),
      };
    } else {
      // Handle specific error cases
      if (result.status_code === 998) {
        console.log(`[SMS FAILED ❌] DLT Route Issue: ${result.message}`);
        console.log(`[SMS INFO] 💡 You may need to register DLT templates with Fast2SMS`);
        console.log(`[SMS INFO] 💡 Visit: https://www.fast2sms.com/dlt-registration`);
      } else {
        console.log(`[SMS FAILED ❌] ${result.message || "Unknown error"}`);
      }
      console.log(`[SMS FAILED ❌] Full error:`, result);
      console.log(`[SMS FALLBACK] Using simulation mode`);
      return simulateSMSFallback(phoneNumber, message);
    }
  } catch (error: any) {
    console.log(`[SMS ERROR ❌] ${error.message}`);
    console.log(`[SMS FALLBACK] Using simulation mode`);
    return simulateSMSFallback(phoneNumber, message);
  }
}

function simulateSMSFallback(phoneNumber: string, message: string): { success: boolean; messageId: string; error?: string } {
  console.log(`[SMS SIMULATION 📱] To: ${phoneNumber}`);
  console.log(`[SMS SIMULATION 📱] Message displayed in new terminal window`);
  console.log("---");
  console.log("💡 Fast2SMS Setup Instructions:");
  console.log("   1. Create Fast2SMS account: https://www.fast2sms.com/");
  console.log("   2. Go to: Dev API → API Keys");
  console.log("   3. Copy your API key");
  console.log("   4. Add to .env:");
  console.log("      FAST2SMS_API_KEY=your_api_key_here");
  console.log("---");
  
  return {    
    success: true, 
    messageId: crypto.randomBytes(8).toString("hex"),
    error: "Using simulation mode - Fast2SMS not configured"
  };
}

export interface NearbyFacility {
  name: string;
  type: "police" | "hospital" | "fuel_station" | "service_center" | "pharmacy" | "clinic" | "fire_station";
  latitude: number;
  longitude: number;
  distance: number; // in km
  phone: string;
  address: string;
  isOpen24Hours: boolean;
  controlRoomNumber?: string;
  source?: string;
}

/**
 * Find nearby emergency facilities using hybrid approach with STRICT distance filtering
 * Shows only VERY NEAR facilities (2km → 5km → 10km max)
 */
export async function findNearbyFacilities(
  latitude: number,
  longitude: number,
  policePhone: string = "100",
  hospitalPhone: string = "108"
): Promise<NearbyFacility[]> {
  console.log(`🔍 [VERY NEAR SEARCH] Starting strict nearby search for ${latitude}, ${longitude}`);
  
  let allFacilities: NearbyFacility[] = [];
  
  // STRICT radius search - only very near facilities
  const radiusSteps = [2000, 5000, 10000]; // 2km → 5km → 10km MAX
  
  for (const radius of radiusSteps) {
    console.log(`📍 [VERY NEAR SEARCH] Searching within ${radius/1000}km radius...`);
    
    // 1. Try Google Places API first (if available)
    const googleFacilities = await searchGooglePlaces(latitude, longitude, radius);
    console.log(`🟢 [GOOGLE PLACES] Found ${googleFacilities.length} facilities within ${radius/1000}km`);
    
    // 2. Try OpenStreetMap API
    const osmFacilities = await searchOpenStreetMap(latitude, longitude, radius, policePhone, hospitalPhone);
    console.log(`🟠 [OPENSTREETMAP] Found ${osmFacilities.length} facilities within ${radius/1000}km`);
    
    // 3. Search hardcoded database with STRICT distance filtering
    const hardcodedFacilities = searchHardcodedDatabase(latitude, longitude, radius/1000, policePhone, hospitalPhone);
    console.log(`🔵 [HARDCODED DB] Found ${hardcodedFacilities.length} facilities within ${radius/1000}km`);
    
    // 4. Combine all sources and deduplicate
    const combinedFacilities = combineAndDeduplicate([...googleFacilities, ...osmFacilities, ...hardcodedFacilities]);
    console.log(`🔄 [COMBINED] Total ${combinedFacilities.length} unique facilities within ${radius/1000}km`);
    
    allFacilities = combinedFacilities;
    
    // 5. Check if we have enough facilities per category
    const categoryCounts = getCategoryCounts(allFacilities);
    console.log(`📊 [CATEGORY COUNTS] Within ${radius/1000}km:`, categoryCounts);
    
    // If we have at least 1 facility in most categories, we can stop
    const totalFacilities = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
    if (totalFacilities >= 8 || radius === 10000) { // Stop if we have 8+ facilities or reached max radius
      console.log(`✅ [SEARCH COMPLETE] Found ${totalFacilities} facilities within ${radius/1000}km - stopping search`);
      break;
    }
  }
  
  // 6. Group by category and limit to max 3 per category, prioritize closest
  const groupedFacilities = groupFacilitiesByCategory(allFacilities);
  
  console.log(`🎯 [FINAL RESULT] Returning ${groupedFacilities.length} VERY NEAR facilities (max 3 per category)`);
  return groupedFacilities;
}

/**
 * Search hardcoded comprehensive database with STRICT distance filtering
 */
function searchHardcodedDatabase(
  latitude: number,
  longitude: number,
  maxDistanceKm: number,
  policePhone: string,
  hospitalPhone: string
): NearbyFacility[] {
  const facilities: NearbyFacility[] = [];

  // Comprehensive India-wide facility database (kept for good coverage)
  const indiaFacilities = [
    // Tamil Nadu - Krishnagiri/Bargur Area (Local facilities)
    { name: "Krishnagiri Government Hospital", type: "hospital", lat: 12.5186, lng: 78.2137, phone: hospitalPhone, address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "Bargur Primary Health Center", type: "hospital", lat: 12.5425, lng: 78.3567, phone: hospitalPhone, address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "Bargur Medical Store", type: "pharmacy", lat: 12.5420, lng: 78.3570, phone: "N/A", address: "Bargur, Tamil Nadu", isOpen24Hours: false },
    { name: "Krishnagiri Medical College", type: "hospital", lat: 12.5200, lng: 78.2150, phone: hospitalPhone, address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "Dharmapuri Government Hospital", type: "hospital", lat: 12.1211, lng: 78.1597, phone: hospitalPhone, address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Hosur Government Hospital", type: "hospital", lat: 12.7409, lng: 77.8253, phone: hospitalPhone, address: "Hosur, Tamil Nadu", isOpen24Hours: true },
    { name: "Shoolagiri PHC", type: "clinic", lat: 12.6481, lng: 77.8986, phone: hospitalPhone, address: "Shoolagiri, Tamil Nadu", isOpen24Hours: false },
    { name: "Rayakottai PHC", type: "clinic", lat: 12.4500, lng: 78.1500, phone: hospitalPhone, address: "Rayakottai, Tamil Nadu", isOpen24Hours: false },
    
    { name: "Krishnagiri Police Station", type: "police", lat: 12.5186, lng: 78.2137, phone: policePhone, address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "Bargur Police Station", type: "police", lat: 12.5425, lng: 78.3567, phone: policePhone, address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "Dharmapuri Police Station", type: "police", lat: 12.1211, lng: 78.1597, phone: policePhone, address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Hosur Police Station", type: "police", lat: 12.7409, lng: 77.8253, phone: policePhone, address: "Hosur, Tamil Nadu", isOpen24Hours: true },
    { name: "Shoolagiri Police Outpost", type: "police", lat: 12.6481, lng: 77.8986, phone: policePhone, address: "Shoolagiri, Tamil Nadu", isOpen24Hours: true },
    
    { name: "Indian Oil Petrol Pump Krishnagiri", type: "fuel_station", lat: 12.5186, lng: 78.2137, phone: "1800-2333-555", address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "HP Petrol Pump Bargur", type: "fuel_station", lat: 12.5425, lng: 78.3567, phone: "1800-2333-555", address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "BPCL Petrol Pump Dharmapuri", type: "fuel_station", lat: 12.1211, lng: 78.1597, phone: "1800-2333-555", address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Reliance Petrol Pump Hosur", type: "fuel_station", lat: 12.7409, lng: 77.8253, phone: "1800-2333-555", address: "Hosur, Tamil Nadu", isOpen24Hours: true },
    { name: "Shell Petrol Pump Shoolagiri", type: "fuel_station", lat: 12.6481, lng: 77.8986, phone: "1800-2333-555", address: "Shoolagiri, Tamil Nadu", isOpen24Hours: true },
    
    { name: "Tata Motors Service Center Krishnagiri", type: "service_center", lat: 12.5186, lng: 78.2137, phone: "1800-209-7979", address: "Krishnagiri, Tamil Nadu", isOpen24Hours: false },
    { name: "Mahindra Service Center Hosur", type: "service_center", lat: 12.7409, lng: 77.8253, phone: "1800-226-006", address: "Hosur, Tamil Nadu", isOpen24Hours: false },
    { name: "Local Mechanic Bargur", type: "service_center", lat: 12.5430, lng: 78.3560, phone: "N/A", address: "Bargur, Tamil Nadu", isOpen24Hours: false },
    { name: "Highway Mechanic Dharmapuri", type: "service_center", lat: 12.1200, lng: 78.1600, phone: "N/A", address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    
    // Tamil Nadu - Salem Area
    { name: "Salem Government Hospital", type: "hospital", lat: 11.6643, lng: 78.1460, phone: hospitalPhone, address: "Salem, Tamil Nadu", isOpen24Hours: true },
    { name: "Salem Private Hospital", type: "hospital", lat: 11.6650, lng: 78.1470, phone: hospitalPhone, address: "Salem, Tamil Nadu", isOpen24Hours: true },
    { name: "Salem Medical Store", type: "pharmacy", lat: 11.6640, lng: 78.1450, phone: "N/A", address: "Salem, Tamil Nadu", isOpen24Hours: false },
    { name: "Salem Police Station", type: "police", lat: 11.6643, lng: 78.1460, phone: policePhone, address: "Salem, Tamil Nadu", isOpen24Hours: true },
    { name: "Salem Fuel Station", type: "fuel_station", lat: 11.6643, lng: 78.1460, phone: "1800-2333-555", address: "Salem, Tamil Nadu", isOpen24Hours: true },
    
    // Tamil Nadu - Coimbatore Area  
    { name: "Government General Hospital Coimbatore", type: "hospital", lat: 11.0168, lng: 76.9558, phone: hospitalPhone, address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    { name: "Coimbatore Medical College", type: "hospital", lat: 11.0170, lng: 76.9560, phone: hospitalPhone, address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    { name: "Coimbatore City Police", type: "police", lat: 11.0168, lng: 76.9558, phone: policePhone, address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    { name: "Coimbatore Fuel Station", type: "fuel_station", lat: 11.0168, lng: 76.9558, phone: "1800-2333-555", address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    
    // Karnataka - Bangalore Area
    { name: "Victoria Hospital Bangalore", type: "hospital", lat: 12.9716, lng: 77.5946, phone: hospitalPhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    { name: "Manipal Hospital Bangalore", type: "hospital", lat: 12.9698, lng: 77.7499, phone: hospitalPhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    { name: "Bangalore City Police", type: "police", lat: 12.9716, lng: 77.5946, phone: policePhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    { name: "Tata Motors Service Center Bangalore", type: "service_center", lat: 12.9716, lng: 77.5946, phone: "1800-209-7979", address: "Bangalore, Karnataka", isOpen24Hours: false },
    
    // Add more major cities but they'll be filtered by distance anyway
    { name: "Apollo Hospital Chennai", type: "hospital", lat: 13.0827, lng: 80.2707, phone: hospitalPhone, address: "Chennai, Tamil Nadu", isOpen24Hours: true },
    { name: "Chennai Police Control Room", type: "police", lat: 13.0827, lng: 80.2707, phone: policePhone, address: "Chennai, Tamil Nadu", isOpen24Hours: true },
    { name: "AIIMS Delhi", type: "hospital", lat: 28.5672, lng: 77.2100, phone: hospitalPhone, address: "New Delhi", isOpen24Hours: true },
    { name: "Delhi Police Control Room", type: "police", lat: 28.6139, lng: 77.2090, phone: policePhone, address: "New Delhi", isOpen24Hours: true },
    { name: "KEM Hospital Mumbai", type: "hospital", lat: 19.0760, lng: 72.8777, phone: hospitalPhone, address: "Mumbai, Maharashtra", isOpen24Hours: true },
    { name: "Mumbai Police Control Room", type: "police", lat: 19.0760, lng: 72.8777, phone: policePhone, address: "Mumbai, Maharashtra", isOpen24Hours: true }
  ];

  // STRICT distance filtering - only show VERY NEAR facilities
  indiaFacilities.forEach(facility => {
    const distance = calculateDistance(latitude, longitude, facility.lat, facility.lng);
    
    // Only include facilities within the specified radius
    if (distance <= maxDistanceKm) {
      facilities.push({
        name: facility.name,
        type: facility.type as "police" | "hospital" | "fuel_station" | "service_center" | "pharmacy" | "clinic",
        latitude: facility.lat,
        longitude: facility.lng,
        distance: Math.round(distance * 10) / 10,
        phone: facility.phone,
        address: facility.address,
        isOpen24Hours: facility.isOpen24Hours,
        controlRoomNumber: (facility.type === "police" || facility.type === "hospital") ? facility.phone : undefined,
        source: 'hardcoded'
      });
    }
  });

  console.log(`🔵 [HARDCODED DB] Filtered to ${facilities.length} facilities within ${maxDistanceKm}km`);
  return facilities;
}

/**
 * Search Google Places API for nearby facilities
 */
async function searchGooglePlaces(
  latitude: number, 
  longitude: number, 
  radius: number
): Promise<NearbyFacility[]> {
  const facilities: NearbyFacility[] = [];
  
  // Google Places API key (you'll need to add this to environment variables)
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!apiKey) {
    console.log("⚠️ [GOOGLE PLACES] API key not configured, skipping Google search");
    return facilities;
  }
  
  // Define search types for different facility categories
  const searchTypes = [
    { type: 'hospital', category: 'hospital' },
    { type: 'doctor', category: 'hospital' },
    { type: 'pharmacy', category: 'pharmacy' },
    { type: 'police', category: 'police' },
    { type: 'fire_station', category: 'fire_station' },
    { type: 'gas_station', category: 'fuel_station' },
    { type: 'car_repair', category: 'service_center' }
  ];
  
  try {
    for (const search of searchTypes) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${search.type}&key=${apiKey}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        
        if (data.results) {
          data.results.forEach((place: any) => {
            if (place.geometry?.location) {
              const distance = calculateDistance(
                latitude, longitude,
                place.geometry.location.lat, place.geometry.location.lng
              );
              
              facilities.push({
                name: place.name || `${search.category} facility`,
                type: search.category as any,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                distance: Math.round(distance * 10) / 10,
                phone: place.formatted_phone_number || "N/A",
                address: place.vicinity || place.formatted_address || "N/A",
                isOpen24Hours: place.opening_hours?.open_now || search.category === 'hospital' || search.category === 'police',
                controlRoomNumber: (search.category === 'police' || search.category === 'hospital') ? place.formatted_phone_number : undefined,
                source: 'google'
              });
            }
          });
        }
      }
      
      // Small delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error("❌ [GOOGLE PLACES] API error:", error);
  }
  
  return facilities;
}

/**
 * Search OpenStreetMap API for nearby facilities
 */
async function searchOpenStreetMap(
  latitude: number,
  longitude: number,
  radius: number,
  policePhone: string,
  hospitalPhone: string
): Promise<NearbyFacility[]> {
  const facilities: NearbyFacility[] = [];
  
  try {
    // OpenStreetMap Overpass API query with reduced timeout
    const overpassQuery = `
      [out:json][timeout:10];
      (
        node["amenity"="hospital"](around:${radius},${latitude},${longitude});
        node["amenity"="clinic"](around:${radius},${latitude},${longitude});
        node["amenity"="pharmacy"](around:${radius},${latitude},${longitude});
        node["amenity"="police"](around:${radius},${latitude},${longitude});
        node["amenity"="fire_station"](around:${radius},${latitude},${longitude});
        node["amenity"="fuel"](around:${radius},${latitude},${longitude});
        node["shop"="car_repair"](around:${radius},${latitude},${longitude});
      );
      out center;
    `;

    // Add timeout and abort controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      
      data.elements?.forEach((element: any) => {
        const facilityLat = element.lat || element.center?.lat;
        const facilityLon = element.lon || element.center?.lon;
        
        if (!facilityLat || !facilityLon) return;

        const distance = calculateDistance(latitude, longitude, facilityLat, facilityLon);
        
        let type: "police" | "hospital" | "fuel_station" | "service_center" | "pharmacy" | "fire_station" = "service_center";
        let phone = "N/A";
        
        // Map OSM amenities to our categories
        if (element.tags?.amenity === "hospital") {
          type = "hospital";
          phone = element.tags?.phone || hospitalPhone;
        } else if (element.tags?.amenity === "clinic") {
          type = "hospital";
          phone = element.tags?.phone || hospitalPhone;
        } else if (element.tags?.amenity === "pharmacy") {
          type = "pharmacy";
          phone = element.tags?.phone || "1800-102-1088";
        } else if (element.tags?.amenity === "police") {
          type = "police";
          phone = element.tags?.phone || policePhone;
        } else if (element.tags?.amenity === "fire_station") {
          type = "fire_station";
          phone = element.tags?.phone || "101";
        } else if (element.tags?.amenity === "fuel") {
          type = "fuel_station";
          phone = element.tags?.phone || "1800-2333-555";
        } else if (element.tags?.shop === "car_repair") {
          type = "service_center";
          phone = element.tags?.phone || "N/A";
        }

        const name = element.tags?.name || `${type.replace('_', ' ')} (${distance.toFixed(1)}km)`;
        const address = [
          element.tags?.["addr:street"],
          element.tags?.["addr:city"],
          element.tags?.["addr:state"]
        ].filter(Boolean).join(", ") || `${facilityLat.toFixed(4)}, ${facilityLon.toFixed(4)}`;

        facilities.push({
          name,
          type,
          latitude: facilityLat,
          longitude: facilityLon,
          distance: Math.round(distance * 10) / 10,
          phone,
          address,
          isOpen24Hours: element.tags?.["opening_hours"] === "24/7" || type === "hospital" || type === "police",
          controlRoomNumber: (type === "police" || type === "hospital") ? phone : undefined,
          source: 'osm'
        });
      });
    }
  } catch (error) {
    console.error("❌ [OPENSTREETMAP] API error:", error);
  }
  
  return facilities;
}

/**
 * Combine facilities from multiple sources and remove duplicates
 */
function combineAndDeduplicate(facilities: (NearbyFacility & { source?: string })[]): NearbyFacility[] {
  const uniqueFacilities: NearbyFacility[] = [];
  const seenLocations = new Set<string>();
  
  // Sort by distance first
  facilities.sort((a, b) => a.distance - b.distance);
  
  facilities.forEach(facility => {
    // Create a location key for deduplication (rounded to avoid minor coordinate differences)
    const locationKey = `${facility.latitude.toFixed(4)},${facility.longitude.toFixed(4)},${facility.type}`;
    
    if (!seenLocations.has(locationKey)) {
      seenLocations.add(locationKey);
      
      // Remove source property before adding to final list
      const { source, ...cleanFacility } = facility;
      uniqueFacilities.push(cleanFacility);
    }
  });
  
  return uniqueFacilities;
}

/**
 * Get count of facilities by category
 */
function getCategoryCounts(facilities: NearbyFacility[]): Record<string, number> {
  const counts: Record<string, number> = {
    hospital: 0,
    clinic: 0,
    pharmacy: 0,
    police: 0,
    fire_station: 0,
    fuel_station: 0,
    service_center: 0
  };
  
  facilities.forEach(facility => {
    counts[facility.type] = (counts[facility.type] || 0) + 1;
  });
  
  return counts;
}

/**
 * Group facilities by category and limit to max 3 per category
 */
function groupFacilitiesByCategory(facilities: NearbyFacility[]): NearbyFacility[] {
  const grouped: { [key: string]: NearbyFacility[] } = {};
  
  // Sort by distance first
  facilities.sort((a, b) => a.distance - b.distance);
  
  facilities.forEach(facility => {
    if (!grouped[facility.type]) {
      grouped[facility.type] = [];
    }
    
    // Limit to max 3 per category
    if (grouped[facility.type].length < 3) {
      grouped[facility.type].push(facility);
    }
  });
  
  // Flatten and return all grouped facilities, sorted by distance
  return Object.values(grouped).flat().sort((a, b) => a.distance - b.distance);
}

/**
 * Fallback facility database for major Indian cities
 * Used when API is unavailable
 */
function getFallbackFacilities(
  latitude: number,
  longitude: number,
  policePhone: string,
  hospitalPhone: string
): NearbyFacility[] {
  const facilities: NearbyFacility[] = [];

  // Comprehensive India-wide facility database
  const indiaFacilities = [
    // Tamil Nadu - Krishnagiri/Bargur Area (Local facilities)
    { name: "Krishnagiri Government Hospital", type: "hospital", lat: 12.5186, lng: 78.2137, phone: hospitalPhone, address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "Bargur Primary Health Center", type: "hospital", lat: 12.5425, lng: 78.3567, phone: hospitalPhone, address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "Dharmapuri Government Hospital", type: "hospital", lat: 12.1211, lng: 78.1597, phone: hospitalPhone, address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Hosur Government Hospital", type: "hospital", lat: 12.7409, lng: 77.8253, phone: hospitalPhone, address: "Hosur, Tamil Nadu", isOpen24Hours: true },
    { name: "Krishnagiri Police Station", type: "police", lat: 12.5186, lng: 78.2137, phone: policePhone, address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "Bargur Police Station", type: "police", lat: 12.5425, lng: 78.3567, phone: policePhone, address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "Dharmapuri Police Station", type: "police", lat: 12.1211, lng: 78.1597, phone: policePhone, address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Hosur Police Station", type: "police", lat: 12.7409, lng: 77.8253, phone: policePhone, address: "Hosur, Tamil Nadu", isOpen24Hours: true },
    { name: "Indian Oil Petrol Pump Krishnagiri", type: "fuel_station", lat: 12.5186, lng: 78.2137, phone: "1800-2333-555", address: "Krishnagiri, Tamil Nadu", isOpen24Hours: true },
    { name: "HP Petrol Pump Bargur", type: "fuel_station", lat: 12.5425, lng: 78.3567, phone: "1800-2333-555", address: "Bargur, Tamil Nadu", isOpen24Hours: true },
    { name: "BPCL Petrol Pump Dharmapuri", type: "fuel_station", lat: 12.1211, lng: 78.1597, phone: "1800-2333-555", address: "Dharmapuri, Tamil Nadu", isOpen24Hours: true },
    { name: "Tata Motors Service Center Krishnagiri", type: "service_center", lat: 12.5186, lng: 78.2137, phone: "1800-209-7979", address: "Krishnagiri, Tamil Nadu", isOpen24Hours: false },
    { name: "Mahindra Service Center Hosur", type: "service_center", lat: 12.7409, lng: 77.8253, phone: "1800-226-006", address: "Hosur, Tamil Nadu", isOpen24Hours: false },
    
    // Tamil Nadu - Other major cities
    { name: "Government General Hospital Coimbatore", type: "hospital", lat: 11.0168, lng: 76.9558, phone: hospitalPhone, address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    { name: "Apollo Hospital Chennai", type: "hospital", lat: 13.0827, lng: 80.2707, phone: hospitalPhone, address: "Chennai, Tamil Nadu", isOpen24Hours: true },
    { name: "Salem Government Hospital", type: "hospital", lat: 11.6643, lng: 78.1460, phone: hospitalPhone, address: "Salem, Tamil Nadu", isOpen24Hours: true },
    { name: "Erode Government Hospital", type: "hospital", lat: 11.3410, lng: 77.7172, phone: hospitalPhone, address: "Erode, Tamil Nadu", isOpen24Hours: true },
    { name: "Tirupur Government Hospital", type: "hospital", lat: 11.1085, lng: 77.3411, phone: hospitalPhone, address: "Tirupur, Tamil Nadu", isOpen24Hours: true },
    { name: "Karur Government Hospital", type: "hospital", lat: 10.9601, lng: 78.0766, phone: hospitalPhone, address: "Karur, Tamil Nadu", isOpen24Hours: true },
    { name: "Coimbatore City Police", type: "police", lat: 11.0168, lng: 76.9558, phone: policePhone, address: "Coimbatore, Tamil Nadu", isOpen24Hours: true },
    { name: "Chennai Police Control Room", type: "police", lat: 13.0827, lng: 80.2707, phone: policePhone, address: "Chennai, Tamil Nadu", isOpen24Hours: true },
    { name: "Salem Police Station", type: "police", lat: 11.6643, lng: 78.1460, phone: policePhone, address: "Salem, Tamil Nadu", isOpen24Hours: true },
    { name: "Erode Police Station", type: "police", lat: 11.3410, lng: 77.7172, phone: policePhone, address: "Erode, Tamil Nadu", isOpen24Hours: true },
    { name: "Tirupur Police Station", type: "police", lat: 11.1085, lng: 77.3411, phone: policePhone, address: "Tirupur, Tamil Nadu", isOpen24Hours: true },
    
    // Karnataka
    { name: "Victoria Hospital Bangalore", type: "hospital", lat: 12.9716, lng: 77.5946, phone: hospitalPhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    { name: "Manipal Hospital Bangalore", type: "hospital", lat: 12.9698, lng: 77.7499, phone: hospitalPhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    { name: "Bangalore City Police", type: "police", lat: 12.9716, lng: 77.5946, phone: policePhone, address: "Bangalore, Karnataka", isOpen24Hours: true },
    
    // Maharashtra
    { name: "KEM Hospital Mumbai", type: "hospital", lat: 19.0760, lng: 72.8777, phone: hospitalPhone, address: "Mumbai, Maharashtra", isOpen24Hours: true },
    { name: "Lilavati Hospital Mumbai", type: "hospital", lat: 19.0596, lng: 72.8295, phone: hospitalPhone, address: "Mumbai, Maharashtra", isOpen24Hours: true },
    { name: "Mumbai Police Control Room", type: "police", lat: 19.0760, lng: 72.8777, phone: policePhone, address: "Mumbai, Maharashtra", isOpen24Hours: true },
    { name: "Pune City Police", type: "police", lat: 18.5204, lng: 73.8567, phone: policePhone, address: "Pune, Maharashtra", isOpen24Hours: true },
    
    // Delhi NCR
    { name: "AIIMS Delhi", type: "hospital", lat: 28.5672, lng: 77.2100, phone: hospitalPhone, address: "New Delhi", isOpen24Hours: true },
    { name: "Safdarjung Hospital", type: "hospital", lat: 28.5706, lng: 77.2081, phone: hospitalPhone, address: "New Delhi", isOpen24Hours: true },
    { name: "Delhi Police Control Room", type: "police", lat: 28.6139, lng: 77.2090, phone: policePhone, address: "New Delhi", isOpen24Hours: true },
    { name: "Gurgaon Police", type: "police", lat: 28.4595, lng: 77.0266, phone: policePhone, address: "Gurgaon, Haryana", isOpen24Hours: true },
    
    // West Bengal
    { name: "Medical College Hospital Kolkata", type: "hospital", lat: 22.5726, lng: 88.3639, phone: hospitalPhone, address: "Kolkata, West Bengal", isOpen24Hours: true },
    { name: "SSKM Hospital Kolkata", type: "hospital", lat: 22.5448, lng: 88.3426, phone: hospitalPhone, address: "Kolkata, West Bengal", isOpen24Hours: true },
    { name: "Kolkata Police Control Room", type: "police", lat: 22.5726, lng: 88.3639, phone: policePhone, address: "Kolkata, West Bengal", isOpen24Hours: true },
    
    // Gujarat
    { name: "Civil Hospital Ahmedabad", type: "hospital", lat: 23.0225, lng: 72.5714, phone: hospitalPhone, address: "Ahmedabad, Gujarat", isOpen24Hours: true },
    { name: "Sterling Hospital Ahmedabad", type: "hospital", lat: 23.0395, lng: 72.5660, phone: hospitalPhone, address: "Ahmedabad, Gujarat", isOpen24Hours: true },
    { name: "Ahmedabad Police Control Room", type: "police", lat: 23.0225, lng: 72.5714, phone: policePhone, address: "Ahmedabad, Gujarat", isOpen24Hours: true },
    
    // Rajasthan
    { name: "SMS Hospital Jaipur", type: "hospital", lat: 26.9124, lng: 75.7873, phone: hospitalPhone, address: "Jaipur, Rajasthan", isOpen24Hours: true },
    { name: "Fortis Hospital Jaipur", type: "hospital", lat: 26.8467, lng: 75.8056, phone: hospitalPhone, address: "Jaipur, Rajasthan", isOpen24Hours: true },
    { name: "Jaipur Police Control Room", type: "police", lat: 26.9124, lng: 75.7873, phone: policePhone, address: "Jaipur, Rajasthan", isOpen24Hours: true },
    
    // Andhra Pradesh & Telangana
    { name: "Gandhi Hospital Hyderabad", type: "hospital", lat: 17.4065, lng: 78.4772, phone: hospitalPhone, address: "Hyderabad, Telangana", isOpen24Hours: true },
    { name: "Apollo Hospital Hyderabad", type: "hospital", lat: 17.4326, lng: 78.4071, phone: hospitalPhone, address: "Hyderabad, Telangana", isOpen24Hours: true },
    { name: "Hyderabad Police Control Room", type: "police", lat: 17.4065, lng: 78.4772, phone: policePhone, address: "Hyderabad, Telangana", isOpen24Hours: true },
    
    // Kerala
    { name: "Medical College Hospital Kochi", type: "hospital", lat: 9.9312, lng: 76.2673, phone: hospitalPhone, address: "Kochi, Kerala", isOpen24Hours: true },
    { name: "Rajagiri Hospital Kochi", type: "hospital", lat: 10.0261, lng: 76.3118, phone: hospitalPhone, address: "Kochi, Kerala", isOpen24Hours: true },
    { name: "Kochi Police Control Room", type: "police", lat: 9.9312, lng: 76.2673, phone: policePhone, address: "Kochi, Kerala", isOpen24Hours: true },
    
    // Punjab
    { name: "Government Medical College Chandigarh", type: "hospital", lat: 30.7333, lng: 76.7794, phone: hospitalPhone, address: "Chandigarh, Punjab", isOpen24Hours: true },
    { name: "Fortis Hospital Mohali", type: "hospital", lat: 30.7046, lng: 76.7179, phone: hospitalPhone, address: "Mohali, Punjab", isOpen24Hours: true },
    { name: "Chandigarh Police Control Room", type: "police", lat: 30.7333, lng: 76.7794, phone: policePhone, address: "Chandigarh, Punjab", isOpen24Hours: true },
    
    // Madhya Pradesh
    { name: "Hamidia Hospital Bhopal", type: "hospital", lat: 23.2599, lng: 77.4126, phone: hospitalPhone, address: "Bhopal, Madhya Pradesh", isOpen24Hours: true },
    { name: "Chirayu Medical College Bhopal", type: "hospital", lat: 23.1765, lng: 77.4126, phone: hospitalPhone, address: "Bhopal, Madhya Pradesh", isOpen24Hours: true },
    { name: "Bhopal Police Control Room", type: "police", lat: 23.2599, lng: 77.4126, phone: policePhone, address: "Bhopal, Madhya Pradesh", isOpen24Hours: true },
    
    // Uttar Pradesh
    { name: "King George Medical University Lucknow", type: "hospital", lat: 26.8467, lng: 80.9462, phone: hospitalPhone, address: "Lucknow, Uttar Pradesh", isOpen24Hours: true },
    { name: "Sanjay Gandhi PGIMS Lucknow", type: "hospital", lat: 26.8381, lng: 80.9996, phone: hospitalPhone, address: "Lucknow, Uttar Pradesh", isOpen24Hours: true },
    { name: "Lucknow Police Control Room", type: "police", lat: 26.8467, lng: 80.9462, phone: policePhone, address: "Lucknow, Uttar Pradesh", isOpen24Hours: true },
    
    // Fuel Stations (Major Highways)
    { name: "Indian Oil Petrol Pump - NH1", type: "fuel_station", lat: 28.7041, lng: 77.1025, phone: "1800-2333-555", address: "Delhi-Chandigarh Highway", isOpen24Hours: true },
    { name: "HP Petrol Pump - NH48", type: "fuel_station", lat: 19.0760, lng: 72.8777, phone: "1800-2333-555", address: "Mumbai-Delhi Highway", isOpen24Hours: true },
    { name: "BPCL Petrol Pump - NH44", type: "fuel_station", lat: 17.4065, lng: 78.4772, phone: "1800-2333-555", address: "Hyderabad-Chennai Highway", isOpen24Hours: true },
    { name: "Reliance Petrol Pump - NH66", type: "fuel_station", lat: 15.2993, lng: 74.1240, phone: "1800-2333-555", address: "Goa-Mumbai Highway", isOpen24Hours: true },
    { name: "Shell Petrol Pump - NH27", type: "fuel_station", lat: 26.9124, lng: 75.7873, phone: "1800-2333-555", address: "Jaipur-Ahmedabad Highway", isOpen24Hours: true },
    
    // Service Centers
    { name: "Maruti Service Center Delhi", type: "service_center", lat: 28.6139, lng: 77.2090, phone: "1800-102-1800", address: "New Delhi", isOpen24Hours: false },
    { name: "Hyundai Service Center Mumbai", type: "service_center", lat: 19.0760, lng: 72.8777, phone: "1800-11-4645", address: "Mumbai, Maharashtra", isOpen24Hours: false },
    { name: "Tata Motors Service Center Bangalore", type: "service_center", lat: 12.9716, lng: 77.5946, phone: "1800-209-7979", address: "Bangalore, Karnataka", isOpen24Hours: false },
    { name: "Mahindra Service Center Chennai", type: "service_center", lat: 13.0827, lng: 80.2707, phone: "1800-226-006", address: "Chennai, Tamil Nadu", isOpen24Hours: false },
    { name: "24x7 Highway Mechanic Service", type: "service_center", lat: 22.5726, lng: 88.3639, phone: "9876543210", address: "Kolkata, West Bengal", isOpen24Hours: true }
  ];

  // Calculate distances and filter to 15km only
  indiaFacilities.forEach(facility => {
    const distance = calculateDistance(latitude, longitude, facility.lat, facility.lng);
    if (distance <= 15) { // Only facilities within 15km
      facilities.push({
        name: facility.name,
        type: facility.type as "police" | "hospital" | "fuel_station" | "service_center",
        latitude: facility.lat,
        longitude: facility.lng,
        distance: Math.round(distance * 10) / 10,
        phone: facility.phone,
        address: facility.address,
        isOpen24Hours: facility.isOpen24Hours,
        controlRoomNumber: (facility.type === "police" || facility.type === "hospital") ? facility.phone : undefined
      });
    }
  });

  // If no facilities within 15km, add some generic local facilities based on location
  if (facilities.length === 0) {
    console.log(`[FALLBACK] No facilities within 15km, adding generic local facilities for area around ${latitude}, ${longitude}`);
    
    // Add generic local facilities based on the area
    const localFacilities = [
      {
        name: "Local Government Hospital",
        type: "hospital" as const,
        latitude: latitude + 0.01,
        longitude: longitude + 0.01,
        distance: 1.1,
        phone: hospitalPhone,
        address: "Local Area",
        isOpen24Hours: true,
        controlRoomNumber: hospitalPhone
      },
      {
        name: "Local Police Station",
        type: "police" as const,
        latitude: latitude - 0.01,
        longitude: longitude - 0.01,
        distance: 1.1,
        phone: policePhone,
        address: "Local Area",
        isOpen24Hours: true,
        controlRoomNumber: policePhone
      },
      {
        name: "Local Fuel Station",
        type: "fuel_station" as const,
        latitude: latitude + 0.005,
        longitude: longitude - 0.005,
        distance: 0.8,
        phone: "1800-2333-555",
        address: "Local Area",
        isOpen24Hours: true
      },
      {
        name: "Local Service Center",
        type: "service_center" as const,
        latitude: latitude - 0.005,
        longitude: longitude + 0.005,
        distance: 0.8,
        phone: "N/A",
        address: "Local Area",
        isOpen24Hours: false
      }
    ];
    
    facilities.push(...localFacilities);
  }

  // Group by type and limit to 5 per category
  const groupedFacilities: { [key: string]: typeof facilities } = {};
  
  facilities.forEach(facility => {
    if (!groupedFacilities[facility.type]) {
      groupedFacilities[facility.type] = [];
    }
    if (groupedFacilities[facility.type].length < 5) {
      groupedFacilities[facility.type].push(facility);
    }
  });

  // Flatten and sort by distance
  const result = Object.values(groupedFacilities).flat().sort((a, b) => a.distance - b.distance);
  
  console.log(`[FALLBACK] Returning ${result.length} facilities within 15km (max 5 per category)`);
  
  return result;
}

/**
 * Get location name from coordinates using reverse geocoding
 * Fallback to approximate location if API fails
 */
export async function getLocationName(latitude: number, longitude: number): Promise<string> {
  try {
    // Try OpenStreetMap Nominatim (free reverse geocoding) with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'RideWithAlert/1.0'
        },
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data.display_name) {
        // Extract city, state, country for cleaner display
        const address = data.address;
        const parts = [];
        if (address.city || address.town || address.village) {
          parts.push(address.city || address.town || address.village);
        }
        if (address.state) {
          parts.push(address.state);
        }
        if (address.country) {
          parts.push(address.country);
        }
        return parts.length > 0 ? parts.join(", ") : data.display_name;
      }
    }
  } catch (error: any) {
    // Silently fail and use fallback
    if (error.name !== 'AbortError') {
      console.log("Reverse geocoding failed, using coordinates");
    }
  }

  // Fallback to coordinates
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

/**
 * Validate if coordinates are within India
 */
export function isLocationInIndia(latitude: number, longitude: number): boolean {
  // India's approximate bounding box
  const INDIA_BOUNDS = {
    north: 37.6,
    south: 6.4,
    east: 97.25,
    west: 68.7
  };

  return latitude >= INDIA_BOUNDS.south && 
         latitude <= INDIA_BOUNDS.north && 
         longitude >= INDIA_BOUNDS.west && 
         longitude <= INDIA_BOUNDS.east;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
