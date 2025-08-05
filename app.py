from flask import Flask, render_template, jsonify, request
import psycopg2
import json
import re

app = Flask(__name__)

# Conexión a PostGIS
def get_conn():
    return psycopg2.connect(
        host="localhost",
        dbname="geoinfo",
        user="postgres",
        password="cthulhu",
        port="5432"
    )

# Página principal
@app.route("/")
def index():
    return render_template("FIRMS_Honduras.html")

# === Ruta para obtener lista de capas geométricas ===
@app.route('/layers')
def get_layers():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT f_table_name FROM geometry_columns ORDER BY f_table_name;")
        tablas = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify(tablas)
    except Exception as e:
        print("Error obteniendo capas:", e)
        return jsonify({"error": "Error al obtener lista de capas"}), 500

# === Ruta para devolver datos GeoJSON de la capa seleccionada ===
@app.route('/layer_data')
def get_layer_data():
    layer = request.args.get('name')
    if not layer:
        return jsonify({"error": "Missing layer name"}), 400

    if not re.match(r'^[a-zA-Z0-9_]+$', layer):
        return jsonify({"error": "Invalid layer name"}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        sql = f"""
        SELECT row_to_json(fc)
        FROM (
          SELECT 'FeatureCollection' AS type,
                 array_to_json(array_agg(f)) AS features
          FROM (
            SELECT 'Feature' AS type,
                   ST_AsGeoJSON(t.geom)::json AS geometry,
                   (row_to_json(t.*)::jsonb - 'geom') AS properties
            FROM {layer} AS t
            WHERE t.geom IS NOT NULL AND ST_IsValid(t.geom)
          ) AS f
        ) AS fc;
        """
        cur.execute(sql)
        result = cur.fetchone()[0]
    except Exception as e:
        print("Error:", e)
        return jsonify({"error": "Error al obtener capa"}), 500
    finally:
        cur.close()
        conn.close()

    return jsonify(result)

# === Ejecutar servidor Flask ===
if __name__ == '__main__':
    app.run(debug=True)
