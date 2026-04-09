import dns from 'node:dns';
import nodemailer from 'nodemailer';
import type { Driver, Emergency, Trip, Vehicle } from '../shared/schema';
import { extractCitiesAlongRoute, generateRouteMapUrl } from './route-cities';

// Render and many hosts have no working IPv6 route to Gmail; Node may still try AAAA first in some paths.
// Prefer IPv4 for all DNS lookups in this process (Node 17+).
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// QUICK FIX: Use correct nodemailer import with debug logging
const emailUser = process.env.EMAIL_USER?.trim().replace(/\\n/g, '').replace(/\n/g, '');
const emailPass = process.env.EMAIL_APP_PASSWORD?.trim().replace(/\\n/g, '').replace(/\n/g, '');

const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const useImplicitSsl = smtpPort === 465;

console.log('🔍 Email Debug Info:', {
  hasEmailUser: !!emailUser,
  emailUserLength: emailUser?.length,
  hasEmailPass: !!emailPass,
  emailPassLength: emailPass?.length,
  emailUserSample: emailUser?.substring(0, 10) + '...',
  emailPassSample: emailPass?.substring(0, 4) + '...',
  smtpHost,
  smtpPort,
  useImplicitSsl,
});

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: useImplicitSsl,
  requireTLS: !useImplicitSsl,
  
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  connectionTimeout: 60_000,
  greetingTimeout: 30_000,
  socketTimeout: 60_000,
  tls: {
    minVersion: 'TLSv1.2',
    servername: smtpHost,
    family: 4, 
  },
  debug: process.env.SMTP_DEBUG === 'true',
  logger: process.env.SMTP_DEBUG === 'true',
});

// Test connection on startup with detailed error info
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email service connection failed:', error);
    console.error('🔧 Error details:', {
      code: (error as any).code,
      command: (error as any).command,
      response: (error as any).response,
      responseCode: (error as any).responseCode
    });
  } else {
    console.log('✅ Email service is ready to send emails');
  }
});

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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.log('📧 Email not configured - skipping email notification');
      return;
    }

    const emailUser = process.env.EMAIL_USER?.trim().replace(/\\n/g, '');
    const driverEmail = driver.email?.trim();

    console.log('📧 Email config check:', {
      emailUser: emailUser,
      hasPassword: !!process.env.EMAIL_APP_PASSWORD,
      driverEmail: driverEmail,
      emailUserRaw: process.env.EMAIL_USER
    });

    // Validate email addresses
    if (!emailUser || !driverEmail) {
      console.error('❌ Invalid email configuration:', { emailUser, driverEmail });
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

    const mailOptions = {
      from: emailUser,
      to: driverEmail,
      subject: `🚛 Trip Assignment - ${trip.tripId}`,
      text: textBody,
      html: htmlContent,
    };

    console.log('📧 Attempting to send email to:', driverEmail);
    console.log('📧 From address:', emailUser);
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Trip assignment email sent successfully:', result.messageId);
  }

  // Send trip cancellation email
  static async sendTripCancellation(
    driver: Driver,
    trip: Trip,
    vehicle: Vehicle
  ) {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
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

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: driver.email,
      subject: `🚫 Trip Cancelled - ${trip.tripId}`,
      text: textBody,
      html: htmlContent,
    };

    try {
      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Trip cancellation email sent successfully:', result.messageId);
    } catch (error) {
      console.error('❌ Error sending trip cancellation email:', error);
      throw error;
    }
  }

  // Send emergency alert to police and hospitals (only for real emergencies)
  static async sendRealEmergencyAlert(
    emergency: Emergency,
    driver: Driver,
    vehicle: Vehicle,
    nearbyFacilities: any[]
  ) {
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
    const testRecipients = process.env.EMERGENCY_EMAIL_RECIPIENTS?.split(',') || [process.env.EMAIL_USER];

    for (const recipient of testRecipients) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: `🚨 CONFIRMED REAL EMERGENCY - ${emergencyType.toUpperCase()} - ${driver.name}`,
        html: htmlContent,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Real emergency alert sent to ${recipient}`);
      } catch (error) {
        console.error(`Error sending real emergency alert to ${recipient}:`, error);
      }
    }
  }

  // Send emergency alert to driver's emergency contact
  static async sendEmergencyContactAlert(
    emergency: Emergency,
    driver: Driver,
    vehicle: Vehicle
  ) {
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
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: driver.email, // Replace with actual emergency contact email
      subject: `🚨 Emergency Alert - ${driver.name}`,
      html: htmlContent,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Emergency contact alert sent for ${driver.name}`);
    } catch (error) {
      console.error('Error sending emergency contact alert:', error);
    }
  }

  // Test email configuration
  static async testConnection() {
    try {
      await transporter.verify();
      console.log('Email service is ready');
      return true;
    } catch (error) {
      console.error('Email service error:', error);
      return false;
    }
  }

  // Send test email
  static async sendTestEmail(recipient: string, message: string) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient,
      subject: '🧪 RideWithAlert - Test Email',
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
    };

    try {
      const result = await transporter.sendMail(mailOptions);
      console.log(`Test email sent to ${recipient}:`, result.messageId);
    } catch (error) {
      console.error(`Error sending test email to ${recipient}:`, error);
      throw error;
    }
  }
}