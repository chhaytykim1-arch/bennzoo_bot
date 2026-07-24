import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'database.json');

const defaultData = {
  owner_id: null,
  admin_username: 'admin_support',
  banner_image: null,
  categories: [],
  products: [],
  orders: [],
  users: []
};

async function readDB() {
  try {
    if (!(await fs.pathExists(DB_FILE))) {
      await fs.writeJson(DB_FILE, defaultData, { spaces: 2 });
      return defaultData;
    }
    return await fs.readJson(DB_FILE);
  } catch (err) {
    console.error('Error reading DB:', err);
    return defaultData;
  }
}

async function writeDB(data) {
  try {
    await fs.writeJson(DB_FILE, data, { spaces: 2 });
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

export async function getAdminIds() {
  const db = await readDB();
  const defaultAdmins = ['7984481387', '7283817695'];
  const envAdmins = (process.env.OWNER_IDS || process.env.OWNER_ID || '').split(/[,;\s]+/).filter(Boolean);
  const dbAdmins = db.owner_ids || (db.owner_id ? [db.owner_id] : []);
  
  const allAdmins = new Set([...defaultAdmins, ...envAdmins, ...dbAdmins].map(id => String(id).trim()));
  return Array.from(allAdmins);
}

export async function getOwnerId() {
  const adminIds = await getAdminIds();
  return adminIds[0] || null;
}

export async function setOwnerId(id) {
  const db = await readDB();
  if (!db.owner_ids) db.owner_ids = ['7984481387', '7283817695'];
  if (!db.owner_ids.includes(String(id))) {
    db.owner_ids.push(String(id));
  }
  db.owner_id = String(id);
  await writeDB(db);
}

export async function addAdminId(id) {
  const db = await readDB();
  if (!db.owner_ids) db.owner_ids = ['7984481387', '7283817695'];
  if (!db.owner_ids.includes(String(id))) {
    db.owner_ids.push(String(id));
    await writeDB(db);
  }
}

export async function getAdminUsername() {
  const db = await readDB();
  return db.admin_username || process.env.ADMIN_USERNAME || 'admin';
}

export async function setAdminUsername(username) {
  const db = await readDB();
  db.admin_username = username.replace('@', '');
  await writeDB(db);
}

export async function getCategories() {
  const db = await readDB();
  return db.categories || [];
}

export async function addCategory(name, description = '') {
  const db = await readDB();
  const id = 'cat_' + Date.now();
  db.categories.push({ id, name, description });
  await writeDB(db);
  return id;
}

export async function deleteCategory(categoryId) {
  const db = await readDB();
  db.categories = db.categories.filter(c => c.id !== categoryId);
  db.products = db.products.filter(p => p.category_id !== categoryId);
  await writeDB(db);
}

export async function setCategoryPhoto(categoryId, photoId) {
  const db = await readDB();
  const cat = db.categories.find(c => c.id === categoryId);
  if (cat) {
    cat.photo_id = photoId;
    await writeDB(db);
    return true;
  }
  return false;
}

export async function getProductsByCategory(categoryId) {
  const db = await readDB();
  return (db.products || []).filter(p => p.category_id === categoryId);
}

export async function getProduct(productId) {
  const db = await readDB();
  return (db.products || []).find(p => p.id === productId);
}

export async function addProduct(categoryId, name, price, description = '', mediaPath = 'video_2026-07-23_16-32-58.mp4') {
  const db = await readDB();
  const id = 'prod_' + Date.now();
  const newProduct = {
    id,
    category_id: categoryId,
    name,
    price,
    description,
    keys: [],
    media_path: mediaPath
  };
  db.products.push(newProduct);
  await writeDB(db);
  return id;
}

export async function deleteProduct(productId) {
  const db = await readDB();
  db.products = db.products.filter(p => p.id !== productId);
  await writeDB(db);
}

export async function setProductPhoto(productId, photoId) {
  const db = await readDB();
  const prod = db.products.find(p => p.id === productId);
  if (prod) {
    prod.photo_id = photoId;
    await writeDB(db);
    return true;
  }
  return false;
}

export async function setProductMedia(productId, mediaPath) {
  const db = await readDB();
  const prod = db.products.find(p => p.id === productId);
  if (prod) {
    prod.media_path = mediaPath;
    await writeDB(db);
    return true;
  }
  return false;
}

export async function addKeys(productId, keyList) {
  const db = await readDB();
  const prod = db.products.find(p => p.id === productId);
  if (prod) {
    if (!Array.isArray(prod.keys)) prod.keys = [];
    prod.keys.push(...keyList);
    await writeDB(db);
    return prod.keys.length;
  }
  return 0;
}

export async function popKey(productId) {
  const db = await readDB();
  const prod = db.products.find(p => p.id === productId);
  if (prod && prod.keys && prod.keys.length > 0) {
    const issuedKey = prod.keys.shift();
    await writeDB(db);
    return issuedKey;
  }
  return null;
}

export async function createPendingOrder({ userId, username, productId, productName, amount, md5, priceStr }) {
  const db = await readDB();
  if (!db.pending_orders) db.pending_orders = [];
  const orderId = 'ORD-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const pendingOrder = {
    orderId,
    userId,
    username,
    productId,
    productName,
    amount,
    priceStr,
    md5,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };
  db.pending_orders.push(pendingOrder);
  await writeDB(db);
  return pendingOrder;
}

export async function getPendingOrder(orderId) {
  const db = await readDB();
  return (db.pending_orders || []).find(o => o.orderId === orderId);
}

export async function markOrderPaid(orderId, keyIssued) {
  const db = await readDB();
  if (!db.pending_orders) db.pending_orders = [];
  const pendingIndex = db.pending_orders.findIndex(o => o.orderId === orderId);
  let pendingOrder = null;
  if (pendingIndex !== -1) {
    pendingOrder = db.pending_orders[pendingIndex];
    db.pending_orders.splice(pendingIndex, 1);
  }

  if (!db.orders) db.orders = [];
  const completedOrder = {
    orderId: orderId,
    userId: pendingOrder ? pendingOrder.userId : null,
    username: pendingOrder ? pendingOrder.username : '',
    productId: pendingOrder ? pendingOrder.productId : '',
    productName: pendingOrder ? pendingOrder.productName : '',
    keyIssued,
    date: new Date().toISOString(),
    status: 'PAID'
  };
  db.orders.push(completedOrder);
  await writeDB(db);
  return completedOrder;
}

export async function cancelPendingOrder(orderId) {
  const db = await readDB();
  if (!db.pending_orders) return;
  db.pending_orders = db.pending_orders.filter(o => o.orderId !== orderId);
  await writeDB(db);
}

export async function recordOrder(userId, username, productId, productName, keyIssued) {
  const db = await readDB();
  const orderId = 'ORD-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  db.orders.push({
    orderId,
    userId,
    username,
    productId,
    productName,
    keyIssued,
    date: new Date().toISOString()
  });
  await writeDB(db);
  return orderId;
}


export async function trackUser(userId, username, firstName) {
  const db = await readDB();
  if (!db.users) db.users = [];
  const existing = db.users.find(u => u.userId === userId);
  if (!existing) {
    db.users.push({ userId, username, firstName, joinedAt: new Date().toISOString() });
    await writeDB(db);
  }
}

export async function getAllUsers() {
  const db = await readDB();
  return db.users || [];
}

export async function getStats() {
  const db = await readDB();
  let totalKeys = 0;
  (db.products || []).forEach(p => {
    totalKeys += (p.keys || []).length;
  });
  return {
    categories: (db.categories || []).length,
    products: (db.products || []).length,
    totalKeys,
    totalOrders: (db.orders || []).length,
    usersCount: (db.users || []).length
  };
}
