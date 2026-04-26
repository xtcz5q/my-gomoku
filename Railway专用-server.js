const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gomoku_secret_key_2024';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const loadJSON = (filepath, defaultValue) => {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (e) { console.error('Load error:', e.message); }
    return defaultValue;
};

const saveJSON = (filepath, data) => {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Save error:', e.message); }
};

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const RANKINGS_FILE = path.join(DATA_DIR, 'rankings.json');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

let users = loadJSON(USERS_FILE, {});
let stats = loadJSON(STATS_FILE, {});
let rankings = loadJSON(RANKINGS_FILE, []);
let messages = loadJSON(MESSAGES_FILE, []);
let challenges = loadJSON(CHALLENGES_FILE, []);

const botNames = ['棋王小明', '无敌小李', '棋后小红', '神算子', '棋圣王五', '映雪', '清风', '明月', '星空', '飞鸟'];
const botAvatars = ['😊', '😎', '🤔', '😏', '🙂', '😌', '🤩', '😇', '🥳', '😋'];

function initializeBots() {
    const existingBotCount = Object.keys(users).filter(k => k.startsWith('bot_')).length;
    if (existingBotCount < 10) {
        for (let i = existingBotCount; i < 10; i++) {
            const botId = 'bot_' + Date.now().toString(36) + '_' + i;
            const botPhone = 'bot_' + (1000 + i);
            const botNickname = botNames[i % botNames.length] + '_' + Math.random().toString(36).substring(2, 5);
            users[botPhone] = {
                id: botId,
                phone: botPhone,
                nickname: botNickname,
                avatar: botAvatars[i % botAvatars.length],
                createdAt: new Date().toISOString()
            };
            stats[botId] = {
                userId: botId,
                phone: botPhone,
                nickname: botNickname,
                avatar: botAvatars[i % botAvatars.length],
                totalGames: Math.floor(Math.random() * 100) + 20,
                wins: Math.floor(Math.random() * 60) + 10,
                losses: 0,
                skillRewind: 0,
                skillBarrier: 0,
                skillTwin: 0,
                skillPoints: Math.floor(Math.random() * 500) + 100
            };
            stats[botId].losses = stats[botId].totalGames - stats[botId].wins;
        }
        saveJSON(USERS_FILE, users);
        saveJSON(STATS_FILE, stats);
    }
}

initializeBots();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未登录' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: '登录已过期' });
        req.user = user;
        next();
    });
};

app.post('/api/register', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });
        if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ error: '手机号格式不正确' });
        if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
        if (users[phone]) return res.status(400).json({ error: '该手机号已注册' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = Date.now().toString();
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        const nickname = '玩家' + phone.slice(-4) + '_' + randomSuffix;

        users[phone] = { id: userId, phone, nickname, avatar: '😊', password: hashedPassword, createdAt: new Date().toISOString() };
        stats[userId] = { userId, phone, nickname, avatar: '😊', totalGames: 0, wins: 0, losses: 0, skillRewind: 0, skillBarrier: 0, skillTwin: 0, skillPoints: 0 };

        saveJSON(USERS_FILE, users);
        saveJSON(STATS_FILE, stats);

        const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: userId, phone, nickname, avatar: '😊' } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: '注册失败' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });

        const user = users[phone];
        if (!user) return res.status(401).json({ error: '手机号或密码错误' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: '手机号或密码错误' });

        const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user.id, phone: user.phone, nickname: user.nickname, avatar: user.avatar } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

app.get('/api/rankings', (req, res) => {
    rankings = Object.values(stats).filter(s => s.totalGames > 0).map(s => ({
        userId: s.userId, phone: s.phone, nickname: s.nickname || '玩家', avatar: s.avatar || '😊',
        totalGames: s.totalGames, wins: s.wins, losses: s.losses,
        winRate: s.totalGames > 0 ? Math.round(s.wins / s.totalGames * 100) : 0
    })).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate).slice(0, 100);
    saveJSON(RANKINGS_FILE, rankings);
    res.json(rankings);
});

app.get('/api/points-rankings', (req, res) => {
    const allStats = Object.values(stats).filter(s => (s.skillPoints || 0) > 0 || s.totalGames > 0);
    const sorted = allStats.map(s => ({
        userId: s.userId, phone: s.phone, nickname: s.nickname || '玩家', avatar: s.avatar || '😊', points: s.skillPoints || 0
    })).sort((a, b) => b.points - a.points).slice(0, 100);
    res.json(sorted);
});

app.post('/api/messages', (req, res) => {
    try {
        const { content, nickname, avatar, replyTo } = req.body;
        if (!content || content.trim().length === 0) return res.status(400).json({ error: '留言内容不能为空' });
        if (content.length > 200) return res.status(400).json({ error: '留言最多200字' });

        const message = { id: Date.now().toString(), content: content.trim(), nickname: nickname || '游客', avatar: avatar || '😊', createdAt: new Date().toISOString() };
        if (replyTo) message.replyTo = replyTo;
        messages.push(message);
        if (messages.length > 200) messages = messages.slice(-200);
        saveJSON(MESSAGES_FILE, messages);
        res.json(message);
    } catch (error) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/messages', (req, res) => res.json(messages));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
});
