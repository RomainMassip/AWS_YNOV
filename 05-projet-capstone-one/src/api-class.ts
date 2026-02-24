import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  PutMethodResponseCommand,
  PutIntegrationResponseCommand,
  CreateDeploymentCommand
} from "@aws-sdk/client-api-gateway";
import {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  GetRoleCommand
} from "@aws-sdk/client-iam";
import {
  STSClient,
  GetCallerIdentityCommand
} from "@aws-sdk/client-sts";
import { addLog } from './log-function';

/**
 * Configuration
 */
const REGION = "eu-west-1";
const API_NAME = "s3-content-api-boat";
const STAGE_NAME = "dev";
const DESCRIPTION = "API Gateway for Boat Project";
const DYNAMODB_TABLE = "boats";
const S3_BUCKET = "boat-images";
const IAM_ROLE_NAME = "apigateway-dynamodb-s3-role";
const DYNAMODB_ROLE_NAME = "APIGatewayDynamoDBServiceRole";
const S3_ROLE_NAME = "APIGatewayS3ServiceRole";

// Allow providing existing role ARNs via environment variables
const ENV_DYNAMODB_ROLE_ARN = process.env.APIGATEWAY_DYNAMODB_ROLE_ARN || process.env.APIGATEWAY_DYNAMODB_ROLE || process.env.APIGATEWAY_DYNAMODBROLE_ARN || process.env.APIGATEWAY_DYNAMODB_ROLE_ARN;
const ENV_S3_ROLE_ARN = process.env.APIGATEWAY_S3_ROLE_ARN || process.env.APIGATEWAY_S3_ROLE || process.env.APIGATEWAY_S3ROLE_ARN || process.env.APIGATEWAY_S3_ROLE_ARN;

/**
 * Clients AWS
 */
const apiGateway = new APIGatewayClient({ region: REGION });
const iam = new IAMClient({ region: REGION });
const sts = new STSClient({ region: REGION });

/**
 * Obtenir l'ID du compte AWS
 */
async function getAccountId(): Promise<string> {
  const result = await sts.send(new GetCallerIdentityCommand({}));
  return result.Account!;
}

/**
 * Créer ou récupérer le rôle IAM
 */
async function ensureRole(roleName: string, accountId: string, inlinePolicy: any, logFile = './deploy.log'): Promise<string> {
  const trustPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "apigateway.amazonaws.com"
        },
        Action: "sts:AssumeRole"
      }
    ]
  };

  // If the role ARN is provided via environment, return it
  if (roleName === DYNAMODB_ROLE_NAME && ENV_DYNAMODB_ROLE_ARN) {
    addLog(`ℹ️ Using provided DynamoDB role ARN from env: ${ENV_DYNAMODB_ROLE_ARN}`, logFile);
    return ENV_DYNAMODB_ROLE_ARN;
  }
  if (roleName === S3_ROLE_NAME && ENV_S3_ROLE_ARN) {
    addLog(`ℹ️ Using provided S3 role ARN from env: ${ENV_S3_ROLE_ARN}`, logFile);
    return ENV_S3_ROLE_ARN;
  }

  let roleArn: string;
  try {
    const getRoleResult = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    roleArn = getRoleResult.Role?.Arn!;
    addLog(`✅ Rôle IAM existant utilisé : ${roleArn}`, logFile);
  } catch (error: any) {
    if (error.name === 'NoSuchEntityException' || error.name === 'NoSuchEntity') {
      const createRoleResult = await iam.send(
        new CreateRoleCommand({
          RoleName: roleName,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Description: `Rôle ${roleName} pour API Gateway`
        })
      );
      roleArn = createRoleResult.Role?.Arn!;
      addLog(`✅ Rôle IAM créé : ${roleArn}`, logFile);
    } else {
      throw error;
    }
  }

  try {
    await iam.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: `${roleName}-inline-policy`,
        PolicyDocument: JSON.stringify(inlinePolicy)
      })
    );
    addLog(`✅ Permissions attachées au rôle ${roleName}`, logFile);
  } catch (err: any) {
    // If we cannot attach the policy due to lack of permissions, log clear instructions and continue
    addLog(`⚠️ Impossible d'attacher la policy au rôle ${roleName}: ${err}.`, logFile);
    addLog(`👉 Votre session n'a pas la permission iam:PutRolePolicy. Demandez à un administrateur d'attacher la policy suivante au rôle ${roleName} (ou créez le rôle avec ces permissions), puis relancez le déploiement.`, logFile);
    addLog(`Policy JSON: ${JSON.stringify(inlinePolicy)}`, logFile);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
  return roleArn;
}
export async function deployApi(logFile = './deploy.log') {
  try {
    addLog('📋 Configuration IAM...', logFile);
    const accountId = await getAccountId();

    // Define inline policies for each role (if we need to create them)
    const dynamoInlinePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['dynamodb:Scan', 'dynamodb:GetItem'],
          Resource: `arn:aws:dynamodb:${REGION}:${accountId}:table/${DYNAMODB_TABLE}`
        }
      ]
    };

    const s3InlinePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: `arn:aws:s3:::${S3_BUCKET}/*`
        }
      ]
    };

    const dynamoRoleArn = await ensureRole(DYNAMODB_ROLE_NAME, accountId, dynamoInlinePolicy, logFile);
    const s3RoleArn = await ensureRole(S3_ROLE_NAME, accountId, s3InlinePolicy, logFile);

    const apiResult = await apiGateway.send(
      new CreateRestApiCommand({
        name: API_NAME,
        description: DESCRIPTION
      })
    );

    const restApiId = apiResult.id!;
    addLog(`✅ API Gateway REST créée : ${restApiId}`, logFile);

    const resources = await apiGateway.send(
      new GetResourcesCommand({ restApiId })
    );

    const rootResourceId = resources.items?.find(r => r.path === "/")?.id;

    if (!rootResourceId) {
      throw new Error("Ressource racine introuvable");
    }

    const shipsResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "ships"
      })
    );

    const shipsResourceId = shipsResource.id!;
    addLog('✅ Ressource /ships créée', logFile);

    await apiGateway.send(
      new PutMethodCommand({
        restApiId,
        resourceId: shipsResourceId,
        httpMethod: "GET",
        authorizationType: "NONE"
      })
    );

    await apiGateway.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId: shipsResourceId,
        httpMethod: "GET",
        type: "AWS",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${REGION}:dynamodb:action/Scan`,
        credentials: dynamoRoleArn,
        requestTemplates: {
          "application/json": JSON.stringify({
            TableName: DYNAMODB_TABLE
          })
        }
      })
    );

    await apiGateway.send(
      new PutMethodResponseCommand({
        restApiId,
        resourceId: shipsResourceId,
        httpMethod: "GET",
        statusCode: "200"
      })
    );

    await apiGateway.send(
      new PutIntegrationResponseCommand({
        restApiId,
        resourceId: shipsResourceId,
        httpMethod: "GET",
        statusCode: "200",
        responseTemplates: {
          "application/json": "$input.json('$')"
        }
      })
    );

    addLog('✅ GET /ships configuré (DynamoDB Scan)', logFile);

    const photoResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: shipsResourceId,
        pathPart: "photo"
      })
    );

    const photoResourceId = photoResource.id!;

    const photoKeyResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: photoResourceId,
        pathPart: "{key}"
      })
    );

    const photoKeyResourceId = photoKeyResource.id!;
    addLog('✅ Ressource /ships/photo/{key} créée', logFile);

    await apiGateway.send(
      new PutMethodCommand({
        restApiId,
        resourceId: photoKeyResourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
        requestParameters: {
          "method.request.path.key": true
        }
      })
    );

    await apiGateway.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId: photoKeyResourceId,
        httpMethod: "GET",
        type: "AWS",
        integrationHttpMethod: "GET",
        uri: `arn:aws:apigateway:${REGION}:s3:path/${S3_BUCKET}/{key}`,
        credentials: s3RoleArn,
        requestParameters: {
          "integration.request.path.key": "method.request.path.key"
        }
      })
    );

    await apiGateway.send(
      new PutMethodResponseCommand({
        restApiId,
        resourceId: photoKeyResourceId,
        httpMethod: "GET",
        statusCode: "200"
      })
    );

    await apiGateway.send(
      new PutIntegrationResponseCommand({
        restApiId,
        resourceId: photoKeyResourceId,
        httpMethod: "GET",
        statusCode: "200",
        responseTemplates: {
          "application/json": "$input.json('$')"
        }
      })
    );

    addLog('✅ GET /ships/photo/{key} configuré (S3)', logFile);

    const profileResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: shipsResourceId,
        pathPart: "profile"
      })
    );

    const profileResourceId = profileResource.id!;

    const profileKeyResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: profileResourceId,
        pathPart: "{key}"
      })
    );

    const profileKeyResourceId = profileKeyResource.id!;
    addLog('✅ Ressource /ships/profile/{key} créée', logFile);

    await apiGateway.send(
      new PutMethodCommand({
        restApiId,
        resourceId: profileKeyResourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
        requestParameters: {
          "method.request.path.key": true
        }
      })
    );

    await apiGateway.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId: profileKeyResourceId,
        httpMethod: "GET",
        type: "AWS",
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${REGION}:dynamodb:action/GetItem`,
        credentials: dynamoRoleArn,
        requestTemplates: {
          "application/json": JSON.stringify({
            TableName: DYNAMODB_TABLE,
            Key: {
              id: {
                S: "$method.request.path.key"
              }
            }
          })
        }
      })
    );

    await apiGateway.send(
      new PutMethodResponseCommand({
        restApiId,
        resourceId: profileKeyResourceId,
        httpMethod: "GET",
        statusCode: "200"
      })
    );

    await apiGateway.send(
      new PutIntegrationResponseCommand({
        restApiId,
        resourceId: profileKeyResourceId,
        httpMethod: "GET",
        statusCode: "200",
        responseTemplates: {
          "application/json": "$input.json('$.Item')"
        }
      })
    );

    addLog('✅ GET /ships/profile/{key} configuré (DynamoDB GetItem)', logFile);

    await apiGateway.send(
      new CreateDeploymentCommand({
        restApiId,
        stageName: STAGE_NAME
      })
    );

    addLog('\n🚀 API Gateway déployée avec succès !', logFile);
    addLog(`\n📋 Endpoints disponibles :`, logFile);
    addLog(`  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships`, logFile);
    addLog(`  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships/photo/{key}`, logFile);
    addLog(`  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships/profile/{key}`, logFile);
    addLog(`\n📊 Configuration :`, logFile);
    addLog(`  • DynamoDB Table: ${DYNAMODB_TABLE}`, logFile);
    addLog(`  • S3 Bucket: ${S3_BUCKET}`, logFile);
    addLog(`  • Rôle IAM: ${IAM_ROLE_NAME}`, logFile);
  } catch (error) {
    addLog(`❌ Erreur : ${error}`, './deploy.log');
    process.exit(1);
  }
}