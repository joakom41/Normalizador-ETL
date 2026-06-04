/**
 * INTERFAZ DE USUARIO Y LÓGICA DE CONTROL (ETL)
 */
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Database, CheckCircle, FileText, AlertCircle, Loader2, Search, Image as ImageIcon, MapPin, RefreshCw } from 'lucide-react';
import { processCommunes, processFamous, processPlaces, normalizeText } from './utils/NormalizationEngine';
import { db } from './firebase';
import { collection, writeBatch, doc, getDocs } from 'firebase/firestore';
import MapComponent from './components/MapComponent';
import { fetchCommuneData, fetchFamousImage } from './utils/api';

function App() {
  const [mode, setMode] = useState('comunas'); // 'comunas', 'famosos', 'lugares', 'database'
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Estados nuevos para Parte 3
  const [communeFormat, setCommuneFormat] = useState('TITLE');
  const [communeSearch, setCommuneSearch] = useState('');
  const [selectedFamous, setSelectedFamous] = useState(null);
  const [famousImageLoading, setFamousImageLoading] = useState(false);

  // Estados para el visor de Base de Datos
  const [dbSelectedTable, setDbSelectedTable] = useState('comunas'); // 'comunas', 'famosos', 'lugares'
  const [dbRecords, setDbRecords] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Efecto para auto-cargar datos cuando se entra al modo base de datos o se cambia de tabla
  useEffect(() => {
    if (mode === 'database') {
      fetchDatabaseRecords(dbSelectedTable);
    }
  }, [mode, dbSelectedTable]);

  // Función para obtener registros guardados en Firestore (ordenados alfabéticamente)
  const fetchDatabaseRecords = async (tableName) => {
    setDbLoading(true);
    setDbError(null);
    setDbRecords([]);
    
    try {
      if (tableName === 'comunas') {
        const querySnapshot = await getDocs(collection(db, 'COMUNAS_NORM'));
        const records = [];
        querySnapshot.forEach((doc) => {
          records.push({ id: doc.id, ...doc.data() });
        });
        records.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        setDbRecords(records);
      } else if (tableName === 'famosos') {
        const querySnapshot = await getDocs(collection(db, 'FAMOSOS_NORM'));
        const records = [];
        querySnapshot.forEach((doc) => {
          records.push({ id: doc.id, ...doc.data() });
        });
        records.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        setDbRecords(records);
      } else if (tableName === 'lugares') {
        // Obtenemos las tres tablas relacionales de lugares de forma concurrente
        const [lugaresSnap, geoSnap, dirSnap] = await Promise.all([
          getDocs(collection(db, 'LUGARES_NORM')),
          getDocs(collection(db, 'GEOREFERENCIAS_NORM')),
          getDocs(collection(db, 'DIRECCIONES_NORM'))
        ]);
        
        const geoMap = {};
        geoSnap.forEach(doc => {
          const data = doc.data();
          if (data.lugar_id) {
            geoMap[data.lugar_id] = data;
          }
        });
        
        const dirMap = {};
        dirSnap.forEach(doc => {
          const data = doc.data();
          if (data.lugar_id) {
            dirMap[data.lugar_id] = data;
          }
        });
        
        const joinedRecords = [];
        lugaresSnap.forEach(doc => {
          const lugar = doc.data();
          const docId = doc.id;
          const lugarId = lugar.id;
          
          const geo = geoMap[lugarId] || {};
          const dir = dirMap[lugarId] || {};
          
          const dirPartes = [];
          if (dir.nombre_calle) dirPartes.push(dir.nombre_calle);
          if (dir.numero_calle) dirPartes.push(dir.numero_calle);
          if (dir.ciudad_estado_provincia) dirPartes.push(dir.ciudad_estado_provincia);
          if (dir.pais) dirPartes.push(dir.pais);

          joinedRecords.push({
            id: docId,
            nombre: lugar.nombre,
            timestamp: lugar.timestamp,
            latitud: geo.latitud,
            longitud: geo.longitud,
            direccion: dirPartes.length > 0 ? dirPartes.join(', ') : 'Sin dirección'
          });
        });
        
        joinedRecords.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        setDbRecords(joinedRecords);
      }
    } catch (error) {
      console.error("Error al obtener datos de Firebase:", error);
      setDbError(error.message || 'Error al obtener los datos de la base de datos.');
    } finally {
      setDbLoading(false);
    }
  };

  // Función para descargar los datos de la tabla seleccionada como un archivo TXT limpio (solo nombres, uno por línea)
  const downloadTableAsTxt = () => {
    if (!dbRecords || dbRecords.length === 0) return;
    
    const textContent = dbRecords
      .map(rec => rec.nombre)
      .filter(Boolean)
      .join("\n");
    
    const element = document.createElement("a");
    const file = new Blob([textContent], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = `export_${dbSelectedTable}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };



  // Manejador de archivo
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const content = e.target.result;
      let result;
      if (mode === 'comunas') {
        result = processCommunes(content, communeFormat);
        // Obtener info adicional para comunas
        const enrichedData = await Promise.all(result.data.map(async (item) => {
          const apiData = await fetchCommuneData(item.nombre);
          return { ...item, ...apiData };
        }));
        result.data = enrichedData;
        
        let found = 0;
        let notFound = 0;
        enrichedData.forEach(d => {
           if(d.habitantes !== 'Desconocido' && d.habitantes !== 'Error de API') found++;
           else notFound++;
        });
        result.logs.push(`- Comunas encontradas en API: ${found}`);
        result.logs.push(`- Comunas NO encontradas en API: ${notFound}`);

      } else if (mode === 'famosos') {
        result = processFamous(content);
      } else if (mode === 'lugares') {
        result = processPlaces(content);
      }
      
      setData(result.data);
      setLogs(result.logs);
      setSummary(result.summary);
      setIsProcessing(false);
    };

    reader.readAsText(file);
  };

  // Manejador para búsqueda de una sola comuna
  const handleSingleCommuneSubmit = async (e) => {
    e.preventDefault();
    if (!communeSearch.trim()) return;

    setIsProcessing(true);
    setLogs([]);
    setData(null);

    const original = communeSearch.trim();
    const normalized = normalizeText(original, communeFormat);
    
    const apiData = await fetchCommuneData(normalized);
    
    const singleData = [{
      id: crypto.randomUUID(),
      nombre: normalized,
      original: original,
      timestamp: new Date().toISOString(),
      ...apiData
    }];

    const found = apiData.habitantes !== 'Desconocido' ? 1 : 0;
    const notFound = found === 0 ? 1 : 0;

    setData(singleData);
    setSummary({ total: 1, unique: 1, duplicates: 0 });
    setLogs([
      `LOG ETL BÚSQUEDA INDIVIDUAL - ${new Date().toLocaleString()}`,
      `Línea 1 [MODIFICADO]: "${original}" -> "${normalized}"`,
      `- Comunas encontradas en API: ${found}`,
      `- Comunas NO encontradas en API: ${notFound}`,
    ]);
    setIsProcessing(false);
  };

  // Ver imagen de famoso
  const handleViewFamousImage = async (famous) => {
    setSelectedFamous(famous);
    setFamousImageLoading(true);
    
    // Si ya la tenemos cargada temporalmente, no volver a llamar a la API
    if (famous.imageUrl) {
        setFamousImageLoading(false);
        return;
    }

    const imageData = await fetchFamousImage(famous.nombre);
    
    // Actualizar los datos en memoria con la imagen
    const updatedData = data.map(d => {
      if (d.id === famous.id) {
        return { 
          ...d, 
          imageUrl: imageData?.url || null,
          imageSource: imageData?.source || null,
          imageDate: imageData?.captureDate || null
        };
      }
      return d;
    });
    
    setData(updatedData);
    setSelectedFamous(updatedData.find(d => d.id === famous.id));
    setFamousImageLoading(false);
  };

  // Guardar en Firebase
  const handleSaveToFirebase = async () => {
    if (!data) return;
    
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      if (mode === 'comunas') {
        const communesRef = collection(db, 'COMUNAS_NORM');
        const chunks = [];
        for (let i = 0; i < data.length; i += 500) chunks.push(data.slice(i, i + 500));
        
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            // Usamos el nombre normalizado como ID para hacer UPSERT real y evitar duplicados en DB
            const docId = item.nombre.replace(/\s+/g, '_').toLowerCase();
            const docRef = doc(communesRef, docId);
            batch.set(docRef, item, { merge: true });
          });
          await batch.commit();
        }
      } else if (mode === 'famosos') {
        const famososRef = collection(db, 'FAMOSOS_NORM');
        const chunks = [];
        for (let i = 0; i < data.length; i += 500) chunks.push(data.slice(i, i + 500));
        
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            const docId = item.nombre.replace(/\s+/g, '_').toLowerCase();
            const docRef = doc(famososRef, docId);
            batch.set(docRef, item, { merge: true });
          });
          await batch.commit();
        }
      } else if (mode === 'lugares') {
        const lugaresRef = collection(db, 'LUGARES_NORM');
        const geoRef = collection(db, 'GEOREFERENCIAS_NORM');
        const dirRef = collection(db, 'DIRECCIONES_NORM');
        
        const allDocs = [
          ...data.lugares.map(i => ({ ref: doc(lugaresRef, i.nombre.replace(/\s+/g, '_')), item: i })),
          ...data.georeferencias.map(i => ({ ref: doc(geoRef, i.id), item: i })),
          ...data.direcciones.map(i => ({ ref: doc(dirRef, i.id), item: i }))
        ];
        
        const chunks = [];
        for (let i = 0; i < allDocs.length; i += 500) chunks.push(allDocs.slice(i, i + 500));
        
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((docItem) => {
            batch.set(docItem.ref, docItem.item, { merge: true });
          });
          await batch.commit();
        }
      }
      
      setSaveStatus('success');
    } catch (error) {
      console.error("Error completo:", error);
      setSaveStatus('error');
      alert(`Error de Firebase: ${error.code || 'Desconocido'} - ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const changeMode = (newMode) => {
    setMode(newMode);
    setData(null);
    setLogs([]);
    setSummary(null);
    setSaveStatus(null);
    setSelectedFamous(null);
  }

  return (
    <div className="container fade-in">
      <header className="header">
        <h1>Normalizador ETL</h1>
        <p>Procesamiento inteligente de datos para Firebase</p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button 
            className="btn" 
            style={{ opacity: mode === 'comunas' ? 1 : 0.5, background: mode === 'comunas' ? 'var(--primary)' : 'transparent', border: mode === 'comunas' ? 'none' : '1px solid var(--glass-border)' }}
            onClick={() => changeMode('comunas')}
          >
            Comunas
          </button>
          <button 
            className="btn" 
            style={{ opacity: mode === 'famosos' ? 1 : 0.5, background: mode === 'famosos' ? 'var(--primary)' : 'transparent', border: mode === 'famosos' ? 'none' : '1px solid var(--glass-border)' }}
            onClick={() => changeMode('famosos')}
          >
            Famosos
          </button>
          <button 
            className="btn" 
            style={{ opacity: mode === 'lugares' ? 1 : 0.5, background: mode === 'lugares' ? 'var(--primary)' : 'transparent', border: mode === 'lugares' ? 'none' : '1px solid var(--glass-border)' }}
            onClick={() => changeMode('lugares')}
          >
            Lugares
          </button>
          <button 
            className="btn" 
            style={{ opacity: mode === 'database' ? 1 : 0.5, background: mode === 'database' ? 'var(--primary)' : 'transparent', border: mode === 'database' ? 'none' : '1px solid var(--glass-border)' }}
            onClick={() => changeMode('database')}
          >
            <Database size={16} /> Ver Base de Datos
          </button>
        </div>
      </header>

      <main className="glass-card">
        {/* Controles de Configuración Específicos por Modo */}
        <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {mode === 'comunas' && !isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
              <div>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Formato de Normalización:</label>
                <select 
                  value={communeFormat} 
                  onChange={(e) => setCommuneFormat(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)' }}
                >
                  <option value="UPPERCASE" style={{ background: '#1a1a2e', color: 'white' }}>MAYÚSCULAS</option>
                  <option value="LOWERCASE" style={{ background: '#1a1a2e', color: 'white' }}>minúsculas</option>
                  <option value="TITLE" style={{ background: '#1a1a2e', color: 'white' }}>Formato Título</option>
                </select>
              </div>

              <form onSubmit={handleSingleCommuneSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  list="communes-list"
                  placeholder="O ingresa una sola comuna..." 
                  value={communeSearch}
                  onChange={(e) => setCommuneSearch(e.target.value)}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)' }}
                />
                <datalist id="communes-list">
                  <option value="Concepción" />
                  <option value="Florida" />
                  <option value="La Florida" />
                  <option value="Santiago" />
                  <option value="Valparaíso" />
                  <option value="Viña del Mar" />
                  <option value="Antofagasta" />
                  <option value="Temuco" />
                  <option value="Talcahuano" />
                </datalist>
                <button type="submit" className="btn" style={{ padding: '0.75rem' }}>
                  <Search size={20} />
                </button>
              </form>
              {!data && <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>--- Ó ---</div>}
            </div>
          )}
          
          {!data && !isProcessing && mode !== 'database' && (
            <div 
              className="upload-zone"
              onClick={() => fileInputRef.current.click()}
              style={{ width: '100%' }}
            >
              <Upload className="upload-icon" />
              <h2>Cargar Archivo de Datos (.txt)</h2>
              <p>Selecciona el archivo para comenzar la normalización masiva</p>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                accept=".txt"
              />
            </div>
          )}
        </div>

        {isProcessing && (
          <div className="upload-zone">
            <Loader2 className="upload-icon animate-spin" />
            <h2>Procesando y Consultando APIs...</h2>
            <p>Por favor espera, estamos enriqueciendo los datos.</p>
          </div>
        )}

        {data && (
          <div className="fade-in">
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Leídos</span>
                <span className="stat-value">{summary.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Normalizados Únicos</span>
                <span className="stat-value" style={{ color: 'var(--accent)' }}>
                  {summary.unique}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Duplicados Eliminados</span>
                <span className="stat-value" style={{ color: 'var(--danger)' }}>
                  {summary.duplicates}
                </span>
              </div>
            </div>

            {/* VISTA ESPECÍFICA FAMOSOS */}
            {mode === 'famosos' && data && Array.isArray(data) && (
              <div style={{ marginTop: '2rem' }}>
                <h3>Lista de Famosos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                  {data.slice(0, 50).map(famous => (
                    <div key={famous.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                      <span>{famous.nombre}, {famous.edad} años</span>
                      <button 
                        className="btn" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                        onClick={() => handleViewFamousImage(famous)}
                      >
                        <ImageIcon size={16} style={{ marginRight: '0.5rem' }} /> Ver imagen
                      </button>
                    </div>
                  ))}
                  {data.length > 50 && <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>...y {data.length - 50} más</p>}
                </div>
              </div>
            )}

            {/* DETALLE FAMOSO */}
            {selectedFamous && (
              <div className="fade-in glass-card" style={{ marginTop: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.05)' }}>
                <h3>{selectedFamous.nombre}</h3>
                {famousImageLoading ? (
                  <div style={{ padding: '2rem' }}><Loader2 className="animate-spin" size={32} /></div>
                ) : selectedFamous.imageUrl ? (
                  <div>
                    <img 
                      src={selectedFamous.imageUrl} 
                      alt={selectedFamous.nombre} 
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', objectFit: 'contain' }} 
                    />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Fuente: {selectedFamous.imageSource} | Fecha captura: {selectedFamous.imageDate}
                    </p>
                  </div>
                ) : (
                  <p style={{ color: 'var(--danger)' }}>No se encontró imagen en la API.</p>
                )}
              </div>
            )}

            {/* VISTA ESPECÍFICA LUGARES (MAPA) */}
            {mode === 'lugares' && data.georeferencias && (
               <MapComponent 
                 georeferencias={data.georeferencias} 
                 lugares={data.lugares} 
                 direcciones={data.direcciones} 
               />
            )}

            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn"
                onClick={handleSaveToFirebase}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Database />}
                {isSaving ? 'Guardando/Actualizando...' : 'Guardar en Firebase (Upsert)'}
              </button>
              
              <button 
                className="btn" 
                style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}
                onClick={() => {
                  const element = document.createElement("a");
                  const file = new Blob([logs.join('\\n')], {type: 'text/plain'});
                  element.href = URL.createObjectURL(file);
                  element.download = "registro_cambios_etl.txt";
                  document.body.appendChild(element);
                  element.click();
                }}
              >
                <FileText /> Descargar Log (.txt)
              </button>

              <button 
                className="btn" 
                style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}
                onClick={() => changeMode(mode)}
              >
                Limpiar / Subir otro
              </button>
            </div>

            {saveStatus === 'success' && (
              <div className="fade-in" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <CheckCircle size={20} />
                ¡Datos sincronizados y actualizados con éxito!
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="fade-in" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <AlertCircle size={20} /> Error de red o permisos en Firebase.
              </div>
            )}

            <div style={{ marginTop: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <FileText size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '1.25rem' }}>Registro de Auditoría (Log)</h3>
              </div>
              <div className="log-container">
                {logs.map((log, i) => (
                  <div key={i} className={`log-entry ${log.includes('Línea') || log.includes('- ') ? 'info' : 'header'}`}>
                    {log.startsWith('Línea') ? '> ' : (log.startsWith('- ') ? '  ' : '# ')}
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === 'database' && (
          <div className="fade-in" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  className={`db-select-btn ${dbSelectedTable === 'comunas' ? 'active' : ''}`}
                  onClick={() => setDbSelectedTable('comunas')}
                >
                  Comunas (COMUNAS_NORM)
                </button>
                <button 
                  className={`db-select-btn ${dbSelectedTable === 'famosos' ? 'active' : ''}`}
                  onClick={() => setDbSelectedTable('famosos')}
                >
                  Famosos (FAMOSOS_NORM)
                </button>
                <button 
                  className={`db-select-btn ${dbSelectedTable === 'lugares' ? 'active' : ''}`}
                  onClick={() => setDbSelectedTable('lugares')}
                >
                  Lugares (LUGARES_NORM)
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn" 
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }}
                  onClick={() => fetchDatabaseRecords(dbSelectedTable)}
                  disabled={dbLoading}
                >
                  <RefreshCw className={dbLoading ? 'animate-spin' : ''} size={16} /> Refrescar
                </button>

                <button 
                  className="btn" 
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }}
                  onClick={downloadTableAsTxt}
                  disabled={dbLoading || dbRecords.length === 0}
                >
                  <FileText size={16} /> Descargar como TXT
                </button>
              </div>
            </div>

            {dbLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem' }}>
                <Loader2 className="animate-spin" size={36} color="var(--primary)" />
                <p style={{ color: 'var(--text-muted)' }}>Cargando registros desde Firestore...</p>
              </div>
            )}

            {dbError && (
              <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <AlertCircle size={20} /> Error: {dbError}
              </div>
            )}

            {!dbLoading && !dbError && dbRecords.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '2px dashed var(--glass-border)', borderRadius: '16px' }}>
                <Database size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }} />
                <h3>No hay registros guardados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Procesa algún archivo e insértalo a Firebase para visualizarlo aquí.
                </p>
              </div>
            )}

            {!dbLoading && !dbError && dbRecords.length > 0 && (
              <div className="table-wrapper">
                {dbSelectedTable === 'comunas' && (
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>Nombre Normalizado</th>
                        <th>Original</th>
                        <th>Región</th>
                        <th>Habitantes</th>
                        <th>Fecha de Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{rec.nombre}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{rec.original}</td>
                          <td>{rec.region || 'Desconocida'}</td>
                          <td>{rec.habitantes || 'Desconocido'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {rec.timestamp ? new Date(rec.timestamp).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {dbSelectedTable === 'famosos' && (
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Fecha Nac.</th>
                        <th>Edad Aprox.</th>
                        <th>¿Cumpleaños hoy?</th>
                        <th>Original</th>
                        <th>Fecha de Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{rec.nombre}</td>
                          <td>{rec.fecha_nacimiento || 'N/A'}</td>
                          <td>{rec.edad !== null && rec.edad !== undefined ? `${rec.edad} años` : 'Desconocida'}</td>
                          <td>
                            {rec.cumpleanos_hoy ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                Sí 🎉
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{rec.original}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {rec.timestamp ? new Date(rec.timestamp).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {dbSelectedTable === 'lugares' && (
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>Nombre del Lugar</th>
                        <th>Dirección Mapeada</th>
                        <th>Latitud</th>
                        <th>Longitud</th>
                        <th>Fecha de Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{rec.nombre}</td>
                          <td style={{ maxWidth: '300px', whiteSpace: 'normal', wordWrap: 'break-word' }}>{rec.direccion}</td>
                          <td style={{ fontFamily: 'monospace' }}>{rec.latitud || 'N/A'}</td>
                          <td style={{ fontFamily: 'monospace' }}>{rec.longitud || 'N/A'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {rec.timestamp ? new Date(rec.timestamp).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
