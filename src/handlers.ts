import { Handler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { createDoc } from "./job";
import { DOCUMENT_KEY, DYNAMODB_TABLE } from "./utils";

export const get: Handler = async (event: any) => {
  const headers = {
    "content-type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  };
  const params = {
    TableName: DYNAMODB_TABLE as string,
    Key: {
      id: DOCUMENT_KEY,
    },
  };

  try {
    const dynamoDb = new DynamoDB.DocumentClient();
    const res = await dynamoDb.get(params).promise();

    if (res.Item) {
      return {
        statusCode: 200,
        body: JSON.stringify(res.Item),
        headers
      };
    } else {
      try {
        const body = JSON.stringify(await createDoc());

        return {
          statusCode: 200,
          body,
          headers,
        };
      } catch (err) {
        console.log(err.message);
        return {
          statusCode: 500,
          body: "Creating API data",
          headers,
        };
      }
    }
  } catch (err) {
    console.log("Can't fetch from Dynamo DB");
    console.log(err.message);
    try {
      console.log(await createDoc());
    } catch (err) {
      console.log(err);
    }
    return {
      statusCode: 200,
      body: await createDoc(),
      headers,
    };
  }
};

export const cron: Handler = async (event: any) => {
  const doc = await createDoc();
  console.log(JSON.stringify(doc, null, 4))
};
