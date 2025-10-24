require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
if (!BOT_TOKEN) throw new Error("❌ BOT_TOKEN belum diatur di .env!");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log("🤖 Bot Random Chat Indonesia sedang dijalankan...");

const STATUS = {
  IDLE: "idle",
  SEARCHING: "searching",
  CHATTING: "chatting",
};

// ------------------ Database Helper ------------------
function createUser(id) {
  db.run("INSERT OR IGNORE INTO users (id, gender, status, partner_id) VALUES (?, ?, ?, ?)", [
    id,
    null,
    STATUS.IDLE,
    null,
  ]);
}

function setGender(id, gender) {
  db.run("UPDATE users SET gender = ? WHERE id = ?", [gender, id]);
}

function setStatus(id, status) {
  db.run("UPDATE users SET status = ? WHERE id = ?", [status, id]);
}

function setPartner(id, partnerId) {
  db.run("UPDATE users SET partner_id = ? WHERE id = ?", [partnerId, id]);
}

function clearPartner(id) {
  db.run("UPDATE users SET partner_id = NULL WHERE id = ?", [id]);
}

function getUser(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ------------------ Pairing ------------------
async function findPartner(userId) {
  const user = await getUser(userId);
  return new Promise((resolve) => {
    let query = "SELECT id FROM users WHERE status = ? AND id != ?";
    let params = [STATUS.SEARCHING, userId];

    db.get(query, params, (err, row) => {
      if (row) {
        const partnerId = row.id;
        setStatus(userId, STATUS.CHATTING);
        setStatus(partnerId, STATUS.CHATTING);
        setPartner(userId, partnerId);
        setPartner(partnerId, userId);
        resolve(partnerId);
      } else {
        setStatus(userId, STATUS.SEARCHING);
        resolve(null);
      }
    });
  });
}

async function stopChat(userId, notify = true) {
  const user = await getUser(userId);
  if (user?.partner_id) {
    const partner = await getUser(user.partner_id);
    clearPartner(userId);
    clearPartner(partner.id);
    setStatus(userId, STATUS.IDLE);
    setStatus(partner.id, STATUS.IDLE);
    if (notify)
      bot.sendMessage(partner.id, "❌ Pasanganmu telah menghentikan obrolan.", mainMenu());
  } else {
    setStatus(userId, STATUS.IDLE);
  }
}

// ------------------ UI / Menu ------------------
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💬 Mulai Chat", callback_data: "start_chat" },
          { text: "🛑 Berhenti", callback_data: "stop_chat" },
        ],
        [
          { text: "⏭️ Next", callback_data: "next_chat" },
          { text: "⚙️ Gender", callback_data: "set_gender" },
        ],
        [
          { text: "📩 Hubungi Admin", callback_data: "contact_admin" },
          { text: "❓ Bantuan", callback_data: "help" },
        ],
      ],
    },
  };
}

// ------------------ START ------------------
bot.onText(/\/start/, async (msg) => {
  const id = msg.from.id;
  createUser(id);

  await bot.sendMessage(
    id,
    `👋 *Selamat Datang di Random Chat Indonesia!*\n\n` +
      `Kamu bisa bertemu orang baru dan ngobrol secara anonim.\n` +
      `Gunakan tombol di bawah untuk mulai chatting 💬`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ------------------ HELP ------------------
bot.onText(/\/help/, async (msg) => {
  const help = `
🆘 *Panduan Random Chat Indonesia*

💬 /start – Mulai bot
⏭️ /next – Ganti partner
🛑 /stop – Berhenti chat
⚙️ /gender – Pilih jenis kelamin
📩 /lapor – Kirim pesan ke admin

Nikmati obrolan yang seru dan tetap sopan ya 😊
`;
  bot.sendMessage(msg.chat.id, help, { parse_mode: "Markdown", ...mainMenu() });
});

// ------------------ CALLBACK BUTTON ------------------
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  createUser(userId);

  switch (query.data) {
    case "start_chat":
      const partner = await findPartner(userId);
      if (partner) {
        bot.sendMessage(userId, "🎉 Kamu terhubung! Sapa pasanganmu 👋");
        bot.sendMessage(partner, "🎉 Kamu terhubung! Sapa pasanganmu 👋");
      } else {
        bot.sendMessage(userId, "🔍 Mencari partner... Mohon tunggu sebentar ⏳");
      }
      break;

    case "stop_chat":
      await stopChat(userId);
      bot.sendMessage(userId, "🛑 Obrolan dihentikan.", mainMenu());
      break;

    case "next_chat":
      await stopChat(userId, false);
      const next = await findPartner(userId);
      if (next) {
        bot.sendMessage(userId, "🔄 Partner baru ditemukan!");
        bot.sendMessage(next, "🔄 Partner baru ditemukan!");
      } else {
        bot.sendMessage(userId, "🔍 Mencari partner baru...");
      }
      break;

    case "set_gender":
      bot.sendMessage(userId, "Pilih jenis kelamin kamu:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👦 Cowok", callback_data: "gender_male" },
              { text: "👧 Cewek", callback_data: "gender_female" },
            ],
            [{ text: "🎲 Acak", callback_data: "gender_random" }],
          ],
        },
      });
      break;

    case "help":
      bot.sendMessage(
        userId,
        "🆘 Gunakan tombol untuk memulai / menghentikan chat.\n" +
          "Bot ini anonim, identitasmu aman 👻",
        mainMenu()
      );
      break;

    case "contact_admin":
      bot.sendMessage(userId, "📨 Ketik pesanmu untuk admin.\nBalas dengan /batal untuk membatalkan.");
      break;

    case "gender_male":
      setGender(userId, "male");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Cowok*", { parse_mode: "Markdown", ...mainMenu() });
      break;

    case "gender_female":
      setGender(userId, "female");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Cewek*", { parse_mode: "Markdown", ...mainMenu() });
      break;

    case "gender_random":
      setGender(userId, "random");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Acak*", { parse_mode: "Markdown", ...mainMenu() });
      break;
  }
});

// ------------------ FORWARD PESAN ------------------
bot.on("message", async (msg) => {
  if (msg.text && msg.text.startsWith("/")) return;

  const user = await getUser(msg.from.id);
  if (!user) return;

  if (user.status !== STATUS.CHATTING || !user.partner_id) {
    bot.sendMessage(msg.chat.id, "⚠️ Kamu belum memulai chat. Tekan *💬 Mulai Chat*.", {
      parse_mode: "Markdown",
      ...mainMenu(),
    });
    return;
  }

  try {
    await bot.copyMessage(user.partner_id, msg.chat.id, msg.message_id);
  } catch (e) {
    console.error("❌ Gagal kirim pesan:", e.message);
  }
});

// ------------------ STATS ADMIN ------------------
bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  db.get("SELECT COUNT(*) AS total FROM users", (err, row) => {
    db.get("SELECT COUNT(*) AS chatting FROM users WHERE status = ?", [STATUS.CHATTING], (e2, r2) => {
      db.get("SELECT COUNT(*) AS searching FROM users WHERE status = ?", [STATUS.SEARCHING], (e3, r3) => {
        bot.sendMessage(
          msg.chat.id,
          `📊 Statistik:\n👥 Total: ${row.total}\n💬 Chatting: ${r2.chatting}\n🔍 Mencari: ${r3.searching}`
        );
      });
    });
  });
});

// ------------------ LOG ONLINE ------------------
(async () => {
  try {
    const me = await bot.getMe();
    console.log(`✅ Bot @${me.username} siap digunakan!`);
    bot.sendMessage(
      ADMIN_ID,
      `🚀 Bot *${me.first_name}* (@${me.username}) sekarang online.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("❌ Token tidak valid atau koneksi gagal:", e.message);
  }
})();