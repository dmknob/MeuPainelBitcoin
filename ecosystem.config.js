module.exports = {
  apps : [{
    name   : "MeuPainelBitcoin", // O nome que já usamos para a aplicação
    script : "server.js",      // O arquivo a ser executado

    // Esta linha é importante: garante que o dotenv encontre o .env
    cwd: __dirname,
  }]
}