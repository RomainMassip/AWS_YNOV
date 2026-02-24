import * as dynamodb from './dynamodb-operations';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';

// Configuration du client S3
const s3Client = new S3Client({
  region: 'eu-west-1', // Région par défaut
});

// Log file path
const LOG_FILE = './deploy.log';

/**
 * Ajouter un message au fichier log
 */
function addLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, logMessage);
  //console.log(message);
}

/**
 * Initialiser le fichier log
 */
function initializeLog(): void {
  const timestamp = new Date().toISOString();
  writeFileSync(LOG_FILE, `=== Deployment Log - ${timestamp} ===\n`);
  console.log(`Fichier de log initialisé: ${LOG_FILE}`);
}

/**
 * Créer un bucket S3
 */
async function createBucket(bucketName: string): Promise<void> {
  const command = new CreateBucketCommand({
    Bucket: bucketName,
    CreateBucketConfiguration: {
      LocationConstraint: 'eu-west-1',
    },
  });

  await s3Client.send(command);
}

/**
 * Uploader un fichier vers S3
 */
async function uploadFile(
  bucketName: string,
  key: string,
  filePath: string
): Promise<void> {
  const fileContent = readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
    ContentType: 'image/jpeg',
  });

  await s3Client.send(command);
}

// Main function to execute all operations
async function deploy() {
  try {
    console.log('🚀 Starting Project Deployment...');

    initializeLog();
    addLog('🚀 Starting Project Deployment...');
    const bucketName = `s3-lab05-sdk-${Date.now()}`;
    const localFilePath1 = './assets/fisher.jpg';
    const localFilePath2 = './assets/tanker.jpg';
    const fileName1 = 'fisher.jpg';
    const fileName2 = 'tanker.jpg';

    // Create S3 and Insert Objects
    await createBucket(bucketName);
    addLog(`✅ Bucket "${bucketName}" created successfully`);

    await uploadFile(bucketName, fileName1, localFilePath1);
    addLog(`✅ File "${fileName1}" uploaded successfully to bucket "${bucketName}"`);

    await uploadFile(bucketName, fileName2, localFilePath2);
    addLog(`✅ File "${fileName2}" uploaded successfully to bucket "${bucketName}"`);

    // Create DynamoDB and Insert Items
    await dynamodb.createShipsTable();
    await dynamodb.insertShips();

    // Create API Gateway and Configure S3 / DynamoDB Integration

    addLog('✅ Project deployed successfully...');
  } catch (error) {
    addLog(`❌ Error: ${error}`);
    console.error('❌ Error:', error);
  }
}

// Execute the main function
deploy();
