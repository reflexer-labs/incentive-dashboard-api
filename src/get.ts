import { DynamoDB } from "aws-sdk";
import { createDoc } from "./job";
import { DOCUMENT_KEY } from "./utils";

export const get = async (): Promise<any> => {
  const params = {
    TableName: process.env.DYNAMODB_TABLE as string,
    Key: {
      id: DOCUMENT_KEY,
    },
  };

  try {
    const dynamoDb = new DynamoDB.DocumentClient();
    const res = await dynamoDb.get(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(res.Item),
    };
  } catch (err) {
    console.log(err.message);

    let body: string;
    try {
      body = JSON.stringify(await createDoc());
      return {
        statusCode: 200,
        body,
      };
    } catch (err) {
      console.log(err.message);
      return {
        statusCode: 500,
      };
    }
  }
};
