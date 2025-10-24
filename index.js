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
  MUTED: "muted",
};

// ------------------ Database Helper ------------------
function createUser(id) {
  db.run("INSERT OR IGNORE INTO users (id, status, partner_id, muted) VALUES (?, ?, ?, ?)", [
    id,
    STATUS.IDLE,
    null,
    0,
  ]);
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

function muteUser(id) {
  db.run("UPDATE users SET status = ? WHERE id = ?", [STATUS.MUTED, id]);
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
    db.get(
      "SELECT id FROM users WHERE status = ? AND id != ? AND (muted IS NULL OR muted = 0) LIMIT 1",
      [STATUS.SEARCHING, userId],
      (err, row) => {
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
      }
    );
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
      bot.sendMessage(partner.id, "❌ Pasanganmu telah menghentikan obrolan.", mainMenuIdle());
  } else {
    setStatus(userId, STATUS.IDLE);
  }
}

// ------------------ MENU ------------------
function mainMenuIdle() {
  return {
    reply_markup: {
      keyboard: [["🔍 Cari Partner"]],
      resize_keyboard: true,
    },
  };
}

function chattingMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["🛑 Berhenti", "⏭️ Next"],
        ["👍 Like", "👎 Dislike", "🚨 Laporkan"],
      ],
      resize_keyboard: true,
    },
  };
}

// ------------------ START ------------------
bot.onText(/\/start/, async (msg) => {
  const id = msg.from.id;
  createUser(id);

  const user = await getUser(id);
  if (user.status === STATUS.MUTED) {
    bot.sendMessage(id, "🚫 Kamu telah diblokir dari bot ini karena pelanggaran aturan.");
    return;
  }

  await bot.sendMessage(
    id,
    `👋 *Selamat Datang di Random Chat Indonesia!*\n\n` +
      `Langsung mencari partner untukmu... 🔍`,
    { parse_mode: "Markdown" }
  );

  const partner = await findPartner(id);
  if (partner) {
    bot.sendMessage(id, "🎉 Kamu terhubung! Sapa pasanganmu 👋", chattingMenu());
    bot.sendMessage(partner, "🎉 Kamu terhubung! Sapa pasanganmu 👋", chattingMenu());
  } else {
    bot.sendMessage(id, "🔎 Mencari partner... Tunggu sebentar ⏳", mainMenuIdle());
  }
});

// ------------------ TEXT HANDLER ------------------
bot.on("message", async (msg) => {
  const text = msg.text;
  const userId = msg.from.id;
  createUser(userId);

  const user = await getUser(userId);
  if (!user || user.status === STATUS.MUTED) {
    bot.sendMessage(userId, "🚫 Kamu tidak bisa menggunakan bot ini lagi.");
    return;
  }

  // Tombol Menu
  switch (text) {
    case "🔍 Cari Partner": {
      const partner = await findPartner(userId);
      if (partner) {
        bot.sendMessage(userId, "🎉 Partner ditemukan! Sapa pasanganmu 👋", chattingMenu());
        bot.sendMessage(partner, "🎉 Partner ditemukan! Sapa pasanganmu 👋", chattingMenu());
      } else {
        bot.sendMessage(userId, "🔍 Mencari partner... Mohon tunggu sebentar ⏳", mainMenuIdle());
      }
      return;
    }

    case "🛑 Berhenti":
      await stopChat(userId);
      bot.sendMessage(userId, "🛑 Obrolan dihentikan. Sedang mencari partner baru...", chattingMenu());
      const newPartner = await findPartner(userId);
      if (newPartner) {
        bot.sendMessage(userId, "🎉 Partner baru ditemukan! 👋", chattingMenu());
        bot.sendMessage(newPartner, "🎉 Partner baru ditemukan! 👋", chattingMenu());
      } else {
        bot.sendMessage(userId, "🔍 Belum ada partner, menunggu...", mainMenuIdle());
      }
      return;

    case "⏭️ Next":
      await stopChat(userId, false);
      bot.sendMessage(userId, "⏭️ Sedang mencari partner baru...", chattingMenu());
      const nextPartner = await findPartner(userId);
      if (nextPartner) {
        bot.sendMessage(userId, "🎉 Partner baru ditemukan! 👋", chattingMenu());
        bot.sendMessage(nextPartner, "🎉 Partner baru ditemukan! 👋", chattingMenu());
      } else {
        bot.sendMessage(userId, "🔍 Belum ada partner, menunggu...", mainMenuIdle());
      }
      return;

    case "👍 Like":
      bot.sendMessage(userId, "👍 Terima kasih! Kami senang kamu menikmati obrolannya 😄");
      return;

    case "👎 Dislike":
      bot.sendMessage(userId, "🙏 Terima kasih atas feedbacknya. Kami akan terus memperbaiki pengalaman chat!");
      return;

    case "🚨 Laporkan":
      if (!user.partner_id) {
        bot.sendMessage(userId, "⚠️ Kamu tidak sedang dalam obrolan untuk melaporkan.");
        return;
      }
      const partner = await getUser(user.partner_id);
      bot.sendMessage(
        ADMIN_ID,
        `🚨 *Laporan Baru!*\n\n` +
          `🧑 Pelapor: [${userId}](tg://user?id=${userId})\n` +
          `🚫 Terlapor: [${partner.id}](tg://user?id=${partner.id})\n\n` +
          `Pesan: Pengguna dilaporkan karena scam atau perilaku buruk.`,
        { parse_mode: "Markdown" }
      );
      bot.sendMessage(userId, "✅ Laporan telah dikirim ke admin. Terima kasih sudah membantu menjaga komunitas 🙏");
      return;

    default:
      // Forward pesan ke partner
      if (user.status === STATUS.CHATTING && user.partner_id) {
        try {
          await bot.copyMessage(user.partner_id, msg.chat.id, msg.message_id);
        } catch (e) {
          console.error("❌ Gagal kirim pesan:", e.message);
        }
      }
      return;
  }
});

// ------------------ ADMIN COMMAND ------------------
bot.onText(/\/mute (\d+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = Number(match[1]);
  muteUser(targetId);
  bot.sendMessage(msg.chat.id, `🔇 Pengguna ${targetId} telah dimute.`);
  bot.sendMessage(targetId, "🚫 Kamu telah diblokir oleh admin karena pelanggaran aturan.");
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  db.get("SELECT COUNT(*) AS total FROM users", (err, row) => {
    db.get("SELECT COUNT(*) AS chatting FROM users WHERE status = ?", [STATUS.CHATTING], (e2, r2) => {
      db.get("SELECT COUNT(*) AS searching FROM users WHERE status = ?", [STATUS.SEARCHING], (e3, r3) => {
        bot.sendMessage(
          msg.chat.id,
          `📊 *Statistik Bot:*\n👥 Total pengguna: ${row.total}\n💬 Sedang chat: ${r2.chatting}\n🔍 Sedang mencari: ${r3.searching}`,
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
