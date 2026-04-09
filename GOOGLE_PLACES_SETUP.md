# Google Places API Setup Guide

## Why Use Google Places?

Google Places API provides:
- ✅ More accurate facility locations
- ✅ Real-time opening hours
- ✅ Phone numbers and ratings
- ✅ Better coverage in urban areas
- ✅ Fallback to OpenStreetMap if Google fails

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "NEW PROJECT"
4. Enter project name: `RideWithAlert` (or your choice)
5. Click "CREATE"
6. Wait for project to be created (1-2 minutes)

### 2. Enable Places API

1. In the left sidebar, click "APIs & Services" → "Library"
2. Search for "Places API"
3. Click on "Places API"
4. Click "ENABLE"
5. Wait for it to enable (should be instant)

### 3. Create API Key

1. Go to "APIs & Services" → "Credentials"
2. Click "CREATE CREDENTIALS" → "API Key"
3. A dialog will show your new API key
4. Click the copy icon to copy it
5. Click "CLOSE"

### 4. Restrict API Key (Recommended for Security)

1. In Credentials page, find your API key
2. Click on it to open details
3. Under "Application restrictions":
   - Select "HTTP referrers (web sites)"
   - Add your domain(s):
     - `localhost:5000` (for development)
     - `yourdomain.com` (for production)
     - `*.yourdomain.com` (for subdomains)

4. Under "API restrictions":
   - Select "Restrict key"
   - Check only "Places API"
   - Click "SAVE"

### 5. Add to .env File

1. Open `.env` file in your project root
2. Find the line: `GOOGLE_PLACES_API_KEY=your_google_places_api_key_here`
3. Replace with your actual key:
   ```
   GOOGLE_PLACES_API_KEY=AIzaSyD_example_key_here_1234567890
   ```
4. Save the file

### 6. Restart Server

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm run dev
# or
npm start
```

## Verify It's Working

### Check Server Logs

After restarting, trigger an emergency and look for:

```
🟢 [GOOGLE PLACES] Found 15 facilities
```

If you see this, Google Places is working! ✅

### Check for Errors

If you see:
```
⚠️ [GOOGLE PLACES] API key not configured, skipping Google search
```

- API key is still the placeholder value
- Check `.env` file was saved correctly
- Restart server

If you see:
```
❌ [GOOGLE PLACES] API error: 403 Forbidden
```

- API key is invalid or expired
- Places API not enabled in Google Cloud
- Check your API key and permissions

## Billing Information

### Free Tier
- First 25,000 requests per month are free
- Each facility search = 1 request
- Typical emergency = 7 requests (for 7 facility types)

### Estimated Monthly Cost
- 100 emergencies/month = ~700 requests = **FREE** ✅
- 1,000 emergencies/month = ~7,000 requests = **FREE** ✅
- 5,000 emergencies/month = ~35,000 requests = ~$5-10/month

### Enable Billing Alerts
1. Go to "Billing" in Google Cloud Console
2. Click "Budgets and alerts"
3. Set budget limit (e.g., $10/month)
4. Get email alerts if you exceed it

## Troubleshooting

### Issue: "Invalid API Key"
**Solution:**
- Copy the key again from Google Cloud Console
- Make sure there are no extra spaces
- Restart server

### Issue: "API key not valid for this service"
**Solution:**
- Go to Google Cloud Console
- Check "API restrictions" on your key
- Make sure "Places API" is selected
- Wait 5 minutes for changes to propagate

### Issue: "Quota exceeded"
**Solution:**
- You've exceeded free tier (25,000 requests/month)
- Enable billing in Google Cloud Console
- Or reduce facility search frequency

### Issue: Still seeing "API key not configured"
**Solution:**
- Check `.env` file exists in project root
- Make sure line is: `GOOGLE_PLACES_API_KEY=your_actual_key`
- Not: `GOOGLE_PLACES_API_KEY=your_google_places_api_key_here`
- Restart server after saving

## Fallback Behavior

If Google Places fails for any reason:
1. System automatically falls back to OpenStreetMap
2. Facilities are still found (just from OpenStreetMap)
3. No errors shown to user
4. Emergency response continues normally

This means Google Places is **optional** - the system works fine without it!

## Monitoring Usage

### Check API Usage
1. Go to Google Cloud Console
2. Click "APIs & Services" → "Library"
3. Click "Places API"
4. Click "Metrics" tab
5. See requests over time

### Set Up Alerts
1. Go to "Billing" → "Budgets and alerts"
2. Create budget for Places API
3. Get email if you exceed limit

## Production Deployment

### Before Going Live
1. ✅ Test with real API key
2. ✅ Verify facilities are found
3. ✅ Check server logs for errors
4. ✅ Set up billing alerts
5. ✅ Restrict API key to your domain

### Deployment Steps
1. Add API key to production `.env`
2. Restart production server
3. Monitor logs for first 24 hours
4. Check billing dashboard

## Support

If you have issues:
1. Check server logs for error messages
2. Verify API key in Google Cloud Console
3. Check Places API is enabled
4. Verify billing is enabled (if over free tier)
5. Wait 5 minutes for changes to propagate

## Cost Optimization

### Reduce Requests
- Increase facility search radius (fewer searches needed)
- Cache results for 5-10 minutes
- Only search when emergency is triggered

### Monitor Costs
- Set budget alerts at $5/month
- Review usage monthly
- Adjust radius if costs are high

## Next Steps

1. ✅ Create Google Cloud Project
2. ✅ Enable Places API
3. ✅ Create API Key
4. ✅ Add to `.env`
5. ✅ Restart server
6. ✅ Test with emergency
7. ✅ Monitor logs and billing

You're all set! 🎉
