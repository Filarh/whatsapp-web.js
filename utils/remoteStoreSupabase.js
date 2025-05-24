require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET;

const uploadedSessions = new Set(); // Para evitar múltiples subidas innecesarias

const remoteStore = {
  async save({ session }) {
    const filePath = `${session}.zip`;

    if (!fs.existsSync(filePath)) {
      console.warn(`[STORE] ⚠️ Archivo no encontrado: ${filePath}`);
      return;
    }

    if (uploadedSessions.has(session)) {
      console.log(`[STORE] ⏩ Sesión '${session}' ya fue subida previamente, omitiendo`);
      return;
    }

    // Verifica si ya existe remotamente
    const exists = await remoteStore.sessionExists({ session });
    if (exists) {
      console.log(`[STORE] ✅ Sesión '${session}' ya existe en Supabase`);
      uploadedSessions.add(session); // La marcamos como ya sincronizada
      return;
    }

    const data = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${session}.zip`, data, { upsert: false }); // NO sobrescribas

    if (error) {
      console.error(`[STORE] ❌ Error al subir '${session}': ${error.message}`);
    } else {
      uploadedSessions.add(session);
      console.log(`[STORE] ✅ Sesión '${session}' guardada en Supabase`);
    }
  },

  async extract({ session, path: destinationPath }) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(`${session}.zip`);

    if (error) throw new Error(`[STORE] ❌ Error al descargar: ${error.message}`);

    const buffer = await data.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(buffer));
    console.log(`[STORE] 📦 Sesión '${session}' restaurada desde Supabase`);
  },

  async delete({ session }) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([`${session}.zip`]);

    if (error) {
      console.error(`[STORE] ❌ Error al eliminar: ${error.message}`);
    } else {
      uploadedSessions.delete(session);
      console.log(`[STORE] 🗑️ Sesión '${session}' eliminada de Supabase`);
    }
  },

  async sessionExists({ session }) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { search: `${session}.zip` });

    if (error) {
      console.error(`[STORE] ⚠️ Error al verificar sesión: ${error.message}`);
      return false;
    }

    return data?.some(item => item.name === `${session}.zip`) || false;
  }
};

module.exports = remoteStore;
