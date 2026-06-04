/**
 * CONFIGURACIÓN DE BASE DE DATOS (FIREBASE)
 * Este archivo establece la conexión con el motor de base de datos
 * Firestore, cumpliendo con la regla de utilizar un motor de BD de preferencia.
 */
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDsw7Aw1BUIZolUWOUwYnFvxvwGjjgnkiU",
  authDomain: "etl-comunas-norm-12345.firebaseapp.com",
  projectId: "etl-comunas-norm-12345",
  storageBucket: "etl-comunas-norm-12345.firebasestorage.app",
  messagingSenderId: "775459339735",
  appId: "1:775459339735:web:a2d513107c09529ce9df92"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
