# RideWithAlert

A comprehensive fleet management and emergency response system with real-time GPS tracking, route safety analysis, and automated emergency alerts.

## Features

- **Real-time GPS Tracking** - Live vehicle monitoring with WebSocket updates
- **Emergency SOS System** - One-click emergency alerts with video recording
- **Route Safety Analysis** - Intelligent route scoring based on safety metrics
- **Email Notifications** - AWS SES integration for trip assignments and emergency alerts
- **Facility Detection** - Automatic nearby emergency facility identification
- **Manager Dashboard** - Fleet oversight with real-time vehicle tracking
- **Driver Dashboard** - GPS tracking, route display, and emergency controls

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + Socket.IO
- **Database**: PostgreSQL + Drizzle ORM
- **Email**: AWS SES API
- **Maps**: Google Maps + OpenStreetMap
- **Deployment**: Render

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Configure your AWS SES, database, and other settings
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

```env
# Database
DATABASE_URL="your_postgresql_connection_string"

# AWS SES (Email)
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_SES_REGION="ap-south-1"
SENDER_EMAIL="your_verified_email@domain.com"

# Emergency Settings
EMERGENCY_EMAIL_RECIPIENTS="email1@domain.com,email2@domain.com"
EMERGENCY_HELPLINE="108"
CONTROL_ROOM_PHONE="1100"

# App Settings
NODE_ENV="production"
PORT="10000"
PUBLIC_APP_URL="https://your-app-url.com"
```

## License

MIT License