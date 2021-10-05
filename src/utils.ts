import Axios from "axios";
import { BigNumber } from "ethers";

export const DOCUMENT_KEY = "doc";
export const DYNAMODB_TABLE = "doc";

export const coinGeckoPrice = async (id: string[]) => {
  const res = await Axios.get(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id.join(",")}`
  );
  return res.data.map((x) => x.current_price) as number[];
};

export const bigNumberToNumber = (bn: BigNumber) => parseInt(bn.toString());

export const formatPercent = (number: number) => number.toFixed(2);

export const nFormatter = (num, digits) => {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "m" },
    { value: 1e9, symbol: "b" },
    { value: 1e12, symbol: "t" },
    { value: 1e15, symbol: "p" },
    { value: 1e18, symbol: "e" },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var item = lookup
    .slice()
    .reverse()
    .find(function (item) {
      return num >= item.value;
    });
  return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
};

export const getUniV3ActiveLiquidity = async () => {
  const resp = await Axios.post("https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3", {
    query: `{
      pool(id: "0xcb0c5d9d92f4f2f80cce7aa271a1e148c226e19d") {
        liquidity
      }
      }`,
  });

  return Number(resp.data.data.pool.liquidity);
};

export const getUniV3Positions = async (): Promise<
  { liquidity: string; tickLower: { tickIdx: string }; tickUpper: { tickIdx: string } }[]
> => {
  const resp = await Axios.post("https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3", {
    query: `{
      positions(where: {pool: "0xcb0c5d9d92f4f2f80cce7aa271a1e148c226e19d", liquidity_gt: 0}, orderBy: liquidity, orderDirection: desc, first: 1000) {
        liquidity
        tickLower {
          tickIdx
        }
        tickUpper {
      tickIdx
        }
      }
    }`,
  });

  return resp.data.data.positions;
};

export interface Distro {
  from: string;
  until: string;
  amount: string;
  name: string;
  description: string;
  link: string;
  optional: { [key: string]: string };
}

export interface Round {
  number: number;
  name: string;
  image: string;
  distros: Distro[];
  snapshotDate: string;
  distributionDate: string;
  starMessage?: string;
}

export interface Document {
  rounds: Round[];
}
