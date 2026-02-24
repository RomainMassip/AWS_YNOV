//import
import { writeFileSync, appendFileSync } from 'fs';

/**
 * Ajouter un message au fichier log
 */
export function addLog(message: string, file: string ): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  appendFileSync(file, logMessage);
  //console.log(message);
}

/**
 * Initialiser le fichier log
 */
export function initializeLog(file: string): void {
  const timestamp = new Date().toISOString();
  writeFileSync(file, `=== Deployment Log - ${timestamp} ===\n`);
  console.log(`Fichier de log initialisé: ${file}`);
}