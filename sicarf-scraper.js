const playwright = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SICARF_URL = 'https://sicarf.iterpa.pa.gov.br/analise/#/login';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function loginSICARF(browser, cpf, senha) {
  const page = await browser.newPage();
  await page.goto(SICARF_URL, { waitUntil: 'networkidle' });
  
  try {
    await page.fill('input[type="text"]', cpf);
    await page.waitForTimeout(500);
    
    await page.fill('input[type="password"]', senha);
    await page.waitForTimeout(500);
    
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
    
    console.log('✅ Login realizado com sucesso');
    return page;
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error.message);
    throw error;
  }
}

async function buscarProcessos(page, numeroProcesso) {
  try {
    await page.waitForSelector('input[placeholder*="Processo"], input[placeholder*="processo"]', { timeout: 10000 });
    
    const inputSelector = 'input[placeholder*="Processo"], input[placeholder*="processo"]';
    await page.fill(inputSelector, numeroProcesso);
    await page.waitForTimeout(1000);
    
    await page.press(inputSelector, 'Enter');
    await page.waitForTimeout(2000);
    
    const dados = await page.evaluate(() => {
      const linhas = document.querySelectorAll('tbody tr');
      const resultado = [];
      
      linhas.forEach(linha => {
        const colunas = linha.querySelectorAll('td');
        if (colunas.length > 0) {
          resultado.push({
            processo: colunas[0]?.textContent?.trim() || '',
            setor: colunas[1]?.textContent?.trim() || '',
            situacao: colunas[2]?.textContent?.trim() || '',
            dataMovimentacao: colunas[3]?.textContent?.trim() || '',
            responsavel: colunas[4]?.textContent?.trim() || ''
          });
        }
      });
      
      return resultado;
    });
    
    return dados;
  } catch (error) {
    console.error(`❌ Erro ao buscar processo ${numeroProcesso}:`, error.message);
    return null;
  }
}

function calcularDiasNoSetor(dataMovimentacao) {
  if (!dataMovimentacao) return null;
  
  try {
    const [dia, mes, ano] = dataMovimentacao.split('/');
    const data = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    const diferenca = Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
    return diferenca >= 0 ? diferenca : 0;
  } catch {
    return null;
  }
}

async function sincronizarComSupabase(processos, aba) {
  try {
    const processosComDias = processos.map(p => ({
      processo: p.processo,
      aba,
      setor: p.setor,
      situacao: p.situacao,
      data_movimentacao: p.dataMovimentacao,
      dias_no_setor: calcularDiasNoSetor(p.dataMovimentacao),
      responsavel: p.responsavel,
      sincronizado_em: new Date().toISOString()
    }));
    
    const { data, error } = await supabase
      .from('processos_sicarf')
      .upsert(processosComDias, { onConflict: 'processo' });
    
    if (error) throw error;
    console.log(`✅ ${processosComDias.length} processos sincronizados na aba ${aba}`);
    return data;
  } catch (error) {
    console.error('❌ Erro ao sincronizar com Supabase:', error.message);
    throw error;
  }
}

async function sincronizarTodosProcesos(processos) {
  const browser = await playwright.chromium.launch({ headless: true });
  
  try {
    const page = await loginSICARF(browser, process.env.SICARF_CPF, process.env.SICARF_SENHA);
    
    const abasProcessos = {
      'Geral': ['2022/518396', '2022/359040', '2022/1163766'],
      'Ricardo Paranhos': ['010600021/2025', '010600023/2025', '092409963/2025'],
      'Erico e Idacir': ['052805668/2025', '052805665/2025', '052705563/2025']
    };
    
    for (const [aba, numeros] of Object.entries(abasProcessos)) {
      console.log(`\n🔍 Sincronizando aba: ${aba}`);
      
      for (const numero of numeros) {
        const dados = await buscarProcessos(page, numero);
        if (dados && dados.length > 0) {
          await sincronizarComSupabase(dados, aba);
        }
        await page.waitForTimeout(1500);
      }
    }
    
    console.log('\n✅ Sincronização completada!');
    return { sucesso: true, mensagem: 'Todos os processos foram sincronizados' };
  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
    return { sucesso: false, erro: error.message };
  } finally {
    await browser.close();
  }
}

module.exports = { sincronizarTodosProcesos, buscarProcessos, calcularDiasNoSetor };
