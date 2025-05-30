import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token'

const redeMainnet = 'https://api.mainnet-beta.solana.com'
// const redeDevnet = 'https://api.devnet.solana.com'

export async function transferTokens(
  privateKey: number[],
  recipientAddress: string,
  tokenMint: string,
  tokenQuantity: number,
): Promise<string> {
  // Conexão com a mainnet da Solana
  const connection = new Connection(redeMainnet, 'confirmed')

  // Criação do keypair do remetente
  const senderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKey))

  // Criação dos objetos PublicKey
  const recipientPubkey = new PublicKey(recipientAddress)
  const tokenMintPubkey = new PublicKey(tokenMint)
  try {
    // Obtém o endereço da conta de token do remetente
    const sourceTokenAccountAddress = await getAssociatedTokenAddress(
      tokenMintPubkey,
      senderKeypair.publicKey,
    )

    // Obtém ou cria a conta de token do destinatário
    const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      senderKeypair,
      tokenMintPubkey,
      recipientPubkey,
    )

    // Obtém informações do mint para decimais
    const mintInfo = await getMint(connection, tokenMintPubkey)
    const decimals = mintInfo.decimals

    // Calcula a quantidade em unidades inteiras
    const amount = Math.floor(tokenQuantity * Math.pow(10, decimals))

    // Cria a instrução de transferência
    const transferInstruction = createTransferInstruction(
      sourceTokenAccountAddress,
      destinationTokenAccount.address,
      senderKeypair.publicKey,
      amount,
    )

    // Monta a transação
    const transaction = new Transaction().add(transferInstruction)

    // Envia e confirma a transação
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      senderKeypair,
    ])

    return signature
  } catch (error) {
    console.log('🚀 ~ error:', error)
    return 'Erro ao transferir tokens'
  }
}
