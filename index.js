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

      //gcp bucket
      const bucket = googleStorage.bucket(bucketname)
      const file = bucket.file(`${emailFetch}/file.zip`)
      await file.save(fileBuffer, { contentType: 'text/plain' });      
      console.log('File uploaded to GCS');
      const mailgun = new Mailgun(FormData);
      const mg = mailgun.client({username: 'api', key: mailgunkey});

      await mg.messages.create(domain, {
        from: "postmaster@mynscc.me",
        to: [emailFetch],
        subject: "Hello",
        text: `File ${urlToFetch} Uploaded Successfully`,
        html: "<h1>The file has been successfully uploaded to S3.</h1>"
      })
      .then(msg => console.log(msg)) // logs response data
  .catch(err => console.log(err)); // logs any error

  // Store email information in DynamoDB
  const emailInfo = {
    TableName: dynamodb_table, // Replace with your DynamoDB table name
    Item: {
      emailId: emailFetch, // Unique identifier for the email
      timestamp: new Date().toISOString(), // Timestamp of when the email was sent
      status: 'sent', // Initial status of the email
    },
  };

  await dynamoDB.put(emailInfo, function(err, data){
    if(err){
      console.log("dynamo err", err)
    } else{
      console.log("Success", data)
    }
  }).promise();

  console.log('Email sent and tracked in DynamoDB');
      // return uploadResult;
      // return uploadGoogle;
    } else {
      console.error('Failed to fetch data from the URL:', response.status);
      // Handle error cases or retry logic
    }
  } catch (error) {
    console.error('Error fetching file:', error.message);
    return { statusCode: 500, body: 'Error fetching file' };
  }
};




