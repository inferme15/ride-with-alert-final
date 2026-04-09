import sgMail from '@sendgrid/mail';
import type { Driver, Emergency, Trip, Vehicle } from '../shared/schema';
import { extractCitiesAlongRoute, generateRouteMapUrl } from './route-cities';

// Initialize SendGrid with API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDER_EMAIL?.trim() || '';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid email service initialized');
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email notifications will be skipped');
}

// Helper: send via SendGrid, swallow errors so they never crash the app
async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (!SENDGRID_API_KEY || !FROM_EMAIL) {
    console.log('📧 Email skipped - SENDGRID_API_KEY or EMAIL_USER not configured');
    return;
  }
  try {
    const [response] = await sgMail.send({ ...msg, from: FROM_EMAIL });
    console.log(`✅ Email sent to ${msg.to} | status: ${response.statusCode}`);
  } catch (err: any) {
    console.error('❌ SendGrid error:', err?.response?.body || err.message);
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
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
      console.log('📧 Email not configured - skipping email notification');
      return;
    }

    const driverEmail = driver.email?.trim();

    console.log('📧 Email config check:', {
      hasApiKey: !!SENDGRID_API_KEY,
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
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
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
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
      console.log('📧 Email not configured - skipping emergency alert');
      return;
    }

    const mapUrl = `https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`;
    const emergencyType = String(emergency.emergencyType || 'other');
    const emergencyTypeEmoji = {
      accident: '🚨',
      medical: '🏥',
      breakdown: '🔧',
      fire: '🔥',
      other: '⚠️'
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .emergency-details { background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626; }
          .location-map { text-align: center; margin: 20px 0; }
          .btn-emergency { background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
          .facilities { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .facility-item { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
          .confirmed { background: #dc2626; color: white; padding: 10px; text-align: center; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${emergencyTypeEmoji[emergencyType as keyof typeof emergencyTypeEmoji] || emergencyTypeEmoji.other} CONFIRMED REAL EMERGENCY</h1>
        </div>
        <div class="content">
          <div class="confirmed">
            ⚠️ THIS IS A CONFIRMED REAL EMERGENCY - IMMEDIATE ACTION REQUIRED ⚠️
          </div>
          
          <div class="emergency-details">
            <h2>Emergency Details</h2>
            <p><strong>Type:</strong> ${emergencyType.toUpperCase()}</p>
            <p><strong>Driver:</strong> ${driver.name} (${driver.driverNumber})</p>
            <p><strong>Phone:</strong> ${driver.phoneNumber}</p>
            <p><strong>Vehicle:</strong> ${vehicle.vehicleNumber}</p>
            <p><strong>Location:</strong> ${emergency.address || 'Location coordinates provided'}</p>
            <p><strong>Time:</strong> ${new Date(emergency.timestamp).toLocaleString()}</p>
            ${emergency.description ? `<p><strong>Description:</strong> ${emergency.description}</p>` : ''}
          </div>

          <div class="location-map">
            <h3>📍 Emergency Location</h3>
            <p><strong>Coordinates:</strong> ${emergency.latitude}, ${emergency.longitude}</p>
            <a href="${mapUrl}" class="btn-emergency" target="_blank">View Location on Map</a>
          </div>

          ${driver.medicalConditions ? `
          <div class="emergency-details">
            <h3>🏥 Medical Information</h3>
            <p><strong>Medical Conditions:</strong> ${driver.medicalConditions}</p>
            <p><strong>Blood Group:</strong> ${driver.bloodGroup || 'Not specified'}</p>
            <p><strong>Emergency Contact:</strong> ${driver.emergencyContact} - ${driver.emergencyContactPhone}</p>
          </div>
          ` : ''}

          <div class="facilities">
            <h3>🏥 Nearby Emergency Facilities</h3>
            ${nearbyFacilities.slice(0, 5).map(facility => `
              <div class="facility-item">
                <strong>${facility.name}</strong> (${facility.type.replace('_', ' ').toUpperCase()})<br>
                📍 ${facility.address}<br>
                📞 ${EmailService.normalizeFacilityPhone(facility)}<br>
                📏 Distance: ${facility.distance.toFixed(1)} km
              </div>
            `).join('')}
          </div>

          <div class="emergency-details">
            <h3>⚡ Immediate Actions Required</h3>
            <ul>
              <li>Dispatch emergency services to location immediately</li>
              <li>Contact driver at ${driver.phoneNumber}</li>
              <li>Coordinate with nearby facilities</li>
              <li>Send rescue team to coordinates</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send to configured emergency recipients only
    const testRecipients = process.env.EMERGENCY_EMAIL_RECIPIENTS?.split(',') || [FROM_EMAIL];

    for (const recipient of testRecipients) {
      console.log(`📧 Sending emergency alert to ${recipient}`);
      await sendMail({
        to: recipient.trim(),
        subject: `🚨 CONFIRMED REAL EMERGENCY - ${emergencyType.toUpperCase()} - ${driver.name}`,
        text: `EMERGENCY ALERT: ${emergencyType.toUpperCase()} - ${driver.name} at ${emergency.latitude}, ${emergency.longitude}`,
        html: htmlContent,
      });
    }
  }

  // Send emergency alert to driver's emergency contact
  static async sendEmergencyContactAlert(
    emergency: Emergency,
    driver: Driver,
    vehicle: Vehicle
  ) {
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
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
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
      console.error('❌ SendGrid not configured - missing SENDGRID_API_KEY or EMAIL_USER');
      return false;
    }
    try {
      console.log('✅ SendGrid email service is ready');
      return true;
    } catch (error) {
      console.error('❌ SendGrid service error:', error);
      return false;
    }
  }

  // Send test email
  static async sendTestEmail(recipient: string, message: string) {
    if (!SENDGRID_API_KEY || !FROM_EMAIL) {
      console.log('📧 Email not configured - skipping test email');
      return;
    }

    console.log(`📧 Sending test email to ${recipient}`);
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
            <p>This is a test email from RideWithAlert system.</p>
          </div>
        </body>
        </html>
      `,
    });
  }
}
