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
- `src/deploy-project.ts` — script de déploiement (S3 + API Gateway)
- `src/destroy-project.ts` — script de nettoyage (supprime buckets créés)
- `assets/` — images chargées (`fisher.jpg`, `tanker.jpg`)
- `logs.txt` — log du déploiement
- `destroy-logs.txt` — log de la destruction

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

### DynamoDB (non implémenté / vide)

### API Gateway


### Logs
- Fonctions communes :
	- `initializeLog()` — réécrit/crée le fichier de log (`logs.txt` ou `destroy-logs.txt`) avec un header horodaté.
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
cat logs.txt
```

- Nettoyage :
```bash
npx ts-node src/destroy-project.ts
cat destroy-logs.txt
```

## Annexes / références
- Fichiers sources : `src/deploy-project.ts`, `src/destroy-project.ts`
- AWS SDK v3 (Node.js) — modules `@aws-sdk/client-s3` et `@aws-sdk/client-api-gateway`

---

Si vous voulez que j'écrive ce README dans `README.md` à la place, ou que je génère un rôle IAM (CloudFormation ou policy JSON) exemple, dites-moi lequel et je l'ajoute.

