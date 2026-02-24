//import
import { addLog, initializeLog } from './log-function';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { deleteShipsTable } from './dynamodb-operations';
import { deleteAllProjectBuckets } from './s3-function';

// Configuration du client S3
const s3Client = new S3Client({
  region: 'eu-west-1', // Région par défaut
});

// Log file path
const LOG_FILE = './destroy.log';

// Main function to execute destructive operation
async function main() {
  try {
    initializeLog(LOG_FILE);
    addLog('🚀 Starting Project Deletion...', LOG_FILE);

    // Delete all S3 ressources
    await deleteAllProjectBuckets(LOG_FILE);

    // Delete DynamoDB table
    await deleteShipsTable();

    addLog('\n✅ Project deleted successfully...', LOG_FILE);
  } catch (error) {
    addLog('❌ Error: ' + error, LOG_FILE);
  }
}

// Execute the main function
main();

// Export to make this a module and avoid global scope conflicts
export { };