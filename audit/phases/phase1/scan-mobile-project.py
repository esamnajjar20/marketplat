import os,re,json,collections,hashlib,csv
ROOT=os.path.join(os.getcwd(),"apps/mobile")
# Run from repository root. Writes a simple inventory to ./mobile-inventory.json.
items=[]; missing=[]; rel=alias=0
for dp,ds,fs in os.walk(ROOT):
 ds[:]=[d for d in ds if d not in ("node_modules",".expo",".git","build")]
 for name in fs:
  p=os.path.join(dp,name); b=open(p,"rb").read(); items.append({"path":p.replace(os.sep,"/"),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
for x in items:
 p=x["path"]
 if not p.endswith((".ts",".tsx",".js",".jsx",".mjs",".cjs")): continue
 s=open(p,encoding="utf8").read()
 for spec in re.findall(r'''(?:from\s*|import\s*\(|require\s*\()\s*[\'\"]([^\'\"]+)[\'\"]''',s):
  if spec.startswith("."): rel+=1; base=os.path.normpath(os.path.join(os.path.dirname(p),spec))
  elif spec.startswith("@/"): alias+=1; base=os.path.normpath(os.path.join(ROOT,"src",spec[2:]))
  else: continue
  candidates=[base]+[base+e for e in (".ts",".tsx",".js",".jsx",".mjs",".mts",".d.ts")]+[os.path.join(base,"index"+e) for e in (".ts",".tsx",".js",".mjs")]
  if not any(os.path.isfile(c) for c in candidates): missing.append({"file":p,"specifier":spec})
json.dump({"files":items,"relative_imports_checked":rel,"alias_imports_checked":alias,"unresolved_imports":missing},open("mobile-inventory.json","w",encoding="utf8"),ensure_ascii=False,indent=2)
print(f"files={len(items)} relative={rel} aliases={alias} unresolved={len(missing)}")
