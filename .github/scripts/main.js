const https = require('https')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')
const { defaultProvider } = require('@aws-sdk/client-sqs')
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { unmarshall } = require('@aws-sdk/util-dynamodb')

const AWS_REGION = process.env.AWS_REGION
const SQS_URL = process.env.SQS_URL
const DYNAMO_TABLE = process.env.DYNAMO_TABLE

const sqs = new SQSClient({ region: AWS_REGION, credentials: defaultProvider })
const dynamodb = new DynamoDBClient({ region: AWS_REGION, credentials: defaultProvider })


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
        console.log(`Iteration ${i + 1} - sleeping ${waitSeconds} seconds...`)
        await sleep(waitSeconds * 1000)

        try {
            const response = await dynamodb.send(queryForDeployment(deploymentId))
            console.log(`Query succeeded. Items found: ${response.Items.length}`)

            for (let i = 0; i < response.Items.length; i++) {
                const item = unmarshall(response.Items[i])
                console.log(`Item ${i + 1}: ${item.id} - ${item.completed} - ${item.status}`)
                if (item.completed) {
                    return item.status !== 'FAILED'
                }
            }
        } catch (err) {
            console.log(`Error querying table: ${err}`)
        }
    }
    return false
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function main() {

    const url =
        'https://raw.githubusercontent.com/newrelic/open-install-library/main/test/definitions/infra-agent/ubuntu22-infra.json'
    // const url = 'https://raw.githubusercontent.com/newrelic/open-install-library/main/test/manual/definitions/infra-agent/ubuntu20-infra.json'

    // Fetch deployment config, will be from //raw.githubusercontent.com/newrelic/open-install-library for OIL tests
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
                WAIT_SECONDS = 20
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
