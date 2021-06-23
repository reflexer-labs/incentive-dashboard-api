export const DOCUMENT_KEY = "doc";

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
  distros: Distro[];
  snapshotDate: string;
  distributionDate: string;
  starMessage?: string;
}

export interface Document {
  rounds: Round[];
}
