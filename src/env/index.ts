import dotenv from 'dotenv'

dotenv.config()

export const port = process.env.PORT || 3000
export const privateKey: number[] = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : []
export const metadataUri = process.env.METADATA_URI
