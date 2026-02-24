//import
import { addLog, initializeLog } from './log-function';
import { deleteAllProjectBuckets } from './s3-function';

// Log file path
const LOG_FILE = './destroy.log';

// Main function to execute destructive operation
async function main() {
  try {
    initializeLog(LOG_FILE);
    addLog('🚀 Starting Project Deletion...', LOG_FILE);

    // Delete all S3 ressources
    await deleteAllProjectBuckets(LOG_FILE);

    addLog('\n✅ Project deleted successfully...', LOG_FILE);
  } catch (error) {
    addLog('❌ Error: ' + error, LOG_FILE);
  }
}

// Execute the main function
main();

// Export to make this a module and avoid global scope conflicts
export {};
