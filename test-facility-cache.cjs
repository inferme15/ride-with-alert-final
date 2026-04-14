// Test the optimized facility caching system
require('dotenv').config();

// Mock the utils module since we can't import TypeScript directly
const mockFacilities = [
  { name: "Test Hospital", type: "hospital", latitude: 12.5425, longitude: 78.3567, distance: 0.4, phone: "108", address: "Test Address", isOpen24Hours: true },
  { name: "Test Police", type: "police", latitude: 12.5425, longitude: 78.3567, distance: 0.4, phone: "100", address: "Test Address", isOpen24Hours: true }
];

// Simple cache implementation for testing
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const THROTTLE_DELAY = 2000; // 2 seconds
let lastApiCall = 0;

function getCacheKey(lat, lng) {
  return `${lat.toFixed(2)}-${lng.toFixed(2)}`;
}

function isCacheValid(cached) {
  return Date.now() - cached.timestamp < CACHE_DURATION;
}

async function throttleApiCall() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < THROTTLE_DELAY) {
    const waitTime = THROTTLE_DELAY - timeSinceLastCall;
    console.log(`⏳ [CACHE] Throttling API call, waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCall = Date.now();
}

async function mockFindNearbyFacilities(lat, lng) {
  console.log(`🔍 [MOCK API] Searching for facilities near ${lat}, ${lng}`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
  return mockFacilities;
}

async function getCachedNearbyFacilities(latitude, longitude) {
  const cacheKey = getCacheKey(latitude, longitude);
  
  console.log(`🔍 [CACHE] Looking for facilities near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
  console.log(`🔍 [CACHE] Cache key: ${cacheKey}`);
  
  // Check cache first
  const cached = cache.get(cacheKey);
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
  
  // Make API call with throttling
  console.log(`🔄 [CACHE] Cache miss, making new API request...`);
  await throttleApiCall();
  
  const facilities = await mockFindNearbyFacilities(latitude, longitude);
  
  // Cache the results
  cache.set(cacheKey, {
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
}

async function testCaching() {
  console.log('🧪 Testing Facility Caching System...\n');
  
  const testLat = 12.545;
  const testLng = 78.357;
  
  console.log('=== Test 1: First API call (cache miss) ===');
  const start1 = Date.now();
  const result1 = await getCachedNearbyFacilities(testLat, testLng);
  const time1 = Date.now() - start1;
  console.log(`⏱️ Time: ${time1}ms, Source: ${result1.source}, Cache Hit: ${result1.cacheHit}\n`);
  
  console.log('=== Test 2: Second call (cache hit) ===');
  const start2 = Date.now();
  const result2 = await getCachedNearbyFacilities(testLat, testLng);
  const time2 = Date.now() - start2;
  console.log(`⏱️ Time: ${time2}ms, Source: ${result2.source}, Cache Hit: ${result2.cacheHit}\n`);
  
  console.log('=== Test 3: Different location (cache miss) ===');
  const start3 = Date.now();
  const result3 = await getCachedNearbyFacilities(testLat + 0.1, testLng + 0.1);
  const time3 = Date.now() - start3;
  console.log(`⏱️ Time: ${time3}ms, Source: ${result3.source}, Cache Hit: ${result3.cacheHit}\n`);
  
  console.log('=== Test 4: Rapid calls (throttling test) ===');
  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(getCachedNearbyFacilities(testLat + 0.2 + i * 0.01, testLng + 0.2));
  }
  
  const start4 = Date.now();
  await Promise.all(promises);
  const time4 = Date.now() - start4;
  console.log(`⏱️ Total time for 3 rapid calls: ${time4}ms\n`);
  
  console.log('=== Cache Statistics ===');
  console.log(`Cache entries: ${cache.size}`);
  console.log(`Last API call: ${new Date(lastApiCall).toLocaleTimeString()}`);
  
  console.log('\n✅ Caching system test completed!');
  console.log('\n🚀 Benefits:');
  console.log(`- Cache hit was ${Math.round((time1 - time2) / time1 * 100)}% faster`);
  console.log('- Prevents API rate limiting');
  console.log('- Reduces server load');
  console.log('- Improves emergency response time');
}

testCaching().catch(console.error);