"""Build online and self-contained presentation files from the canonical source."""
from pathlib import Path
import re,base64,mimetypes,hashlib
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'docs/presentation-src'
s=(SRC/'landing.html').read_text()
s=s.replace('<link rel="stylesheet" href="fonts.css">','') # Gilroy faces are declared in the source.
(ROOT/'presentation-busvision.html').write_text(s)
def inline(m):
    prefix,path,suffix=m.groups()
    asset=SRC/path
    if not asset.is_file(): asset=ROOT/path
    if not asset.is_file(): raise FileNotFoundError(path)
    mime=mimetypes.guess_type(path)[0] or 'application/octet-stream'
    return prefix+'data:'+mime+';base64,'+base64.b64encode(asset.read_bytes()).decode()+suffix
s=re.sub(r'(src=")(assets/[^\"]+)(")',inline,s)
s=re.sub(r"(url\(')(assets/[^']+)('\))",inline,s)
for name,css in [('desktop','body{min-width:1180px}'),('mobile','section{padding:56px 20px!important}.split,.grid.g2,.grid.g3{grid-template-columns:1fr!important;gap:20px!important}#hero h1{font-size:40px!important}.hero-shot{height:auto!important;aspect-ratio:1200/607}.side-label,.scroll-hint{display:none!important}.nav-links{flex-basis:100%}')]:
    variant=s
    if name=='desktop':
        while True:
            match=re.search(r'@media[^{}]*max-width[^{}]*\{',variant)
            if not match: break
            end=match.end(); depth=1
            while depth:
                depth += (variant[end]=='{') - (variant[end]=='}'); end+=1
            variant=variant[:match.start()]+variant[end:]
    out=variant.replace('</head>','<style>'+css+'</style></head>')
    (ROOT/f'presentation-busvision-{name}.html').write_text(out)

# Refresh the iframe and downloads together when any presentation output changes.
# GitHub Pages caches HTML, so an unchanged wrapper must not reuse an older iframe.
outputs = [f'presentation-busvision{suffix}.html' for suffix in ('', '-desktop', '-mobile')]
revision = hashlib.sha256(b''.join((ROOT / name).read_bytes() for name in outputs)).hexdigest()[:12]

def version_links(page, targets):
    html = page.read_text()
    for target in targets:
        pattern = r'((?:href|src)=")' + re.escape(target) + r'(?:\?v=[a-f0-9]+)?(#[^"]*)?(")'
        html = re.sub(pattern, lambda m: f'{m[1]}{target}?v={revision}{m[2] or ""}{m[3]}', html)
    page.write_text(html)

version_links(ROOT / 'busvision.html', outputs)
version_links(ROOT / 'index.html', ['busvision.html'])
print(f'Built online, desktop and mobile presentations. Revision: {revision}')
