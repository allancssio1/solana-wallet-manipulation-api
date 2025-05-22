import express, { Request, Response } from 'express'

import { privateKey } from '../env'
import { createTokenInWallet } from '../service/create-token'
import { transferTokens } from '../service/transfer-token'

// Configurar o roteador
export const router = express.Router()

const toWallet = 'Hz6cCyZeuTTbsQ6RXQDEkiWRTMbk7fiPMMABY7ihpaNa'
const tokenMint = 'FMSc3GS1XiYiZMh3tmUmaAHhYNoGX6ApM5Yhxa6d9vrG'

// Rota para realizar a transferência de tokens
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const result = await transferTokens(privateKey, toWallet, tokenMint, 1)
    res.status(200).json(result)
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Rota para gerar uma nova API Key
router.post('/create-token', (req: Request, res: Response) => {
  try {
    const mint = createTokenInWallet({
      privateKey: privateKey,
      quantity: 60,
      name: 'Token_001',
      symbol: 'BCS',
    })
    res.status(201).json({
      success: true,
      mint,
      message: 'Token criado com sucesso',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

router.get('/metadata', (req: Request, res: Response) => {
  res.json({
    name: 'Metaplex Token',
    symbol: 'MPLX',
    description:
      'The Metaplex Token (MPLX) is the community governance and utility token for the Metaplex Protocol.',
    website: 'http://167.172.135.96:3002/',
    image: 'http://167.172.135.96:3002/logo',
  })
})
