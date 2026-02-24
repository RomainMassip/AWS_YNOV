# Projet final — API S3 pour photos de navires

## Résumé
- Ce projet crée un bucket S3, y charge des images (ships), et expose une API REST (API Gateway) permettant :
	- `GET /ships` → lister les objets du bucket
	- `GET /ships/photo/{key}` → récupérer l'image correspondant à `key`
- Un script de destruction vide et supprime les buckets créés par le projet.

## Schéma d'architecture (Mermaid)
```mermaid
flowchart LR
	A[deploy-project.ts] -->|createBucket / uploadFile| S3[S3 Bucket (s3-lab05-sdk-...)]
	S3 -->|objects| B[Objects: fisher.jpg, tanker.jpg]
	A -->|create API & methods| APIGW[API Gateway (s3-content-api-...)]
	APIGW -->|GET /ships -> ListObjects| S3
	APIGW -->|GET /ships/photo/{key} -> GetObject| S3
	D[destroy-project.ts] -->|listBuckets / emptyBucket / deleteBucket| S3
	note right of APIGW: API Key + Usage Plan\nBinary media types: image/*
```

## Prérequis
- Compte AWS avec permissions pour S3 et API Gateway
- Rôle IAM pour API Gateway (exécution) — fournir l'ARN via la variable d'environnement `APIGW_S3_ROLE_ARN` ou remplacer le placeholder dans le code
- Node.js, npm et TypeScript (ou `npx ts-node` pour exécuter directement)

## Commandes principales
- Déployer (crée bucket, charge fichiers, crée API) :
```bash
npx ts-node src/deploy-project.ts
```
- Détruire (vide et supprime les buckets du projet) :
```bash
npx ts-node src/destroy-project.ts
```

## Fichiers principaux
- `src/deploy-project.ts` — script de déploiement (S3 + DynamoDB)
- `src/destroy-project.ts` — script de nettoyage (supprime buckets + table DynamoDB)
- `assets/` — images chargées (`fisher.jpg`, `tanker.jpg`)
- `deploy.log` — log du déploiement
- `destroy.log` — log de la destruction

## Fonctions et commandes organisées par service

### S3
- Fonctions définies dans les scripts :
	- `createBucket(bucketName: string): Promise<void>` — crée le bucket S3 qui stockera les images (utilise `CreateBucketCommand`).
	- `uploadFile(bucketName: string, key: string, filePath: string): Promise<void>` — lit un fichier local et l'insère dans S3 via `PutObjectCommand` (définit `ContentType: 'image/jpeg'`).
	- `emptyBucket(bucketName: string): Promise<void>` — (dans `destroy-project.ts`) liste les objets (`ListObjectsV2Command`) et supprime chacun (`DeleteObjectCommand`).
	- `deleteBucket(bucketName: string): Promise<void>` — supprime le bucket vide via `DeleteBucketCommand`.
	- `deleteAllProjectBuckets(): Promise<void>` — (dans `destroy-project.ts`) liste tous les buckets (`ListBucketsCommand`), filtre ceux créés par le projet puis vide et supprime chacun.

	Pourquoi : ces opérations couvrent le cycle de vie des objets S3 nécessaires au labo — création, insertion, lecture/liste et suppression.

	Imports (SDK v3):
	- `@aws-sdk/client-s3`: `S3Client`, `CreateBucketCommand`, `PutObjectCommand`, `ListObjectsV2Command`, `DeleteObjectCommand`, `DeleteBucketCommand`, `ListBucketsCommand`

### DynamoDB

## Vue d'ensemble

Ce document explique l'implémentation de la partie DynamoDB pour le projet capstone. Toutes les opérations DynamoDB sont regroupées dans le fichier `src/dynamodb-operations.ts`.

## Architecture

- **Fichier:** `src/dynamodb-operations.ts`
- **Table:** `ships`
- **Clé primaire:** `id` (HASH key, type String)
- **Mode de facturation:** `PAY_PER_REQUEST` (on-demand)
- **Région:** `eu-west-1` (configurable via `AWS_REGION`)

## Commandes AWS SDK Utilisées

### Imports
```typescript
import {
    DynamoDBClient,          // Client principal pour DynamoDB
    CreateTableCommand,       // Créer une table
    DeleteTableCommand,       // Supprimer une table
    PutItemCommand,          // Insérer/Mettre à jour un item
    DeleteItemCommand,       // Supprimer un item
    ScanCommand,             // Lire tous les items
    GetItemCommand,          // Récupérer un item par clé
    waitUntilTableExists,    // Attendre création de table
    waitUntilTableNotExists, // Attendre suppression de table
} from '@aws-sdk/client-dynamodb';
```

## Fonctions Implémentées

### 1. `createShipsTable()`
**Description:** Crée la table DynamoDB `ships`

**Commandes SDK utilisées:**
- `CreateTableCommand` - Crée la table avec le schéma défini
- `waitUntilTableExists` - Attend que la table soit ACTIVE (max 60s)

**Schéma de la table:**
```typescript
KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' }
]
AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' }  // S = String
]
BillingMode: 'PAY_PER_REQUEST'
```

**Utilisation:**
```typescript
await dynamodb.createShipsTable();
```

---

### 2. `insertShips()`
**Description:** Insère les bateaux depuis le fichier `data/ships.json`

**Commandes SDK utilisées:**
- `PutItemCommand` - Insère chaque bateau dans la table

**Commandes Node.js utilisées:**
- `readFile` - Lit le fichier JSON
- `join(__dirname, '../data/ships.json')` - Construit le chemin absolu

**Format des données:**
```json
{
  "id": { "S": "B-001" },
  "nom": { "S": "Le Vigilant" },
  "type": { "S": "Pêcheur" },
  "pavillon": { "S": "France" },
  "taille": { "N": "12.5" },
  "nombre_marins": { "N": "4" },
  "s3_image_key": { "S": "pecheur-b-001.jpg" }
}
```

**Types DynamoDB:**
- `S` = String
- `N` = Number (stocké comme string)

**Utilisation:**
```typescript
await dynamodb.insertShips();
```

---

### 3. `getAllShips()`
**Description:** Récupère tous les bateaux de la table

**Commandes SDK utilisées:**
- `ScanCommand` - Parcourt toute la table et retourne tous les items

**Retour:** Tableau d'items DynamoDB

**Utilisation:**
```typescript
const ships = await dynamodb.getAllShips();
// Retourne: [{ id: {S: "B-001"}, nom: {S: "Le Vigilant"}, ... }, ...]
```

**Note:** `ScanCommand` lit toute la table - à utiliser avec précaution pour les grandes tables.

---

### 4. `getShipById(shipId: string)`
**Description:** Récupère un bateau spécifique par son ID

**Commandes SDK utilisées:**
- `GetItemCommand` - Récupère un item par sa clé primaire

**Paramètres:**
- `shipId` - ID du bateau (ex: "B-001")

**Retour:** Item DynamoDB ou `null` si non trouvé

**Utilisation:**
```typescript
const ship = await dynamodb.getShipById('B-002');
// Retourne: { id: {S: "B-002"}, nom: {S: "Ocean Giant"}, ... }
```

**Avantage:** Lecture directe par clé = très rapide et économique (vs Scan)

---

### 5. `deleteShip(shipId: string)`
**Description:** Supprime un bateau spécifique

**Commandes SDK utilisées:**
- `DeleteItemCommand` - Supprime un item par sa clé primaire

**Paramètres:**
- `shipId` - ID du bateau à supprimer

**Utilisation:**
```typescript
await dynamodb.deleteShip('B-001');
```

---

### 6. `deleteShipsTable()`
**Description:** Supprime complètement la table `ships`

**Commandes SDK utilisées:**
- `DeleteTableCommand` - Supprime la table
- `waitUntilTableNotExists` - Attend la suppression complète (max 60s)

**Utilisation:**
```typescript
await dynamodb.deleteShipsTable();
```

**Important:** Supprime la table ET tous les items qu'elle contient (pas besoin de supprimer les items un par un).

---

## Configuration du Client DynamoDB

```typescript
const dynamoClient = new DynamoDBClient({
    region: process.env['AWS_REGION'] || 'eu-west-1',
});
```

**Variables d'environnement:**
- `AWS_REGION` - Définit la région AWS (défaut: eu-west-1)

**Authentification:**
- Utilise le système de credentials AWS par défaut (SSO, variables d'env, fichiers de config)
- Commande pour se connecter: `aws sso login`

---

## Import et Utilisation

```typescript
import * as dynamodb from './dynamodb-operations';

// Créer la table
await dynamodb.createShipsTable();

// Insérer les données
await dynamodb.insertShips();

// Lire tous les bateaux
const allShips = await dynamodb.getAllShips();

// Récupérer un bateau
const ship = await dynamodb.getShipById('B-002');

// Supprimer un bateau
await dynamodb.deleteShip('B-001');

// Supprimer la table
await dynamodb.deleteShipsTable();
```

---

## Différences entre les Commandes

### GetItem vs Scan
| Commande | Usage | Performance | Coût |
|----------|-------|-------------|------|
| `GetItemCommand` | Récupérer 1 item par clé | Très rapide | 1 unité de lecture |
| `ScanCommand` | Lire tous les items | Lent sur grandes tables | 1 unité par 4KB |

**Recommandation:** Toujours utiliser `GetItemCommand` quand on connaît la clé.

### PutItem vs UpdateItem
| Commande | Usage |
|----------|-------|
| `PutItemCommand` | Crée ou remplace complètement un item |
| `UpdateItemCommand` | Met à jour des attributs spécifiques (non utilisé ici) |

---

## Gestion d'Erreurs

Toutes les fonctions incluent:
- **try-catch** pour capturer les erreurs AWS
- **Console logs** pour suivre l'exécution
- **throw error** pour propager les erreurs au code appelant

```typescript
try {
    await dynamoClient.send(command);
    console.log('✅ Success');
} catch (error) {
    console.error('❌ Error:', error);
    throw error;
}
```

---

## Waiters (Attentes)

Les **waiters** sont des utilitaires qui attendent qu'une ressource atteigne un état spécifique:

```typescript
await waitUntilTableExists(
    { client: dynamoClient, maxWaitTime: 60 },
    { TableName: tableName }
);
```

**Paramètres:**
- `client` - Client DynamoDB
- `maxWaitTime` - Temps d'attente maximum en secondes
- `TableName` - Nom de la table

**Utilité:** Évite les erreurs "ResourceNotFoundException" en s'assurant que la table est prête avant d'effectuer des opérations.

---

## Données de Test

Fichier: `data/ships.json`

2 bateaux:
1. **Le Vigilant** (B-001) - Pêcheur français, 12.5m, 4 marins
2. **Ocean Giant** (B-002) - Tanker libérien, 330m, 25 marins

---

## Commandes Utiles

```bash
# Installer les dépendances
npm install @aws-sdk/client-dynamodb

# Se connecter à AWS SSO
aws sso login

# Exécuter le script de déploiement
npx ts-node src/deploy-project.ts

# Lister les tables DynamoDB
aws dynamodb list-tables --region eu-west-1

# Décrire une table
aws dynamodb describe-table --table-name ships --region eu-west-1

# Scanner tous les items (via CLI)
aws dynamodb scan --table-name ships --region eu-west-1
```

---

## Bonnes Pratiques Appliquées

✅ **Séparation des responsabilités** - Toutes les opérations DynamoDB dans un fichier dédié

✅ **Export de fonctions** - Réutilisables dans d'autres modules

✅ **Namespace import** - Code organisé (`dynamodb.createShipsTable()`)

✅ **Gestion d'erreurs** - Try-catch systématique

✅ **Console logs** - Suivi de l'exécution

✅ **Types TypeScript** - Paramètres typés pour la sécurité

✅ **Chemins absolus** - `__dirname` pour robustesse

✅ **Attente des opérations** - Waiters pour éviter les erreurs de timing

---


---


### API Gateway


### Logs
- Fonctions communes :
    - `initializeLog()` — réécrit/crée le fichier de log (`deploy.log` ou `destroy.log`) avec un header horodaté.
	- `addLog(message: string)` — ajoute une ligne horodatée au fichier de log et facilite le suivi hors-console.

	Pourquoi : garder un historique local des opérations (utile pour debug et audit local) sans dépendre uniquement des logs AWS.

	Imports:
	- Node.js core `fs`: `writeFileSync`, `appendFileSync` (ou `appendFile`)

## Pourquoi ces composants sont utilisés (récapitulatif)
- S3 : contrôler les fichiers (images) nécessaires à l'application et fournir des endpoints pour y accéder via API Gateway.
- API Gateway : exposer S3 via HTTP de façon sécurisée et contrôlée (méthodes REST, clé API, plan d'usage, médias binaires).
- Logs : traçabilité locale des scripts d'automatisation.

## Exemples rapides
- Déploiement (avec rôle fourni) :
```bash
export APIGW_S3_ROLE_ARN=arn:aws:iam::123456789012:role/APIGatewayS3ServiceRole
npx ts-node src/deploy-project.ts
cat deploy.log
```

- Nettoyage :
```bash
npx ts-node src/destroy-project.ts
cat destroy.log
```

## Annexes / références
- Fichiers sources : `src/deploy-project.ts`, `src/destroy-project.ts`
- AWS SDK v3 (Node.js) — modules `@aws-sdk/client-s3` et `@aws-sdk/client-api-gateway`

---

Si vous voulez que j'écrive ce README dans `README.md` à la place, ou que je génère un rôle IAM (CloudFormation ou policy JSON) exemple, dites-moi lequel et je l'ajoute.

---

## Fil de l'eau

- ✅ Fait : opérations S3 (création bucket, upload, suppression) et scripts de logs.
- ✅ Fait : opérations DynamoDB (création table, insertion, suppression).
- ✅ Fait : destroy supprime buckets + table `ships`.
- 🟡 En cours : création de l'API Gateway.
- ⬜ A faire : intégrer le bucket S3 avec l'API Gateway.
- ⬜ A faire : intégrer DynamoDB avec l'API Gateway.
- ⬜ A faire : tester l'architecture complète.

