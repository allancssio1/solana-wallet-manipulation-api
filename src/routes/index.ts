import express, { Request, Response } from 'express'

import { privateKey } from '../env'
import { createTokenInWallet, testandoDB } from '../service/create-token'
import { transferTokens } from '../service/transfer-token'

// Configurar o roteador
export const router = express.Router()

interface CreateTokenRequest extends Request {
  body: {
    name: string
    symbol: string
    quantity: number
  }
}

interface TransferTokenRequest extends Request {
  body: {
    toWallet: string
    tokenMint: string
    quantity: number
  }
}

// Rota para realizar a transferência de tokens
router.post('/transfer', async (req: TransferTokenRequest, res: Response) => {
  try {
    const { toWallet, tokenMint, quantity } = req.body
    const result = await transferTokens(
      privateKey,
      toWallet,
      tokenMint,
      quantity,
    )
    res.status(200).json(result)
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Rota para gerar uma nova API Key
router.post('/create-token', (req: CreateTokenRequest, res: Response) => {
  try {
    const { name, quantity, symbol } = req.body
    const mint = createTokenInWallet({
      privateKey: new Uint8Array(privateKey),
      quantity,
      name,
      symbol,
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
    name: 'Imovel chain BCS 1',
    symbol: 'ICBCS',
    description:
      'The Imovel chain BCS (ICBCS) is the community governance and utility token for the Metaplex Protocol.',
    website: 'https://solana-wallet-manipulation-api.onrender.com/',
    image: 'https://solana-wallet-manipulation-api.onrender.com/api/logo',
  })
})

router.get('/logo', (req: Request, res: Response) => {
  res.sendFile('logo.png', { root: `./public/` })
})

router.get('/teste', (req: Request, res: Response) => {
  const result = testandoDB()
  res.json(result)
})
