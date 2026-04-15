/**
 * Optimized Facility Service with Caching and Rate Limit Prevention
 * 
 * Fixes:
 * ✅ Caching - Store results to avoid repeated API calls
 * ✅ Single API call - Share results between systems  
 * ✅ Throttling - Prevent burst requests
 * ✅ Background preloading - Fetch facilities when trip starts
 */

import type { NearbyFacility } from './utils';
import { findNearbyFacilities } from './utils';

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const THROTTLE_DELAY = 2000; // 2 seconds between API calls
const CACHE_PRECISION = 2; // Round coordinates to 2 decimal places

// Cache storage
interface CachedFacilities {
  facilities: NearbyFacility[];
  timestamp: number;
  location: { lat: number; lng: number };
}

const facilityCache = new Map<string, CachedFacilities>();
const ongoingRequests = new Map<string, Promise<NearbyFacility[]>>();
let lastApiCall = 0;

/**
 * Generate cache key from coordinates
 */
function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)}-${lng.toFixed(CACHE_PRECISION)}`;
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cached: CachedFacilities): boolean {
  return Date.now() - cached.timestamp < CACHE_DURATION;
}

/**
 * Throttle API calls to prevent rate limiting
 */
async function throttleApiCall(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < THROTTLE_DELAY) {
    const waitTime = THROTTLE_DELAY - timeSinceLastCall;
    console.log(`⏳ [CACHE] Throttling API call, waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCall = Date.now();
}

/**
 * Get nearby facilities with caching and optimization
 */
export async function getCachedNearbyFacilities(
  latitude: number,
  longitude: number,
  policePhone: string = '100',
  hospitalPhone: string = '108'
): Promise<NearbyFacilities> {
  const cacheKey = getCacheKey(latitude, longitude);
  
  console.log(`🔍 [CACHE] Looking for facilities near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
  console.log(`🔍 [CACHE] Cache key: ${cacheKey}`);
  
  // Check cache first
  const cached = facilityCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    console.log(`✅ [CACHE] Found valid cached data (${cached.facilities.length} facilities)`);
    console.log(`✅ [CACHE] Cache age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s`);
    return {
      facilities: cached.facilities,
      source: 'cache',
      cacheHit: true,
      timestamp: cached.timestamp
    };
  }
  
  // Check if there's already an ongoing request for this location
  const ongoingRequest = ongoingRequests.get(cacheKey);
  if (ongoingRequest) {
    console.log(`⏳ [CACHE] Waiting for ongoing request...`);
    const facilities = await ongoingRequest;
    return {
      facilities,
      source: 'shared-request',
      cacheHit: false,
      timestamp: Date.now()
    };
  }
  
  // Create new request with throttling
  console.log(`🔄 [CACHE] Cache miss, making new API request...`);
  await throttleApiCall();
  
  // Create and store the promise to prevent duplicate requests
  const requestPromise = findNearbyFacilities(latitude, longitude, policePhone, hospitalPhone);
  ongoingRequests.set(cacheKey, requestPromise);
  
  try {
    const facilities = await requestPromise;
    
    // Cache the results
    facilityCache.set(cacheKey, {
      facilities,
      timestamp: Date.now(),
      location: { lat: latitude, lng: longitude }
    });
    
    console.log(`✅ [CACHE] Cached ${facilities.length} facilities for key ${cacheKey}`);
    
    return {
      facilities,
      source: 'api',
      cacheHit: false,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error(`❌ [CACHE] API request failed:`, error);
    throw error;
  } finally {
    // Clean up ongoing request
    ongoingRequests.delete(cacheKey);
  }
}

/**
 * Preload facilities for a location (background operation)
 */
export async function preloadFacilities(
  latitude: number,
  longitude: number,
  policePhone: string = '100',
  hospitalPhone: string = '108'
): Promise<void> {
  const cacheKey = getCacheKey(latitude, longitude);
  
  // Don't preload if we already have valid cache
  const cached = facilityCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    console.log(`✅ [PRELOAD] Already cached for ${cacheKey}`);
    return;
  }
  
  console.log(`🚀 [PRELOAD] Background loading facilities for ${cacheKey}...`);
  
  try {
    await getCachedNearbyFacilities(latitude, longitude, policePhone, hospitalPhone);
    console.log(`✅ [PRELOAD] Successfully preloaded facilities for ${cacheKey}`);
  } catch (error) {
    console.warn(`⚠️ [PRELOAD] Failed to preload facilities:`, error);
  }
}

/**
 * Get facilities for emergency (prioritizes speed)
 */
export async function getEmergencyFacilities(
  latitude: number,
  longitude: number,
  policePhone: string = '100',
  hospitalPhone: string = '108'
): Promise<NearbyFacility[]> {
  console.log(`🚨 [EMERGENCY] Getting facilities for emergency at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
  
  const result = await getCachedNearbyFacilities(latitude, longitude, policePhone, hospitalPhone);
  
  console.log(`🚨 [EMERGENCY] Retrieved ${result.facilities.length} facilities from ${result.source}`);
  
  return result.facilities;
}

/**
 * Clear old cache entries
 */
export function cleanupCache(): void {
  const now = Date.now();
  let cleaned = 0;
  
  // Convert to array to avoid iterator issues
  const entries = Array.from(facilityCache.entries());
  for (const [key, cached] of entries) {
    if (!isCacheValid(cached)) {
      facilityCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 [CACHE] Cleaned up ${cleaned} expired cache entries`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  // Convert to array to avoid iterator issues
  const values = Array.from(facilityCache.values());
  for (const cached of values) {
    if (isCacheValid(cached)) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }
  
  return {
    totalEntries: facilityCache.size,
    validEntries,
    expiredEntries,
    ongoingRequests: ongoingRequests.size,
    lastApiCall: lastApiCall > 0 ? new Date(lastApiCall).toISOString() : 'never'
  };
}

// Types
export interface NearbyFacilities {
  facilities: NearbyFacility[];
  source: 'cache' | 'api' | 'shared-request';
  cacheHit: boolean;
  timestamp: number;
}

export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  ongoingRequests: number;
  lastApiCall: string;
}

// Cleanup cache every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);