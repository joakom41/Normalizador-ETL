import { fetchFamousImage } from './src/utils/api.js';

async function runTests() {
  console.log("Probando la API de Famosos (Wikipedia)...");
  
  const testNames = ["Madonna", "Pelé", "Julio César"];
  
  for (const name of testNames) {
    const data = await fetchFamousImage(name);
    console.log(`\nFamoso: ${name}`);
    if (data) {
      console.log(`✅ Imagen encontrada: ${data.url}`);
      console.log(`✅ Fuente: ${data.source}`);
    } else {
      console.log(`❌ No se encontró imagen.`);
    }
  }
}

runTests();
