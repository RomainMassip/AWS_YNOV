//import
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { addLog } from './log-function';


// Configuration du client S3
export const s3Client = new S3Client({
  region: 'eu-west-1', // Région par défaut
});

/**
 * Créer un bucket S3
 */
export async function createBucket(bucketName: string): Promise<void> {
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
export async function uploadFile(
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

/**
 * Vider un bucket S3 en supprimant tous les objets
 */
export async function emptyBucket(bucketName: string, logfile: string): Promise<void> {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
    });

    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      addLog(`Suppression de ${listResponse.Contents.length} objet(s)...`, logfile);
      
      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });
          await s3Client.send(deleteCommand);
        }
      }
      addLog(`Tous les objets du bucket "${bucketName}" ont été supprimés`, logfile);
    } else {
      addLog(`Le bucket "${bucketName}" est déjà vide`, logfile);
    }
  } catch (error) {
    addLog(`❌ Erreur lors du vidage du bucket: ${error}`, logfile);
    throw error;
  }
}

/**
 * Supprimer un bucket S3
 */
export async function deleteBucket(bucketName: string, logfile: string): Promise<void> {
  try {
    const deleteCommand = new DeleteBucketCommand({
      Bucket: bucketName,
    });

    await s3Client.send(deleteCommand);
    addLog(`✅ Bucket "${bucketName}" supprimé avec succès`, logfile);
  } catch (error) {
    addLog(`❌ Erreur lors de la suppression du bucket: ${error}`, logfile);
    throw error;
  }
}

/**
 * Lister et supprimer tous les buckets S3 créés par le projet
 */
export async function deleteAllProjectBuckets(logfile: string): Promise<void> {
  try {
    const listCommand = new ListBucketsCommand({});
    const listResponse = await s3Client.send(listCommand);

    const projectBuckets = (listResponse.Buckets || [])
      .filter(bucket => bucket.Name && bucket.Name.startsWith('s3-lab05-sdk-'))
      .map(bucket => bucket.Name as string);

    if (projectBuckets.length === 0) {
      addLog('📋 Aucun bucket du projet trouvé', logfile);
      return;
    }

    addLog(`🪣 ${projectBuckets.length} bucket(s) trouvé(s)`, logfile);

    for (const bucketName of projectBuckets) {
      addLog(`\n🔄 Traitement de "${bucketName}"...`, logfile);
      await emptyBucket(bucketName, logfile);
      await deleteBucket(bucketName, logfile);
    }
  } catch (error) {
    addLog(`❌ Erreur lors de la suppression des buckets: ${error}`, logfile);
    throw error;
  }
}