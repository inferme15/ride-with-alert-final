// AWS SES API Test Script
require('dotenv').config();
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

async function testAWSSESAPI() {
  console.log('🧪 Testing AWS SES API connection...');
  console.log('📧 Region:', process.env.AWS_SES_REGION);
  console.log('📧 User:', process.env.AWS_ACCESS_KEY_ID);
  console.log('📧 Sender:', process.env.SENDER_EMAIL);
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Missing AWS SES credentials');
    return;
  }
  
  const sesClient = new SESClient({
    region: process.env.AWS_SES_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  try {
    console.log('📧 Sending test email via AWS SES API...');
    
    const command = new SendEmailCommand({
      Source: process.env.SENDER_EMAIL,
      Destination: {
        ToAddresses: [process.env.SENDER_EMAIL], // Send to yourself
      },
      Message: {
        Subject: {
          Data: '🧪 AWS SES API Test - RideWithAlert',
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `✅ AWS SES API Test Successful!

Your AWS SES API configuration is working correctly.

Region: ${process.env.AWS_SES_REGION}
From: ${process.env.SENDER_EMAIL}
Time: ${new Date().toLocaleString()}

This means emails will work properly on Render!
No more SMTP timeout issues.`,
            Charset: 'UTF-8',
          },
          Html: {
            Data: `
              <h2>✅ AWS SES API Test Successful!</h2>
              <p>Your AWS SES API configuration is working correctly.</p>
              <p><strong>Region:</strong> ${process.env.AWS_SES_REGION}</p>
              <p><strong>From:</strong> ${process.env.SENDER_EMAIL}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p>This means emails will work properly on Render!<br>
              No more SMTP timeout issues.</p>
            `,
            Charset: 'UTF-8',
          },
        },
      },
    });
    
    const response = await sesClient.send(command);
    console.log('✅ Test email sent successfully via AWS SES API!');
    console.log('📧 Message ID:', response.MessageId);
    console.log('📧 Request ID:', response.$metadata.requestId);
    
  } catch (error) {
    console.error('❌ AWS SES API Error:', error.message);
    console.log('\n🔧 Troubleshooting Steps:');
    console.log('1. Verify sender email in AWS SES Console');
    console.log('2. Check if AWS SES is out of sandbox mode');
    console.log('3. Verify AWS credentials are correct');
    console.log('4. Check AWS SES region matches your setup');
    console.log('5. Ensure recipient email is verified (if in sandbox)');
    
    if (error.Code) {
      console.log(`\n❌ Error Code: ${error.Code}`);
    }
    if (error.$metadata?.requestId) {
      console.log(`📧 Request ID: ${error.$metadata.requestId}`);
    }
  }
}

testAWSSESAPI();