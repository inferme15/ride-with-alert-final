# AWS SES Setup for Render Deployment

## Environment Variables to Add to Render

Add these environment variables to your Render service:

```
AWS_SES_USER=AKIA5GOKN4HYYFTVY2U2
AWS_SES_PASSWORD=BGvzkDOEx4e5cD/Pc8PULNfEp5iYKzV+aUKqBTLkKuXO
AWS_SES_REGION=ap-south-1
SENDER_EMAIL=kitika1508@gmail.com
```

## Steps to Add to Render:

1. Go to your Render dashboard
2. Select your service (ride-with-alert)
3. Click "Environment" tab
4. Add the 4 variables above
5. Click "Save Changes"
6. Service will auto-redeploy

## Important Notes:

- **Sandbox Mode**: Currently limited to 200 emails/day, 1 email/sec
- **Verified Recipients**: Only kitika1508@gmail.com can receive emails in sandbox
- **To add more recipients**: Go to AWS SES → Identities → Add and verify their email
- **Production Access**: Request from AWS SES console (usually 24 hours approval)

## Testing:

After deployment, emails will be sent via AWS SES instead of SendGrid.

## Local Testing:

Your local `.env` already has AWS SES credentials configured.
