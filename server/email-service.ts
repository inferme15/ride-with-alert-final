import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { Driver, Emergency, Trip, Vehicle } from '../shared/schema';
import { extractCitiesAlongRoute, generateRouteMapUrl } from './route-cities';

// Initialize AWS SES with API credentials (more reliable than SMTP for Render)
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SES_REGION = process.env.AWS_SES_REGION || 'ap-south-1';
const FROM_EMAIL = process.env.SENDER_EMAIL?.trim() || 'kitika1508@gmail.com';

let sesClient: SESClient | null = null;
let emailProvider = 'none';

// Initialize AWS SES API client
if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  try {
    sesClient = new SESClient({
      region: AWS_SES_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
    emailProvider = 'aws-ses-api';
    console.log('✅ AWS SES API service initialized');
    console.log(`📧 Provider: AWS SES API, Region: ${AWS_SES_REGION}, Sender: ${FROM_EMAIL}`);
  } catch (error) {
    console.error('❌ AWS SES API setup failed:', error);
    sesClient = null;
  }
} else {
  console.warn('⚠️ AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not set - email notifications will be skipped');
}

// Helper: send via AWS SES API
async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (!sesClient) {
    console.log('📧 Email skipped - AWS SES API not configured');
    return;
  }

  console.log(`📧 Attempting to send email to ${msg.to} using ${emailProvider}...`);

  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [msg.to],
      },
      Message: {
        Subject: {
          Data: msg.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: msg.text,
            Charset: 'UTF-8',
          },
          Html: {
            Data: msg.html,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const response = await sesClient.send(command);
    console.log(`✅ Email sent via AWS SES API to ${msg.to} | messageId: ${response.MessageId}`);
  } catch (err: any) {
    console.error('❌ AWS SES API error:', err?.message || err);
    console.error('❌ API Error details:', {
      code: err?.Code || err?.code,
      message: err?.Message || err?.message,
      requestId: err?.$metadata?.requestId
    });
    
    // Log specific API errors
    if (err?.Code === 'MessageRejected') {
      console.error('📧 Email rejected - check sender/recipient verification in AWS SES');
    }
    if (err?.Code === 'SendingPausedException') {
      console.error('📧 Sending paused - check AWS SES account status');
    }
    if (err?.Code === 'MailFromDomainNotVerifiedException') {
      console.error('📧 Domain not verified - verify sender domain in AWS SES');
    }
    
    throw err;
  }
}

// Email templates
export class EmailService {
  // Minimal facility shape accepted by email templates (compatible with server/utils).
  private static normalizeFacilityPhone(f: any) {
    return f?.phoneNumber || f?.phone || 'N/A';
  }

  private static getPublicBaseUrl() {
    return (
      process.env.PUBLIC_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      'http://localhost:10000'
    );
  }

  private static formatIST(date: Date) {
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  private static kmFromMeters(meters?: number) {
    if (!meters || Number.isNaN(Number(meters))) return null;
    return (Number(meters) / 1000).toFixed(1);
  }

  private static minsFromSeconds(seconds?: number) {
    if (!seconds || Number.isNaN(Number(seconds))) return null;
    return Math.max(1, Math.round(Number(seconds) / 60));
  }

  private static async getRouteViaLines(routeData: any): Promise<string[]> {
    // Expecting routeData.geometry (GeoJSON LineString) OR routeData.points/coordinates.
    const geometry: GeoJSON.LineString | undefined =
      routeData?.geometry?.type === 'LineString'
        ? routeData.geometry
        : Array.isArray(routeData?.geometry?.coordinates)
          ? { type: 'LineString', coordinates: routeData.geometry.coordinates }
          : Array.isArray(routeData?.points)
            ? { type: 'LineString', coordinates: routeData.points }
            : Array.isArray(routeData?.coordinates)
              ? { type: 'LineString', coordinates: routeData.coordinates }
              : undefined;

    if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return [];

    // Best-effort city extraction (avoid blocking email too long).
    const timeoutMs = 3000;
    const cities = await Promise.race([
      extractCitiesAlongRoute(geometry, 5).catch(() => []),
      new Promise<[]>(resolve => setTimeout(() => resolve([]), timeoutMs)),
    ]);

    if (!Array.isArray(cities) || cities.length === 0) return [];
    return cities.slice(0, 5).map((c: any, idx: number) => {
      const dist = typeof c.distanceFromStart === 'number' && c.distanceFromStart > 0 ? ` (${c.distanceFromStart}km)` : '';
      return `${idx + 1}. ${c.name}${dist}`;
    });
  }

  private static buildTripAssignedText(args: {
    driver: Driver;
    trip: Trip;
    vehicle: Vehicle;
    routeData?: any;
    routeViaLines?: string[];
  }) {
    const { driver, trip, vehicle, routeData, routeViaLines } = args;

    const baseUrl = this.getPublicBaseUrl();
    const mapUrl =
      routeData?.geometry?.type === 'LineString'
        ? generateRouteMapUrl(routeData.geometry, routeData?.dangerZones || [], Boolean(routeData?.isRecommended))
        : (trip.startLatitude && trip.startLongitude && trip.endLatitude && trip.endLongitude)
          ? `https://www.google.com/maps/dir/${trip.startLatitude},${trip.startLongitude}/${trip.endLatitude},${trip.endLongitude}`
          : '';

    const distanceKm =
      this.kmFromMeters(routeData?.distance) ||
      (typeof routeData?.distance === 'number' ? String(routeData.distance) : null);
    const etaMin =
      this.minsFromSeconds(routeData?.estimatedTime) ||
      (typeof routeData?.estimatedTime === 'number' ? String(routeData.estimatedTime) : null);

    const safetyScore =
      routeData?.safetyMetrics?.overallSafetyScore ??
      routeData?.safetyScore ??
      (trip as any)?.safetyMetrics?.overallSafetyScore ??
      null;

    const dangerZonesCount =
      Array.isArray(routeData?.dangerZones) ? routeData.dangerZones.length : (Array.isArray((trip as any)?.dangerZones) ? (trip as any).dangerZones.length : 0);

    const lines: string[] = [];
    lines.push('RIDE WITH ALERT - TRIP ASSIGNED');
    lines.push('');
    lines.push(`Hello ${driver.name},`);
    lines.push('');
    lines.push('A new trip has been assigned to you.');
    lines.push('');
    lines.push('# *Trip Assignment*');
    lines.push('');
    lines.push(`*Vehicle :* ${vehicle.vehicleNumber} (${vehicle.vehicleType})`);
    lines.push(`*Driver :* ${driver.name} (${driver.driverNumber})`);
    lines.push('');
    lines.push('*Route :*');
    lines.push(`From: ${trip.startLocation || 'Start Location'}`);
    lines.push(`To: ${trip.endLocation || 'Destination'}`);
    lines.push('');

    if (routeViaLines && routeViaLines.length > 0) {
      lines.push('*Route via :*');
      lines.push(...routeViaLines);
      lines.push('');
    }

    lines.push('*Route Analysis :*');
    lines.push(routeData?.isUserSelected ? 'User-Selected Route' : 'Assigned Route');
    if (safetyScore !== null && safetyScore !== undefined) lines.push(`Safety Score: ${Math.round(Number(safetyScore))}/100`);
    lines.push(`Danger Zones: ${dangerZonesCount}`);
    if (distanceKm) lines.push(`Distance: ${distanceKm} km`);
    if (etaMin) lines.push(`Est. Time: ${etaMin} min`);
    lines.push('');

    if (mapUrl) {
      lines.push('*View Route on Map :*');
      lines.push(mapUrl);
      lines.push('');
    }

    lines.push('*Login Credentials :*');
    lines.push(`Username: ${trip.temporaryUsername}`);
    lines.push(`Password: ${trip.temporaryPassword}`);
    lines.push('');
    lines.push(`Login at: ${baseUrl}/login/driver`);
    lines.push('');
    lines.push('Safety Details');
    lines.push(`- Safety Score: ${safetyScore !== null && safetyScore !== undefined ? `${Math.round(Number(safetyScore))}/100` : 'N/A'}`);
    lines.push(`- Emergency Helplines: Police 100 | Medical ${process.env.EMERGENCY_HELPLINE || '108'} | Fire 101`);
    lines.push(`- Control Room: ${process.env.CONTROL_ROOM_PHONE || 'N/A'}`);
    lines.push('');
    lines.push('Important');
    lines.push('- Start only after pre-check.');
    lines.push('- Keep GPS and camera active.');
    lines.push('- Use SOS only for real emergency.');
    lines.push('');
    lines.push('Regards,');
    lines.push('Ride With Alert Control Room');
    lines.push('');

    return lines.join('\n');
  }

  private static buildTripCancelledText(args: {
    driver: Driver;
    trip: Trip;
    vehicle: Vehicle;
  }) {
    const { driver, trip, vehicle } = args;
    const baseUrl = this.getPublicBaseUrl();

    const lines: string[] = [];
    lines.push('RIDE WITH ALERT - TRIP CANCELLED');
    lines.push('');
    lines.push(`Hello ${driver.name},`);
    lines.push('');
    lines.push('Your assigned trip has been cancelled.');
    lines.push('');
    lines.push('# *Trip Cancellation*');
    lines.push('');
    lines.push(`*Trip ID :* ${trip.tripId}`);
    lines.push(`*Driver :* ${driver.name} (${driver.driverNumber})`);
    lines.push(`*Vehicle :* ${vehicle.vehicleNumber} (${vehicle.vehicleType})`);
    lines.push('');
    lines.push('*Route :*');
    lines.push(`From: ${trip.startLocation || 'Start Location'}`);
    lines.push(`To: ${trip.endLocation || 'Destination'}`);
    lines.push('');
    lines.push(`*Cancelled At :* ${this.formatIST(new Date())}`);
    lines.push('');
    lines.push('Important');
    lines.push('- Do not start the trip.');
    lines.push('- Wait for the next assignment from Control Room.');
    lines.push('');
    lines.push(`Login at: ${baseUrl}/login/driver`);
    lines.push('');
    lines.push('Regards,');
    lines.push('Ride With Alert Control Room');
    lines.push('');

    return lines.join('\n');
  }
  
  // Send trip assignment email with route details
  static async sendTripAssignment(
    driver: Driver,
    trip: Trip,
    vehicle: Vehicle,
    routeData?: any
  ) {
    // Check if email is configured
    if (!sesClient) {
      console.log('📧 Email not configured - skipping email notification');
      return;
    }

    const driverEmail = driver.email?.trim();

    console.log('📧 Email config check:', {
      hasAPI: !!sesClient,
      provider: emailProvider,
      fromEmail: FROM_EMAIL,
      driverEmail: driverEmail,
    });

    // Validate email addresses
    if (!driverEmail) {
      console.error('❌ Invalid email configuration:', { driverEmail });
      return;
    }

    const routeViaLines = await EmailService.getRouteViaLines(routeData);
    const textBody = EmailService.buildTripAssignedText({ driver, trip, vehicle, routeData, routeViaLines });
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #ffffff; color: #111827; padding: 16px;">
          <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.5; margin: 0;">${textBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
      </html>
    `;

    console.log('📧 Attempting to send trip assignment email to:', driverEmail);
    await sendMail({
      to: driverEmail,
      subject: `🚛 Trip Assignment - ${trip.tripId}`,
      text: textBody,
      html: htmlContent,
    });
  }

  // Send trip cancellation email
  static async sendTripCancellation(
    driver: Driver,
    trip: Trip,
    vehicle: Vehicle
  ) {
    // Check if email is configured
    if (!sesClient) {
      console.log('📧 Email not configured - skipping trip cancellation email');
      return;
    }

    const textBody = EmailService.buildTripCancelledText({ driver, trip, vehicle });
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #ffffff; color: #111827; padding: 16px;">
          <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.5; margin: 0;">${textBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
      </html>
    `;

    console.log('📧 Attempting to send trip cancellation email to:', driver.email);
    await sendMail({
      to: driver.email,
      subject: `🚫 Trip Cancelled - ${trip.tripId}`,
      text: textBody,
      html: htmlContent,
    });
  }

  // Send emergency alert to police and hospitals (only for real emergencies)
  static async sendRealEmergencyAlert(
    emergency: Emergency,
    driver: Driver,
    vehicle: Vehicle,
    nearbyFacilities: any[]
  ) {
    if (!sesClient) {
      console.log('📧 Email not configured - skipping emergency alert');
      return;
    }

    const mapUrl = `https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`;
    const emergencyType = String(emergency.emergencyType || 'other');

    // Build plain text email
    const textLines: string[] = [];
    textLines.push('⚠️ ⚠️ ⚠️ CONFIRMED REAL EMERGENCY - IMMEDIATE ACTION REQUIRED ⚠️ ⚠️ ⚠️');
    textLines.push('');
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('EMERGENCY DETAILS');
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('');
    textLines.push(`Emergency Type: ${emergencyType.toUpperCase()}`);
    textLines.push(`Driver Name: ${driver.name}`);
    textLines.push(`Driver Number: ${driver.driverNumber}`);
    textLines.push(`Driver Phone: ${driver.phoneNumber}`);
    textLines.push(`Vehicle Number: ${vehicle.vehicleNumber}`);
    textLines.push(`Vehicle Type: ${vehicle.vehicleType}`);
    textLines.push(`Location: ${emergency.address || 'Location coordinates provided'}`);
    textLines.push(`Coordinates: ${emergency.latitude}, ${emergency.longitude}`);
    textLines.push(`Time: ${new Date(emergency.timestamp).toLocaleString()}`);
    if (emergency.description) {
      textLines.push(`Description: ${emergency.description}`);
    }
    textLines.push('');
    
    // Medical Information
    if (driver.medicalConditions) {
      textLines.push('═══════════════════════════════════════════════════════════════');
      textLines.push('MEDICAL INFORMATION');
      textLines.push('═══════════════════════════════════════════════════════════════');
      textLines.push('');
      textLines.push(`Medical Conditions: ${driver.medicalConditions}`);
      textLines.push(`Blood Group: ${driver.bloodGroup || 'Not specified'}`);
      textLines.push(`Emergency Contact: ${driver.emergencyContact}`);
      textLines.push(`Emergency Contact Phone: ${driver.emergencyContactPhone}`);
      textLines.push('');
    }

    // Emergency Location
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('EMERGENCY LOCATION');
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('');
    textLines.push(`Latitude: ${emergency.latitude}`);
    textLines.push(`Longitude: ${emergency.longitude}`);
    textLines.push(`Map Link: ${mapUrl}`);
    textLines.push('');

    // Nearby Facilities
    if (nearbyFacilities && nearbyFacilities.length > 0) {
      textLines.push('═══════════════════════════════════════════════════════════════');
      textLines.push('NEARBY EMERGENCY FACILITIES');
      textLines.push('═══════════════════════════════════════════════════════════════');
      textLines.push('');
      nearbyFacilities.slice(0, 10).forEach((facility, index) => {
        textLines.push(`${index + 1}. ${facility.name}`);
        textLines.push(`   Type: ${facility.type.replace('_', ' ').toUpperCase()}`);
        textLines.push(`   Address: ${facility.address}`);
        textLines.push(`   Phone: ${EmailService.normalizeFacilityPhone(facility)}`);
        textLines.push(`   Distance: ${facility.distance.toFixed(1)} km`);
        textLines.push('');
      });
    }

    // Immediate Actions
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('IMMEDIATE ACTIONS REQUIRED');
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('');
    textLines.push('1. DISPATCH emergency services to location immediately');
    textLines.push(`2. CONTACT driver at ${driver.phoneNumber}`);
    textLines.push('3. COORDINATE with nearby facilities');
    textLines.push('4. SEND rescue team to coordinates');
    textLines.push('5. MONITOR situation and provide updates');
    textLines.push('');
    textLines.push('═══════════════════════════════════════════════════════════════');
    textLines.push('');
    textLines.push('This is an automated emergency alert from Ride With Alert System');
    textLines.push('');

    const textContent = textLines.join('\n');

    // Send to configured emergency recipients only
    const testRecipients = process.env.EMERGENCY_EMAIL_RECIPIENTS?.split(',') || [FROM_EMAIL];

    for (const recipient of testRecipients) {
      console.log(`📧 Sending emergency alert to ${recipient}`);
      await sendMail({
        to: recipient.trim(),
        subject: `🚨 CONFIRMED REAL EMERGENCY - ${emergencyType.toUpperCase()} - ${driver.name}`,
        text: textContent,
        html: `<pre style="font-family: monospace; white-space: pre-wrap; word-wrap: break-word;">${textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
      });
    }
  }

  // Send emergency alert to driver's emergency contact
  static async sendEmergencyContactAlert(
    emergency: Emergency,
    driver: Driver,
    vehicle: Vehicle
  ) {
    if (!sesClient) {
      console.log('📧 Email not configured - skipping emergency contact alert');
      return;
    }

    if (!driver.emergencyContact || !driver.emergencyContactPhone) return;

    const mapUrl = `https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`;
    const emergencyType = String(emergency.emergencyType || 'other');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .alert-box { background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚨 Emergency Alert - ${driver.name}</h1>
        </div>
        <div class="content">
          <p>Dear ${driver.emergencyContact},</p>
          
          <div class="alert-box">
            <p>This is an emergency notification regarding <strong>${driver.name}</strong>.</p>
            <p><strong>Emergency Type:</strong> ${emergencyType.toUpperCase()}</p>
            <p><strong>Location:</strong> ${emergency.address || 'See map link below'}</p>
            <p><strong>Time:</strong> ${new Date(emergency.timestamp).toLocaleString()}</p>
            <p><strong>Vehicle:</strong> ${vehicle.vehicleNumber}</p>
          </div>

          <p><a href="${mapUrl}" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Location</a></p>
          
          <p>Emergency services have been notified. Please contact the driver at ${driver.phoneNumber} if possible.</p>
          
          <p>Fleet Management Team</p>
        </div>
      </body>
      </html>
    `;

    // For demo, we'll use the driver's email as emergency contact email
    // In real implementation, you'd have emergency contact email in the schema
    console.log(`📧 Sending emergency contact alert to ${driver.email}`);
    await sendMail({
      to: driver.email,
      subject: `🚨 Emergency Alert - ${driver.name}`,
      text: `Emergency alert for ${driver.name}: ${emergencyType.toUpperCase()}`,
      html: htmlContent,
    });
  }

  // Test email configuration
  static async testConnection() {
    if (sesClient) {
      console.log('✅ AWS SES API service is ready');
      return true;
    }
    console.error('❌ No email service configured');
    return false;
  }

  // Send test email
  static async sendTestEmail(recipient: string, message: string) {
    if (!sesClient) {
      console.log('📧 Email not configured - skipping test email');
      return;
    }

    console.log(`📧 Sending test email to ${recipient} using ${emailProvider}`);
    await sendMail({
      to: recipient,
      subject: '🧪 RideWithAlert - Test Email',
      text: message,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .test-box { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2563eb; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🧪 Test Email</h1>
          </div>
          <div class="content">
            <div class="test-box">
              <pre>${message}</pre>
            </div>
            <p>This is a test email from RideWithAlert system using ${emailProvider}.</p>
          </div>
        </body>
        </html>
      `,
    });
  }
}