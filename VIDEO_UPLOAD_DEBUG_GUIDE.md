# Video Upload Debugging Guide

## Testing the Live Deployment: https://ride-with-alert.onrender.com

### Enhanced Debugging Added

I've added comprehensive debugging throughout the video upload pipeline:

#### 1. Frontend (Driver Dashboard)
- **Video Recording Validation**: Tests if recorded video blob is valid and playable
- **Camera State Debugging**: Logs camera readiness, errors, and stream status
- **FormData Logging**: Shows exactly what data is being sent to server
- **Enhanced Error Messages**: More detailed error reporting for video issues

#### 2. Backend (Server Routes)
- **File Upload Debugging**: Logs all received files with size, type, and path info
- **FormData Processing**: Shows all form fields received from client
- **Video URL Generation**: Logs video file paths and accessibility
- **Socket Emission Tracking**: Detailed logging of data sent to manager

#### 3. Manager Dashboard (Emergency Alert)
- **Video Display Debugging**: Logs video loading, errors, and metadata
- **URL Resolution**: Shows how video URLs are constructed and accessed
- **Playback Status**: Tracks video loading states and errors

### Testing Steps

#### Step 1: Test Driver Login and GPS
1. Go to https://ride-with-alert.onrender.com
2. Click "I am a Driver"
3. Login with any driver credentials (e.g., D001, D002, etc.)
4. **Check Browser Console** for GPS and camera initialization logs
5. Look for these log messages:
   - `🌍 [REAL GPS] Starting real GPS tracking...`
   - `📷 [CAMERA] Initializing camera for emergency recording...`
   - `✅ [CAMERA] Camera ready for emergency recording`

#### Step 2: Test Manager Dashboard Setup
1. Open a new browser tab/window
2. Go to https://ride-with-alert.onrender.com
3. Click "I am a Fleet Manager"  
4. Login with manager credentials (M001, etc.)
5. Keep this tab open to receive emergency alerts

#### Step 3: Test SOS Button (Critical Test)
1. **In Driver Tab**: Press the red SOS Emergency button
2. **Allow camera permissions** when prompted
3. **Check Browser Console** for detailed logs:

**Expected Driver Console Logs:**
```
🚨 Emergency button clicked - starting IMMEDIATE video recording
🎥 [EMERGENCY] Starting immediate video recording...
🎬 [VIDEO] Initializing MediaRecorder...
✅ [VIDEO] Using codec: video/webm;codecs=vp9,opus
▶️ [VIDEO] Recording started successfully
🛑 [VIDEO] Recording stopped, total chunks: X
✅ [VIDEO] Final video blob created: XXXX bytes
🎥 [DEBUG] Video blob URL created for testing: blob:...
✅ [DEBUG] Video blob is valid and playable
📊 [DEBUG] Video dimensions: 1280 x 720
⏱️ [DEBUG] Video duration: 10.xxx seconds
🚀 [EMERGENCY HOOK] Sending emergency request...
📋 [EMERGENCY HOOK] FormData contents:
  video: File(emergency-capture.webm, XXXX bytes, video/webm)
  driverNumber: DXXX
  vehicleNumber: VXXX
  ...
✅ [EMERGENCY HOOK] Success response: {...}
```

**Expected Server Logs (Check Render Dashboard):**
```
[EMERGENCY TRIGGER - HIGH PRIORITY] Driver: DXXX, Vehicle: VXXX
[EMERGENCY DEBUG] File received: {filename: emergency-xxx.webm, size: XXXX, ...}
[EMERGENCY DEBUG] Video URL processing: {hasFile: true, videoUrl: /uploads/emergency-xxx.webm, ...}
[SOCKET EMIT - IMMEDIATE] Emergency sent to MANAGER
```

#### Step 4: Test Manager Video Reception
1. **In Manager Tab**: Look for emergency popup
2. **Check Browser Console** for video loading logs:

**Expected Manager Console Logs:**
```
📺 [VIDEO DISPLAY] Video loading started
✅ [VIDEO DISPLAY] Video data loaded successfully
▶️ [VIDEO DISPLAY] Video can play
📊 [VIDEO DISPLAY] Video metadata loaded: {duration: 10.xxx, videoWidth: 1280, videoHeight: 720}
```

### Common Issues and Solutions

#### Issue 1: No Video Recorded
**Symptoms**: Console shows "No video recorded, sending alert without video"
**Debug**: Look for these logs:
- `❌ [VIDEO] Camera stream not available or inactive`
- `❌ [VIDEO] No video tracks available`
- `❌ [CAMERA] Failed to initialize camera`

**Solutions**:
- Ensure camera permissions are granted
- Try refreshing the page and allowing camera access
- Check if camera is being used by another application

#### Issue 2: Video Not Reaching Manager
**Symptoms**: Manager receives emergency but no video shows
**Debug**: Check server logs for:
- `[EMERGENCY DEBUG] File received: No file received`
- `[EMERGENCY DEBUG] Video URL processing: {hasFile: false}`

**Solutions**:
- Check if video blob was created successfully in driver console
- Verify FormData contains video file in emergency hook logs
- Check network tab for failed upload requests

#### Issue 3: Video Won't Play in Manager
**Symptoms**: Video element shows but won't play
**Debug**: Look for manager console errors:
- `❌ [VIDEO DISPLAY] Video playback error`
- Network 404 errors for video file

**Solutions**:
- Check if video file exists on server
- Verify video URL construction in logs
- Test video URL directly in browser

### Manual Testing Checklist

- [ ] Driver GPS tracking works
- [ ] Camera initializes successfully  
- [ ] SOS button records 10-second video
- [ ] Video blob is valid and playable
- [ ] FormData includes video file
- [ ] Server receives video file
- [ ] Emergency alert reaches manager
- [ ] Video displays and plays in manager dashboard
- [ ] Nearby facilities are fetched correctly

### Debug Log Analysis

After testing, analyze the logs to identify where the video upload pipeline fails:

1. **Video Recording Stage**: Check driver console for video blob creation
2. **Upload Stage**: Check network tab and emergency hook logs
3. **Server Processing**: Check Render server logs for file reception
4. **Manager Display**: Check manager console for video loading

### Next Steps Based on Results

Based on the test results, we can:
1. **Fix video recording issues** if blobs aren't created
2. **Fix upload issues** if files aren't reaching server
3. **Fix server processing** if files aren't stored correctly
4. **Fix display issues** if videos aren't playing in manager

The enhanced debugging will pinpoint exactly where the issue occurs in the video upload pipeline.