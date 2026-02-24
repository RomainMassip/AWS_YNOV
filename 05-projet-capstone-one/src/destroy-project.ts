//import
import { addLog, initializeLog } from '../log-function';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { writeFileSync, appendFileSync } from 'fs';
import { deleteShipsTable } from './dynamodb-operations';

// Configuration du client S3
const s3Client = new S3Client({
  region: 'eu-west-1', // Région par défaut
});

// Log file path
const LOG_FILE = './destroy.log';

/**
 * Vider un bucket S3 en supprimant tous les objets
 */
async function emptyBucket(bucketName: string): Promise<void> {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
    });

    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      addLog(`Suppression de ${listResponse.Contents.length} objet(s)...`, LOG_FILE);

      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });
          await s3Client.send(deleteCommand);
        }
      }
      addLog(`Tous les objets du bucket "${bucketName}" ont été supprimés`, LOG_FILE);
    } else {
      addLog(`Le bucket "${bucketName}" est déjà vide`, LOG_FILE);
    }
  } catch (error) {
    addLog(`❌ Erreur lors du vidage du bucket: ${error}`, LOG_FILE);
    throw error;
  }
}

/**
 * Supprimer un bucket S3
 */
async function deleteBucket(bucketName: string): Promise<void> {
  try {
    const deleteCommand = new DeleteBucketCommand({
      Bucket: bucketName,
    });

    await s3Client.send(deleteCommand);
    addLog(`✅ Bucket "${bucketName}" supprimé avec succès`, LOG_FILE);
  } catch (error) {
    addLog(`❌ Erreur lors de la suppression du bucket: ${error}`, LOG_FILE);
    throw error;
  }
}

/**
 * Lister et supprimer tous les buckets S3 créés par le projet
 */
async function deleteAllProjectBuckets(): Promise<void> {
  try {
    const listCommand = new ListBucketsCommand({});
    const listResponse = await s3Client.send(listCommand);

    const projectBuckets = (listResponse.Buckets || [])
      .filter(bucket => bucket.Name && bucket.Name.startsWith('s3-lab05-sdk-'))
      .map(bucket => bucket.Name as string);

    if (projectBuckets.length === 0) {
      addLog('📋 Aucun bucket du projet trouvé', LOG_FILE);
      return;
    }

    addLog(`🪣 ${projectBuckets.length} bucket(s) trouvé(s)`, LOG_FILE);

    for (const bucketName of projectBuckets) {
      addLog(`\n🔄 Traitement de "${bucketName}"...`, LOG_FILE);
      await emptyBucket(bucketName);
      await deleteBucket(bucketName);
    }
  } catch (error) {
    addLog(`❌ Erreur lors de la suppression des buckets: ${error}`, LOG_FILE);
    throw error;
  }
}

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