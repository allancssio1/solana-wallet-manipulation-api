import { Keypair } from '@solana/web3.js'

const wallets: Record<string, Keypair> = {}

export function getWallets(): Record<string, Keypair> {
  return wallets
}
