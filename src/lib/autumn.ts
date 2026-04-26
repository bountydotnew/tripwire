import { Autumn } from "autumn-js";

export const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});
