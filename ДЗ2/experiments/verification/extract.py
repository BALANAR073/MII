import re,sys,os
# Извлекает блоки кода, первая строка которых — // путь к файлу
def extract(md, outdir, skip_fragments=True):
    text=open(md,encoding='utf-8').read()
    n=0
    for m in re.finditer(r"```(?:ts|tsx|typescript)\n(.*?)```", text, re.S):
        body=m.group(1)
        first=body.split('\n',1)[0].strip()
        mm=re.match(r"//\s*(src/\S+)(.*)",first)
        if not mm: continue
        path, rest = mm.group(1), mm.group(2)
        if skip_fragments and 'фрагмент' in rest: 
            print('  skip fragment', path); continue
        p=os.path.join(outdir,path); os.makedirs(os.path.dirname(p),exist_ok=True)
        open(p,'w',encoding='utf-8').write(body); n+=1
        print('  ',path)
    return n
for md in sys.argv[2:]:
    print(md, extract(md, sys.argv[1]))
