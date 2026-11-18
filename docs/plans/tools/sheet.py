import sys,glob
from PIL import Image
files=sorted(glob.glob(sys.argv[1]+'/*.png')); cols=int(sys.argv[3]) if len(sys.argv)>3 else 3
w,h=640,360; rows=(len(files)+cols-1)//cols
S=Image.new('RGB',(w*cols,h*rows))
for i,f in enumerate(files): S.paste(Image.open(f).convert('RGB').resize((w,h)),((i%cols)*w,(i//cols)*h))
S.save(sys.argv[2])
