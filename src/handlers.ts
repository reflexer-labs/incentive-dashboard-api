import { Handler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { createDoc } from "./job";
import { DOCUMENT_KEY, DYNAMODB_TABLE } from "./utils";

export const get: Handler = async (event: any) => {
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
      };
    } else {
      try {
        const body = JSON.stringify(await createDoc());

        return {
          statusCode: 200,
          body,
        };
      } catch (err) {
        console.log(err.message);
        return {
          statusCode: 500,
          body: "Creating API data",
        };
      }
    }
  } catch (err) {
    console.log("Can't fetch from Dynamo DB");
    console.log(err.message);
    try{
      console.log(await createDoc())
    } catch(err) {
    console.log(err)
    }
    return {
      statusCode: 200,
      body: await createDoc(),
    };
  }
};

export const cron: Handler = async (event: any) => {
  await createDoc();
};
