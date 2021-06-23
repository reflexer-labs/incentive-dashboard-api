import { Document } from "./utils";

export const createDoc = async (): Promise<Document> => {
  const rawDoc = require( '../distros.yml')
  return rawDoc;
};

createDoc();
