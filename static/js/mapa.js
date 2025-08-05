// === Crear el mapa y fondo base ===
var map = L.map('map').setView([14.75, -86.2], 8);

// Capas base
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
});
var esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});
osm.addTo(map);

// Control de capas base
L.control.layers({ "Callejero": osm, "Satélite": esriSat }, null, { position: 'bottomleft' }).addTo(map);

// Mostrar/ocultar dashboard
document.getElementById("dashboard-toggle").addEventListener("click", () => {
  document.getElementById("dashboard").classList.toggle("hidden");
});

// === Carga dinámica desde PostGIS vía Flask ===
let capaPostgis;

fetch('/layers')
  .then(res => res.json())
  .then(layerNames => {
    const select = document.getElementById('layerSelect');
    layerNames.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });

document.getElementById('layerSelect').addEventListener('change', function () {
  const layerName = this.value;
  if (capaPostgis) map.removeLayer(capaPostgis);

  fetch(`/layer_data?name=${layerName}`)
    .then(res => res.json())
    .then(geojson => {
      capaPostgis = L.geoJSON(geojson, {
        style: { color: '#2c3e50', weight: 1 },
        onEachFeature: (feature, layer) => {
          let popupContent = "";
          for (let key in feature.properties) {
            popupContent += `<b>${key}:</b> ${feature.properties[key]}<br>`;
          }
          layer.bindPopup(popupContent);
        }
      }).addTo(map);
      map.fitBounds(capaPostgis.getBounds());

      // === Dashboard: Procesamiento ===
      const counts = { h: 0, n: 0, l: 0 };
      const satelites = {};
      let frpSum = 0;
      const total = geojson.features.length;

      geojson.features.forEach(f => {
        const c = (f.properties.confidence || '').toLowerCase();
        if (counts[c] !== undefined) counts[c]++;
        const sat = f.properties.satellite || "Desconocido";
        satelites[sat] = (satelites[sat] || 0) + 1;
        frpSum += f.properties.frp || 0;
      });

      const frpAvg = parseFloat((frpSum / total).toFixed(1));
      document.getElementById("total-incendios").textContent = total;
      document.getElementById("alta").textContent = counts.h;
      document.getElementById("nominal").textContent = counts.n;
      document.getElementById("baja").textContent = counts.l;
      document.getElementById("frp-total").textContent = Math.round(frpSum);
      document.getElementById("frp-prom").textContent = frpAvg;

      new Chart(document.getElementById("confChart"), {
        type: 'bar',
        data: {
          labels: ['Alta (h)', 'Nominal (n)', 'Baja (l)'],
          datasets: [{
            label: 'Cantidad por Confianza',
            data: [counts.h, counts.n, counts.l],
            backgroundColor: ['#e74c3c', '#f39c12', '#f1c40f']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            datalabels: {
              anchor: 'end',
              align: 'top',
              formatter: (value, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                return `${((value / total) * 100).toFixed(1)}%`;
              },
              color: '#333',
              font: { weight: 'bold' }
            },
            legend: { display: false },
            title: {
              display: true,
              text: 'Distribución por Confianza',
              padding: { top: 10, bottom: 30 }
            }
          },
          scales: { y: { beginAtZero: true } }
        },
        plugins: [ChartDataLabels]
      });

      new Chart(document.getElementById("satChart"), {
        type: 'pie',
        data: {
          labels: Object.keys(satelites),
          datasets: [{
            label: 'Detecciones por Satélite',
            data: Object.values(satelites),
            backgroundColor: [
              '#3498db', '#9b59b6', '#2ecc71', '#34495e',
              '#e67e22', '#1abc9c', '#d35400'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            datalabels: {
              formatter: (value, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                return `${((value / total) * 100).toFixed(1)}%`;
              },
              color: '#fff',
              font: { weight: 'bold' }
            },
            legend: { position: 'bottom' },
            title: {
              display: true,
              text: 'Incendios por Satélite',
              padding: { top: 10, bottom: 10 }
            }
          }
        },
        plugins: [ChartDataLabels]
      });
    });
});

  // map.fitBounds(layer.getBounds());  // Zoom automático basado en los datos (desactivado)

