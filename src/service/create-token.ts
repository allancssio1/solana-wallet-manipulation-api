import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createMint,
} from '@solana/spl-token'
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata'

export async function createTokenInWallet({
  privateKey,
  name,
  symbol,
  quantity = 1,
}: {
  privateKey: number[]
  quantity: number
  name: string
  symbol: string
}): Promise<string> {
  // Validações iniciais
  if (privateKey.length !== 64)
    throw new Error('Chave privada inválida: deve ter 64 bytes')
  if (name.length > 32) throw new Error('Nome deve ter no máximo 32 caracteres')
  if (symbol.length > 10)
    throw new Error('Símbolo deve ter no máximo 10 caracteres')

  // Conexão com a devnet da Solana
  const connection = new Connection(
    'https://api.devnet.solana.com',
    'confirmed',
  )

  // Cria o keypair a partir da chave privada
  const walletKeypair = Keypair.fromSecretKey(new Uint8Array(privateKey))

  // Verifica saldo de SOL
  const balance = await connection.getBalance(walletKeypair.publicKey)
  if (balance < 0.05 * 1_000_000_000)
    throw new Error('Saldo de SOL insuficiente')

  // Cria um novo mint (token) com 6 decimais
  const mint = await createMint(
    connection,
    walletKeypair, // Pagador da transação
    walletKeypair.publicKey, // Autoridade do mint
    null, // Sem autoridade de congelamento
    6, // Número de decimais
  )

  // Obtém ou cria a conta de token associada à carteira
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    mint,
    walletKeypair.publicKey,
  )

  // Mintar a quantidade inicial de tokens para a conta associada
  const initialAmount = Math.floor(quantity * 1_000_000) // Ajusta para 6 decimais
  await mintTo(
    connection,
    walletKeypair,
    mint,
    tokenAccount.address,
    walletKeypair.publicKey,
    initialAmount,
  )

  // Configura a metadata do token
  const metadataPDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  )[0]

  const metadataInstruction = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPDA,
      mint: mint,
      mintAuthority: walletKeypair.publicKey,
      payer: walletKeypair.publicKey,
      updateAuthority: walletKeypair.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: name,
          symbol: symbol,
          uri: '',
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    },
  )

  // Cria e envia a transação para configurar a metadata
  const transaction = new Transaction().add(metadataInstruction)
  const signature = await connection.sendTransaction(
    transaction,
    [walletKeypair],
    {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    },
  )

  // Aguarda a confirmação da transação
  await connection.confirmTransaction(signature, 'confirmed')

  // Retorna o endereço do mint criado
  return mint.toBase58()
}
