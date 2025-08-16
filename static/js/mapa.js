document.addEventListener("DOMContentLoaded", () => {

  // === Registrar EPSG:32616 ===
  proj4.defs("EPSG:32616","+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs");
  ol.proj.proj4.register(proj4);

  // === Crear mapa OpenLayers ===
  const map = new ol.Map({
    target: 'map',
    layers: [
      new ol.layer.Tile({ source: new ol.source.OSM() })
    ],
    view: new ol.View({
      center: ol.proj.fromLonLat([-86.2, 14.75]),
      zoom: 8
    }),
    controls: [] // sin controles para evitar error
  });

  // Variables globales
  let vectorLayerFirms = null;      // capa de puntos FIRMS
  let vectorLayerSelector = null;    // capa del selector
  let chartConf = null;
  let chartSat = null;

  // === FRP: color y radio ===
  function frpColor(frp) {
    const maxFrp = 100;
    const ratio = Math.min(frp / maxFrp, 1);
    return `rgb(255,${Math.round(255*(1-ratio))},0)`;
  }

  function frpRadius(frp) {
    const minRadius = 4;
    const maxRadius = 15;
    return minRadius + (Math.min(frp, 100)/100)*(maxRadius-minRadius);
  }

  // === Mostrar/ocultar dashboard ===
  document.getElementById("dashboard-toggle").addEventListener("click", () => {
    document.getElementById("dashboard").classList.toggle("hidden");
  });

  // === Cargar lista de capas WFS desde GeoServer (sin firms_hotspots) ===
  fetch("/geoserver/ne/ows?service=WFS&version=1.1.0&request=GetCapabilities")
  .then(res => res.text())
  .then(str => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(str, "text/xml");
    const layers = Array.from(xml.getElementsByTagName("FeatureType"))
      .map(ft => ft.getElementsByTagName("Name")[0].textContent)
      .filter(name => name !== "ne:firms_hotspots"); // excluir firms_hotspots

    const select = document.getElementById('layerSelect');
    layers.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });

  // === Mostrar mensaje ===
  function mostrarMensaje(texto, duracion=4000) {
    const cont = document.getElementById('mensaje');
    cont.textContent = texto;
    cont.style.display = 'block';
    setTimeout(()=>{ cont.style.display='none'; }, duracion);
  }

  // === Cargar datos FIRMS ===
  function cargarFirms(fecha) {
    if (!fecha) return;
    if (vectorLayerFirms) { map.removeLayer(vectorLayerFirms); vectorLayerFirms = null; }

    const wfsUrl = `/geoserver/ne/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=firms_hotspots&outputFormat=application/json&CQL_FILTER=acq_date='${fecha}'`;

    fetch(wfsUrl)
    .then(res => res.json())
    .then(geojson => {
      if (!geojson.features || geojson.features.length === 0) {
        mostrarMensaje(`No hay datos para ${fecha}`);
        limpiarDashboard();
        return;
      }

      vectorLayerFirms = new ol.layer.Vector({
        source: new ol.source.Vector({
          features: geojson.features.map(f => {
            const coords = [f.properties.longitude, f.properties.latitude];
            return new ol.Feature({
              geometry: new ol.geom.Point(ol.proj.fromLonLat(coords)),
              ...f.properties
            });
          })
        }),
        style: f => {
          const frp = f.get('frp') || 10;
          return new ol.style.Style({
            image: new ol.style.Circle({
              radius: frpRadius(frp),
              fill: new ol.style.Fill({ color: frpColor(frp) }),
              stroke: new ol.style.Stroke({ color: '#444', width: 1 })
            })
          });
        }
      });

      map.addLayer(vectorLayerFirms);
      actualizarDashboard(geojson);
    })
    .catch(e => {
      mostrarMensaje("Error al cargar datos");
      limpiarDashboard();
      console.error(e);
    });
  }

  // === Cargar capa seleccionada del selector (polígonos, líneas, puntos) ===
  function cargarSelector(layerName) {
    if (!layerName) return;
    if (vectorLayerSelector) { map.removeLayer(vectorLayerSelector); vectorLayerSelector = null; }

    const wfsUrl = `/geoserver/ne/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=${layerName}&outputFormat=application/json`;

    fetch(wfsUrl)
    .then(res => res.json())
    .then(geojson => {
      if (!geojson.features || geojson.features.length === 0) {
        mostrarMensaje(`No hay datos para la capa ${layerName}`);
        return;
      }

      vectorLayerSelector = new ol.layer.Vector({
        source: new ol.source.Vector({
          features: geojson.features.map(f => {
            const geom = f.geometry;
            let featureGeom;

            switch(geom.type){
              case "Point":
                featureGeom = new ol.geom.Point(ol.proj.transform(geom.coordinates, 'EPSG:32616', 'EPSG:3857'));
                break;
              case "MultiPoint":
                featureGeom = new ol.geom.MultiPoint(geom.coordinates.map(c => ol.proj.transform(c, 'EPSG:32616', 'EPSG:3857')));
                break;
              case "LineString":
                featureGeom = new ol.geom.LineString(geom.coordinates.map(c => ol.proj.transform(c, 'EPSG:32616', 'EPSG:3857')));
                break;
              case "MultiLineString":
                featureGeom = new ol.geom.MultiLineString(geom.coordinates.map(line => line.map(c => ol.proj.transform(c, 'EPSG:32616', 'EPSG:3857'))));
                break;
              case "Polygon":
                featureGeom = new ol.geom.Polygon(geom.coordinates.map(ring => ring.map(c => ol.proj.transform(c, 'EPSG:32616', 'EPSG:3857'))));
                break;
              case "MultiPolygon":
                featureGeom = new ol.geom.MultiPolygon(geom.coordinates.map(poly => poly.map(ring => ring.map(c => ol.proj.transform(c, 'EPSG:32616', 'EPSG:3857')))));
                break;
            }

            return new ol.Feature({
              geometry: featureGeom,
              ...f.properties
            });
          })
        }),
        style: new ol.style.Style({
          fill: new ol.style.Fill({ color: 'rgba(52,152,219,0.4)' }),
          stroke: new ol.style.Stroke({ color: '#2980b9', width: 2 }),
          image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({color:'#3498db'}) })
        })
      });

      map.addLayer(vectorLayerSelector);
    })
    .catch(e => {
      mostrarMensaje("Error al cargar la capa del selector");
      console.error(e);
    });
  }

  // === Limpiar dashboard ===
  function limpiarDashboard() {
    ['total-incendios','alta','nominal','baja','frp-total','frp-prom'].forEach(id => document.getElementById(id).textContent=0);
    document.getElementById('por-satelite').innerHTML='';
    if(chartConf){ chartConf.destroy(); chartConf=null; }
    if(chartSat){ chartSat.destroy(); chartSat=null; }
  }

  // === Actualizar dashboard ===
  function actualizarDashboard(geojson){
    const counts = {h:0,n:0,l:0};
    const satelites = {};
    let frpSum = 0;
    const total = geojson.features.length;

    geojson.features.forEach(f => {
      const c = (f.properties.confidence||'').toLowerCase();
      if(counts[c]!==undefined) counts[c]++;
      const sat = f.properties.satellite||"Desconocido";
      satelites[sat] = (satelites[sat]||0)+1;
      frpSum += f.properties.frp||0;
    });

    const frpAvg = parseFloat((frpSum/total).toFixed(1));
    document.getElementById("total-incendios").textContent=total;
    document.getElementById("alta").textContent=counts.h;
    document.getElementById("nominal").textContent=counts.n;
    document.getElementById("baja").textContent=counts.l;
    document.getElementById("frp-total").textContent=Math.round(frpSum);
    document.getElementById("frp-prom").textContent=frpAvg;

    const ulSat = document.getElementById("por-satelite");
    ulSat.innerHTML="";
    Object.entries(satelites).forEach(([sat,val])=>{
      const li=document.createElement("li");
      li.textContent=`${sat}: ${val}`;
      ulSat.appendChild(li);
    });

    if(chartConf) chartConf.destroy();
    if(chartSat) chartSat.destroy();

    chartConf = new Chart(document.getElementById("confChart"),{
      type:'bar',
      data:{
        labels:['Alta (h)','Nominal (n)','Baja (l)'],
        datasets:[{label:'Cantidad por Confianza',data:[counts.h,counts.n,counts.l],backgroundColor:['#e74c3c','#f39c12','#f1c40f']}]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          datalabels:{anchor:'end',align:'top',color:'#ddd',font:{weight:'bold'},formatter:(v,c)=>{const total=c.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);return `${((v/total)*100).toFixed(1)}%`}} ,
          legend:{display:false}, title:{display:true,text:'Distribución por Confianza',padding:{top:10,bottom:30}}
        }
      },
      plugins:[ChartDataLabels]
    });

    chartSat = new Chart(document.getElementById("satChart"),{
      type:'pie',
      data:{labels:Object.keys(satelites), datasets:[{data:Object.values(satelites), backgroundColor:['#3498db','#9b59b6','#2ecc71','#34495e','#e67e22','#1abc9c','#d35400']}]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          datalabels:{formatter:(v,c)=>{const total=c.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return `${((v/total)*100).toFixed(1)}%`}, color:'#fff', font:{weight:'bold'}} ,
          legend:{position:'bottom'}, title:{display:true,text:'Incendios por Satélite',padding:{top:10,bottom:10}}
        }
      },
      plugins:[ChartDataLabels]
    });
  }

  // === Botón cargar datos FIRMS ===
  document.getElementById('cargarBtn').addEventListener('click', ()=>{
    const fecha=document.getElementById('fechaInput').value;
    if(!fecha){ mostrarMensaje("Selecciona una fecha primero"); return; }
    cargarFirms(fecha);
  });

  // === Cambio selector de capas (carga automática) ===
  document.getElementById('layerSelect').addEventListener('change', (e)=>{
    const layerName = e.target.value;
    if(layerName) cargarSelector(layerName);
  });

});
