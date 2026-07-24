process.env.NTBA_FIX_350 = '1';

import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

import {
  generateKHQR,
  verifyBakongTransaction
} from './payment.js';

import {
  getAdminIds,
  addAdminId,
  getOwnerId,
  setOwnerId,
  getAdminUsername,
  setAdminUsername,
  getCategories,
  addCategory,
  deleteCategory,
  setCategoryPhoto,
  getProductsByCategory,
  getProduct,
  addProduct,
  deleteProduct,
  setProductPhoto,
  setProductMedia,
  addKeys,
  popKey,
  recordOrder,
  createPendingOrder,
  getPendingOrder,
  markOrderPaid,
  cancelPendingOrder,
  trackUser,
  getAllUsers,
  getStats
} from './db.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.BOT_TOKEN;

if (!token || token.trim() === '') {
  console.error('CRITICAL ERROR: BOT_TOKEN is missing in .env file!');
  process.exit(1);
}

// Create Telegram Bot instance with polling
const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// Suppress transient connection reset errors
bot.on('polling_error', (error) => {
  if (error.code === 'EFATAL' || (error.message && error.message.includes('ECONNRESET'))) {
    return;
  }
  console.error('Polling error:', error.message || error);
});

console.log('🤖 Telegram Store & Key Delivery Bot is starting...');

// Cached Telegram file_id for instant video delivery
let cachedStartVideoFileId = null;

// User state tracker for multi-step admin input
const adminState = {};

// Helper: Check if user is owner / admin
async function isOwner(userId) {
  const adminIds = await getAdminIds();
  return adminIds.includes(String(userId));
}

// Smart Emoji Assigner / Converter
function autoAddEmoji(name) {
  if (!name) return '🎮 Item';

  let cleanName = name.trim();

  // Check if name already has an emoji symbol
  const hasEmoji = /[\u{1F300}-\u{1F9FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/u.test(cleanName);
  if (hasEmoji) return cleanName;

  const lower = cleanName.toLowerCase();

  // Smart capitalization for short keywords
  if (lower === 'vpn') cleanName = 'VPN';
  if (lower === 'ff') cleanName = 'FreeFire';
  if (lower === 'apk') cleanName = 'APK';
  if (lower === 'ios') cleanName = 'iOS';

  let emoji = '🎮';

  if (lower.includes('vpn')) emoji = '🌐';
  else if (lower.includes('fluorite')) emoji = '🔮';
  else if (lower.includes('proxy')) emoji = '👿';
  else if (lower.includes('drip')) emoji = '😈';
  else if (lower.includes('client')) emoji = '😈';
  else if (lower.includes('esign') || lower.includes('e.sign') || lower.includes('ipa')) emoji = '📱';
  else if (lower.includes('migul')) emoji = '📱';
  else if (lower.includes('8ball') || lower.includes('pool')) emoji = '🎱';
  else if (lower.includes('android') || lower.includes('60%')) emoji = '🇻🇳';
  else if (lower.includes('freefire') || lower.includes('ff')) emoji = '🔥';
  else if (lower.includes('vip') || lower.includes('key')) emoji = '🎫';
  else if (lower.includes('ios')) emoji = '📱';
  else if (lower.includes('apk') || lower.includes('mod')) emoji = '⚡';
  else if (lower.includes('cert') || lower.includes('sign')) emoji = '📜';

  return `${emoji} ${cleanName}`;
}

// Unicode Bold Font Converter to make button text pop and highlight
function toUnicodeBold(str) {
  if (!str) return '';
  const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bold   = "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵";
  let result = "";
  for (let char of str) {
    const idx = normal.indexOf(char);
    if (idx !== -1) {
      result += Array.from(bold)[idx];
    } else {
      result += char;
    }
  }
  return result;
}

// ----------------------------------------------------
// KEYBOARDS
// ----------------------------------------------------

// Bottom Persistent Keyboard
const mainReplyKeyboard = {
  reply_markup: {
    keyboard: [[{ text: '🛒 BUY NOW' }]],
    resize_keyboard: true,
    persistent: true
  }
};

// Build Categories Inline Keyboard with Red 🔴 / Blue 🔵 / Green 🟢 Stock Highlights
async function buildCategoryKeyboard() {
  const categories = await getCategories();
  const adminUsername = await getAdminUsername();

  const inline_keyboard = [];

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const products = await getProductsByCategory(cat.id);
    let totalStock = 0;
    products.forEach(p => {
      totalStock += (p.keys || []).length;
    });

    // Red 🔴 if Out of Stock, Blue 🔵 if In Stock
    const statusHighlight = totalStock > 0 ? '🔵' : '🔴';
    const boldName = toUnicodeBold(cat.name);
    const displayName = `${statusHighlight} ${autoAddEmoji(boldName)}`;

    inline_keyboard.push([{
      text: displayName,
      callback_data: `cat_${cat.id}`
    }]);
  }

  // Contact Admin button with Green 🟢 Highlight
  inline_keyboard.push([
    {
      text: '🟢 🗣️ Contact Admin',
      url: `https://t.me/${adminUsername}`
    }
  ]);

  inline_keyboard.push([
    { text: '🔙 Back', callback_data: 'nav_start' }
  ]);

  return { reply_markup: { inline_keyboard } };
}

// Build Products Inline Keyboard
async function buildProductKeyboard(categoryId) {
  const products = await getProductsByCategory(categoryId);
  const inline_keyboard = [];

  products.forEach(prod => {
    const boldName = toUnicodeBold(prod.name);
    const displayName = autoAddEmoji(boldName);
    const stockCount = (prod.keys || []).length;
    const statusHighlight = stockCount > 0 ? `🔵 [${stockCount} Keys]` : `🔴 [Out of Stock]`;
    const buttonIcon = stockCount > 0 ? '🔵' : '🔴';

    inline_keyboard.push([{
      text: `${buttonIcon} ${displayName} - ${prod.price} ${statusHighlight}`,
      callback_data: `prod_${prod.id}`
    }]);
  });

  inline_keyboard.push([
    { text: '🔙 Back to Categories', callback_data: 'nav_buy' }
  ]);

  return { reply_markup: { inline_keyboard } };
}

// Build Single Product Actions Keyboard
function buildProductActionsKeyboard(productId, mediaPath) {
  const inline_keyboard = [
    [
      { text: '🛍️ Get Key / Buy', callback_data: `buy_${productId}` }
    ]
  ];

  if (mediaPath && fs.existsSync(path.join(__dirname, mediaPath))) {
    inline_keyboard.push([
      { text: '🎥 View Tutorial Video', callback_data: `video_${productId}` }
    ]);
  }

  inline_keyboard.push([
    { text: '🔙 Back to Catalog', callback_data: 'nav_buy' }
  ]);

  return { reply_markup: { inline_keyboard } };
}

// ----------------------------------------------------
// COMMAND HANDLERS
// ----------------------------------------------------

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || 'Customer';

  await trackUser(userId, username, firstName);

  const startText = `<b>❶Benzzo Gaming ស្វាគមន៍ ${firstName}</b>
-----------------------------------
📖 <b>របៀបទិញ</b>
🎫 🔑 Key ម៉ោង នឹងថ្ងៃគ្រប់ប្រភេទ
🍿 វីដេអូបង្រៀន
🛠️ គ្រប់សេវាកម្មកែប្រែប្រព័ន្ធប្រតិបត្តិការ
🤖 Bot ដើររហូត២៤/៧
✅ មានប្រព័ន្ធចុងក្រោយ key, file, video

💥 ( 🛒 BUY NOW ) 💥`;

  const defaultVideoPath = path.join(__dirname, 'video_2026-07-23_16-32-58.mp4');

  // If video is cached on Telegram, send using file_id instantly
  if (cachedStartVideoFileId) {
    try {
      await bot.sendVideo(chatId, cachedStartVideoFileId, {
        caption: startText,
        parse_mode: 'HTML',
        ...mainReplyKeyboard
      });
      return;
    } catch (err) {
      console.error('Error sending cached video, resetting cache:', err.message);
      cachedStartVideoFileId = null;
    }
  }

  if (fs.existsSync(defaultVideoPath)) {
    try {
      const sentMsg = await bot.sendVideo(chatId, fs.createReadStream(defaultVideoPath), {
        caption: startText,
        parse_mode: 'HTML',
        ...mainReplyKeyboard
      });
      if (sentMsg && sentMsg.video && sentMsg.video.file_id) {
        cachedStartVideoFileId = sentMsg.video.file_id;
      }
      return;
    } catch (err) {
      console.error('Error sending video on /start:', err.message);
    }
  }

  // Fallback if video is missing
  await bot.sendMessage(chatId, startText, {
    parse_mode: 'HTML',
    ...mainReplyKeyboard
  });
});

// Claim Owner Command
bot.onText(/\/claimowner/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const currentOwner = await getOwnerId();

  if (currentOwner && currentOwner !== String(userId)) {
    return bot.sendMessage(chatId, `⚠️ Owner is already registered (ID: ${currentOwner}).`);
  }

  await setOwnerId(userId);
  bot.sendMessage(chatId, `✅ <b>Success!</b> You are now registered as the Bot Owner.\nYour User ID: <code>${userId}</code>\n\nType /admin to access the Owner Panel.`, { parse_mode: 'HTML' });
});

// Admin Panel Command
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) {
    return bot.sendMessage(chatId, '⛔ <b>Access Denied!</b> You are not authorized as Owner.\nIf no owner is set, type /claimowner to register as Owner.', { parse_mode: 'HTML' });
  }

  const stats = await getStats();
  const adminUsername = await getAdminUsername();

  const adminMenuText = `
👑 <b>BENZZO GAMING BOT ADMIN DASHBOARD</b>
-----------------------------------
📊 <b>Store Statistics:</b>
• Total Users: <b>${stats.usersCount}</b>
• Total Categories: <b>${stats.categories}</b>
• Total Products: <b>${stats.products}</b>
• Available Keys: <b>${stats.totalKeys}</b>
• Completed Orders: <b>${stats.totalOrders}</b>

⚡ <b>Super-Easy Admin Actions (Click buttons below):</b>
  `;

  const inline_keyboard = [
    [
      { text: '➕ Add Category', callback_data: 'admin_wiz_add_cat' },
      { text: '📦 Add Product', callback_data: 'admin_wiz_add_prod' }
    ],
    [
      { text: '🔑 Add Keys', callback_data: 'admin_wiz_add_keys' },
      { text: '🖼️ Set Photo', callback_data: 'admin_wiz_set_photo' }
    ],
    [
      { text: '📋 List Products & Stock', callback_data: 'admin_list_products' }
    ],
    [
      { text: '🗑️ Delete Item', callback_data: 'admin_wiz_delete' },
      { text: '📢 Broadcast', callback_data: 'admin_broadcast_prompt' }
    ],
    [
      { text: '🔙 Exit Dashboard', callback_data: 'nav_start' }
    ]
  ];

  await bot.sendMessage(chatId, adminMenuText, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard }
  });
});

// Command: /listproducts
bot.onText(/\/listproducts/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const categories = await getCategories();
  let listText = `📦 <b>PRODUCT & KEY INVENTORY:</b>\n-----------------------------------\n`;

  for (const cat of categories) {
    listText += `\n📁 <b>Category: ${cat.name}</b> (ID: <code>${cat.id}</code>)\n`;
    const products = await getProductsByCategory(cat.id);
    if (products.length === 0) {
      listText += `  <i>(No products in category)</i>\n`;
    }
    for (const prod of products) {
      const keysCount = (prod.keys || []).length;
      listText += `  └ 🔹 <b>${prod.name}</b>\n     • ID: <code>${prod.id}</code>\n     • Price: ${prod.price}\n     • Stock Keys: <b>${keysCount}</b>\n`;
    }
  }

  bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
});

// Command: /addkey <product_id> <key1,key2,...>
bot.onText(/\/addkey\s+([^\s]+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const productId = match[1].trim();
  const rawKeys = match[2].trim();
  const keyList = rawKeys.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);

  const prod = await getProduct(productId);
  if (!prod) {
    return bot.sendMessage(chatId, `❌ Product with ID <code>${productId}</code> not found! Use /listproducts to see IDs.`, { parse_mode: 'HTML' });
  }

  const totalKeys = await addKeys(productId, keyList);
  bot.sendMessage(chatId, `✅ <b>Successfully added ${keyList.length} key(s) to ${prod.name}!</b>\nTotal Stock Now: <b>${totalKeys}</b> keys.`, { parse_mode: 'HTML' });
});

// Command: /addcategory <name>
bot.onText(/\/addcategory\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const categoryName = match[1].trim();
  const catId = await addCategory(categoryName);

  bot.sendMessage(chatId, `✅ <b>Category Created!</b>\nName: ${categoryName}\nID: <code>${catId}</code>`, { parse_mode: 'HTML' });
});

// Command: /addproduct <cat_id> | <name> | <price> | <description>
bot.onText(/\/addproduct\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 3) {
    return bot.sendMessage(chatId, `⚠️ Format: <code>/addproduct cat_id | Product Name | $1.50 | Optional Description</code>`, { parse_mode: 'HTML' });
  }

  const catId = parts[0];
  const name = parts[1];
  const price = parts[2];
  const desc = parts[3] || '';

  const prodId = await addProduct(catId, name, price, desc);
  bot.sendMessage(chatId, `✅ <b>Product Created!</b>\nName: ${name}\nPrice: ${price}\nID: <code>${prodId}</code>`, { parse_mode: 'HTML' });
});

// Command: /delcategory <cat_id>
bot.onText(/\/delcategory\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const catId = match[1].trim();
  await deleteCategory(catId);

  bot.sendMessage(chatId, `🗑️ <b>Category deleted:</b> <code>${catId}</code>`, { parse_mode: 'HTML' });
});

// Command: /delproduct <prod_id>
bot.onText(/\/delproduct\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const prodId = match[1].trim();
  await deleteProduct(prodId);

  bot.sendMessage(chatId, `🗑️ <b>Product deleted:</b> <code>${prodId}</code>`, { parse_mode: 'HTML' });
});

// Command: /setadmin <username>
bot.onText(/\/setadmin\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const username = match[1].trim();
  await setAdminUsername(username);

  bot.sendMessage(chatId, `✅ <b>Admin Username updated to:</b> @${username.replace('@', '')}`, { parse_mode: 'HTML' });
});

// Command: /addadmin <user_id>
bot.onText(/\/addadmin\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const newAdminId = match[1].trim();
  await addAdminId(newAdminId);

  bot.sendMessage(chatId, `✅ <b>New Admin Added!</b>\nUser ID: <code>${newAdminId}</code> can now use /admin`, { parse_mode: 'HTML' });
});

// Command: /setphoto <prod_id>
bot.onText(/\/setphoto\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const productId = match[1].trim();
  const prod = await getProduct(productId);

  if (!prod) {
    return bot.sendMessage(chatId, `❌ Product <code>${productId}</code> not found! Use /listproducts to see IDs.`, { parse_mode: 'HTML' });
  }

  if (msg.reply_to_message && msg.reply_to_message.photo) {
    const photos = msg.reply_to_message.photo;
    const highestResPhoto = photos[photos.length - 1].file_id;
    await setProductPhoto(productId, highestResPhoto);
    return bot.sendMessage(chatId, `🖼️ <b>Product Photo Set for ${prod.name}!</b>`, { parse_mode: 'HTML' });
  }

  adminState[userId] = { action: 'awaiting_photo', productId };
  bot.sendMessage(chatId, `🖼️ <b>Send or upload the picture for "${prod.name}" now!</b>\n<i>(Or send any photo with caption: /setphoto ${productId})</i>`, { parse_mode: 'HTML' });
});

// Photo Upload Handler for Admin
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const caption = (msg.caption || '').trim();
  const photos = msg.photo;
  if (!photos || photos.length === 0) return;

  const highestResPhoto = photos[photos.length - 1].file_id;
  const state = adminState[userId];

  // Case 1: Creating a Category via Photo (+ Optional Caption)
  if (state && (state.action === 'awaiting_cat_name' || state.action === 'awaiting_cat_name_or_photo')) {
    delete adminState[userId];
    const rawName = caption || 'New Category';
    const emojiName = autoAddEmoji(rawName);

    const catId = await addCategory(emojiName);
    await setCategoryPhoto(catId, highestResPhoto);

    return bot.sendMessage(chatId, `✅ <b>Category Created & Photo Set!</b>\n\n📁 Name: <b>${emojiName}</b>\n🆔 ID: <code>${catId}</code>\n\nClick /admin to add products to this category!`, { parse_mode: 'HTML' });
  }

  // Case 2: Creating a Product via Photo (+ Caption)
  if (state && (state.action === 'awaiting_prod_image_and_info' || state.action === 'awaiting_prod_info')) {
    const categoryId = state.categoryId;
    delete adminState[userId];

    const parts = caption.split('|').map(p => p.trim());
    const rawName = parts[0] || 'New Product';
    const price = parts[1] || '$0.00';
    const desc = parts[2] || '';

    const emojiName = autoAddEmoji(rawName);
    const prodId = await addProduct(categoryId, emojiName, price, desc);
    await setProductPhoto(prodId, highestResPhoto);

    return bot.sendMessage(chatId, `🎉 <b>Product Created & Photo Set Successfully!</b>\n\n🔹 Item: <b>${emojiName}</b>\n💵 Price: <b>${price}</b>\n🖼️ Picture Attached!\n\nClick /admin to add license keys!`, { parse_mode: 'HTML' });
  }

  // Case 3: Setting/Updating photo of an existing product
  let productId = null;
  if (state && (state.action === 'awaiting_prod_photo' || state.action === 'awaiting_photo')) {
    productId = state.productId;
  } else {
    const match = caption.match(/\/setphoto\s+([^\s]+)/) || caption.match(/^(prod_[^\s]+)/);
    if (match) productId = match[1];
  }

  if (productId) {
    const success = await setProductPhoto(productId, highestResPhoto);
    const prod = await getProduct(productId);
    delete adminState[userId];

    if (success) {
      return bot.sendMessage(chatId, `🖼️ <b>Product Photo Set Successfully!</b>\n\nItem: <b>${prod ? prod.name : productId}</b>\n\nClick /admin to view dashboard!`, { parse_mode: 'HTML' });
    } else {
      return bot.sendMessage(chatId, `❌ Product with ID <code>${productId}</code> not found. Check /listproducts.`, { parse_mode: 'HTML' });
    }
  }

  bot.sendMessage(chatId, `💡 <b>Photo received!</b> Click <b>🖼️ Set Photo</b> in /admin to attach it to a product!`, { parse_mode: 'HTML' });
});

// Command: /broadcast <message>
bot.onText(/\/broadcast\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isOwner(userId))) return;

  const broadcastMsg = match[1].trim();
  const users = await getAllUsers();

  let count = 0;
  for (const user of users) {
    try {
      await bot.sendMessage(user.userId, `📢 <b>ANNOUNCEMENT:</b>\n\n${broadcastMsg}`, { parse_mode: 'HTML' });
      count++;
    } catch (err) {
      console.error(`Failed sending broadcast to user ${user.userId}:`, err.message);
    }
  }

  bot.sendMessage(chatId, `📢 Broadcast sent to <b>${count}</b> user(s)!`, { parse_mode: 'HTML' });
});

// Listen for Messages & Admin Wizard Text Inputs
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || '').trim();

  if (text === '🛒 BUY NOW') {
    const categoryMarkup = await buildCategoryKeyboard();
    return bot.sendMessage(chatId, '🛒 <b>Choose a category:</b>', {
      parse_mode: 'HTML',
      ...categoryMarkup
    });
  }

  // Admin Wizard Step-by-step Input Handlers
  if (adminState[userId] && (await isOwner(userId))) {
    const state = adminState[userId];

    // State A: Add Category Name
    if (state.action === 'awaiting_cat_name_or_photo' || state.action === 'awaiting_cat_name') {
      if (!text || text.startsWith('/')) return;
      delete adminState[userId];
      const emojiName = autoAddEmoji(text);
      const catId = await addCategory(emojiName);
      return bot.sendMessage(chatId, `✅ <b>Category Created Successfully!</b>\n\n📁 Name: <b>${emojiName}</b>\n🆔 ID: <code>${catId}</code>\n\nClick /admin to add products to this category!`, { parse_mode: 'HTML' });
    }

    // State B: Add Product Details via Text (Name | Price | Desc)
    if (state.action === 'awaiting_prod_image_and_info' || state.action === 'awaiting_prod_info') {
      if (!text || text.startsWith('/')) return;
      const parts = text.split('|').map(p => p.trim());
      const rawName = parts[0];
      const price = parts[1] || '$0.00';
      const desc = parts[2] || '';

      const emojiName = autoAddEmoji(rawName);
      const prodId = await addProduct(state.categoryId, emojiName, price, desc);
      adminState[userId] = { action: 'awaiting_prod_photo', productId: prodId, name: emojiName, price };

      return bot.sendMessage(chatId, `🖼️ <b>Product Created! Now send the photo for "${emojiName}"!</b>\n\n<i>(Upload or send a photo now, or type <b>skip</b> if you don't want a photo)</i>`, { parse_mode: 'HTML' });
    }

    // State C: Skip Product Photo
    if (state.action === 'awaiting_prod_photo' && text.toLowerCase() === 'skip') {
      const prodName = state.name;
      delete adminState[userId];
      return bot.sendMessage(chatId, `✅ <b>Product "${prodName}" Saved (without photo)!</b>\n\nClick /admin to add license keys to it!`, { parse_mode: 'HTML' });
    }

    // State D: Add License Keys
    if (state.action === 'awaiting_keys') {
      if (!text || text.startsWith('/')) return;
      const keyList = text.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
      const prodId = state.productId;
      delete adminState[userId];

      const prod = await getProduct(prodId);
      const prodName = prod ? prod.name : 'Product';
      const totalKeys = await addKeys(prodId, keyList);

      return bot.sendMessage(chatId, `🎉 <b>Successfully added ${keyList.length} key(s) to "${prodName}"!</b>\nTotal Stock Now: <b>${totalKeys} keys</b>.`, { parse_mode: 'HTML' });
    }
  }
});

// ----------------------------------------------------
// CALLBACK QUERY HANDLER (INLINE BUTTON CLICKS)
// ----------------------------------------------------

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const userId = query.from.id;
  const username = query.from.username || 'user';

  try {
    await bot.answerCallbackQuery(query.id);

    // Navigation: Back to Start
    if (data === 'nav_start') {
      const categoryMarkup = await buildCategoryKeyboard();
      return bot.editMessageText('🛒 <b>Choose a category:</b>', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        ...categoryMarkup
      }).catch(() => { });
    }

    // Navigation: Buy/Catalog Menu
    if (data === 'nav_buy') {
      const categoryMarkup = await buildCategoryKeyboard();
      return bot.editMessageText('🛒 <b>Choose a category:</b>', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        ...categoryMarkup
      }).catch(() => { });
    }

    // Category Selected: cat_<cat_id>
    if (data.startsWith('cat_')) {
      const categoryId = data.replace('cat_', '');
      const categories = await getCategories();
      const cat = categories.find(c => c.id === categoryId);
      const productMarkup = await buildProductKeyboard(categoryId);

      if (cat && cat.photo_id) {
        return bot.sendPhoto(chatId, cat.photo_id, {
          caption: `📦 <b>Select a product in ${cat.name}:</b>`,
          parse_mode: 'HTML',
          ...productMarkup
        });
      }

      return bot.sendMessage(chatId, `📦 <b>Select a product below:</b>`, {
        parse_mode: 'HTML',
        ...productMarkup
      });
    }

    // Product Selected: prod_<prod_id>
    if (data.startsWith('prod_')) {
      const productId = data.replace('prod_', '');
      const prod = await getProduct(productId);

      if (!prod) {
        return bot.sendMessage(chatId, '❌ Product not found.');
      }

      const stockCount = (prod.keys || []).length;
      const stockBadge = stockCount > 0 ? `🔵 <b>${stockCount} keys in stock</b>` : `🔴 <b>Out of Stock (0 keys)</b>`;
      const prodText = `
🔹 <b>Product: ${prod.name}</b>
💵 Price: <b>${prod.price}</b>
📦 Status: ${stockBadge}
📝 Description: ${prod.description || 'N/A'}
      `;

      const actionsMarkup = buildProductActionsKeyboard(productId, prod.media_path);

      if (prod.photo_id) {
        return bot.sendPhoto(chatId, prod.photo_id, {
          caption: prodText,
          parse_mode: 'HTML',
          ...actionsMarkup
        });
      }

      return bot.sendMessage(chatId, prodText, {
        parse_mode: 'HTML',
        ...actionsMarkup
      });
    }

    // Action: Video Tutorial Click: video_<prod_id>
    if (data.startsWith('video_')) {
      const productId = data.replace('video_', '');
      const prod = await getProduct(productId);

      if (prod && prod.media_path) {
        const fullMediaPath = path.join(__dirname, prod.media_path);
        if (fs.existsSync(fullMediaPath)) {
          await bot.sendMessage(chatId, `🍿 <b>Tutorial Video for ${prod.name}:</b>`, { parse_mode: 'HTML' });
          await bot.sendVideo(chatId, fs.createReadStream(fullMediaPath), { caption: `🎥 Video Guide: ${prod.name}` });
        } else {
          await bot.sendMessage(chatId, '⚠️ Tutorial video file is currently processing.');
        }
      }
      return;
    }

    // Action: Buy / Get Key Click: buy_<prod_id>
    if (data.startsWith('buy_')) {
      const productId = data.replace('buy_', '');
      const prod = await getProduct(productId);

      if (!prod) {
        return bot.sendMessage(chatId, '❌ Product not found.');
      }

      // Check key stock first
      const stockCount = (prod.keys || []).length;
      if (stockCount === 0) {
        const adminUsername = await getAdminUsername();
        return bot.sendMessage(chatId, `⚠️ <b>Out of Stock!</b>\n\nSorry, this product is currently out of keys. Please contact Admin @${adminUsername} to request stock replenishment.`, { parse_mode: 'HTML' });
      }

      const tempOrderId = 'ORD-' + Math.random().toString(36).substring(2, 9).toUpperCase();

      // Generate KHQR Payment QR
      const khqrResult = await generateKHQR({
        amount: prod.price,
        orderId: tempOrderId,
        merchantId: process.env.BAKONG_MERCHANT_ID
      });

      if (!khqrResult.success) {
        return bot.sendMessage(chatId, `❌ <b>Failed to generate payment QR!</b>\n${khqrResult.error}`, { parse_mode: 'HTML' });
      }

      // Save pending order to database
      const pendingOrder = await createPendingOrder({
        userId,
        username,
        productId,
        productName: prod.name,
        amount: khqrResult.amount,
        priceStr: prod.price,
        md5: khqrResult.md5
      });

      const orderId = pendingOrder.orderId;

      const paymentCaption = `
🇰🇭 <b>BAKONG KHQR PAYMENT</b>
-----------------------------------
📦 <b>Item:</b> ${prod.name}
💵 <b>Amount to Pay:</b> <code>$${khqrResult.amount.toFixed(2)}</code>
🆔 <b>Order ID:</b> <code>${orderId}</code>
📌 <b>Merchant Account:</b> <code>${khqrResult.merchantId}</code>

📱 <b>Instructions:</b>
1. Scan the KHQR code using any Cambodian Banking App (ABA, ACLEDA, Sathapana, Wing, Bakong, etc.)
2. Confirm payment of <b>$${khqrResult.amount.toFixed(2)}</b>
3. Tap <b>✅ Verify Payment</b> below after completing payment.
      `;

      return bot.sendPhoto(chatId, khqrResult.qrBuffer, {
        caption: paymentCaption,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Verify Payment', callback_data: `verify_pay_${orderId}` }
            ],
            [
              { text: '❌ Cancel Order', callback_data: `cancel_pay_${orderId}` }
            ]
          ]
        }
      });
    }

    // Action: Verify Payment Click: verify_pay_<order_id>
    if (data.startsWith('verify_pay_')) {
      const orderId = data.replace('verify_pay_', '');
      const pendingOrder = await getPendingOrder(orderId);

      if (!pendingOrder) {
        return bot.sendMessage(chatId, '⚠️ <b>Order not found or already completed/cancelled.</b>', { parse_mode: 'HTML' });
      }

      await bot.sendMessage(chatId, `🔄 <b>Checking Bakong network for Order ${orderId}...</b>`, { parse_mode: 'HTML' });

      const verification = await verifyBakongTransaction(pendingOrder.md5);

      if (!verification.paid) {
        return bot.sendMessage(chatId, `⏳ <b>Payment Not Detected Yet!</b>\n\n${verification.message}\n\nPlease complete payment in your banking app and click <b>✅ Verify Payment</b> again.`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Verify Payment Again', callback_data: `verify_pay_${orderId}` }],
              [{ text: '❌ Cancel Order', callback_data: `cancel_pay_${orderId}` }]
            ]
          }
        });
      }

      // Payment is verified! Pop key from database
      const keyIssued = await popKey(pendingOrder.productId);

      if (!keyIssued) {
        const adminUsername = await getAdminUsername();
        return bot.sendMessage(chatId, `⚠️ <b>Payment Received but Product is Out of Stock!</b>\n\nPlease contact Admin @${adminUsername} with Order ID <code>${orderId}</code> for immediate assistance.`, { parse_mode: 'HTML' });
      }

      // Mark order paid in DB
      await markOrderPaid(orderId, keyIssued);

      const prod = await getProduct(pendingOrder.productId);

      const successMsg = `
🎉 <b>PAYMENT VERIFIED & PURCHASE SUCCESSFUL!</b>
-----------------------------------
🆔 <b>Order ID:</b> <code>${orderId}</code>
📦 <b>Item:</b> ${pendingOrder.productName}
💵 <b>Amount Paid:</b> $${pendingOrder.amount}
📌 <b>Payment Method:</b> Bakong KHQR

🔑 <b>YOUR LICENSE KEY:</b>
<code>${keyIssued}</code>

<i>Keep your key safe. Thank you for your purchase!</i>
      `;

      await bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });

      // Automatically send video tutorial if attached!
      if (prod && prod.media_path) {
        const fullMediaPath = path.join(__dirname, prod.media_path);
        if (fs.existsSync(fullMediaPath)) {
          await bot.sendVideo(chatId, fs.createReadStream(fullMediaPath), { caption: `🍿 Tutorial & Setup Video for ${pendingOrder.productName}` });
        }
      }
      return;
    }

    // Action: Cancel Order Click: cancel_pay_<order_id>
    if (data.startsWith('cancel_pay_')) {
      const orderId = data.replace('cancel_pay_', '');
      await cancelPendingOrder(orderId);
      return bot.sendMessage(chatId, `❌ <b>Order ${orderId} has been cancelled.</b>`, { parse_mode: 'HTML' });
    }


    // Admin List Products
    if (data === 'admin_list_products') {
      if (!(await isOwner(userId))) return;
      const categories = await getCategories();
      if (categories.length === 0) {
        return bot.sendMessage(chatId, '📦 <b>Store Inventory is currently empty!</b> Use ➕ Add Category to start.', { parse_mode: 'HTML' });
      }
      let listText = `📦 <b>PRODUCT LIST & KEYS INVENTORY:</b>\n-----------------------------------\n`;
      for (const cat of categories) {
        listText += `\n📁 <b>${cat.name}</b> (ID: <code>${cat.id}</code>)\n`;
        const products = await getProductsByCategory(cat.id);
        if (products.length === 0) listText += `  <i>(No products in category)</i>\n`;
        for (const p of products) {
          const keysCount = (p.keys || []).length;
          const stockBadge = keysCount > 0 ? `🔵 <b>${keysCount} keys in stock</b>` : `🔴 <b>Out of stock</b>`;
          const hasPhoto = p.photo_id ? '🖼️ Photo' : 'No photo';
          listText += `  └ 🔹 <b>${p.name}</b>\n     • ID: <code>${p.id}</code>\n     • Price: ${p.price}\n     • Status: ${stockBadge} (${hasPhoto})\n`;
        }
      }
      return bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
    }

    // Admin Wizard: Add Category
    if (data === 'admin_wiz_add_cat') {
      if (!(await isOwner(userId))) return;
      adminState[userId] = { action: 'awaiting_cat_name_or_photo' };
      return bot.sendMessage(chatId, `➕ <b>Send Category Name, OR upload a Photo with Caption now!</b>\n\n<b>Example Text:</b>\n<code>🔮 Fluorite FreeFire iOS</code>\n\n<b>Example Photo Caption:</b>\n<code>VPN</code>\n\n<i>(Type text or upload photo with caption now!)</i>`, { parse_mode: 'HTML' });
    }

    // Admin Wizard: Add Product -> Select Category
    if (data === 'admin_wiz_add_prod') {
      if (!(await isOwner(userId))) return;
      const categories = await getCategories();
      if (categories.length === 0) {
        return bot.sendMessage(chatId, `⚠️ <b>No categories exist yet!</b> Please click ➕ <b>Add Category</b> first.`, { parse_mode: 'HTML' });
      }
      const inline_keyboard = categories.map(cat => ([{
        text: `📁 ${cat.name}`,
        callback_data: `admin_sel_cat_${cat.id}`
      }]));
      return bot.sendMessage(chatId, `📦 <b>Select which category to add the product to:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
      });
    }

    // Admin Wizard: Category Selected for Product Creation
    if (data.startsWith('admin_sel_cat_')) {
      if (!(await isOwner(userId))) return;
      const categoryId = data.replace('admin_sel_cat_', '');
      const categories = await getCategories();
      const cat = categories.find(c => c.id === categoryId);
      adminState[userId] = { action: 'awaiting_prod_image_and_info', categoryId };
      return bot.sendMessage(chatId, `📸 <b>Send the Product Image with Caption now!</b>\n\n📁 Category: <b>${cat ? cat.name : 'Category'}</b>\n\n<b>Caption Format:</b>\n<code>Product Name | $Price | Optional Description</code>\n\n<b>Example Caption:</b>\n<code>Fluorite FF iOS 1 Day | $2.00 | VIP Key</code>\n\n<i>(Upload your image with caption now — the bot will automatically convert it to an emoji button with the picture attached!)</i>`, { parse_mode: 'HTML' });
    }

    // Admin Wizard: Add Keys -> Select Product
    if (data === 'admin_wiz_add_keys') {
      if (!(await isOwner(userId))) return;
      const categories = await getCategories();
      let allProducts = [];
      for (const cat of categories) {
        const prods = await getProductsByCategory(cat.id);
        allProducts.push(...prods);
      }
      if (allProducts.length === 0) {
        return bot.sendMessage(chatId, `⚠️ <b>No products exist yet!</b> Click 📦 <b>Add Product</b> first.`, { parse_mode: 'HTML' });
      }
      const inline_keyboard = allProducts.map(prod => ([{
        text: `🔹 ${prod.name} (${(prod.keys || []).length} keys)`,
        callback_data: `admin_sel_prod_keys_${prod.id}`
      }]));
      return bot.sendMessage(chatId, `🔑 <b>Select which product to add license keys for:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
      });
    }

    // Admin Wizard: Product Selected for Adding Keys
    if (data.startsWith('admin_sel_prod_keys_')) {
      if (!(await isOwner(userId))) return;
      const productId = data.replace('admin_sel_prod_keys_', '');
      const prod = await getProduct(productId);
      adminState[userId] = { action: 'awaiting_keys', productId };
      return bot.sendMessage(chatId, `🔑 <b>Send license keys for "${prod ? prod.name : 'Product'}" now:</b>\n\n<i>(Paste keys in chat. Separate multiple keys with commas or new lines!)</i>`, { parse_mode: 'HTML' });
    }

    // Admin Wizard: Set Photo -> Select Product
    if (data === 'admin_wiz_set_photo') {
      if (!(await isOwner(userId))) return;
      const categories = await getCategories();
      let allProducts = [];
      for (const cat of categories) {
        const prods = await getProductsByCategory(cat.id);
        allProducts.push(...prods);
      }
      if (allProducts.length === 0) {
        return bot.sendMessage(chatId, `⚠️ <b>No products exist yet!</b> Click 📦 <b>Add Product</b> first.`, { parse_mode: 'HTML' });
      }
      const inline_keyboard = allProducts.map(prod => ([{
        text: `🖼️ ${prod.name}`,
        callback_data: `admin_sel_prod_photo_${prod.id}`
      }]));
      return bot.sendMessage(chatId, `🖼️ <b>Select which product to set/update picture for:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
      });
    }

    // Admin Wizard: Product Selected for Photo
    if (data.startsWith('admin_sel_prod_photo_')) {
      if (!(await isOwner(userId))) return;
      const productId = data.replace('admin_sel_prod_photo_', '');
      const prod = await getProduct(productId);
      adminState[userId] = { action: 'awaiting_photo', productId };
      return bot.sendMessage(chatId, `🖼️ <b>Send or upload the picture for "${prod ? prod.name : 'Product'}" now:</b>`, { parse_mode: 'HTML' });
    }

    // Admin Wizard: Delete Menu
    if (data === 'admin_wiz_delete') {
      if (!(await isOwner(userId))) return;
      const categories = await getCategories();
      if (categories.length === 0) {
        return bot.sendMessage(chatId, `⚠️ <b>Store is currently empty!</b>`, { parse_mode: 'HTML' });
      }
      const inline_keyboard = [];
      for (const cat of categories) {
        inline_keyboard.push([{
          text: `🗑️ Delete Category: ${cat.name}`,
          callback_data: `admin_del_cat_${cat.id}`
        }]);
        const prods = await getProductsByCategory(cat.id);
        for (const p of prods) {
          inline_keyboard.push([{
            text: `   └ 🗑️ Delete Product: ${p.name}`,
            callback_data: `admin_del_prod_${p.id}`
          }]);
        }
      }
      return bot.sendMessage(chatId, `🗑️ <b>Click any item below to delete it:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
      });
    }

    // Admin Delete Category Click
    if (data.startsWith('admin_del_cat_')) {
      if (!(await isOwner(userId))) return;
      const categoryId = data.replace('admin_del_cat_', '');
      await deleteCategory(categoryId);
      return bot.sendMessage(chatId, `🗑️ <b>Category deleted!</b>`, { parse_mode: 'HTML' });
    }

    // Admin Delete Product Click
    if (data.startsWith('admin_del_prod_')) {
      if (!(await isOwner(userId))) return;
      const productId = data.replace('admin_del_prod_', '');
      await deleteProduct(productId);
      return bot.sendMessage(chatId, `🗑️ <b>Product deleted!</b>`, { parse_mode: 'HTML' });
    }

    // Admin Broadcast Prompt
    if (data === 'admin_broadcast_prompt') {
      if (!(await isOwner(userId))) return;
      return bot.sendMessage(chatId, `📢 <b>To Broadcast a message to all users:</b>\n\nRun command:\n<code>/broadcast Your announcement message here</code>`, { parse_mode: 'HTML' });
    }

  } catch (err) {
    console.error('Error handling callback query:', err);
  }
});

console.log('✅ Telegram Bot loaded successfully and listening for messages!');
