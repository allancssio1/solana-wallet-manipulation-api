import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js'
import {
  Metaplex,
  keypairIdentity,
  CreateTokenWithMetadataParams,
} from '@metaplex-foundation/js'
import { create, AddResult } from 'ipfs-http-client'
import axios, { AxiosResponse } from 'axios'
import { Octokit } from '@octokit/rest'
import { readFileSync } from 'fs'

// Configurações iniciais
const MINT_ADDRESS: string = 'SEU_MINT_ADDRESS' // Substitua pelo endereço da mint do token
const WALLET_PATH: string = '~/.config/solana/devnet.json' // Caminho da chave privada
const GITHUB_TOKEN: string = 'SEU_GITHUB_TOKEN' // Token de acesso pessoal do GitHub

// Interface para os metadados do token
interface TokenMetadata {
  name: string
  symbol: string
  description: string
  seller_fee_basis_points: number
  creators: never[]
  decimals: number
  logoURI: string
  extensions: { website: string }
  tags: string[]
}

// Interface para os dados enviados ao agregador
interface AggregatorData extends TokenMetadata {
  mint: string
}

// Dados do token para metadados
const tokenMetadata: TokenMetadata = {
  name: 'Meu Token',
  symbol: 'MTK',
  description: 'Um token de teste na Solana Devnet',
  seller_fee_basis_points: 0,
  creators: [],
  decimals: 9,
  logoURI: 'https://meusite.com/logo.png', // Substitua pela URL do logotipo
  extensions: { website: 'https://meusite.com' },
  tags: ['devnet', 'test'],
}

// Função para hospedar metadados no IPFS
async function uploadToIPFS(metadata: TokenMetadata): Promise<string> {
  try {
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
    })
    const { cid }: AddResult = await ipfs.add(JSON.stringify(metadata))
    const url: string = `https://ipfs.io/ipfs/${cid}`
    console.log('Metadados hospedados no IPFS:', url)
    return url
  } catch (error: unknown) {
    console.error('Erro ao hospedar metadados no IPFS:', error)
    throw error
  }
}

// Função para vincular metadados ao token usando Metaplex
async function addMetadataToToken(
  mintAddress: string,
  metadataUri: string,
): Promise<void> {
  try {
    // Conectar à Devnet
    const connection: Connection = new Connection(
      clusterApiUrl('devnet'),
      'confirmed',
    )

    // Carregar a chave privada
    const secretKey: number[] = JSON.parse(readFileSync(WALLET_PATH, 'utf-8'))
    const wallet: Keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey))

    // Configurar Metaplex
    const metaplex: Metaplex = Metaplex.make(connection).use(
      keypairIdentity(wallet),
    )

    // Criar metadados
    const params: CreateTokenWithMetadataParams = {
      mint: new PublicKey(mintAddress),
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: tokenMetadata.seller_fee_basis_points,
    }

    await metaplex.tokens().createTokenWithMetadata(params)

    console.log('Metadados vinculados ao token:', mintAddress)
  } catch (error: unknown) {
    console.error('Erro ao vincular metadados:', error)
    throw error
  }
}

// Função para submeter o token ao Solflare Unified Token List Aggregator
async function submitToSolflareAggregator(
  tokenData: AggregatorData,
): Promise<void> {
  try {
    const octokit: Octokit = new Octokit({ auth: GITHUB_TOKEN })
    const repoOwner: string = 'solflare-wallet'
    const repoName: string = 'utl-aggregator'
    const branchName: string = `add-token-${tokenData.mint}`

    // Obter o SHA do branch principal
    const mainBranch: { data: { commit: { sha: string } } } =
      await octokit.repos.getBranch({
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
    const pr: { data: { html_url: string } } = await octokit.pulls.create({
      owner: repoOwner,
      repo: repoName,
      title: `Add token: ${tokenData.name}`,
      head: branchName,
      base: 'main',
      body: `Adicionando token ${tokenData.name} (${tokenData.mint}) à lista.`,
    })

    console.log('Pull request criado:', pr.data.html_url)
  } catch (error: unknown) {
    console.error('Erro ao submeter ao Solflare Aggregator:', error)
    throw error
  }
}

// Função principal para executar todo o processo
export async function registerToken(): Promise<void> {
  try {
    // Passo 1: Hospedar metadados no IPFS
    const metadataUri: string = await uploadToIPFS(tokenMetadata)

    // Passo 2: Vincular metadados ao token
    await addMetadataToToken(MINT_ADDRESS, metadataUri)

    // Passo 3: Preparar dados para o agregador
    const aggregatorData: AggregatorData = {
      mint: MINT_ADDRESS,
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      decimals: tokenMetadata.decimals,
      logoURI: tokenMetadata.logoURI,
      tags: tokenMetadata.tags,
      extensions: tokenMetadata.extensions,
    }

    // Passo 4: Submeter ao Solflare Aggregator
    await submitToSolflareAggregator(aggregatorData)

    console.log('Processo concluído com sucesso!')
  } catch (error: unknown) {
    console.error('Erro no processo de registro:', error)
  }
}
