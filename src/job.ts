import {
  bigNumberToNumber,
  coinGeckoPrice,
  Document,
  DOCUMENT_KEY,
  DYNAMODB_TABLE,
  formatPercent,
  nFormatter,
} from "./utils";
import { ethers } from "ethers";
import { GebAdmin } from "@reflexer-finance/geb-admin";
import { DynamoDB } from "aws-sdk";

export const createDoc = async (): Promise<Document> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC);
  const geb = new GebAdmin("mainnet", provider);
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();

  // == Blockchain multicall ==
  const flxPoolRequest = geb.contracts.uniswapPairCoinEth.getReserves(true);
  flxPoolRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx
  const aaveVariableDebt = geb.contracts.protocolToken.totalSupply(true);
  aaveVariableDebt.to = "0xB5385132EE8321977FfF44b60cDE9fE9AB0B4e6b"; // aave variable debt address

  const multicall = geb.multiCall([
    geb.contracts.uniswapPairCoinEth.getReserves(true),
    flxPoolRequest,
    aaveVariableDebt,
  ]);

  // == Execute all prmoises ==
  const [[raiPrice, flxPrice], multiCallData] = await Promise.all([
    coinGeckoPrice(["rai", "reflexer-ungovernance-token"]),
    multicall,
  ]);

  // == Populate map ==

  // Uniswap ETH/RAI pool APR
  const raiInUniV2RaiEth = bigNumberToNumber(multiCallData[0]._reserve0) / 1e18;
  valuesMap.set(
    "UNI_V2_ETH_RAI_APR",
    formatPercent(((334 * 365 * flxPrice) / (raiInUniV2RaiEth * 2 * raiPrice)) * 100)
  );

  // Uniswap ETH/RAI pool size
  valuesMap.set("UNI_V2_ETH_RAI_POOL_SIZE", nFormatter(raiInUniV2RaiEth * 2 * raiPrice, 2));

  // Uniswap FLX/ETH pool APR
  const flxInUniV2FlxEth = bigNumberToNumber(multiCallData[1]._reserve0) / 1e18;
  valuesMap.set(
    "UNI_V2_FLX_ETH_APR",
    formatPercent(((80 * 365 * flxPrice) / (flxInUniV2FlxEth * 2 * flxPrice)) * 100)
  );

  // Uniswap FLX/ETH pool size
  valuesMap.set("UNI_V2_FLX_ETH_POOL_SIZE", nFormatter(flxInUniV2FlxEth * 2 * flxPrice, 2));

  // Aave pool size
  valuesMap.set("AAVE_RAI_POOL_SIZE", nFormatter((bigNumberToNumber(multiCallData[2]) / 1e18) * raiPrice, 2));

  setPropertyRecursive(rawDoc, valuesMap);

  // == Store in DynamoDB
  const params = {
    TableName: DYNAMODB_TABLE as string,
    Item: {
      id: DOCUMENT_KEY,
      data: rawDoc,
    },
  };

  try {
    const dynamoDb = new DynamoDB.DocumentClient();
    await dynamoDb.put(params).promise();
  } catch (err) {
    console.log("Could not store in DynamoDB");
    console.log(err.message);
  }

  return rawDoc as any;
};

const setPropertyRecursive = (obj: any, map: Map<string, string>) => {
  for (let k of Object.keys(obj)) {
    switch (typeof obj[k]) {
      case "object":
        setPropertyRecursive(obj[k], map);
        break;
      case "string":
        const matches = obj[k].match(/{{(.*?)}}/g);
        if (!matches) continue;
        for (let m of matches) {
          const key = m.replace("{{", "").replace("}}", "");
          if (map.has(key)) {
            obj[k] = obj[k].replace(m, map.get(key));
          }
        }
        break;
      default:
        continue;
    }
  }
};
