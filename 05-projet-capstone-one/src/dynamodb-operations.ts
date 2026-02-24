// Import Node.js modules
import { readFile } from 'fs/promises';
import { join } from 'path';

// Import AWS SDK DynamoDB commands
import {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    DeleteTableCommand,
    PutItemCommand,
    DeleteItemCommand,
    ScanCommand,
    GetItemCommand,
    waitUntilTableExists,
    waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';

// Create DynamoDB client instance
const dynamoClient = new DynamoDBClient({
    region: process.env['AWS_REGION'] || 'eu-west-1',
});

async function tableExists(tableName: string): Promise<boolean> {
    try {
        await dynamoClient.send(
            new DescribeTableCommand({
                TableName: tableName,
            })
        );
        return true;
    } catch (error: any) {
        if (error?.name === 'ResourceNotFoundException') {
            return false;
        }
        throw error;
    }
}

// Function to create the ships table
export async function createShipsTable() {
    const tableName = 'ships';
    console.log(`📋 Creating table: ${tableName}`);

    try {
        if (await tableExists(tableName)) {
            console.log('ℹ️  Table already exists, skipping creation.');
            return;
        }

        await dynamoClient.send(
            new CreateTableCommand({
                TableName: tableName,
                KeySchema: [
                    {
                        AttributeName: 'id',
                        KeyType: 'HASH',
                    },
                ],
                AttributeDefinitions: [
                    {
                        AttributeName: 'id',
                        AttributeType: 'S',
                    },
                ],
                BillingMode: 'PAY_PER_REQUEST',
            })
        );

        console.log('⏳ Waiting for table to be created...');
        await waitUntilTableExists(
            { client: dynamoClient, maxWaitTime: 60 },
            { TableName: tableName }
        );

        console.log('✅ Table created successfully!');
    } catch (error) {
        if ((error as any)?.name === 'ResourceInUseException') {
            console.log('ℹ️  Table already exists, skipping creation.');
            return;
        }
        console.error('❌ Error creating table:', error);
        throw error;
    }
}

// Function to insert ships data
export async function insertShips() {
    const tableName = 'ships';
    console.log('🚢 Inserting ships data...');

    try {
        // Read ships data from JSON file
        const filePath = join(__dirname, '../data/ships.json');
        const fileContent = await readFile(filePath, 'utf-8');
        const ships = JSON.parse(fileContent);

        // Insert each ship
        for (const ship of ships) {
            console.log(`  ⚓ Inserting ship: ${ship.nom.S}`);
            await dynamoClient.send(
                new PutItemCommand({
                    TableName: tableName,
                    Item: ship,
                })
            );
        }

        console.log(`✅ ${ships.length} ships inserted successfully!`);
    } catch (error) {
        console.error('❌ Error inserting ships:', error);
        throw error;
    }
}

// Function to get all ships
export async function getAllShips() {
    const tableName = 'ships';
    console.log('📋 Reading all ships from the table...');

    try {
        const response = await dynamoClient.send(
            new ScanCommand({
                TableName: tableName,
            })
        );

        console.log(`✅ Found ${response.Count} ships:`);
        if (response.Items) {
            response.Items.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item['nom']?.S} (${item['id']?.S}) - ${item['type']?.S}`);
            });
        }

        return response.Items || [];
    } catch (error) {
        console.error('❌ Error reading ships:', error);
        throw error;
    }
}

// Function to get a ship by ID
export async function getShipById(shipId: string) {
    const tableName = 'ships';
    console.log(`🔍 Getting ship with ID: ${shipId}`);

    try {
        const response = await dynamoClient.send(
            new GetItemCommand({
                TableName: tableName,
                Key: {
                    id: { S: shipId },
                },
            })
        );

        if (response.Item) {
            console.log(`✅ Ship found: ${response.Item['nom']?.S}`);
            return response.Item;
        } else {
            console.log('⚠️  Ship not found');
            return null;
        }
    } catch (error) {
        console.error('❌ Error getting ship:', error);
        throw error;
    }
}

// Function to delete a ship by ID
export async function deleteShip(shipId: string) {
    const tableName = 'ships';
    console.log(`🗑️  Deleting ship with ID: ${shipId}`);

    try {
        await dynamoClient.send(
            new DeleteItemCommand({
                TableName: tableName,
                Key: {
                    id: { S: shipId },
                },
            })
        );

        console.log('✅ Ship deleted successfully!');
    } catch (error) {
        console.error('❌ Error deleting ship:', error);
        throw error;
    }
}

// Function to delete the ships table
export async function deleteShipsTable() {
    const tableName = 'ships';
    console.log(`🗑️  Deleting table: ${tableName}`);

    try {
        await dynamoClient.send(
            new DeleteTableCommand({
                TableName: tableName,
            })
        );

        console.log('⏳ Waiting for table to be deleted...');
        await waitUntilTableNotExists(
            { client: dynamoClient, maxWaitTime: 60 },
            { TableName: tableName }
        );

        console.log('✅ Table deleted successfully!');
    } catch (error) {
        console.error('❌ Error deleting table:', error);
        throw error;
    }
}
