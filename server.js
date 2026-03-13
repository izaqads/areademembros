const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

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
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurar sessões
app.use(session({
    secret: 'sua-chave-secreta-segura-mude-isso',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        httpOnly: true,
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
// ROTAS DE CONFIGURAÇÃO
// ============================================

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
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  🚀 Plataforma de Aulas iniciada!          ║
║  🌐 http://localhost:${PORT}                  ║
║  📊 Admin: http://localhost:${PORT}/admin.html ║
╚════════════════════════════════════════════╝
    `);
});
