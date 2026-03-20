const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'secreto_taller_costura_2024';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos en memoria
const db = new sqlite3.Database(':memory:');

// Crear tablas
db.serialize(() => {
  // Usuarios
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT DEFAULT 'user',
    purchase_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)`,
    ['rcortesesquivel@gmail.com', adminPassword, 'Randal Cortes', 'admin']);

  // Inventario de telas
  db.run(`CREATE TABLE fabrics (
    id INTEGER PRIMARY KEY,
    name TEXT,
    type TEXT,
    composition TEXT,
    color TEXT,
    width REAL,
    meters REAL,
    location TEXT,
    supplier TEXT,
    price_per_meter REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Máquinas
  db.run(`CREATE TABLE machines (
    id INTEGER PRIMARY KEY,
    name TEXT,
    model TEXT,
    serial TEXT,
    status TEXT,
    last_maintenance DATETIME,
    next_maintenance DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Mantenimiento de máquinas
  db.run(`CREATE TABLE maintenance (
    id INTEGER PRIMARY KEY,
    machine_id INTEGER,
    type TEXT,
    description TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    next_date DATETIME,
    FOREIGN KEY(machine_id) REFERENCES machines(id)
  )`);

  // Clientes
  db.run(`CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    bust REAL,
    waist REAL,
    hip REAL,
    shoulder REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Pedidos
  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    order_number TEXT UNIQUE,
    client_id INTEGER,
    description TEXT,
    status TEXT,
    budget REAL,
    paid REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  )`);

  // Vales de recepción
  db.run(`CREATE TABLE vouchers (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    issue_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,
    status TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  )`);

  // Crear usuario admin
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(
    `INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)`,
    ['rcortesesquivel@gmail.com', hashedPassword, 'Randal Cortes', 'admin']
  );
});

// Middleware de autenticación
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// LOGIN
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    // No hacer nada especial en login - la fecha de compra la establece el admin
    
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });
});

// TELAS
app.get('/api/fabrics', auth, (req, res) => {
  db.all('SELECT * FROM fabrics ORDER BY created_at DESC', (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/fabrics', auth, (req, res) => {
  const { name, type, composition, color, width, meters, location, supplier, price } = req.body;
  db.run(
    `INSERT INTO fabrics (name, type, composition, color, width, meters, location, supplier, price_per_meter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, type, composition, color, width, meters, location, supplier, price],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/fabrics/:id', auth, (req, res) => {
  const { name, type, composition, color, width, meters, location, supplier, price } = req.body;
  db.run(
    `UPDATE fabrics SET name=?, type=?, composition=?, color=?, width=?, meters=?, location=?, supplier=?, price_per_meter=? WHERE id=?`,
    [name, type, composition, color, width, meters, location, supplier, price, req.params.id],
    () => res.json({ success: true })
  );
});

app.delete('/api/fabrics/:id', auth, (req, res) => {
  db.run('DELETE FROM fabrics WHERE id=?', [req.params.id], () => res.json({ success: true }));
});

// MÁQUINAS
app.get('/api/machines', auth, (req, res) => {
  db.all('SELECT * FROM machines ORDER BY created_at DESC', (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/machines', auth, (req, res) => {
  const { name, model, serial, status } = req.body;
  db.run(
    `INSERT INTO machines (name, model, serial, status, last_maintenance, next_maintenance)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 month'))`,
    [name, model, serial, status || 'activa'],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/machines/:id', auth, (req, res) => {
  db.run('DELETE FROM machines WHERE id=?', [req.params.id], () => res.json({ success: true }));
});

// MANTENIMIENTO
app.get('/api/maintenance/:machineId', auth, (req, res) => {
  db.all('SELECT * FROM maintenance WHERE machine_id = ? ORDER BY date DESC', [req.params.machineId], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/maintenance', auth, (req, res) => {
  const { machine_id, type, description, next_date } = req.body;
  db.run(
    `INSERT INTO maintenance (machine_id, type, description, next_date) VALUES (?, ?, ?, ?)`,
    [machine_id, type, description, next_date],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

// CLIENTES
app.get('/api/clients', auth, (req, res) => {
  db.all('SELECT * FROM clients ORDER BY created_at DESC', (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/clients', auth, (req, res) => {
  const { name, email, phone, address, bust, waist, hip, shoulder } = req.body;
  db.run(
    `INSERT INTO clients (name, email, phone, address, bust, waist, hip, shoulder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email, phone, address, bust, waist, hip, shoulder],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/clients/:id', auth, (req, res) => {
  const { name, email, phone, address, bust, waist, hip, shoulder } = req.body;
  db.run(
    `UPDATE clients SET name=?, email=?, phone=?, address=?, bust=?, waist=?, hip=?, shoulder=? WHERE id=?`,
    [name, email, phone, address, bust, waist, hip, shoulder, req.params.id],
    () => res.json({ success: true })
  );
});

app.delete('/api/clients/:id', auth, (req, res) => {
  db.run('DELETE FROM clients WHERE id=?', [req.params.id], () => res.json({ success: true }));
});

// PEDIDOS
app.get('/api/orders', auth, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/orders', auth, (req, res) => {
  const { order_number, client_id, description, status, budget } = req.body;
  db.run(
    `INSERT INTO orders (order_number, client_id, description, status, budget) VALUES (?, ?, ?, ?, ?)`,
    [order_number, client_id, description, status || 'pendiente', budget],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/orders/:id', auth, (req, res) => {
  const { status, paid } = req.body;
  db.run(
    `UPDATE orders SET status=?, paid=? WHERE id=?`,
    [status, paid, req.params.id],
    () => res.json({ success: true })
  );
});

app.delete('/api/orders/:id', auth, (req, res) => {
  db.run('DELETE FROM orders WHERE id=?', [req.params.id], () => res.json({ success: true }));
});

// VALES
app.get('/api/vouchers', auth, (req, res) => {
  db.all('SELECT * FROM vouchers ORDER BY issue_date DESC', (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/vouchers', auth, (req, res) => {
  const { order_id, due_date } = req.body;
  db.run(
    `INSERT INTO vouchers (order_id, due_date, status) VALUES (?, ?, 'activo')`,
    [order_id, due_date],
    function(err) {
      res.json({ id: this.lastID });
    }
  );
});

// DESCARGAS Y MATERIAL
app.get('/api/user-access-info', auth, (req, res) => {
  db.get('SELECT id, email, name, purchase_date FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    let canDownload = false;
    let daysRemaining = 0;
    
    if (user.purchase_date) {
      const purchaseDate = new Date(user.purchase_date);
      const now = new Date();
      const daysPassed = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
      canDownload = daysPassed >= 8;
      daysRemaining = Math.max(0, 8 - daysPassed);
    }
    
    res.json({
      user,
      canDownload,
      daysRemaining,
      purchaseDate: user.purchase_date
    });
  });
});

app.get('/api/download-material', auth, (req, res) => {
  db.get('SELECT purchase_date FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (!user || !user.purchase_date) {
      return res.status(403).json({ error: 'Acceso no autorizado. La fecha de compra no ha sido registrada.' });
    }
    
    const purchaseDate = new Date(user.purchase_date);
    const now = new Date();
    const daysPassed = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
    
    if (daysPassed < 8) {
      return res.status(403).json({ error: 'El material estará disponible en ' + (8 - daysPassed) + ' días.' });
    }
    
    // Descargar el PDF
    const path = require('path');
    const filePath = path.join(__dirname, 'public', 'Pack_Taller_Organizado_Info.pdf');
    res.download(filePath, 'Pack_Taller_Organizado_Info.pdf');
  });
});

app.get('/api/download-guide', auth, (req, res) => {
  db.get('SELECT purchase_date FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (!user || !user.purchase_date) {
      return res.status(403).json({ error: 'Acceso no autorizado. La fecha de compra no ha sido registrada.' });
    }
    
    const purchaseDate = new Date(user.purchase_date);
    const now = new Date();
    const daysPassed = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
    
    if (daysPassed < 8) {
      return res.status(403).json({ error: 'El material estará disponible en ' + (8 - daysPassed) + ' días.' });
    }
    
    // Descargar el PDF de guía
    const path = require('path');
    const filePath = path.join(__dirname, 'public', 'Guia_Uso_App.pdf');
    res.download(filePath, 'Guia_Uso_App.pdf');
  });
});

// DASHBOARD
app.get('/api/dashboard', auth, (req, res) => {
  db.all('SELECT COUNT(*) as count FROM orders WHERE status = "activo"', (err, orders) => {
    db.all('SELECT COUNT(*) as count FROM machines WHERE status = "mantenimiento"', (err, machines) => {
      db.all('SELECT COUNT(*) as count FROM fabrics WHERE meters < 5', (err, fabrics) => {
        res.json({
          activeOrders: orders?.[0]?.count || 0,
          machinesUnderMaintenance: machines?.[0]?.count || 0,
          lowStockFabrics: fabrics?.[0]?.count || 0
        });
      });
    });
  });
});

// ADMIN - Gestión de usuarios
app.get('/api/admin/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  
  db.all('SELECT id, email, name, role, purchase_date, created_at FROM users ORDER BY created_at DESC', (err, users) => {
    res.json(users || []);
  });
});

app.post('/api/admin/users/:id/set-purchase-date', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  
  const { purchase_date } = req.body;
  const userId = req.params.id;
  
  if (!purchase_date) {
    return res.status(400).json({ error: 'Fecha de compra requerida' });
  }
  
  db.run(
    'UPDATE users SET purchase_date = ? WHERE id = ?',
    [purchase_date, userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar' });
      res.json({ success: true, message: 'Fecha de compra actualizada' });
    }
  );
});

app.post('/api/admin/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  
  const { email, password, name, purchase_date } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, contraseña y nombre requeridos' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run(
    'INSERT INTO users (email, password, name, role, purchase_date) VALUES (?, ?, ?, ?, ?)',
    [email, hashedPassword, name, 'user', purchase_date || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error al crear usuario' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.delete('/api/admin/users/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar' });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📱 Usuario: rcortesesquivel@gmail.com`);
  console.log(`🔑 Contraseña: admin123`);
});
