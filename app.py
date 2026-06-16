from flask import Flask, jsonify, render_template, request
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import hashlib
import time
from datetime import datetime

app = Flask(__name__)

# Constants
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_EXPIRY_SECONDS = 300  # 5 minutes cache

# Global cache
cache = {
    "data": None,
    "last_fetched": 0
}

def generate_id(date_str, type_str, content_str):
    """Generates a stable unique ID for an update based on its content."""
    hash_input = f"{date_str}-{type_str}-{content_str}"
    return hashlib.md5(hash_input.encode('utf-8')).hexdigest()

def extract_plain_text(html_content):
    """Converts HTML content into plain text for search and sharing."""
    soup = BeautifulSoup(html_content, 'html.parser')
    # Replace links with text + URL for better reading in plain text if applicable
    for a in soup.find_all('a'):
        href = a.get('href', '')
        if href and not href.startswith('#'):
            a.replace_with(f"{a.get_text()} ({href})")
    return soup.get_text().strip()

def fetch_and_parse_feed():
    """Fetches the XML Atom feed and parses it into structured update dictionary items."""
    try:
        response = requests.get(FEED_URL, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching feed: {e}")
        return None, str(e)

    try:
        root = ET.fromstring(response.content)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        updates = []
        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            date_str = title_el.text if title_el is not None else "Unknown Date"
            
            updated_el = entry.find('atom:updated', ns)
            raw_date = updated_el.text if updated_el is not None else ""
            
            # Extract alternate link
            link_el = entry.find('atom:link[@rel="alternate"]', ns)
            if link_el is None:
                link_el = entry.find('atom:link', ns)
            href = link_el.attrib.get('href') if link_el is not None else ""
            
            content_el = entry.find('atom:content', ns)
            content_html = content_el.text if content_el is not None else ""
            
            # Split the content by h3 tags
            soup = BeautifulSoup(content_html, 'html.parser')
            
            current_type = None
            current_content_parts = []
            
            for child in soup.contents:
                # If it's a header, we start a new sub-update
                if getattr(child, 'name', None) == 'h3':
                    if current_type and current_content_parts:
                        html_slice = "".join(str(c) for c in current_content_parts).strip()
                        plain_text = extract_plain_text(html_slice)
                        updates.append({
                            'id': generate_id(date_str, current_type, html_slice),
                            'date': date_str,
                            'raw_date': raw_date,
                            'type': current_type,
                            'content': html_slice,
                            'plain_text': plain_text,
                            'link': href
                        })
                    current_type = child.get_text().strip()
                    current_content_parts = []
                else:
                    current_content_parts.append(child)
            
            # Add the trailing update
            if current_type and current_content_parts:
                html_slice = "".join(str(c) for c in current_content_parts).strip()
                plain_text = extract_plain_text(html_slice)
                updates.append({
                    'id': generate_id(date_str, current_type, html_slice),
                    'date': date_str,
                    'raw_date': raw_date,
                    'type': current_type,
                    'content': html_slice,
                    'plain_text': plain_text,
                    'link': href
                })
                
            # Fallback if no <h3> tags were present in the content
            if not current_type and content_html.strip():
                plain_text = extract_plain_text(content_html)
                updates.append({
                    'id': generate_id(date_str, 'Update', content_html),
                    'date': date_str,
                    'raw_date': raw_date,
                    'type': 'Update',
                    'content': content_html.strip(),
                    'plain_text': plain_text,
                    'link': href
                })
                
        return updates, None
    except Exception as e:
        print(f"Error parsing feed: {e}")
        return None, str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/updates')
def get_updates():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    # Return from cache if valid and no forced refresh
    if not force_refresh and cache["data"] is not None and (current_time - cache["last_fetched"] < CACHE_EXPIRY_SECONDS):
        return jsonify({
            "status": "success",
            "from_cache": True,
            "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
            "updates": cache["data"]
        })
        
    # Fetch fresh data
    updates, error = fetch_and_parse_feed()
    if error:
        # If fetch fails but we have cached data, return the stale cache with warning
        if cache["data"] is not None:
            return jsonify({
                "status": "partial_success",
                "warning": f"Could not refresh: {error}. Serving cached data.",
                "last_fetched": datetime.fromtimestamp(cache["last_fetched"]).isoformat(),
                "updates": cache["data"]
            })
        return jsonify({
            "status": "error",
            "message": error
        }), 500
        
    # Update global cache
    cache["data"] = updates
    cache["last_fetched"] = current_time
    
    return jsonify({
        "status": "success",
        "from_cache": False,
        "last_fetched": datetime.fromtimestamp(current_time).isoformat(),
        "updates": updates
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
