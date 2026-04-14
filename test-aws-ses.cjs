// AWS SES Connection Test Script
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testAWSSES() {
  console.log('🧪 Testing AWS SES connection...');
  console.log('📧 Region:', process.env.AWS_SES_REGION);
  console.log('📧 User:', process.env.AWS_SES_USER);
  console.log('📧 Sender:', process.env.SENDER_EMAIL);
  
  if (!process.env.AWS_SES_USER || !process.env.AWS_SES_PASSWORD) {
    console.error('❌ Missing AWS SES credentials');
    return;
  }
  
  const transporter = nodemailer.createTransport({
    host: `email-smtp.${process.env.AWS_SES_REGION}.amazonaws.com`,
    port: 465, // Use port 465 (SSL) for better Render compatibility
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.AWS_SES_USER,
      pass: process.env.AWS_SES_PASSWORD,
    },
    connectionTimeout: 30000, // 30 seconds for Render
    greetingTimeout: 15000,   // 15 seconds  
    socketTimeout: 30000,     // 30 seconds
    pool: false,              // Disable pooling for Render
    debug: true,              // Enable debug
    logger: true,             // Enable logging
  });
  
  try {
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ AWS SES SMTP connection successful!');
    
    // Send test email
    console.log('📧 Sending test email...');
    const result = await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.SENDER_EMAIL, // Send to yourself first
      subject: '🧪 AWS SES Test - RideWithAlert',
      html: `
        <h2>✅ AWS SES Test Successful!</h2>
        <p>Your AWS SES configuration is working correctly.</p>
        <p><strong>Region:</strong> ${process.env.AWS_SES_REGION}</p>
        <p><strong>From:</strong> ${process.env.SENDER_EMAIL}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>Emergency notifications will now work properly!</p>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    
  } catch (error) {
    console.error('❌ AWS SES Error:', error.message);
    console.log('\n🔧 Troubleshooting Steps:');
    console.log('1. Verify sender email in AWS SES Console');
    console.log('2. Check if AWS SES is out of sandbox mode');
    console.log('3. Verify AWS credentials are correct');
    console.log('4. Check AWS SES region matches your setup');
    console.log('5. Ensure recipient email is verified (if in sandbox)');
  }
}

testAWSSES();