/**
 * MOTOR DE NORMALIZACIÓN ETL - ARQUITECTURA DE DATOS
 * Este módulo contiene la lógica pura para la limpieza y transformación de datos.
 */

/**
 * Función: normalizeText
 * Propósito: Transforma una cadena de texto individual siguiendo las reglas de negocio.
 * Reglas aplicadas:
 * 1. Conversión a MAYÚSCULAS para estandarizar.
 * 2. Normalización NFD para separar caracteres de sus tildes.
 * 3. Eliminación de diacríticos (tildes) mediante RegEx.
 * 4. Eliminación de caracteres especiales residuales (mantiene letras, números y espacios).
 * 5. Eliminación de espacios en blanco al inicio y final (trim).
 */
export const normalizeText = (text, format = 'UPPERCASE') => {
  if (!text) return "";
  
  let normalized = text
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") // Elimina tildes
    .replace(/[^a-zA-Z0-9\s]/gi, "")    // Elimina cualquier caracter que no sea letra, número o espacio
    .replace(/\s+/g, " ")               // Reemplaza múltiples espacios consecutivos por uno solo
    .trim();
    
  if (format === 'UPPERCASE') {
    normalized = normalized.toUpperCase();
  } else if (format === 'LOWERCASE') {
    normalized = normalized.toLowerCase();
  } else if (format === 'TITLE') {
    normalized = normalized.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
    
  return normalized;
};

/**
 * Función: processCommunes
 * Propósito: Procesa un conjunto masivo de datos, gestiona duplicados y genera auditoría.
 * @param {string} fileContent - El contenido bruto del archivo de texto.
 * @returns {Object} - Objeto con datos limpios, logs de auditoría y resumen estadístico.
 */
export const processCommunes = (fileContent, format = 'UPPERCASE') => {
  // Separar el archivo por saltos de línea (soporta Windows y Unix)
  const lines = fileContent.split(/\r?\n/);
  const results = [];
  const duplicates = [];
  const seenMap = new Map(); // Llave sin espacios -> Índice en el arreglo 'results'
  const logs = [];

  // Registro inicial del proceso
  logs.push(`LOG DE PROCESAMIENTO ETL - ${new Date().toLocaleString()}`);
  logs.push(`---------------------------------------------------------`);
  logs.push(`Inicio: ${lines.length} registros brutos detectados.`);

  lines.forEach((line, index) => {
    const original = line.trim();
    if (!original) return; // Ignorar líneas vacías

    // Aplicar transformación individual
    const normalized = normalizeText(original, format);
    const spacelessKey = normalized.replace(/\s/g, "");
    
    // Lógica de eliminación de duplicados por similitud sin espacios
    if (seenMap.has(spacelessKey)) {
      const existingIndex = seenMap.get(spacelessKey);
      const existing = results[existingIndex];
      
      // Contar espacios para preferir la versión con mejor formateo (ej: "VINA DEL MAR" sobre "VINA DELMAR")
      const existingSpacesCount = (existing.nombre.match(/\s/g) || []).length;
      const currentSpacesCount = (normalized.match(/\s/g) || []).length;

      if (currentSpacesCount > existingSpacesCount) {
        // El actual está mejor espaciado que el guardado previamente. Lo reemplazamos en results.
        logs.push(`Línea ${index + 1} [MODIFICADO POR ESPACIADO]: "${original}" -> Reemplaza a "${existing.original}" (por mejor formato de espacios: "${normalized}")`);
        duplicates.push({ line: existing.line, original: existing.original, normalized: existing.nombre });
        
        results[existingIndex] = {
          id: existing.id, // Mantenemos el ID original para sobreescritura correcta
          nombre: normalized,
          original: original,
          timestamp: new Date().toISOString(),
          line: index + 1
        };
      } else {
        // El actual tiene menos o iguales espacios. Se descarta como duplicado.
        duplicates.push({ line: index + 1, original, normalized });
        logs.push(`Línea ${index + 1} [DUPLICADO OMITIDO]: "${original}" -> Omitido por similitud con "${existing.original}"`);
      }
    } else {
      // Estructura de datos para la base de datos
      results.push({
        id: crypto.randomUUID(),
        nombre: normalized,
        original: original,
        timestamp: new Date().toISOString(),
        line: index + 1
      });
      
      seenMap.set(spacelessKey, results.length - 1);
      
      // Registrar cambio en el log si hubo transformación (ej: tildes o minúsculas)
      if (original !== normalized) {
        logs.push(`Línea ${index + 1} [MODIFICADO]: "${original}" -> "${normalized}"`);
      }
    }
  });

  // Resumen final del log
  logs.push(`---------------------------------------------------------`);
  logs.push(`PROCESO COMPLETADO EXITOSAMENTE`);
  logs.push(`- Registros Únicos (Exportados): ${results.length}`);
  logs.push(`- Registros Duplicados (Eliminados): ${duplicates.length}`);

  return {
    data: results,
    logs: logs,
    summary: {
      total: lines.length,
      unique: results.length,
      duplicates: duplicates.length
    }
  };
};

const parseFamousDate = (dateStr) => {
  let year = null;
  let month = '01';
  let day = '01';
  
  if (dateStr.includes('a.C.')) {
    const yearMatch = dateStr.match(/(\d+)\s*a\.C\./);
    if (yearMatch) {
       year = -parseInt(yearMatch[1], 10);
    }
    const parts = dateStr.split('/');
    if (parts.length === 3) {
       month = parts[1].padStart(2, '0');
       day = parts[2].padStart(2, '0');
    }
  } else if (dateStr.includes('alrededor de')) {
    const yearMatch = dateStr.match(/(\d+)/);
    if (yearMatch) {
       year = parseInt(yearMatch[1], 10);
    }
  } else {
    const cleanStr = dateStr.replace(/-/g, '/');
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parts[1].padStart(2, '0');
        day = parts[2].padStart(2, '0');
      } else if (parts[2].length === 4) {
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
        year = parseInt(parts[2], 10);
      }
    }
  }
  
  let yearStr = year !== null ? year.toString() : '0000';
  if (year !== null && year < 0) {
    yearStr = '-' + Math.abs(year).toString().padStart(4, '0');
  } else if (year !== null) {
    yearStr = yearStr.padStart(4, '0');
  }
  
  const formatted = `${day}-${month}-${yearStr}`;
  
  return {
    day: parseInt(day, 10),
    month: parseInt(month, 10),
    year,
    formatted
  };
};

export const processFamous = (fileContent) => {
  const lines = fileContent.split(/\r?\n/);
  const results = [];
  const duplicates = [];
  const seenMap = new Map(); // Llave sin espacios -> Índice en resultados
  const logs = [];

  logs.push(`LOG DE PROCESAMIENTO ETL (FAMOSOS) - ${new Date().toLocaleString()}`);
  logs.push(`---------------------------------------------------------`);
  logs.push(`Inicio: ${lines.length} registros brutos detectados.`);

  const CURRENT_YEAR = 2026;
  const CURRENT_MONTH = 5;
  const CURRENT_DAY = 23;

  lines.forEach((line, index) => {
    const original = line.trim();
    if (!original) return;

    const match = original.match(/^\d+\.\s*(.+?)\s*-\s*(.+)$/);
    if (!match) {
      logs.push(`Línea ${index + 1} [ERROR]: Formato inválido "${original}"`);
      return;
    }
    
    let name = match[1].trim();
    // Quitar separadores no permitidos en el nombre (como / o - no justificados)
    name = name.replace(/[-/]/g, '').trim();
    const dateStr = match[2].trim();

    const parsedDate = parseFamousDate(dateStr);
    
    // Check duplicates by name without space
    const normalizedName = normalizeText(name);
    const spacelessKey = normalizedName.replace(/\s/g, "");

    const age = parsedDate.year !== null ? (CURRENT_YEAR - parsedDate.year) : null;
    const isBirthday = (parsedDate.month === CURRENT_MONTH && parsedDate.day === CURRENT_DAY);

    if (seenMap.has(spacelessKey)) {
      const existingIndex = seenMap.get(spacelessKey);
      const existing = results[existingIndex];
      
      const existingSpacesCount = (existing.nombre.match(/\s/g) || []).length;
      const currentSpacesCount = (normalizedName.match(/\s/g) || []).length;

      if (currentSpacesCount > existingSpacesCount) {
        logs.push(`Línea ${index + 1} [MODIFICADO POR ESPACIADO]: "${original}" -> Reemplaza a "${existing.original}" (por mejor formato de espacios)`);
        duplicates.push({ line: existing.line, original: existing.original, name: existing.nombre });
        
        results[existingIndex] = {
          id: existing.id,
          nombre: name,
          fecha_nacimiento: parsedDate.formatted,
          edad: age,
          cumpleanos_hoy: isBirthday,
          original: original,
          timestamp: new Date().toISOString(),
          line: index + 1
        };
      } else {
        duplicates.push({ line: index + 1, original, name });
        logs.push(`Línea ${index + 1} [DUPLICADO OMITIDO]: "${original}" -> Omitido por similitud con "${existing.original}"`);
      }
    } else {
      results.push({
        id: crypto.randomUUID(),
        nombre: name,
        fecha_nacimiento: parsedDate.formatted,
        edad: age,
        cumpleanos_hoy: isBirthday,
        original: original,
        timestamp: new Date().toISOString(),
        line: index + 1
      });
      seenMap.set(spacelessKey, results.length - 1);
      logs.push(`Línea ${index + 1} [PROCESADO]: "${name}" | ${parsedDate.formatted} | Edad: ${age} | Cumpleaños hoy: ${isBirthday}`);
    }
  });

  logs.push(`---------------------------------------------------------`);
  logs.push(`PROCESO COMPLETADO EXITOSAMENTE`);
  logs.push(`- Registros Únicos (Exportados): ${results.length}`);
  logs.push(`- Registros Duplicados (Eliminados): ${duplicates.length}`);

  return {
    data: results,
    logs: logs,
    summary: {
      total: lines.length,
      unique: results.length,
      duplicates: duplicates.length
    }
  };
};

export const processPlaces = (fileContent) => {
  const lines = fileContent.split(/\r?\n/);
  const lugares = [];
  const georeferencias = [];
  const direcciones = [];
  const duplicates = [];
  const seenMap = new Map(); // Llave sin espacios -> Índice en lugares
  const logs = [];

  logs.push(`LOG DE PROCESAMIENTO ETL (LUGARES) - ${new Date().toLocaleString()}`);
  logs.push(`---------------------------------------------------------`);
  logs.push(`Inicio: ${lines.length} registros brutos detectados.`);

  // Skip header if present (Assuming first line is header)
  let startIndex = 0;
  if (lines.length > 0 && lines[0].toLowerCase().includes('nombre del lugar')) {
    startIndex = 1;
    logs.push(`Línea 1 [INFO]: Cabecera omitida.`);
  }

  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index];
    const original = line.trim();
    if (!original) continue;

    const parts = original.split(';');
    if (parts.length < 3) {
      logs.push(`Línea ${index + 1} [ERROR]: Formato inválido "${original}"`);
      continue;
    }

    const nombreLugar = parts[0].trim();
    const direccionFull = parts[1].trim();
    const georefFull = parts[2].trim();

    // Deduplication by normalized name and georef combined to be safer, or just name
    const dedupeKey = normalizeText(nombreLugar);
    const spacelessKey = dedupeKey.replace(/\s/g, "");

    // Parse Georeferencia
    const geoParts = georefFull.split(',').map(p => p.trim());
    let latitud = geoParts[0] || null;
    let longitud = geoParts[1] || null;

    // Parse Direccion
    const dirParts = direccionFull.split(',').map(p => p.trim());
    let nombre_calle = null;
    let numero_calle = null;
    let ciudad_estado_provincia = null;
    let pais = null;

    if (dirParts.length >= 3) {
      pais = dirParts[dirParts.length - 1];
      ciudad_estado_provincia = dirParts.slice(1, dirParts.length - 1).join(', ');
      
      const streetPart = dirParts[0];
      const match = streetPart.match(/^(\d+)\s+(.+)$/);
      if (match) {
        numero_calle = match[1];
        nombre_calle = match[2];
      } else {
        nombre_calle = streetPart;
      }
    } else if (dirParts.length === 1) {
      nombre_calle = dirParts[0];
    } else if (dirParts.length === 2) {
      pais = dirParts[1];
      nombre_calle = dirParts[0];
    }

    if (seenMap.has(spacelessKey)) {
      const existingIndex = seenMap.get(spacelessKey);
      const existingLugar = lugares[existingIndex];

      const existingSpacesCount = (existingLugar.nombre.match(/\s/g) || []).length;
      const currentSpacesCount = (nombreLugar.match(/\s/g) || []).length;

      if (currentSpacesCount > existingSpacesCount) {
        logs.push(`Línea ${index + 1} [MODIFICADO POR ESPACIADO]: "${nombreLugar}" -> Reemplaza a "${existingLugar.nombre}" (por mejor formato de espacios)`);
        duplicates.push({ line: index + 1, original });

        const lugarId = existingLugar.id;
        
        // Update existing record
        lugares[existingIndex] = {
          id: lugarId,
          nombre: nombreLugar,
          timestamp: new Date().toISOString()
        };

        const geoIdx = georeferencias.findIndex(g => g.lugar_id === lugarId);
        if (geoIdx !== -1) {
          georeferencias[geoIdx] = {
            id: georeferencias[geoIdx].id,
            lugar_id: lugarId,
            latitud,
            longitud
          };
        }

        const dirIdx = direcciones.findIndex(d => d.lugar_id === lugarId);
        if (dirIdx !== -1) {
          direcciones[dirIdx] = {
            id: direcciones[dirIdx].id,
            lugar_id: lugarId,
            nombre_calle,
            numero_calle,
            ciudad_estado_provincia,
            pais
          };
        }
      } else {
        duplicates.push({ line: index + 1, original });
        logs.push(`Línea ${index + 1} [DUPLICADO OMITIDO]: "${nombreLugar}" -> Omitido por similitud con "${existingLugar.nombre}"`);
      }
    } else {
      const lugarId = crypto.randomUUID();

      lugares.push({
        id: lugarId,
        nombre: nombreLugar,
        timestamp: new Date().toISOString()
      });

      georeferencias.push({
        id: crypto.randomUUID(),
        lugar_id: lugarId,
        latitud,
        longitud
      });

      direcciones.push({
        id: crypto.randomUUID(),
        lugar_id: lugarId,
        nombre_calle,
        numero_calle,
        ciudad_estado_provincia,
        pais
      });

      seenMap.set(spacelessKey, lugares.length - 1);
      logs.push(`Línea ${index + 1} [PROCESADO]: "${nombreLugar}"`);
    }
  }

  logs.push(`---------------------------------------------------------`);
  logs.push(`PROCESO COMPLETADO EXITOSAMENTE`);
  logs.push(`- Registros Únicos (Lugares/Geo/Dir): ${lugares.length}`);
  logs.push(`- Registros Duplicados (Eliminados): ${duplicates.length}`);

  return {
    data: { lugares, georeferencias, direcciones },
    logs: logs,
    summary: {
      total: lines.length - startIndex,
      unique: lugares.length,
      duplicates: duplicates.length
    }
  };
};
