// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración del pool: acepta DATABASE_URL o variables separadas
const poolConfig = {};
if (process.env.DATABASE_URL) {
  // Si tienes una URL (heroku / otros)
  poolConfig.connectionString = process.env.DATABASE_URL;
  // Si estás usando SSL obligatorio (ej. Supabase), forzamos rejectUnauthorized false
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || '';
  poolConfig.database = process.env.PGDATABASE || 'postgres';
  poolConfig.port = process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432;
  // Si estamos en producción o el host contiene "supabase" usamos SSL
  if ((process.env.PGHOST||'').includes('supabase') || process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

// probar conexión al arrancar
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conectado a PostgreSQL:', poolConfig.host || 'DATABASE_URL');
    client.release();
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:');
    console.error(err.message || err);
    // no hacemos process.exit para que puedas ver el error y el server siga corriendo si quieres
  }
})();

// Servir frontend estático (si tienes index.html en carpeta "public")
app.use(express.static(path.join(__dirname, 'public')));

// --- RUTAS API ---
// salud
app.get('/api/health', (req, res) => res.json({ ok: true }));

// listar clubes
app.get('/api/clubes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT club_id, nombre, pais, ciudad FROM club ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    console.error('Error /api/clubes:', err);
    res.status(500).json({ error: 'Error consultando BD' });
  }
});

// listar equipos
app.get('/api/equipos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.equipo_id, e.nombre, e.categoria, c.nombre AS club
      FROM equipo e
      JOIN club c ON e.club_id = c.club_id
      ORDER BY c.nombre, e.nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error /api/equipos:', err);
    res.status(500).json({ error: 'Error consultando BD' });
  }
});

// listar partidos (simple)
app.get('/api/partidos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.partido_id, p.fecha_hora, p.lugar,
             el.nombre AS local, ev.nombre AS visitante
      FROM partido p
      JOIN equipo el ON p.equipo_local_id = el.equipo_id
      JOIN equipo ev ON p.equipo_visitante_id = ev.equipo_id
      ORDER BY p.fecha_hora NULLS LAST
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error /api/partidos:', err);
    res.status(500).json({ error: 'Error consultando BD' });
  }
});

// detalles de partido (incluye marcador si existe)
app.get('/api/partidos/detalle/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

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
    res.json(rows[0]);
  } catch (err) {
    console.error('Error /api/partidos/detalle:', err);
    res.status(500).json({ error: 'Error consultando BD' });
  }
});

// endpoint "solicitudes" (por compatibilidad con tu frontend original).
// Si no existe la tabla "solicitudes" devolvemos un arreglo vacío para evitar 500.
app.get('/api/solicitudes', async (req, res) => {
  try {
    const check = await pool.query(`
      SELECT to_regclass('public.solicitudes') AS exists_tbl
    `);
    if (!check.rows[0].exists_tbl) {
      // tabla no existe: devolvemos algunos datos demo o vacío
      return res.json([
        { id: 1, descripcion: 'Tabla solicitudes no encontrada', estado: 'n/a' }
      ]);
    }
    const { rows } = await pool.query('SELECT * FROM solicitudes ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Error /api/solicitudes:', err);
    res.status(500).json({ error: 'Error consultando BD' });
  }
});

// catchall: devolver index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
