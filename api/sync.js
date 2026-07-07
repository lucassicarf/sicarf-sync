const { sincronizarTodosProcesos } = require('../sicarf-scraper');

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== process.env.SYNC_SECRET) {
      return res.status(401).json({ erro: 'Não autorizado' });
    }

    const resultado = await sincronizarTodosProcesos();
    
    return res.status(200).json({
      sucesso: resultado.sucesso,
      mensagem: resultado.mensagem || resultado.erro,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      erro: 'Erro na sincronização',
      detalhes: error.message
    });
  }
}
