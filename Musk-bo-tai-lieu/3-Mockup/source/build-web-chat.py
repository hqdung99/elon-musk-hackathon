import base64
s=open("musk-web-chat-src.html").read()
def b(f): return "data:image/jpeg;base64,"+base64.b64encode(open("musk-assets/"+f,"rb").read()).decode()
for k,f in {"{{IMG_BOX}}":"ip-box.jpg","{{IMG_ABOUT}}":"ip-about.jpg","{{IMG_BACK}}":"ip-blue-back.jpg","{{IMG_PINK}}":"ip-pink.jpg","{{IMG_DIAP}}":"diapers.jpg","{{IMG_FORM}}":"formula.jpg","{{IMG_WIPE}}":"wipes.jpg"}.items(): s=s.replace(k,b(f))
open("musk-web-chat-publish.html","w").write(s)
print(len(s))
