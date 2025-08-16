from flask import Flask, render_template

app = Flask(__name__)

# --- Página principal ---
@app.route("/")
def index():
    return render_template("FIRMS_Honduras.html")

if __name__ == '__main__':
    app.run(debug=True)
