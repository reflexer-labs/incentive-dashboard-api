import {
  bigNumberToNumber,
  coinGeckoPrice,
  Document,
  DOCUMENT_KEY,
  DYNAMODB_TABLE,
  formatPercent,
  getUniV3ActiveLiquidity,
  getUniV3Positions,
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
} from "./abis";

const BLOCK_INTERVAL = 13;

export const createDoc = async (): Promise<Document> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC);
  const geb = new GebAdmin("mainnet", provider);
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();

  // == Blockchain multicall ==

  // Uniswap
  const flxEthReservesRequest = geb.contracts.uniswapPairCoinEth.getReserves(true);
  flxEthReservesRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx

  const flxEthLpTotalSupplyRequest = geb.contracts.uniswapPairCoinEth.totalSupply(true);
  flxEthLpTotalSupplyRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx

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

  // Uni V3 RAI/DAI
  const uniV3Slot0Request = geb.contracts.uniswapV3PairCoinEth.slot0(true);
  uniV3Slot0Request.to = "0xcB0C5d9D92f4F2F80cce7aa271a1E148c226e19D";

  // @ts-ignore
  const multicall = geb.multiCall([
    // uniswap
    geb.contracts.uniswapPairCoinEth.getReserves(true), // 0
    flxEthReservesRequest, // 1

    // Aave
    aaveVariableDebtRequest, // 2
    aaveRaiAssetData, // 3

    // Idle
    idleAPRRequest, // 4
    idleRaiTotalSupplyRequest, // 5
    idleTokenPriceRequest, // 6

    // Fuse
    fuseTotalBorrowRequest, // 7
    fuseBorrowRateRequest, // 8
    fuseSupplyRateRequest, // 9

    // FLX staking
    geb.contracts.stakingFirstResort.rewardRate(true), // 10
    geb.contracts.stakingToken.totalSupply(true), // 11
    flxEthLpTotalSupplyRequest, // 12
    geb.contracts.stakingFirstResort.stakedSupply(true), // 13

    // Uni V3 RAI/DAI
    uniV3Slot0Request, // 14
  ]) as any[];

  const redemptionPrice =
    bigNumberToNumber(await geb.contracts.oracleRelayer.redemptionPrice_readOnly()) / 1e27;

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
    formatPercent(((80 * 365 * flxPrice) / (raiInUniV2RaiEth * (1 + 2.5) * raiPrice)) * 100)
  );

  // Uniswap -- ETH/RAI pool size
  valuesMap.set("UNI_V2_ETH_RAI_POOL_SIZE", nFormatter(raiInUniV2RaiEth * 2 * raiPrice, 2));

  // Aave
  const aaveRaiReserveData = multiCallData[3] as any;
  let totalRaiBorrow = bigNumberToNumber(multiCallData[2]) / 1e18;
  valuesMap.set("AAVE_RAI_POOL_SIZE", nFormatter(totalRaiBorrow * raiPrice, 2));
  valuesMap.set(
    "AAVE_FLX_APR",
    formatPercent(((10 * 365 * flxPrice) / (totalRaiBorrow * raiPrice)) * 0.65 * 100)
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
  valuesMap.set(
    "IDLE_APR_TOTAL",
    formatPercent(
      (10 * 365 * flxPrice * 100) / idlePoolSize + bigNumberToNumber(multiCallData[4] as any) / 1e18
    )
  );

  // Fuse Total borrows
  totalRaiBorrow = bigNumberToNumber(multiCallData[7]) / 1e18;
  valuesMap.set("FUSE_RAI_POOL_SIZE", nFormatter(totalRaiBorrow * raiPrice, 2));
  valuesMap.set(
    "FUSE_FLX_APR",
    formatPercent(((10 * 365 * flxPrice) / (totalRaiBorrow * raiPrice)) * 0.65 * 100)
  );

  const blockRateToYearlyRate = (blockRate: BigNumber) =>
    formatPercent((((bigNumberToNumber(blockRate) * 3600 * 24) / 13 / 1e18 + 1) ** 365 - 1) * 100);
  valuesMap.set("FUSE_RAI_SUPPLY_APY", blockRateToYearlyRate(multiCallData[9]));
  valuesMap.set("FUSE_RAI_BORROW_APY", blockRateToYearlyRate(multiCallData[8]));

  // FLX stakers APR
  const flxInUniV2FlxEth = bigNumberToNumber(multiCallData[1]._reserve0) / 1e18;
  const annualRewards = (bigNumberToNumber(multiCallData[10]) / 1e18) * 365 * 3600 * 24;
  const stakingSharesTotalSUpply = bigNumberToNumber(multiCallData[11]) / 1e18;
  const stakingAPR = ((annualRewards / BLOCK_INTERVAL) * stakingSharesTotalSUpply) / (flxInUniV2FlxEth * 2);
  valuesMap.set("FLX_STAKING_APR", formatPercent(stakingAPR * 100));

  const lpSharesInStaking = bigNumberToNumber(multiCallData[13]) / 1e18;
  const lpShareTotal = bigNumberToNumber(multiCallData[12]) / 1e18;
  const flxEthPoolSize = flxInUniV2FlxEth * 2 * flxPrice;
  valuesMap.set("FLX_STAKING_POOL_SIZE", nFormatter((flxEthPoolSize * lpSharesInStaking) / lpShareTotal, 2));

  // Uniswap V3
  const tickSpacing = 10;
  const tickToPrice = (tick: number) => 1.0001 ** tick;
  const roundPrice = (price: number, dec = 4) =>
    (Math.round(price * 10 ** dec) / 10 ** dec).toString();
  const priceToTick = (price: number) => Math.log(price) / Math.log(1.0001);
  const flooredTick = (tick: number, tickSpacing: number) =>
    Math.floor(tick) - (Math.floor(tick) % tickSpacing);

  const marketPriceTick = multiCallData[14].tick;
  const redemptionPriceTick = priceToTick(redemptionPrice);

  const optimalLowerTick = flooredTick(Math.min(marketPriceTick, redemptionPriceTick), tickSpacing);
  const optimalUpperTick =
    flooredTick(Math.max(marketPriceTick, redemptionPriceTick), tickSpacing) + tickSpacing;

  const recommendedLowerTick = optimalLowerTick - tickSpacing;

  const recommendedUpperTick = optimalUpperTick + tickSpacing;

  const allUniV3Position = await getUniV3Positions();
  const totalLiquidity = allUniV3Position
    // Filter positions that are in rnage
    .filter(
      (p) =>
        Number(p.tickLower.tickIdx) <= optimalLowerTick && Number(p.tickUpper.tickIdx) >= optimalUpperTick
    )
    // Sum all liquidity
    .reduce((acc, p) => acc + Number(p.liquidity), 0);

  const tickRangeToAPR = (arr: number[]) => {
    const liquidity = 1e18 / (1.0001 ** (arr[1] / 2) - 1.0001 ** (arr[0] / 2));
    return (((liquidity / totalLiquidity) * 150 * 365 * flxPrice) / 2.5) * 100;
  };

  valuesMap.set(
    "UNISWAP_V3_OPTIMAL",
    `${formatPercent(tickRangeToAPR([optimalLowerTick, optimalUpperTick]))}% (LP from ${roundPrice(
      tickToPrice(optimalLowerTick)
    )} DAI to ${roundPrice(tickToPrice(optimalUpperTick))} DAI)`
  );

  valuesMap.set(
    "UNISWAP_V3_RECOMMENDED",
    `${formatPercent(tickRangeToAPR([recommendedLowerTick, recommendedUpperTick]))}% (LP from ${roundPrice(
      tickToPrice(recommendedLowerTick)
    )} DAI to ${roundPrice(tickToPrice(recommendedUpperTick))} DAI)`
  );

  valuesMap.set("UNISWAP_APR", formatPercent(tickRangeToAPR([recommendedLowerTick, recommendedUpperTick])));

  valuesMap.set(
    "UNISWAP_APR_DESC",
    `FLX APR only, ignores trading fees income. Assuming a Safe with 250% cRatio and the recommended range indicated below. The optimal range is the smallest possible range to include both, the redemption price and the market price. The recommended range adds one tick on each side.`
  );

  valuesMap.set("UNISWAP_V3_RAI_REDEMPTION_PRICE", roundPrice(redemptionPrice,6));
  valuesMap.set("UNISWAP_V3_RAI_MARKET_PRICE", roundPrice(tickToPrice(marketPriceTick), 6));

  valuesMap.set(
    "R2_UNISWAP_APR_NO_DETAIL",
    formatPercent(tickRangeToAPR([optimalLowerTick, optimalUpperTick]))
  );
  valuesMap.set(
    "R3_UNISWAP_APR_NO_DETAIL",
    formatPercent(tickRangeToAPR([recommendedLowerTick, recommendedUpperTick]))
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
