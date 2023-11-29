import AWS from 'aws-sdk';
import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';


const gcp_key = process.env.GCP_KEY
const bucketname = process.env.GCS_BUCKET_NAME
const mailgunkey = process.env.MAILGUN_API_KEY
const domain = process.env.MAILGUN_DOMAIN
const dynamodb_table = process.env.DYNAMODB_NAME
const decode_key = Buffer.from(gcp_key, 'base64')
const parsedKey = JSON.parse(decode_key.toString('utf-8'));
//const s3 = new AWS.S3({ region: 'us-west-1' });

const googleStorage = new Storage({
  credentials : parsedKey
});
const dynamoDB = new AWS.DynamoDB.DocumentClient();

export const handler = async (event, context) => {
  const snsMessage = JSON.parse(event.Records[0].Sns.Message);
  const urlToFetch = snsMessage.url; 
  const emailFetch = snsMessage.email;

  try {
    const response = await fetch(urlToFetch);

    if (response.ok) {
      const fileData = await response.arrayBuffer();
      const fileBuffer = Buffer.from(new Uint8Array(fileData));

      // Generating a unique file name using email and timestamp
      const timestamp = new Date().getTime(); // Get current timestamp
      const uniqueFileName = `${emailFetch}/${timestamp}_file.zip`;
      //gcp bucket
      const bucket = googleStorage.bucket(bucketname)
      const file = bucket.file(uniqueFileName)
      await file.save(fileBuffer, { contentType: 'text/plain' });      
      console.log('File uploaded to GCS');

      //const gcpPath = `${bucket}/${uniqueFileName}`

      // const authenticatedUrl = `https://storage.cloud.google.com/${bucket}/dharmathanishqnimmala%40gmail.com/file.zip`


  await sendEmailAndTrack(emailFetch, uniqueFileName,bucketname, true);
  console.log('Email sent and tracked in DynamoDB');
      // return uploadResult;
      // return uploadGoogle;
    } else {
      console.error('Failed to fetch data from the URL:', response.status);
      await sendEmailAndTrack(emailFetch, 'Unavailable',bucketname, false, response.status);
      // Handle error cases or retry logic
    }
  } catch (error) {
    console.error('Error fetching file:', error.message);
    return { statusCode: 500, body: 'Error fetching file' };
  }
};

async function sendEmailAndTrack(email, filePath, bucketName, isSuccess, errorMessage = null) {
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({ username: 'api', key: mailgunkey });

  let emailSubject = isSuccess ? 'Successful Submission' : 'Failed Submission';
  let emailText = isSuccess ? `File ${bucketName}/${filePath} Uploaded Successfully` : `Submission Failed for File path: ${bucketName}/${filePath}`;

  if (!isSuccess) {
    emailText += `\nReason: ${errorMessage}`;
  }

  await mg.messages.create(domain, {
    from: "postmaster@mynscc.me",
    to: [email],
    subject: emailSubject,
    text: emailText
  });

  // Store email information in DynamoDB for tracking
  const emailInfo = {
    TableName: dynamodb_table,
    Item: {
      UserEmail: email,
      Timestamp: new Date().toISOString(),
      status: isSuccess ? 'success' : 'failure'
    },
  };

  await dynamoDB.put(emailInfo, function(err, data){
    if(err){
      console.log("dynamo err", err)
    } else{
      console.log("Success", data)
    }
  }).promise();

  console.log(`${emailSubject} email sent and tracked in DynamoDB`);
}