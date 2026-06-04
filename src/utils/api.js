/**
 * Módulo para interactuar con APIs externas.
 */

// Función para obtener datos de una comuna (Región y Población aproximada)
// Usaremos la API de Wikipedia como fuente pública y confiable.
export const fetchCommuneData = async (communeName) => {
  try {
    const query = encodeURIComponent(communeName + " (Chile)");
    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts|info&exintro=1&explaintext=1&titles=${query}&format=json&origin=*`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    
    if (pageId === "-1") {
      // Intentar sin "(Chile)"
      const retryUrl = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts|info&exintro=1&explaintext=1&titles=${encodeURIComponent(communeName)}&format=json&origin=*`;
      const retryResponse = await fetch(retryUrl);
      const retryData = await retryResponse.json();
      const retryPages = retryData.query.pages;
      const retryPageId = Object.keys(retryPages)[0];
      
      if (retryPageId === "-1") {
        return { region: "No encontrada", habitantes: "No encontrado" };
      }
      return extractCommuneDataFromText(retryPages[retryPageId].extract);
    }
    
    return extractCommuneDataFromText(pages[pageId].extract);
  } catch (error) {
    console.error("Error fetching commune data:", error);
    return { region: "Error de API", habitantes: "Error de API" };
  }
};

// Extractor heurístico de la descripción de Wikipedia
const extractCommuneDataFromText = (text) => {
  if (!text) return { region: "Desconocida", habitantes: "Desconocido" };
  
  let region = "Desconocida";
  let habitantes = "Desconocido";
  
  // Buscar región
  const regionMatch = text.match(/región (?:de|del)?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)(?=[,\.])/i);
  if (regionMatch) {
    region = regionMatch[1].trim();
  }
  
  // Buscar habitantes
  const popMatch = text.match(/población.*?(\d{1,3}(?:\.\d{3})*|\d+)\s*habitantes/i);
  if (popMatch) {
    habitantes = popMatch[1];
  }
  
  return { region, habitantes };
};

// Función para obtener la imagen de un famoso desde Wikipedia
export const fetchFamousImage = async (famousName) => {
  try {
    const query = encodeURIComponent(famousName);
    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=pageimages|imageinfo&pithumbsize=500&titles=${query}&iiprop=url|extmetadata&format=json&origin=*`;
    
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    
    if (pageId === "-1" || !pages[pageId].thumbnail) {
      // Intentar en inglés si no se encuentra en español
      const urlEn = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|imageinfo&pithumbsize=500&titles=${query}&iiprop=url|extmetadata&format=json&origin=*`;
      const responseEn = await fetch(urlEn);
      const dataEn = await responseEn.json();
      const pagesEn = dataEn.query.pages;
      const pageIdEn = Object.keys(pagesEn)[0];
      
      if (pageIdEn === "-1" || !pagesEn[pageIdEn].thumbnail) {
        return null;
      }
      return {
        url: pagesEn[pageIdEn].thumbnail.source,
        source: "Wikipedia (EN)",
        captureDate: "Desconocida"
      };
    }
    
    return {
      url: pages[pageId].thumbnail.source,
      source: "Wikipedia (ES)",
      captureDate: "Desconocida" // Extmetadata a veces requiere otra consulta compleja para licencias, simplificamos
    };
  } catch (error) {
    console.error("Error fetching famous image:", error);
    return null;
  }
};
