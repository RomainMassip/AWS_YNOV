import * as dynamodb from './dynamodb-operations';

import { addLog, initializeLog } from './log-function';
import { createBucket, uploadFile } from './s3-function';
// Log file path
const LOG_FILE = './deploy.log';

// Main function to execute all operations
async function deploy() {
  try {
    initializeLog(LOG_FILE);
    addLog('🚀 Starting Project Deployment...', LOG_FILE);
    const bucketName = `s3-lab05-sdk-${Date.now()}`;
    const localFilePath1 = './assets/fisher.jpg';
    const localFilePath2 = './assets/tanker.jpg';
    const fileName1 = 'fisher.jpg';
    const fileName2 = 'tanker.jpg';

    // Create S3 and Insert Objects
    await createBucket(bucketName);
    addLog(`✅ Bucket "${bucketName}" created successfully`, LOG_FILE);
    
    await uploadFile(bucketName, fileName1, localFilePath1);
    addLog(`✅ File "${fileName1}" uploaded successfully to bucket "${bucketName}"`, LOG_FILE);

    await uploadFile(bucketName, fileName2, localFilePath2);
    addLog(`✅ File "${fileName2}" uploaded successfully to bucket "${bucketName}"`, LOG_FILE);

    // Create DynamoDB and Insert Items
    await dynamodb.createShipsTable();
    await dynamodb.insertShips();

    // Create API Gateway and Configure S3 / DynamoDB Integration

    addLog('✅ Project deployed successfully...', LOG_FILE);
  } catch (error) {
    addLog(`❌ Error: ${error}`, LOG_FILE);
  }
}

// Execute the main function
deploy();
