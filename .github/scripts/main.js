const https = require('https')
const core = require('@actions/core')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { unmarshall } = require('@aws-sdk/util-dynamodb')

const AWS_REGION = process.env.AWS_REGION
const SQS_URL = process.env.SQS_URL
const DYNAMO_TABLE = process.env.DYNAMO_TABLE
const AWS_CREDS = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

const sqs = new SQSClient({ region: AWS_REGION, credentials: AWS_CREDS })
const dynamodb = new DynamoDBClient({ region: AWS_REGION, credentials: AWS_CREDS })


function queryForDeployment(messageId) {
    const query_params = {
        TableName: DYNAMO_TABLE,
        KeyConditionExpression: 'id = :id',
        FilterExpression: 'completed = :completed',
        ExpressionAttributeNames: {
            '#id': 'id',
            '#completed': 'completed',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':id': {
                S: messageId,
            },
            ':completed': {
                BOOL: true,
            },
        },
        ProjectionExpression: '#id, #completed, #status',
        ScanIndexForward: false,
    }
    return new QueryCommand(query_params)
}

async function isDeploymentSuccessful(deploymentId, dynamodb, retries, waitSeconds) {
    for (let i = 0; i < retries; i++) {
        console.log(`Deployment pending, sleeping ${waitSeconds} seconds...`)
        await sleep(waitSeconds * 1000)

        try {
            const response = await dynamodb.send(queryForDeployment(deploymentId))
            console.log(`Query succeeded. Items found: ${response.Items.length}`)

            for (let i = 0; i < response.Items.length; i++) {
                const item = unmarshall(response.Items[i])
                console.log(`Item ${i + 1}: ${item.id} - ${item.completed} - ${item.status}`)
                if (item.completed && item.status === 'FAILED') {
                    throw new Error(`Deployment failed => ${item.message}`)
                } else {
                    return true
                }
            }
        } catch (err) {
            console.log(`Error querying table: ${err}`)
        }
    }
    throw new Error(`Deployment timed out after ${retries} retries.`)
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function main() {
    const url = process.env.TEST_DEFINITION_URL

    https.get(url, (res) => {
        let body = ''

        res.on('data', (chunk) => {
            body += chunk
        })

        res.on('end', async () => {
            let messageId
            try {
                const command = new SendMessageCommand({
                    QueueUrl: SQS_URL,
                    MessageBody: body,
                })
                data = await sqs.send(command)
                messageId = data.MessageId
                console.log(`Message sent: ${messageId}`)
            } catch (err) {
                console.error(`Error sending message: ${err}`)
            }

            // Execute the query with retries/sleeps
            let RETRIES = 100,
                WAIT_SECONDS = 30
            const success = await isDeploymentSuccessful(messageId, dynamodb, RETRIES, WAIT_SECONDS)
            console.log(`Deployment success: ${success}`)
        })

        res.on('error', (err) => {
            console.error(`Error calling URL: ${err}`)
        })
    })
}

if (require.main === module) {
    main()
}
