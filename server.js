// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ----------------------
// Configuración PostgreSQL
// ----------------------
const poolConfig = {};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || '';
  poolConfig.database = process.env.PGDATABASE || 'postgres';
  poolConfig.port = process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432;
  if ((process.env.PGHOST||'').includes('supabase') || process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

let pool;
let dbAvailable = false;

(async () => {
  try {
    pool = new Pool(poolConfig);
    const client = await pool.connect();
    console.log('✅ Conectado a PostgreSQL:', poolConfig.host || 'DATABASE_URL');
    client.release();
    dbAvailable = true;
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
    console.log('⚠️ Usando datos de ejemplo en memoria.');
  }
})();

// ----------------------
// Servir frontend
// ----------------------
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------
// Rutas API
// ----------------------

// Salud
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Listar clubes
app.get('/api/clubes', async (req, res) => {
  if (dbAvailable) {
    try {
      const { rows } = await pool.query('SELECT club_id, nombre, pais, ciudad FROM club ORDER BY nombre');
      return res.json(rows);
    } catch (err) {
      console.error('Error /api/clubes:', err);
    }
  }
  res.json([
    { club_id: 1, nombre: 'Demo Club', pais: 'Demo Pais', ciudad: 'Demo Ciudad' }
  ]);
});

// Listar equipos
app.get('/api/equipos', async (req, res) => {
  if (dbAvailable) {
    try {
      const { rows } = await pool.query(`
        SELECT e.equipo_id, e.nombre, e.categoria, c.nombre AS club
        FROM equipo e
        JOIN club c ON e.club_id = c.club_id
        ORDER BY c.nombre, e.nombre
      `);
      return res.json(rows);
    } catch (err) {
      console.error('Error /api/equipos:', err);
    }
  }
  res.json([
    { equipo_id: 1, nombre: 'Demo Equipo', categoria: 'Primera', club: 'Demo Club' }
  ]);
});

// Listar partidos
app.get('/api/partidos', async (req, res) => {
  if (dbAvailable) {
    try {
      const { rows } = await pool.query(`
        SELECT p.partido_id, p.fecha_hora, p.lugar,
               el.nombre AS local, ev.nombre AS visitante
        FROM partido p
        JOIN equipo el ON p.equipo_local_id = el.equipo_id
        JOIN equipo ev ON p.equipo_visitante_id = ev.equipo_id
        ORDER BY p.fecha_hora NULLS LAST
      `);
      return res.json(rows);
    } catch (err) {
      console.error('Error /api/partidos:', err);
    }
  }
  res.json([
    { partido_id: 1, fecha_hora: new Date(), lugar: 'Demo Estadio', local: 'Demo Local', visitante: 'Demo Visitante' }
  ]);
});

// Detalle de partido
app.get('/api/partidos/detalle/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  if (dbAvailable) {
    try {
      const { rows } = await pool.query(`
        SELECT p.partido_id, p.fecha_hora, p.lugar,
               el.nombre AS local, ev.nombre AS visitante,
               r.goles_local, r.goles_visitante, r.resultado_1x2
        FROM partido p
        JOIN equipo el ON p.equipo_local_id = el.equipo_id
        JOIN equipo ev ON p.equipo_visitante_id = ev.equipo_id
        LEFT JOIN resultado_partido r ON p.partido_id = r.partido_id
        WHERE p.partido_id = $1
      `, [id]);

      if (rows.length === 0) return res.status(404).json({ error: 'Partido no encontrado' });
      return res.json(rows[0]);
    } catch (err) {
      console.error('Error /api/partidos/detalle:', err);
    }
  }

  res.json({
    partido_id: id,
    fecha_hora: new Date(),
    lugar: 'Demo Estadio',
    local: 'Demo Local',
    visitante: 'Demo Visitante',
    goles_local: 0,
    goles_visitante: 0,
    resultado_1x2: 'X'
  });
});

// SPA catch-all
app.get('/.', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------------
// Start server
// ----------------------
const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
