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

// ------------------ UI / MENU ------------------
function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["💬 Mulai Chat", "🛑 Berhenti"],
        ["⏭️ Next", "⚙️ Gender"],
        ["📩 Hubungi Admin", "❓ Bantuan"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
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
      `Tempat seru buat ngobrol anonim bareng orang baru 💫\n\n` +
      `Gunakan tombol di bawah untuk mulai chatting! 💬`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ------------------ TEXT HANDLER ------------------
bot.on("message", async (msg) => {
  const text = msg.text;
  const userId = msg.from.id;
  createUser(userId);

  const menuList = [
    "💬 Mulai Chat",
    "🛑 Berhenti",
    "⏭️ Next",
    "⚙️ Gender",
    "📩 Hubungi Admin",
    "❓ Bantuan",
    "👦 Cowok",
    "👧 Cewek",
    "🎲 Acak",
    "⬅️ Kembali",
  ];

  // Kalau bukan pesan tombol menu
  if (!menuList.includes(text)) {
    const user = await getUser(userId);
    if (!user || user.status !== STATUS.CHATTING || !user.partner_id) {
      bot.sendMessage(userId, "⚠️ Kamu belum memulai chat.\nTekan *💬 Mulai Chat* untuk mulai ngobrol!", {
        parse_mode: "Markdown",
        ...mainMenu(),
      });
      return;
    }

    // Forward pesan ke partner
    try {
      await bot.copyMessage(user.partner_id, msg.chat.id, msg.message_id);
    } catch (e) {
      console.error("❌ Gagal kirim pesan:", e.message);
    }
    return;
  }

  // ------------------ MENU ACTIONS ------------------
  switch (text) {
    case "💬 Mulai Chat": {
      const partner = await findPartner(userId);
      if (partner) {
        bot.sendMessage(userId, "🎉 Kamu terhubung! Sapa pasanganmu 👋", mainMenu());
        bot.sendMessage(partner, "🎉 Kamu terhubung! Sapa pasanganmu 👋", mainMenu());
      } else {
        bot.sendMessage(userId, "🔍 Sedang mencari partner... Mohon tunggu sebentar ⏳", mainMenu());
      }
      break;
    }

    case "🛑 Berhenti":
      await stopChat(userId);
      bot.sendMessage(userId, "🛑 Obrolan dihentikan.", mainMenu());
      break;

    case "⏭️ Next":
      await stopChat(userId, false);
      const next = await findPartner(userId);
      if (next) {
        bot.sendMessage(userId, "🔄 Partner baru ditemukan! 🎉", mainMenu());
        bot.sendMessage(next, "🔄 Partner baru ditemukan! 🎉", mainMenu());
      } else {
        bot.sendMessage(userId, "🔍 Mencari partner baru... ⏳", mainMenu());
      }
      break;

    case "⚙️ Gender":
      bot.sendMessage(userId, "Pilih jenis kelamin kamu:", {
        reply_markup: {
          keyboard: [
            ["👦 Cowok", "👧 Cewek"],
            ["🎲 Acak", "⬅️ Kembali"],
          ],
          resize_keyboard: true,
        },
      });
      break;

    case "👦 Cowok":
      setGender(userId, "male");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Cowok*", { parse_mode: "Markdown", ...mainMenu() });
      break;

    case "👧 Cewek":
      setGender(userId, "female");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Cewek*", { parse_mode: "Markdown", ...mainMenu() });
      break;

    case "🎲 Acak":
      setGender(userId, "random");
      bot.sendMessage(userId, "✅ Gender kamu diset ke *Acak*", { parse_mode: "Markdown", ...mainMenu() });
      break;

    case "📩 Hubungi Admin":
      bot.sendMessage(userId, "📨 Kirim pesan kamu ke admin.\nKetik */batal* untuk membatalkan.", {
        parse_mode: "Markdown",
        ...mainMenu(),
      });
      break;

    case "❓ Bantuan":
      bot.sendMessage(
        userId,
        `🆘 *Panduan Penggunaan*\n\n` +
          `💬 *Mulai Chat* – Mencari teman ngobrol anonim\n` +
          `⏭️ *Next* – Ganti partner baru\n` +
          `🛑 *Berhenti* – Akhiri obrolan\n` +
          `⚙️ *Gender* – Atur jenis kelamin\n\n` +
          `Selamat bersenang-senang dan tetap sopan ya 😊`,
        { parse_mode: "Markdown", ...mainMenu() }
      );
      break;

    case "⬅️ Kembali":
      bot.sendMessage(userId, "🔙 Kembali ke menu utama.", mainMenu());
      break;
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
          `📊 *Statistik Bot:*\n\n👥 Total pengguna: ${row.total}\n💬 Sedang chat: ${r2.chatting}\n🔍 Sedang mencari: ${r3.searching}`,
          { parse_mode: "Markdown" }
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
