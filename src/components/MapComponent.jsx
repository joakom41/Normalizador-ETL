import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Arreglo para el icono por defecto de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MapComponent = ({ georeferencias, lugares, direcciones }) => {
  // Centro por defecto (ej: Centro de Chile o Mundo)
  const defaultCenter = [0, 0];
  const defaultZoom = 2;

  return (
    <div style={{ height: '400px', width: '100%', marginTop: '2rem', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {georeferencias && georeferencias.map((geo) => {
          const lat = parseFloat(geo.latitud);
          const lng = parseFloat(geo.longitud);
          
          if (isNaN(lat) || isNaN(lng)) return null;

          const lugar = lugares.find(l => l.id === geo.lugar_id);
          const direccion = direcciones.find(d => d.lugar_id === geo.lugar_id);

          return (
            <Marker key={geo.id} position={[lat, lng]}>
              <Popup>
                <div style={{ color: 'black' }}>
                  <h3 style={{ margin: '0 0 5px 0' }}>{lugar ? lugar.nombre : 'Lugar desconocido'}</h3>
                  {direccion && (
                    <p style={{ margin: 0, fontSize: '12px' }}>
                      {direccion.nombre_calle} {direccion.numero_calle}, {direccion.ciudad_estado_provincia}, {direccion.pais}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
