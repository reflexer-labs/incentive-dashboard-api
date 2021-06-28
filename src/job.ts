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
import {
  AAVE_RAI_GET_RESERVE_DATA_ABI,
  FUSE_BORROW_RATE,
  FUSE_SUPPLY_RATE,
  FUSE_TOTAL_BORROW,
  IDLE_GET_APR_ABI,
  IDLE_TOKEN_PRICE,
  KASHI_TOTAL_BORROW,
} from "./abis";

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
  const aaveVariableDebtRequest = geb.contracts.protocolToken.totalSupply(true);
  aaveVariableDebtRequest.to = "0xB5385132EE8321977FfF44b60cDE9fE9AB0B4e6b"; // aave variable debt address
  const aaveRaiAssetData = {
    abi: AAVE_RAI_GET_RESERVE_DATA_ABI,
    to: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9", // Aave lending pool
    data: "0x35ea6a7500000000000000000000000003ab458634910aad20ef5f1c8ee96f1d6ac54919", // getReserveData(<RAI address>)
  };

  // Idle
  const idleAPRRequest = {
    abi: IDLE_GET_APR_ABI,
    to: "0x5C960a3DCC01BE8a0f49c02A8ceBCAcf5D07fABe", // IdleRai token
    data: "0x1f80b18a", // getAvgAPR()
  };
  const idleRaiTotalSupplyRequest = geb.contracts.protocolToken.totalSupply(true);
  idleRaiTotalSupplyRequest.to = "0x5C960a3DCC01BE8a0f49c02A8ceBCAcf5D07fABe"; // IdleRai token
  const idleTokenPriceRequest = {
    abi: IDLE_TOKEN_PRICE,
    to: "0x5C960a3DCC01BE8a0f49c02A8ceBCAcf5D07fABe",
    data: "0x7ff9b596", // tokenPrice()
  };

  // Fuse
  const fuseTotalBorrowRequest = {
    abi: FUSE_TOTAL_BORROW,
    to: "0x752F119bD4Ee2342CE35E2351648d21962c7CAfE", // Fuse RAI cToken
    data: "0x47bd3718", // totalBorrows()
  };

  const fuseBorrowRateRequest = {
    abi: FUSE_BORROW_RATE,
    to: "0x752F119bD4Ee2342CE35E2351648d21962c7CAfE", // Fuse RAI cToken
    data: "0xf8f9da28", // borrowRatePerBlock()
  };

  const fuseSupplyRateRequest = {
    abi: FUSE_SUPPLY_RATE,
    to: "0x752F119bD4Ee2342CE35E2351648d21962c7CAfE", // Fuse RAI cToken
    data: "0xae9d70b0", // supplyRatePerBlock()
  };

  // Kashi
  const kashiTotalBorrowRequest = {
    abi: KASHI_TOTAL_BORROW,
    to: "0xA7c3304462b169C71F8EdC894Ea9d32879Fb4823",
    data: "0x8285ef40",
  };

  // @ts-ignore
  const multicall = geb.multiCall([
    // uniswap
    geb.contracts.uniswapPairCoinEth.getReserves(true), // 0
    flxPoolRequest, // 1

    // Aave
    aaveVariableDebtRequest, // 2
    aaveRaiAssetData, // 3

    // Idle
    idleAPRRequest, // 4
    idleRaiTotalSupplyRequest, // 5
    idleTokenPriceRequest, // 6

    fuseTotalBorrowRequest, // 7
    fuseBorrowRateRequest, // 8
    fuseSupplyRateRequest, // 9

    // Kashi
    kashiTotalBorrowRequest, // 10
  ]) as any[];

  // == Execute all prmoises ==
  const [[raiPrice, flxPrice], multiCallData] = await Promise.all([
    coinGeckoPrice(["rai", "reflexer-ungovernance-token"]),
    multicall,
  ]);

  // == Populate map ==

  // Uniswap -- ETH/RAI pool APR
  const raiInUniV2RaiEth = bigNumberToNumber(multiCallData[0]._reserve0) / 1e18;
  valuesMap.set(
    "UNI_V2_ETH_RAI_APR",
    formatPercent(((334 * 365 * flxPrice) / (raiInUniV2RaiEth * (1 + 2.5) * raiPrice)) * 100)
  );

  // Uniswap -- ETH/RAI pool size
  valuesMap.set("UNI_V2_ETH_RAI_POOL_SIZE", nFormatter(raiInUniV2RaiEth * 2 * raiPrice, 2));

  // Uniswap FLX/ETH pool APR
  const flxInUniV2FlxEth = bigNumberToNumber(multiCallData[1]._reserve0) / 1e18;
  valuesMap.set(
    "UNI_V2_FLX_ETH_APR",
    formatPercent(((80 * 365 * flxPrice) / (flxInUniV2FlxEth * 2 * flxPrice)) * 100)
  );

  // Uniswap -- FLX/ETH pool size
  valuesMap.set("UNI_V2_FLX_ETH_POOL_SIZE", nFormatter(flxInUniV2FlxEth * 2 * flxPrice, 2));

  // Aave
  const aaveRaiReserveData = multiCallData[3] as any;
  let totalRaiBorrow = bigNumberToNumber(multiCallData[2]) / 1e18;
  valuesMap.set("AAVE_RAI_POOL_SIZE", nFormatter(totalRaiBorrow * raiPrice, 2));
  valuesMap.set(
    "AAVE_FLX_APR",
    formatPercent(((65 * 365 * flxPrice) / (totalRaiBorrow * raiPrice)) * 0.65 * 100)
  );
  valuesMap.set(
    "AAVE_RAI_SUPPLY_APY",
    formatPercent((bigNumberToNumber(aaveRaiReserveData.currentLiquidityRate as BigNumber) / 1e27) * 100)
  );
  valuesMap.set(
    "AAVE_RAI_BORROW_APY",
    formatPercent((bigNumberToNumber(aaveRaiReserveData.currentVariableBorrowRate as BigNumber) / 1e27) * 100)
  );

  // Idle -- Pool size
  const idlePoolSize =
    (((bigNumberToNumber(multiCallData[5]) / 1e18) * bigNumberToNumber(multiCallData[6] as any)) / 1e18) *
    raiPrice;
  valuesMap.set("IDLE_POOL_SIZE", nFormatter(idlePoolSize, 2));

  // Idle -- Idle APR
  valuesMap.set(
    "IDLE_APR",
    `${formatPercent((10 * 365 * flxPrice * 100) / idlePoolSize)}% FLX APR + ${formatPercent(
      bigNumberToNumber(multiCallData[4] as any) / 1e18
    )}% Lending APY`
  );

  // Fuse Total borrows
  totalRaiBorrow = bigNumberToNumber(multiCallData[7]) / 1e18;
  valuesMap.set("FUSE_RAI_POOL_SIZE", nFormatter(totalRaiBorrow * raiPrice, 2));
  valuesMap.set(
    "FUSE_FLX_APR",
    formatPercent(((15 * 365 * flxPrice) / (totalRaiBorrow * raiPrice)) * 0.65 * 100)
  );

  const blockRateToYearlyRate = (blockRate: BigNumber) =>
    formatPercent((((bigNumberToNumber(blockRate) * 3600 * 24) / 13 / 1e18 + 1) ** 365 - 1) * 100);
  valuesMap.set("FUSE_RAI_SUPPLY_APY", blockRateToYearlyRate(multiCallData[9]));
  valuesMap.set("FUSE_RAI_BORROW_APY", blockRateToYearlyRate(multiCallData[8]));

  // Kashi -- total borrow
  const kashiTotalBorrow = (bigNumberToNumber(multiCallData[10].elastic) / 1e18) * raiPrice;
  valuesMap.set("KASHI_TOTAL_BORROWS", nFormatter(kashiTotalBorrow, 2));
  valuesMap.set("KASHI_FLX_APR", formatPercent((10 * 365 * flxPrice * 100 * 0.65) / kashiTotalBorrow));

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
