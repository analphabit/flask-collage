"""
Image Collage Tool — Flask backend
Serves the single-page collage editor.
"""
import os
from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    use_cdn = os.environ.get('USE_CDN', 'false').lower() == 'true'
    return render_template('index.html', use_cdn=use_cdn)

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    host  = os.environ.get('FLASK_HOST', '127.0.0.1')
    port  = int(os.environ.get('FLASK_PORT', '5004'))
    app.run(debug=debug, host=host, port=port)
