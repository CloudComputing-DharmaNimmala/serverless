import AWS from 'aws-sdk';
import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const gcp_key = process.env.gcpkey
const parsedKey = JSON.parse(gcp_key);
// const s3 = new AWS.S3({ region: 'us-west-1' });
const googleStorage = new Storage({
  credentials : parsedKey
});

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
      const bucket = googleStorage.bucket('nimmalabucket1')
      const file = bucket.file('file.zip')
      await file.save(fileBuffer, { contentType: 'text/plain' });      
      console.log('File uploaded to GCS');
      //s3 bucket
      // const params = {
      //   Bucket: 'nimmalabucket1', // Replace with your bucket name
      //   Key: 'file.zip', // Name for the file in the bucket
      //   Body: new Uint8Array(fileData),
      // };

      // const uploadResult = await s3.upload(params).promise();

      // console.log('File uploaded to S3:', uploadResult);
      // Send email using Mailgun after successful upload
      const mailgun = new Mailgun(FormData);
      const mg = mailgun.client({username: 'api', key: '680e8f7f873072a6c4ca1d5d15deced4-30b58138-c475eb19'});

      await mg.messages.create('mynscc.me', {
        from: "postmaster@mynscc.me",
        to: ["dharmathanishqnimmala@gmail.com"],
        subject: "Hello",
        text: "File Upload Success",
        html: "<h1>The file has been successfully uploaded to S3.</h1>"
      })
      .then(msg => console.log(msg)) // logs response data
  .catch(err => console.log(err)); // logs any error

  // Store email information in DynamoDB
  const emailInfo = {
    TableName: 'table1', // Replace with your DynamoDB table name
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




