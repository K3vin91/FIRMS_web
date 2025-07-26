// mapa.js

// Crear el mapa y fondo base
var map = L.map('map').setView([14.75, -86.2], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Cargar el GeoJSON
fetch('FIRMS_HN.geojson')
  .then(response => response.json())
  .then(data => {
    var layer = L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        let confidence = feature.properties.confidence.toLowerCase();
        let color = confidence === "h" ? "red" :
                    confidence === "n" ? "orange" :
                    confidence === "l" ? "yellow" :
                    "gray";

        let frp = feature.properties.frp || 0;
        let radius = Math.sqrt(frp) * 2;
        radius = radius < 4 ? 4 : radius > 20 ? 20 : radius;

        return L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          color: "#000",
          weight: 0.5,
          opacity: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: function (feature, layer) {
        let props = feature.properties;
        layer.bindPopup(
          `<b>Fecha:</b> ${props.acq_date}<br>
           <b>Hora:</b> ${props.acq_time}<br>
           <b>Satélite:</b> ${props.satellite}<br>
           <b>Confianza:</b> ${props.confidence}<br>
           <b>FRP:</b> ${props.frp}`
        );
      }
    }).addTo(map);

    // Leyenda
    var legend = L.control({ position: "bottomright" });

    legend.onAdd = function () {
      var div = L.DomUtil.create("div", "info legend");
      var grades = [
        { label: "Alta (h)", color: "red" },
        { label: "Nominal (n)", color: "orange" },
        { label: "Baja (l)", color: "yellow" }
      ];

      div.innerHTML += "<h4>Confianza</h4>";
      grades.forEach(function (g) {
        div.innerHTML +=
          '<i style="background:' + g.color + ';"></i>' +
          g.label + "<br>";
      });

      return div;
    };

    legend.addTo(map);
  });

  // map.fitBounds(layer.getBounds());  // Zoom automático basado en los datos (desactivado)

