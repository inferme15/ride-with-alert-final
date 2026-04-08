# Fast2SMS DLT Setup Guide

## Issue Fixed
Changed `route: "q"` to `route: "dlt"` in `server/utils.ts`

## Next Steps for Full DLT Compliance

### Option 1: Use DLT Route (Current Fix)
- ✅ Already implemented
- Uses `route: "dlt"`
- Should work for basic SMS

### Option 2: Register DLT Templates (Recommended)
1. Visit: https://www.fast2sms.com/dlt-registration
2. Register templates for your message formats:
   - Trip assignment messages
   - Emergency alerts
   - Trip cancellation messages

3. Once approved, you can use specific template IDs:
```javascript
const requestBody = {
  route: "q",
  message: truncatedMessage,
  numbers: formattedNumber,
  flash: "0",
  template_id: "YOUR_TEMPLATE_ID" // Add this after DLT approval
};
```

### Option 3: Use OTP Route (Alternative)
If DLT route still fails, try:
```javascript
const requestBody = {
  route: "otp",
  message: truncatedMessage,
  numbers: formattedNumber,
  flash: "0"
};
```

## Testing
1. Restart your server
2. Create a new trip
3. Check console for SMS success/failure messages

## Troubleshooting
- If still failing, check Fast2SMS dashboard for account status
- Ensure sufficient balance in Fast2SMS account
- Verify phone numbers are in correct format (10 digits)