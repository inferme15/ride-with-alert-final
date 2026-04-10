# Environment Variables Setup

## Local Development (.env)

```
CONTROL_ROOM_PHONE=1100
DATABASE_URL=postgresql://neondb_owner:npg_gf1jNrev4kGD@ep-nameless-art-a13tfhrg.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
SENDER_EMAIL=kitika1508@gmail.com
AWS_SES_USER=AKIA5GOKN4HYYFTVY2U2
AWS_SES_PASSWORD=BGvzkDOEx4e5cD/Pc8PULNfEp5iYKzV+aUKqBTLkKuXO
AWS_SES_REGION=ap-south-1
EMERGENCY_EMAIL_RECIPIENTS=drspk15@gmail.com,drspk15@gmail.com
EMERGENCY_HELPLINE=108
NODE_ENV=production
PORT=10000
PUBLIC_APP_URL=https://ride-with-alert-final.onrender.com
GOOGLE_PLACES_API_KEY=AIzaSyD-AyFRTPsZmgw6NgBRqMoRgL0PY34b0Jc
```

## Render Deployment Environment Variables

Add these to your Render service:

| Key | Value |
|-----|-------|
| `AWS_SES_PASSWORD` | `BGvzkDOEx4e5cD/Pc8PULNfEp5iYKzV+aUKqBTLkKuXO` |
| `AWS_SES_REGION` | `ap-south-1` |
| `AWS_SES_USER` | `AKIA5GOKN4HYYFTVY2U2` |
| `CONTROL_ROOM_PHONE` | `1100` |
| `DATABASE_URL` | `postgresql://neondb_owner:npg_gf1jNrev4kGD@ep-nameless-art-a13tfhrg.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `EMERGENCY_EMAIL_RECIPIENTS` | `drspk15@gmail.com,drspk15@gmail.com` |
| `EMERGENCY_HELPLINE` | `108` |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `PUBLIC_APP_URL` | `https://ride-with-alert-final.onrender.com` |
| `SENDER_EMAIL` | `kitika1508@gmail.com` |

## Steps to Add to Render:

1. Go to https://dashboard.render.com
2. Select your service (ride-with-alert-final)
3. Click "Environment" tab
4. Add each variable from the table above
5. Click "Save Changes"
6. Service will auto-redeploy

## Important Notes:

- **AWS SES**: Using sandbox mode (200 emails/day limit)
- **Email From**: kitika1508@gmail.com (verified in AWS SES)
- **Public URL**: Emails now link to https://ride-with-alert-final.onrender.com
- **Database**: Connected to Neon PostgreSQL
- **Facility Search**: Using OpenStreetMap API (no API key needed)

## Email Service:

- Replaced SendGrid with AWS SES
- Using SMTP connection to `email-smtp.ap-south-1.amazonaws.com:587`
- All email templates working with AWS SES
