# Telegram Store & Key Delivery Bot 🤖

A Telegram e-commerce store bot designed for selling digital goods, game keys (iOS/Android), VPN keys, files, and video tutorials automatically.

---

## 🌟 Features

- 📱 **Custom Telegram UI**: Welcome message banner, persistent `🛒 BUY NOW` menu button, and clean category inline buttons matching your design.
- 🔑 **Automated Key Delivery**: Instantly dispenses unique license keys to customers upon purchase.
- 🍿 **Video Tutorial Support**: Automatically sends tutorial videos (such as `video_2026-07-23_16-32-58.mp4`) when users request help or purchase a key.
- 👑 **Owner Admin Panel**: Control panel accessible via `/admin` to add keys, add products, broadcast messages, and view stock status.

---

## 🚀 How to Run the Bot

1. Open your terminal in `d:\bennzoo_bot`.
2. Run:
   ```cmd
   cmd /c npm start
   ```
   *(Or `node bot.js`)*

---

## 👑 How to Claim Ownership & Admin Setup

1. Open Telegram and search for your bot.
2. Send `/start` to see the user catalog.
3. Send `/claimowner` to register your Telegram account as the **Bot Owner**.
4. Type `/admin` to open the Admin Panel!

### Admin Commands:
- `/admin` - Open Admin Dashboard & View Store Statistics
- `/listproducts` - List all Product IDs and key stock counts
- `/addkey <product_id> <key1,key2...>` - Add batch keys to product stock (e.g., `/addkey prod_ff_ios_1d KEY1,KEY2,KEY3`)
- `/addcategory <Category Name>` - Create new category
- `/addproduct <cat_id> | <Product Name> | <Price> | <Description>` - Create new product
- `/setadmin <username>` - Set admin contact link (e.g., `/setadmin my_username`)
- `/broadcast <message>` - Send announcement to all bot users
