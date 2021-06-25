import {
  bigNumberToNumber,
  coinGeckoPrice,
  Document,
  DOCUMENT_KEY,
  DYNAMODB_TABLE,
  formatPercent,
  nFormatter,
} from "./utils";
import { BigNumber, ethers } from "ethers";
import { GebAdmin } from "@reflexer-finance/geb-admin";
import { DynamoDB } from "aws-sdk";
import { AAVE_RAI_GET_RESERVE_DATA_ABI } from "./abis";

export const createDoc = async (): Promise<Document> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC);
  const geb = new GebAdmin("mainnet", provider);
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();

  // == Blockchain multicall ==

  // Uniswap
  const flxPoolRequest = geb.contracts.uniswapPairCoinEth.getReserves(true);
  flxPoolRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx

  // Aave
  const aaveVariableDebt = geb.contracts.protocolToken.totalSupply(true);
  aaveVariableDebt.to = "0xB5385132EE8321977FfF44b60cDE9fE9AB0B4e6b"; // aave variable debt address
  const aaveRaiAssetData = {
    abi: AAVE_RAI_GET_RESERVE_DATA_ABI,
    to: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9", // Aave lending pool
    data: "0x35ea6a7500000000000000000000000003ab458634910aad20ef5f1c8ee96f1d6ac54919", // getReserveData(<RAI address>)
  };

  const multicall = geb.multiCall([
    geb.contracts.uniswapPairCoinEth.getReserves(true),
    flxPoolRequest,
    aaveVariableDebt,
    aaveRaiAssetData,
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
    formatPercent(((334 * 365 * flxPrice) / (raiInUniV2RaiEth * (1 + 2.5) * raiPrice)) * 100)
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

  // Aave
  const aaveRaiReserveData = multiCallData[3] as any;
  const totalRaiBorrow = bigNumberToNumber(multiCallData[2]) / 1e18;
  valuesMap.set("AAVE_RAI_POOL_SIZE", nFormatter(totalRaiBorrow * raiPrice, 2));
  valuesMap.set("AAVE_FLX_APR", formatPercent(65 * 365 * flxPrice / (totalRaiBorrow * raiPrice) * 0.75 * 100));
  valuesMap.set(
    "AAVE_RAI_SUPPLY_APY",
    formatPercent((bigNumberToNumber(aaveRaiReserveData.currentLiquidityRate as BigNumber) / 1e27) * 100)
  );
  valuesMap.set(
    "AAVE_RAI_BORROW_APY",
    formatPercent((bigNumberToNumber(aaveRaiReserveData.currentVariableBorrowRate as BigNumber) / 1e27) * 100)
  );

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
