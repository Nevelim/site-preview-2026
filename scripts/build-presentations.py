"""Build online and self-contained presentation files from the canonical source."""
from pathlib import Path
import re,base64,mimetypes
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'docs/presentation-src'
s=(SRC/'landing.html').read_text()
s=s.replace('/* QUALITY_STYLES */',(SRC/'quality.css').read_text())
s=s.replace('/* QUALITY_BEHAVIOR */',(SRC/'quality.js').read_text())
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
    (ROOT/f'presentation-busvision-{name}.html').write_text('\n'.join(line.rstrip() for line in out.splitlines())+'\n')
print('Built online, desktop and mobile presentations.')
