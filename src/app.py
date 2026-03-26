"""
Image Collage Tool — Flask backend
Serves the single-page collage editor.
"""
import csv
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

_LOG_DIR   = os.path.join(os.path.dirname(__file__), '..', 'log')
_USAGE_LOG = os.path.join(_LOG_DIR, 'usage.csv')
_CSV_COLS  = ['timestamp', 'format', 'layout', 'resolution', 'images_loaded', 'image_names']

def _read_version():
    """Read VERSION from flask.ini (one directory above src/)."""
    ini_path = os.path.join(os.path.dirname(__file__), '..', 'flask.ini')
    try:
        with open(ini_path) as f:
            for line in f:
                if line.startswith('VERSION'):
                    return line.split('=', 1)[1].strip()
    except OSError:
        pass
    return '?'

@app.route('/api/log-export', methods=['POST'])
def log_export():
    data = request.get_json(silent=True) or {}
    row = {
        'timestamp':    datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'format':       data.get('format', ''),
        'layout':       data.get('layout', ''),
        'resolution':   data.get('resolution', ''),
        'images_loaded': data.get('images_loaded', ''),
        'image_names':  '; '.join(data.get('image_names', [])),
    }
    os.makedirs(_LOG_DIR, exist_ok=True)
    write_header = not os.path.exists(_USAGE_LOG) or os.path.getsize(_USAGE_LOG) == 0
    with open(_USAGE_LOG, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_COLS)
        if write_header:
            writer.writeheader()
        writer.writerow(row)
    return jsonify({'ok': True})


@app.route('/')
def index():
    use_cdn = os.environ.get('USE_CDN', 'false').lower() == 'true'
    return render_template('index.html', use_cdn=use_cdn, version=_read_version())

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    host  = os.environ.get('FLASK_HOST', '127.0.0.1')
    port  = int(os.environ.get('FLASK_PORT', '5004'))
    app.run(debug=debug, host=host, port=port)
