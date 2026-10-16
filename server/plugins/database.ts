import { verifyDatabaseConnection } from '../utils/database'

export default defineNitroPlugin(async () => {
  await verifyDatabaseConnection()
})
