# Deployment Checklist - All Fixes

## Pre-Deployment

### Code Changes
- [x] Video upload filter updated (`server/routes.ts`)
- [x] OpenStreetMap retry logic added (`server/utils.ts`)
- [x] Nominatim retry logic added (`server/utils.ts`)
- [x] Google Places retry logic added (`server/utils.ts`)
- [x] Google Places API key added to `.env`

### Testing
- [ ] Video upload test (trigger emergency, verify video accepted)
- [ ] Facility search test (check logs for successful search)
- [ ] Retry logic test (simulate slow API, verify retries work)
- [ ] Google Places test (if API key added)

---

## Deployment Steps

### 1. Backup Current Code
```bash
git stash  # Save any uncommitted changes
git tag backup-$(date +%Y%m%d-%H%M%S)  # Create backup tag
```

### 2. Deploy Code Changes
```bash
git add server/routes.ts server/utils.ts
git commit -m "Fix: Video upload MIME type, API timeouts with retry logic"
git push origin main
```

### 3. Deploy Configuration (Optional - Google Places)
```bash
# Only if you have a Google Places API key
git add .env
git commit -m "Add: Google Places API key configuration"
git push origin main
```

### 4. Restart Server
```bash
# On your server
pm2 restart app
# or
systemctl restart ride-with-alert
# or
docker restart ride-with-alert
```

### 5. Verify Deployment
```bash
# Check server is running
curl http://localhost:5000/health

# Check logs for startup messages
tail -f /var/log/ride-with-alert.log
```

---

## Post-Deployment Testing

### Test 1: Video Upload
**Steps:**
1. Open driver dashboard
2. Trigger emergency (SOS button)
3. Wait for 10-second video recording
4. Check server logs

**Expected Result:**
```
✅ [MULTER] Video file accepted
✅ [PERFECT FLOW] 10-second video attached
```

**If Failed:**
- Check server restarted
- Check file size < 50MB
- Check browser console for errors

---

### Test 2: Facility Search
**Steps:**
1. Trigger emergency
2. Check server logs for facility search
3. Verify facilities found in manager alert

**Expected Result:**
```
🔄 [COMBINED] Total X unique facilities within 2km
```

**If Failed:**
- Check internet connection
- Check coordinates are valid
- Check logs for retry attempts

---

### Test 3: Retry Logic (Simulate Slow API)
**Steps:**
1. Trigger emergency during high server load
2. Watch server logs
3. Should see retry attempts

**Expected Result:**
```
🔄 [OPENSTREETMAP] Attempt 1/2
⏱️ [OPENSTREETMAP] Timeout on attempt 1
🔄 [OPENSTREETMAP] Attempt 2/2
✅ [OPENSTREETMAP] Successfully fetched data on attempt 2
```

**If Failed:**
- Check network latency
- Check API availability
- Check timeout values in code

---

### Test 4: Google Places (If Configured)
**Steps:**
1. Add API key to `.env`
2. Restart server
3. Trigger emergency
4. Check logs

**Expected Result:**
```
🟢 [GOOGLE PLACES] Found X facilities
```

**If Failed:**
- Check API key is correct (not placeholder)
- Check Places API enabled in Google Cloud
- Check billing enabled
- Wait 5 minutes for changes to propagate

---

## Monitoring After Deployment

### First 24 Hours
- [ ] Monitor server logs for errors
- [ ] Check emergency response times
- [ ] Verify video uploads working
- [ ] Verify facilities found

### First Week
- [ ] Monitor API error rates
- [ ] Check retry success rates
- [ ] Monitor server performance
- [ ] Check Google Places usage (if enabled)

### Ongoing
- [ ] Weekly log review
- [ ] Monthly performance report
- [ ] Quarterly cost review (Google Places)

---

## Rollback Plan

If issues occur:

### Quick Rollback
```bash
git revert HEAD
git push origin main
pm2 restart app
```

### Full Rollback
```bash
git checkout backup-YYYYMMDD-HHMMSS
git push origin main -f
pm2 restart app
```

---

## Performance Metrics

### Before Deployment
```
Video upload success rate: 0%
Facility search success rate: ~70% (timeouts)
Average response time: 5-8s
```

### After Deployment (Expected)
```
Video upload success rate: 100%
Facility search success rate: 95%+
Average response time: 8-12s (with retries)
```

---

## Troubleshooting During Deployment

### Issue: Server won't start
```bash
# Check for syntax errors
npm run build

# Check logs
pm2 logs app

# Rollback if needed
git revert HEAD
```

### Issue: Video uploads still failing
```bash
# Check multer configuration
grep -A 10 "fileFilter" server/routes.ts

# Check server restarted
pm2 restart app

# Check logs
pm2 logs app | grep MULTER
```

### Issue: Facilities not found
```bash
# Check API connectivity
curl https://overpass-api.de/api/interpreter

# Check logs for retries
pm2 logs app | grep OPENSTREETMAP

# Check coordinates
echo "Lat: 12.9716, Lon: 77.5946"
```

### Issue: Google Places not working
```bash
# Check API key in .env
grep GOOGLE_PLACES .env

# Check Places API enabled
# Go to Google Cloud Console

# Check billing enabled
# Go to Google Cloud Console

# Restart server
pm2 restart app
```

---

## Success Criteria

✅ Deployment is successful if:
1. Server starts without errors
2. Video uploads are accepted
3. Facilities are found in emergency alerts
4. No timeout errors in logs
5. Manager receives emergency alerts with sound
6. All tests pass

---

## Communication

### Notify Team
- [ ] Deployment scheduled
- [ ] Deployment in progress
- [ ] Deployment complete
- [ ] Testing results

### Notify Users (if needed)
- [ ] Emergency system improvements deployed
- [ ] Video uploads now working
- [ ] Better facility search reliability
- [ ] No action needed from users

---

## Documentation

### Update Docs
- [ ] Update README with new features
- [ ] Update API documentation
- [ ] Update troubleshooting guide
- [ ] Update deployment guide

### Archive
- [ ] Save deployment logs
- [ ] Save performance metrics
- [ ] Save error logs
- [ ] Create deployment report

---

## Sign-Off

- [ ] Code reviewed
- [ ] Tests passed
- [ ] Deployment approved
- [ ] Monitoring set up
- [ ] Documentation updated

**Deployed by:** _______________
**Date:** _______________
**Time:** _______________
**Status:** ✅ SUCCESS / ❌ FAILED

---

## Post-Deployment Notes

```
[Add any notes about deployment here]
```

---

## Next Steps

1. Monitor for 24 hours
2. Review performance metrics
3. Gather user feedback
4. Plan next improvements

---

## Related Documents

- `QUICK_FIXES_SUMMARY.md` - What was fixed
- `FIXES_QUICK_REFERENCE.md` - Quick reference
- `GOOGLE_PLACES_SETUP.md` - Google Places setup
- `EMERGENCY_ALERT_FIX.md` - Emergency alert fixes
