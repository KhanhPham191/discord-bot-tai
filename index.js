const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const AUTO_REPLY_CHANNELS = ['713109490878120026', '694577581298810940'];
const PREFIX = '!';

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PID_FILE = path.join(__dirname, '.bot.pid');

// Pidfile guard - prevent multiple bot instances
function checkPidFile() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
      const isProcessRunning = process.kill(oldPid, 0);
      if (isProcessRunning) {
        console.error(`❌ Bot đang chạy với PID ${oldPid}. Không thể khởi động lại!`);
        process.exit(1);
      }
    } catch (e) {
      // Process không còn chạy, tiếp tục
    }
  }
  // Ghi PID hiện tại
  fs.writeFileSync(PID_FILE, process.pid.toString());
  console.log(`📌 PID ${process.pid} được ghi vào pidfile`);
}

let config = {
  allowedUsers: [],
  aiEnabled: false
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('✅ Config đã được load từ config.json');
    } catch (e) {
      console.error('Lỗi load config:', e);
    }
  } else {
    console.log('📝 Tạo file config.json mới...');
    saveConfig();
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('✅ Config đã được lưu vào config.json');
}

checkPidFile();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot đã đăng nhập với tư cách: ${client.user.tag}`);
  loadConfig();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.trim();
  const lower = content.toLowerCase();
  let replied = false;

  // Phát hiện từ chửi - bot trả lời bằng lời khôn ngoan/hóm hỉnh
  // Không dùng \b vì nó không làm việc với tiếng Việt
  try {
    const swearList = Array.isArray(config.swearWords) ? config.swearWords : [];
    
    if (swearList.length > 0) {
      // Kiểm tra xem có từ chửi nào trong tin nhắn không (case-insensitive)
      const hasSwear = swearList.some(word => lower.includes(word.toLowerCase()));
      
      if (hasSwear) {
        const replies = Array.isArray(config.smartReplies) ? config.smartReplies : [];
        const smartReply = replies.length > 0 
          ? replies[Math.floor(Math.random() * replies.length)]
          : "Chị em yêu nhau mà, đừng nên như vậy";
        
        console.log(`💬 Phát hiện từ chửi, gửi reply: ${smartReply}`);
        message.reply(smartReply);
        replied = true;
        return;
      }
    }
  } catch (e) {
    console.error('❌ Lỗi kiểm tra từ chửi:', e);
  }
  
  // Xử lý lệnh PREFIX
  if (content.startsWith(PREFIX)) {
    const args = content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) || message.author.id === message.guild?.ownerId;

    if (command === 'ping') {
      message.reply('Pong! 🏓');
      replied = true;
      return;
    }

    if (command === 'hello') {
      message.reply(`Hello ${message.author.username} 😎`);
      replied = true;
      return;
    }

    if (command === 'help') {
      message.reply(
        [
          '📌 Các lệnh hiện có:',
          `\`${PREFIX}ping\` - kiểm tra bot sống hay không`,
          `\`${PREFIX}hello\` - bot chào bạn`,
          `\`${PREFIX}echo <nội dung>\` - bot lặp lại câu bạn nói`,
          '',
          'Admin:',
          `\`${PREFIX}adduser <@user>\` - thêm user vào danh sách`,
          `\`${PREFIX}removeuser <@user>\` - xóa user khỏi danh sách`,
          `\`${PREFIX}listusers\` - xem danh sách user`
        ].join('\n')
      );
      replied = true;
      return;
    }

    if (command === 'echo') {
      if (args.length === 0) {
        message.reply(`Ví dụ: \`${PREFIX}echo xin chào\``);
        replied = true;
        return;
      }
      message.reply(args.join(' '));
      replied = true;
      return;
    }

    if (command === 'adduser') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      const userInput = args[0];
      if (!userInput) {
        message.reply(`Cách dùng: \`${PREFIX}adduser <@user>\``);
        replied = true;
        return;
      }
      
      let userId = userInput;
      if (message.mentions.users.size > 0) {
        userId = message.mentions.users.first().id;
      } else if (userInput.startsWith('<@') && userInput.endsWith('>')) {
        userId = userInput.replace(/[<@!>]/g, '');
      } else if (isNaN(userInput)) {
        const member = message.guild.members.cache.find(m => 
          m.user.username === userInput || m.displayName === userInput
        );
        if (member) {
          userId = member.id;
        } else {
          message.reply(`Không tìm thấy user "${userInput}"`);
          replied = true;
          return;
        }
      }
      
      if (config.allowedUsers.includes(userId)) {
        message.reply(`User này đã được add rồi!`);
        replied = true;
        return;
      }
      config.allowedUsers.push(userId);
      saveConfig();
      message.reply(`Thêm <@${userId}> vào danh sách thành công!`);
      replied = true;
      return;
    }

    if (command === 'removeuser') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      const userId = args[0];
      if (!userId) {
        message.reply(`Cách dùng: \`${PREFIX}removeuser <@user>\``);
        replied = true;
        return;
      }
      if (!config.allowedUsers.includes(userId)) {
        message.reply(`User này không có trong danh sách!`);
        replied = true;
        return;
      }
      config.allowedUsers = config.allowedUsers.filter(id => id !== userId);
      saveConfig();
      message.reply(`Xóa user ${userId} thành công!`);
      replied = true;
      return;
    }

    if (command === 'listusers') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      if (config.allowedUsers.length === 0) {
        message.reply('Chưa có user nào!');
        replied = true;
        return;
      }
      message.reply(`Danh sách user: ${config.allowedUsers.join(', ')}`);
      replied = true;
      return;
    }

    message.reply(`Lệnh \`${PREFIX}${command}\` không tồn tại!`);
    replied = true;
    return;
  }

  // Auto-reply channel
  if (!replied && AUTO_REPLY_CHANNELS.includes(message.channelId)) {
    if (content) {
      message.reply(`Bạn vừa nói: "${content}"`);
      replied = true;
      return;
    }
  }

  // Keyword triggers
  if (!replied && lower.includes('chào bot')) {
    message.reply(`Chào ${message.author.username}! Hôm nay ổn không?`);
    replied = true;
    return;
  }

  if (!replied && lower.includes('buồn quá')) {
    message.reply('Sao vậy? Kể lại đi nào');
    replied = true;
    return;
  }

  if (!replied && lower.includes('vui quá')) {
    message.reply('Quá đã luôn! Chia sẻ đi');
    replied = true;
    return;
  }

  if (!replied && lower.includes('chelsea')) {
    message.reply('Fan chồn xanh!');
    replied = true;
    return;
  }


});

process.on('SIGINT', () => {
  console.log('\n⏹️ Bot đang tắt...');
  saveConfig();
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
    console.log('🗑️ Pidfile đã bị xóa');
  }
  process.exit(0);
});

client.login(TOKEN);
