import { Autumn } from "autumn-js"
import { env } from "@tripwire/env/server"

if (env.NODE_ENV === "production" && !env.AUTUMN_SECRET_KEY) {
  throw new Error("AUTUMN_SECRET_KEY is required in production")
}

export const autumn = new Autumn({
  secretKey: env.AUTUMN_SECRET_KEY,
})
