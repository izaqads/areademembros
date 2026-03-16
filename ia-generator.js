// ============================================
// GERADOR DE ANÚNCIOS COM IA
// ============================================
// ARQUIVO SEPARADO PARA LÓGICA DA IA
// Altere aqui para aprimorar a geração de anúncios!

const iaConfig = require('./ia-config');

/**
 * Gera anúncio usando Claude AI
 * @param {Object} anthropicClient - Cliente Anthropic configurado
 * @param {string} palavrasChave - Palavras-chave do anúncio
 * @param {string} idioma - Idioma do anúncio
 * @returns {Promise<Object>} Resultado da geração
 */
async function gerarAnuncio(anthropicClient, palavrasChave, idioma) {
    try {
        console.log('🚀 Iniciando geração de anúncio...');
        console.log('📝 Palavras-chave:', palavrasChave);
        console.log('🌐 Idioma:', idioma);

        // Validar inputs
        if (!palavrasChave || !idioma) {
            throw new Error('Palavras-chave e idioma são obrigatórios');
        }

        // Validar client
        if (!anthropicClient) {
            throw new Error('Anthropic client não configurado');
        }

        // Obter prompt da configuração
        const prompt = iaConfig.getAdPrompt(palavrasChave, idioma);

        console.log('🤖 Chamando Claude Opus 4 (modelo mais avançado)...');
        
        // Chamar Claude com configurações otimizadas
        const message = await anthropicClient.messages.create({
            model: iaConfig.MODEL,
            max_tokens: iaConfig.MAX_TOKENS,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        // Extrair resposta
        const anuncio = message.content[0].text;
        
        console.log('✅ Anúncio gerado com sucesso com Claude Opus 4!');
        console.log('📊 Tokens usados:', message.usage);

        return {
            sucesso: true,
            anuncio: anuncio,
            palavrasChave: palavrasChave,
            idioma: idioma,
            modelo: iaConfig.MODEL,
            tokensUsados: message.usage
        };

    } catch (err) {
        console.error('❌ ERRO NA GERAÇÃO DE ANÚNCIO:');
        console.error('Tipo:', err.constructor.name);
        console.error('Mensagem:', err.message);
        console.error('Stack:', err.stack);

        throw new Error(`Erro ao gerar anúncio: ${err.message}`);
    }
}

module.exports = {
    gerarAnuncio
};
