import re

html_path = 'c:/Users/Administrator/workspace/soundreport/index.html'
css_path = 'c:/Users/Administrator/workspace/soundreport/style.css'
js_path = 'c:/Users/Administrator/workspace/soundreport/script.js'
out_path = 'c:/Users/Administrator/workspace/soundreport/google_sites_embed.html'

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script src="script.js"></script>', f'<script>\n{js}\n</script>')

# Just in case we missed any href='#'
html = html.replace('href="#"', 'href="javascript:void(0)"')

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Merge complete!")
