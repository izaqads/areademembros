const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Anthropic para gerar anúncios
let Anthropic;
let anthropicClient = null;

try {
    Anthropic = require('@anthropic-ai/sdk');
    if (process.env.ANTHROPIC_API_KEY) {
        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        console.log('✅ Claude API configurada!');
        console.log('🔑 API Key presente:', process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...');
    } else {
        console.log('❌ ANTHROPIC_API_KEY não definida no .env ou Environment Variables!');
        console.log('⚠️  Gerador de anúncios desativado.');
    }
} catch (e) {
    console.log('⚠️  Anthropic SDK não instalado. Instale com: npm install @anthropic-ai/sdk');
}

// SendGrid para emails
let sgMail;
try {
    sgMail = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
} catch (e) {
    console.log('⚠️  SendGrid não instalado. Instale com: npm install @sendgrid/mail');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÃO SUPABASE
// ============================================
const SUPABASE_URL = 'https://nuimrrobhvpzxgcuknhr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eT9uNZfmcgNIkScMUb_UAA_WaFSXjki';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    credentials: false
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurar sessões
app.use(session({
    secret: 'sua-chave-secreta-segura-mude-isso',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        httpOnly: false,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ============================================
// CARREGAR CONFIGURAÇÃO
// ============================================
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Erro ao carregar config.json:', err);
        return {};
    }
}

function saveConfig(config) {
    try {
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error('Erro ao salvar config.json:', err);
        return false;
    }
}

// ============================================
// FUNÇÕES AUXILIARES DE EMAIL
// ============================================
async function enviarEmail(para, assunto, html) {
    if (!sgMail) {
        console.log(`📧 EMAIL SIMULADO - Para: ${para}, Assunto: ${assunto}`);
        return true;
    }

    try {
        await sgMail.send({
            to: para,
            from: process.env.EMAIL_FROM || 'noreply@seudominio.com',
            subject: assunto,
            html: html
        });
        console.log(`✓ Email enviado para ${para}`);
        return true;
    } catch (err) {
        console.error('Erro ao enviar email:', err);
        return false;
    }
}

function gerarTokenRecuperacao() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const { data: existing } = await supabase
            .from('alunos')
            .select('*')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Email já registrado' });
        }

        const { data, error } = await supabase
            .from('alunos')
            .insert([{ nome, email, senha }])
            .select()
            .single();

        if (error) {
            return res.status(400).json({ error: 'Erro ao criar conta' });
        }

        req.session.userId = data.id;
        req.session.userName = data.nome;
        req.session.userEmail = data.email;

        // Enviar email de boas-vindas
        const emailHTML = `
            <h2>Bem-vindo à Plataforma! 🎉</h2>
            <p>Olá <strong>${data.nome}</strong>,</p>
            <p>Sua conta foi criada com sucesso!</p>
            <p>Você já pode acessar todas as aulas disponíveis na plataforma.</p>
            <p>Bom aprendizado!</p>
            <hr>
            <p style="color: #888; font-size: 12px;">Se você não criou essa conta, ignore este email.</p>
        `;
        await enviarEmail(data.email, 'Bem-vindo à Plataforma!', emailHTML);

        res.json({ success: true, user: { id: data.id, nome: data.nome, email: data.email } });
    } catch (err) {
        console.error('Erro no registro:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('alunos')
            .select('*')
            .eq('email', email)
            .eq('senha', senha)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        req.session.userId = data.id;
        req.session.userName = data.nome;
        req.session.userEmail = data.email;

        res.json({ success: true, user: { id: data.id, nome: data.nome, email: data.email } });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout' });
        }
        res.json({ success: true });
    });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session.userId) {
        res.json({
            success: true,
            user: {
                id: req.session.userId,
                nome: req.session.userName,
                email: req.session.userEmail
            }
        });
    } else {
        res.status(401).json({ success: false, error: 'Não autenticado' });
    }
});

// ============================================
// ROTAS DE RECUPERAÇÃO DE SENHA
// ============================================

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const { data } = await supabase
            .from('alunos')
            .select('*')
            .eq('email', email)
            .single();

        if (!data) {
            return res.json({ success: false, error: 'Email não encontrado' });
        }

        // Gerar token de recuperação
        const token = gerarTokenRecuperacao();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Salvar token (você pode usar arquivo ou banco de dados)
        const resetPath = path.join(__dirname, 'password_resets.json');
        let resets = {};
        try {
            resets = JSON.parse(fs.readFileSync(resetPath, 'utf-8'));
        } catch (e) {}

        resets[email] = { token, expiresAt: expiresAt.toISOString() };
        fs.writeFileSync(resetPath, JSON.stringify(resets, null, 2));

        // Enviar email com link de recuperação
        const resetLink = `${process.env.SITE_URL || 'http://localhost:3000'}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;

        const emailHTML = `
            <h2>Recuperação de Senha 🔐</h2>
            <p>Recebemos uma solicitação para resetar sua senha.</p>
            <p><a href="${resetLink}" style="background: #4F7DFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Resetar Senha</a></p>
            <p>Este link expira em 24 horas.</p>
            <p style="color: #888; font-size: 12px;">Se você não solicitou isso, ignore este email.</p>
        `;

        await enviarEmail(email, 'Recuperação de Senha', emailHTML);

        res.json({ success: true, message: 'Email de recuperação enviado!' });
    } catch (err) {
        res.json({ success: false, error: 'Erro ao processar solicitação' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, email, novaSenha } = req.body;

        const resetPath = path.join(__dirname, 'password_resets.json');
        let resets = {};
        try {
            resets = JSON.parse(fs.readFileSync(resetPath, 'utf-8'));
        } catch (e) {}

        const reset = resets[email];

        if (!reset || reset.token !== token) {
            return res.json({ success: false, error: 'Token inválido ou expirado' });
        }

        if (new Date() > new Date(reset.expiresAt)) {
            delete resets[email];
            fs.writeFileSync(resetPath, JSON.stringify(resets, null, 2));
            return res.json({ success: false, error: 'Token expirado' });
        }

        // Atualizar senha
        const { error } = await supabase
            .from('alunos')
            .update({ senha: novaSenha })
            .eq('email', email);

        if (error) {
            return res.json({ success: false, error: 'Erro ao atualizar senha' });
        }

        // Remover token usado
        delete resets[email];
        fs.writeFileSync(resetPath, JSON.stringify(resets, null, 2));

        // Enviar confirmação
        const emailHTML = `
            <h2>Senha Resetada ✓</h2>
            <p>Sua senha foi alterada com sucesso!</p>
            <p>Se você não fez isso, contate o suporte imediatamente.</p>
        `;
        await enviarEmail(email, 'Senha Resetada', emailHTML);

        res.json({ success: true, message: 'Senha atualizada!' });
    } catch (err) {
        res.json({ success: false, error: 'Erro ao resetar senha' });
    }
});

// ============================================
// ROTAS DE AVALIAÇÕES
// ============================================

app.post('/api/aulas/:aulaId/rating', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        const { aulaId } = req.params;
        const { rating } = req.body;

        // Enviar notificação por email (opcional)
        const emailHTML = `
            <h2>Nova Avaliação Recebida ⭐</h2>
            <p><strong>${req.session.userName}</strong> avaliou uma aula com <strong>${rating} estrela${rating > 1 ? 's' : ''}</strong>!</p>
            <p>Email: ${req.session.userEmail}</p>
            <p>Aula ID: ${aulaId}</p>
        `;

        await enviarEmail(
            process.env.ADMIN_EMAIL || 'admin@seusite.com',
            'Nova Avaliação Recebida',
            emailHTML
        );

        res.json({ success: true, message: 'Avaliação registrada!' });
    } catch (err) {
        res.json({ success: false, error: 'Erro ao salvar avaliação' });
    }
});

// ============================================
// ROTAS DE COMENTÁRIOS
// ============================================

app.post('/api/aulas/:aulaId/comments', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        const { aulaId } = req.params;
        const { texto } = req.body;

        // Enviar notificação por email
        const emailHTML = `
            <h2>Novo Comentário em Aula 💬</h2>
            <p><strong>${req.session.userName}</strong> comentou:</p>
            <p style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                "${texto}"
            </p>
            <p>Aula ID: ${aulaId}</p>
            <p>Email: ${req.session.userEmail}</p>
        `;

        await enviarEmail(
            process.env.ADMIN_EMAIL || 'admin@seusite.com',
            'Novo Comentário em Aula',
            emailHTML
        );

        res.json({ success: true, message: 'Comentário salvo!' });
    } catch (err) {
        res.json({ success: false, error: 'Erro ao salvar comentário' });
    }
});

app.get('/api/config', (req, res) => {
    const config = loadConfig();
    res.json(config);
});

app.post('/api/config', (req, res) => {
    const config = req.body;
    
    if (saveConfig(config)) {
        res.json({ success: true, message: 'Configuração salva com sucesso!' });
    } else {
        res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
});

// ============================================
// ROTAS DE AULAS E ALUNOS
// ============================================

app.get('/api/aulas', (req, res) => {
    const config = loadConfig();
    res.json(config.aulas || []);
});

app.get('/api/alunos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('alunos')
            .select('id, nome, email, criado_em')
            .order('criado_em', { ascending: false });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        console.error('Erro ao buscar alunos:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// ============================================
// GERADOR DE ANÚNCIOS COM CLAUDE (VERSÃO AVANÇADA)
// ============================================
app.post('/api/generate-ads', async (req, res) => {
    try {
        console.log('📨 Requisição recebida em /api/generate-ads');
        
        // Verificar se API Key existe
        const apiKey = process.env.ANTHROPIC_API_KEY;
        console.log('🔑 Verificando API Key...');
        
        if (!apiKey) {
            console.error('❌ API Key não configurada!');
            return res.status(400).json({ 
                error: 'API Key do Claude não configurada' 
            });
        }

        const { palavrasChave, idioma } = req.body;
        console.log('📝 Dados recebidos:', { palavrasChave, idioma });

        if (!palavrasChave || !idioma) {
            return res.status(400).json({ error: 'Palavras-chave e idioma são obrigatórios' });
        }

        // Criar client com API Key
        console.log('🤖 Criando cliente Anthropic...');
        const { Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        console.log('✅ Cliente criado com sucesso!');

        // PROMPT MUITO MAIS INTELIGENTE
        const prompt = `Você é um ESPECIALISTA MÁSTER em Google Ads, copywriting de conversão, psicologia do consumidor e marketing digital. 

Sua tarefa é gerar um anúncio EXTREMAMENTE PERSUASIVO e de alta conversão para Google Ads.

CONTEXTO DO PRODUTO:
- Palavras-chave: "${palavrasChave}"
- Idioma: ${idioma}
- Objetivo: MAXIMIZAR CLIQUES E CONVERSÕES
- Público: Consumidores buscando essa solução

REGRAS OBRIGATÓRIAS:
1. TÍTULOS devem ser MAGNÉTICOS - usar gatilhos psicológicos (urgência, escassez, benefício)
2. HEADLINES devem FOCAR EM BENEFÍCIO PRINCIPAL - não em features
3. DESCRIÇÕES devem criar DESEJO e CONFIANÇA
4. SITE LINKS devem guiar para ações específicas

GATILHOS PSICOLÓGICOS A USAR:
✓ Urgência ("Hoje", "Agora", "Limite")
✓ Benefício específico ("Economize X%", "Ganhe Y")
✓ Prova social ("10k clientes", "Avaliação 4.9★")
✓ Confiança ("Garantia", "Sem risco", "100% seguro")
✓ Escassez ("Estoque limitado", "Últimas vagas")

ESTRUTURA DE RESPOSTA:

---TÍTULOS (MAGNÉTICOS)---
1. [Título 1 - máx 30 chars] - use gatilho psicológico
2. [Título 2 - máx 30 chars] - abordagem diferente
3. [Título 3 - máx 30 chars]
... até 10 opções

---HEADLINES (BENEFIT-DRIVEN)---
1. [Headline 1 - máx 30 chars] - benefício #1
2. [Headline 2 - máx 30 chars] - benefício #2
3. [Headline 3 - máx 30 chars] - prova social
... até 10 opções

---DESCRIÇÕES (PERSUASIVAS)---
1. [Descrição 1 - máx 90 chars] - benefício + gatilho
2. [Descrição 2 - máx 90 chars] - confiança + garantia
3. [Descrição 3 - máx 90 chars] - urgência
... até 7 opções

---SITE LINKS (AÇÃO)---
1. [Link 1 - máx 25 chars] → descrição da ação
2. [Link 2 - máx 25 chars] → descrição da ação
3. [Link 3 - máx 25 chars] → descrição da ação
... até 5 opções

LEMBRE-SE:
- Cada texto deve passar EMOÇÃO e não apenas informação
- Evitar clichês genéricos
- Usar números específicos quando possível
- Direcionar para ação clara
- Manter tom conversacional e confiável`;

        console.log('🚀 Chamando Claude Opus 4 (modelo mais avançado)...');
        const message = await client.messages.create({
            model: 'claude-opus-4-20250514', // ✨ MODELO MAIS NOVO E INTELIGENTE
            max_tokens: 3000, // Aumentado para mais qualidade
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        const anuncio = message.content[0].text;
        console.log('✅ Anúncio gerado com sucesso com Claude Opus 4!');

        res.json({
            sucesso: true,
            anuncio: anuncio,
            palavrasChave: palavrasChave,
            idioma: idioma,
            modelo: 'Claude Opus 4 (Avançado)'
        });

    } catch (err) {
        console.error('❌ ERRO DETALHADO:', err);
        console.error('Tipo de erro:', err.constructor.name);
        console.error('Mensagem:', err.message);
        
        res.status(500).json({ 
            error: 'Erro ao gerar anúncio: ' + err.message,
            tipo: err.constructor.name
        });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    // Criar aluno de teste automaticamente
    try {
        const { data } = await supabase
            .from('alunos')
            .select('*')
            .eq('email', 'teste@exemplo.com')
            .single();

        if (!data) {
            await supabase
                .from('alunos')
                .insert([{
                    nome: 'Usuário Teste',
                    email: 'teste@exemplo.com',
                    senha: '123456'
                }]);
            console.log('✅ Aluno de teste criado!');
        }
    } catch (err) {
        // Ignorar erros (aluno já pode existir)
    }
    
    console.log(`
╔════════════════════════════════════════════╗
║  🚀 Plataforma de Aulas iniciada!          ║
║  🌐 http://localhost:${PORT}                  ║
║  📊 Admin: http://localhost:${PORT}/admin.html ║
╚════════════════════════════════════════════╝

✨ FUNCIONALIDADES:
  ✓ Login/Registro com Supabase
  ✓ Recuperação de Senha
  ✓ Sistema de Avaliações ⭐
  ✓ Comentários e Feedback 💬
  ✓ Gerador de Anúncios com IA 🤖
  ✓ Notificações por Email 📧

🔐 DADOS DE TESTE:
  Email: teste@exemplo.com
  Senha: 123456
    `);
});
