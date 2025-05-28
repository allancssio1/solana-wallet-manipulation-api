import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createMint,
} from '@solana/spl-token'
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata'
import { Octokit } from '@octokit/rest'
import { githubToken } from '../env'

// Interface para os parâmetros da função
interface CreateTokenParams {
  privateKey: Uint8Array
  name: string
  symbol: string
  quantity?: number
  logoURI?: string
  website?: string
}

// Interface para os metadados do token
interface TokenMetadata {
  name: string
  symbol: string
  uri: string
  sellerFeeBasisPoints: number
  creators: null
  collection: null
  uses: null
  decimals: number
  logoURI: string
  extensions: { website: string }
  tags: string[]
}

// Interface para os dados do agregador
interface AggregatorData extends TokenMetadata {
  mint: string
}

// Interface para o retorno da função
interface CreateTokenResult {
  mintAddress: string
  tokenAccountAddress: string
  metadataUri: string
  pullRequestUrl?: string
}

const metadataUri =
  'https://solana-wallet-manipulation-api.onrender.com/api/metadata'

// Função para validar metadados na URL fornecida
async function validateMetadataUri(
  uri: string,
  expectedName: string,
  expectedSymbol: string,
): Promise<void> {
  try {
    const response = await axios.get<{
      name?: string
      symbol?: string
      image?: string
    }>(uri)
    const metadata: { name?: string; symbol?: string; image?: string } =
      response.data

    if (!metadata.name || !metadata.symbol || !metadata.image) {
      throw new Error('Metadados incompletos: deve conter name, symbol e image')
    }
    if (metadata.name !== expectedName || metadata.symbol !== expectedSymbol) {
      console.warn(
        `Aviso: Metadados na URL (name: ${metadata.name}, symbol: ${metadata.symbol}) diferem dos fornecidos (name: ${expectedName}, symbol: ${expectedSymbol})`,
      )
    }
  } catch (error: unknown) {
    throw new Error(`Erro ao validar metadataUri (${uri}): ${error}`)
  }
}

// Função para submeter ao Solflare Unified Token List Aggregator
async function submitToSolflareAggregator(
  tokenData: AggregatorData,
): Promise<string | undefined> {
  if (!githubToken) {
    console.warn(
      'githubToken não configurado. Submissão ao Solflare Aggregator ignorada.',
    )
    return undefined
  }

  try {
    const octokit: Octokit = new Octokit({ auth: githubToken })
    const repoOwner: string = 'solflare-wallet'
    const repoName: string = 'utl-aggregator'
    const branchName: string = `add-token-${tokenData.mint}`

    // Obter o SHA do branch principal
    const mainBranch = await octokit.repos.getBranch({
      owner: repoOwner,
      repo: repoName,
      branch: 'main',
    })

    // Criar um novo branch
    await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: mainBranch.data.commit.sha,
    })

    // Criar arquivo JSON com os dados do token
    const tokenFileContent: string = Buffer.from(
      JSON.stringify(tokenData, null, 2),
    ).toString('base64')
    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: `tokens/${tokenData.mint}.json`,
      message: `Add token ${tokenData.name}`,
      content: tokenFileContent,
      branch: branchName,
    })

    // Criar pull request
    const pr = await octokit.pulls.create({
      owner: repoOwner,
      repo: repoName,
      title: `Add token: ${tokenData.name}`,
      head: branchName,
      base: 'main',
      body: `Adicionando token ${tokenData.name} (${tokenData.mint}) à lista.`,
    })

    console.log('Pull request criado:', pr.data.html_url)
    return pr.data.html_url
  } catch (error: unknown) {
    console.error('Erro ao submeter ao Solflare Aggregator:', error)
    return undefined
  }
}

// Função principal para criar o token
export async function createTokenInWallet({
  privateKey,
  name,
  symbol,
  quantity = 1,
  logoURI = 'https://solana-wallet-manipulation-api.onrender.com/api/metadata/image.png',
  website = 'https://meusite.com',
}: CreateTokenParams): Promise<CreateTokenResult> {
  // Validações iniciais
  if (privateKey.length !== 64) {
    throw new Error('Chave privada inválida: deve ter 64 bytes')
  }
  if (name.length > 32) {
    throw new Error('Nome deve ter no máximo 32 caracteres')
  }
  if (symbol.length > 10) {
    throw new Error('Símbolo deve ter no máximo 10 caracteres')
  }
  if (quantity <= 0) {
    throw new Error('Quantidade deve ser maior que zero')
  }
  console.log('1')

  // Validar metadataUri
  await validateMetadataUri(metadataUri, name, symbol)

  // Configurar conexão com a Devnet
  const connection: Connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed',
  )
  console.log('2')

  // Criar keypair a partir da chave privada
  const walletKeypair: Keypair = Keypair.fromSecretKey(privateKey)

  // Verificar saldo mínimo
  const balance: number = await connection.getBalance(walletKeypair.publicKey)
  const minBalance: number = await connection.getMinimumBalanceForRentExemption(
    165,
  ) // Tamanho aproximado para mint + metadados
  if (balance < minBalance) {
    throw new Error(
      `Saldo de SOL insuficiente: necessário ~${
        minBalance / 1_000_000_000
      } SOL, disponível ${balance / 1_000_000_000} SOL`,
    )
  }
  console.log('3')

  try {
    // Criar mint
    const mint: PublicKey = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      null,
      6, // Casas decimais
    )

    // Criar ou obter conta associada
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      mint,
      walletKeypair.publicKey,
    )
    console.log('4')

    // Mintar tokens
    const initialAmount: number = Math.floor(quantity * 1_000_000)
    await mintTo(
      connection,
      walletKeypair,
      mint,
      tokenAccount.address,
      walletKeypair.publicKey,
      initialAmount,
    )
    console.log('5')

    // Preparar metadados
    const metadata: TokenMetadata = {
      name,
      symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
      decimals: 6,
      logoURI,
      extensions: { website },
      tags: ['devnet', 'test'],
    }

    // Criar instrução de metadados
    const metadataPDA: PublicKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )[0]

    console.log('7')
    const metadataInstruction = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint,
        mintAuthority: walletKeypair.publicKey,
        payer: walletKeypair.publicKey,
        updateAuthority: walletKeypair.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
            creators: metadata.creators,
            collection: metadata.collection,
            uses: metadata.uses,
          },
          isMutable: true,
          collectionDetails: null,
        },
      },
    )

    console.log('8')
    // Criar e assinar uma VersionedTransaction
    const transaction = new Transaction().add(metadataInstruction)
    const recentBlockhash = await connection.getLatestBlockhash('confirmed')
    transaction.recentBlockhash = recentBlockhash.blockhash
    transaction.feePayer = walletKeypair.publicKey

    // Converter Transaction para VersionedTransaction
    const versionedTransaction = VersionedTransaction.deserialize(
      transaction.serialize(),
    )
    console.log('9')
    versionedTransaction.sign([walletKeypair])

    // Enviar transação
    const signature = await connection.sendTransaction(versionedTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })
    console.log('10')
    await connection.confirmTransaction(signature, 'confirmed')

    // Submeter ao Solflare Aggregator
    const aggregatorData: AggregatorData = {
      mint: mint.toBase58(),
      ...metadata,
    }
    console.log('11')
    const pullRequestUrl: string | undefined = await submitToSolflareAggregator(
      aggregatorData,
    )

    // Retornar resultado
    return {
      mintAddress: mint.toBase58(),
      tokenAccountAddress: tokenAccount.address.toBase58(),
      metadataUri: metadataUri,
      pullRequestUrl,
    }
  } catch (error: unknown) {
    console.log('erro', error)
    throw new Error(`Erro ao criar token: ${error}`)
  }
}

// export async function createTokenInWallet({
//   privateKey,
//   name,
//   symbol,
//   quantity = 1,
// }: {
//   privateKey: number[]
//   quantity: number
//   name: string
//   symbol: string
// }): Promise<string> {
//   if (privateKey.length !== 64)
//     throw new Error('Chave privada inválida: deve ter 64 bytes')
//   if (name.length > 32) throw new Error('Nome deve ter no máximo 32 caracteres')
//   if (symbol.length > 10)
//     throw new Error('Símbolo deve ter no máximo 10 caracteres')

//   const connection = new Connection(
//     'https://api.devnet.solana.com',
//     'confirmed',
//   )

//   const walletKeypair = Keypair.fromSecretKey(new Uint8Array(privateKey))

//   const balance = await connection.getBalance(walletKeypair.publicKey)
//   if (balance < 0.05 * 1_000_000_000)
//     throw new Error('Saldo de SOL insuficiente')

//   const mint = await createMint(
//     connection,
//     walletKeypair,
//     walletKeypair.publicKey,
//     null,
//     6,
//   )

//   const tokenAccount = await getOrCreateAssociatedTokenAccount(
//     connection,
//     walletKeypair,
//     mint,
//     walletKeypair.publicKey,
//   )

//   const initialAmount = Math.floor(quantity * 1_000_000)
//   await mintTo(
//     connection,
//     walletKeypair,
//     mint,
//     tokenAccount.address,
//     walletKeypair.publicKey,
//     initialAmount,
//   )

//   const metadataPDA = PublicKey.findProgramAddressSync(
//     [
//       Buffer.from('metadata'),
//       TOKEN_METADATA_PROGRAM_ID.toBuffer(),
//       mint.toBuffer(),
//     ],
//     TOKEN_METADATA_PROGRAM_ID,
//   )[0]

//   const metadataInstruction = createCreateMetadataAccountV3Instruction(
//     {
//       metadata: metadataPDA,
//       mint: mint,
//       mintAuthority: walletKeypair.publicKey,
//       payer: walletKeypair.publicKey,
//       updateAuthority: walletKeypair.publicKey,
//     },
//     {
//       createMetadataAccountArgsV3: {
//         data: {
//           name: name,
//           symbol: symbol,
//           uri: metadataUri ?? '',
//           sellerFeeBasisPoints: 0,
//           creators: null,
//           collection: null,
//           uses: null,
//         },
//         isMutable: true,
//         collectionDetails: null,
//       },
//     },
//   )

//   const transaction = new Transaction().add(metadataInstruction)
//   const signature = await connection.sendTransaction(
//     transaction,
//     [walletKeypair],
//     {
//       skipPreflight: false,
//       preflightCommitment: 'confirmed',
//     },
//   )

//   await connection.confirmTransaction(signature, 'confirmed')

//   await registerToken()

//   return mint.toBase58()
// }
