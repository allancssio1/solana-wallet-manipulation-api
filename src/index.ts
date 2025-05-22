import express, { Express } from 'express'
import { router } from './routes'
import { port } from './env'

const app: Express = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Registrar as rotas relacionadas à Solana
app.use('/api', router)

// Iniciar o servidor
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`)
})
