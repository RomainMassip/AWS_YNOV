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
async function setupIamRole(accountId: string): Promise<string> {
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

  let roleArn: string;

  try {
    // Essayer de récupérer le rôle existant
    const getRoleResult = await iam.send(
      new GetRoleCommand({ RoleName: IAM_ROLE_NAME })
    );
    roleArn = getRoleResult.Role?.Arn!;
    console.log("✅ Rôle IAM existant utilisé :", roleArn);
  } catch (error: any) {
    if (error.name === "NoSuchEntityException") {
      // Créer le rôle s'il n'existe pas
      const createRoleResult = await iam.send(
        new CreateRoleCommand({
          RoleName: IAM_ROLE_NAME,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Description: "Rôle pour API Gateway accédant à DynamoDB et S3"
        })
      );
      roleArn = createRoleResult.Role?.Arn!;
      console.log("✅ Rôle IAM créé :", roleArn);
    } else {
      throw error;
    }
  }

  // Attacher les permissions
  const inlinePolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["dynamodb:Scan", "dynamodb:GetItem"],
        Resource: `arn:aws:dynamodb:${REGION}:${accountId}:table/${DYNAMODB_TABLE}`
      },
      {
        Effect: "Allow",
        Action: ["s3:GetObject"],
        Resource: `arn:aws:s3:::${S3_BUCKET}/*`
      }
    ]
  };

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: IAM_ROLE_NAME,
      PolicyName: "apigateway-dynamodb-s3-policy",
      PolicyDocument: JSON.stringify(inlinePolicy)
    })
  );

  console.log("✅ Permissions IAM attachées");

  // Attendre que le rôle soit disponible
  await new Promise(resolve => setTimeout(resolve, 2000));

  return roleArn;
}

async function main() {
  try {
    // ========================================
    // 0️⃣ Préparer le rôle IAM
    // ========================================
    console.log("📋 Configuration IAM...");
    const accountId = await getAccountId();
    const roleArn = await setupIamRole(accountId);

    // ========================================
    // 1️⃣ Créer l'API Gateway
    // ========================================
    const apiResult = await apiGateway.send(
      new CreateRestApiCommand({
        name: API_NAME,
        description: DESCRIPTION
      })
    );

    const restApiId = apiResult.id!;
    console.log("✅ API Gateway REST créée :", restApiId);

    // Récupérer les ressources
    const resources = await apiGateway.send(
      new GetResourcesCommand({ restApiId })
    );

    const rootResourceId = resources.items?.find(r => r.path === "/")?.id;

    if (!rootResourceId) {
      throw new Error("Ressource racine introuvable");
    }

    // ========================================
    // 2️⃣ Créer la ressource /ships
    // ========================================
    const shipsResource = await apiGateway.send(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "ships"
      })
    );

    const shipsResourceId = shipsResource.id!;
    console.log("✅ Ressource /ships créée");

    // Méthode GET /ships (DynamoDB Scan)
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
        credentials: roleArn,
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

    console.log("✅ GET /ships configuré (DynamoDB Scan)");

    // ========================================
    // 3️⃣ Créer la ressource /ships/photo/{key}
    // ========================================
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
    console.log("✅ Ressource /ships/photo/{key} créée");

    // Méthode GET /ships/photo/{key} (S3)
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
        credentials: roleArn,
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

    console.log("✅ GET /ships/photo/{key} configuré (S3)");

    // ========================================
    // 4️⃣ Créer la ressource /ships/profile/{key}
    // ========================================
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
    console.log("✅ Ressource /ships/profile/{key} créée");

    // Méthode GET /ships/profile/{key} (DynamoDB GetItem)
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
        credentials: roleArn,
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

    console.log("✅ GET /ships/profile/{key} configuré (DynamoDB GetItem)");

    // ========================================
    // 5️⃣ Déploiement
    // ========================================
    await apiGateway.send(
      new CreateDeploymentCommand({
        restApiId,
        stageName: STAGE_NAME
      })
    );

    console.log("\n🚀 API Gateway déployée avec succès !");
    console.log(`\n📋 Endpoints disponibles :`);
    console.log(
      `  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships`
    );
    console.log(
      `  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships/photo/{key}`
    );
    console.log(
      `  • GET https://${restApiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}/ships/profile/{key}`
    );
    console.log(`\n📊 Configuration :`);
    console.log(`  • DynamoDB Table: ${DYNAMODB_TABLE}`);
    console.log(`  • S3 Bucket: ${S3_BUCKET}`);
    console.log(`  • Rôle IAM: ${IAM_ROLE_NAME}`);
  } catch (error) {
    console.error("❌ Erreur :", error);
    process.exit(1);
  }
}

main();