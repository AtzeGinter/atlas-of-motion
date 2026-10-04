import re
ORD={'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6,'seventh':7,'eighth':8,'ninth':9,'tenth':10,'eleventh':11,'twelfth':12}
SKULL={
'frontal bone':'Forms the forehead and the roofs of the orbits. Frontalis and corrugator supercilii act on the skin over it.',
'parietal bone':'Paired bones forming the sides and roof of the cranium. Temporalis arises partly from its lower surface.',
'temporal bone':'Houses the middle and inner ear. Its mastoid process anchors sternocleidomastoid, splenius capitis and longissimus capitis; the zygomatic process anchors masseter.',
'occipital bone':'Back and base of the skull, with the foramen magnum for the spinal cord. Trapezius, semispinalis capitis and the suboccipital muscles attach here.',
'sphenoid bone':'Butterfly-shaped bone at the skull base. Its pterygoid plates anchor the pterygoid muscles; the eye muscles arise from the ring around the optic canal.',
'ethmoid':'Light, honeycombed bone between the orbits forming part of the nasal cavity.',
'maxilla':'Upper jaw. Holds the upper teeth and forms the floor of the orbit and much of the face.',
'mandible':'Lower jaw and the only freely movable skull bone. Masseter, temporalis and the pterygoids move it at the temporomandibular joint.',
'zygomatic bone':'Cheekbone. Origin of the zygomaticus muscles and part of the masseter.',
'nasal bone':'Small paired bones forming the bridge of the nose.',
'lacrimal bone':'The smallest facial bone, in the medial wall of the orbit; contains the groove for the tear duct.',
'palatine bone':'Forms the back of the hard palate and part of the nasal cavity.',
'vomer':'Thin bone forming the lower back part of the nasal septum.',
'hyoid bone':'U-shaped bone in the neck that touches no other bone. Anchor for the tongue and the supra- and infrahyoid muscles.'}
OTHER={
'atlas':('Spine','First cervical vertebra (C1). A ring without a body that carries the skull and allows nodding.'),
'axis':('Spine','Second cervical vertebra (C2). Its dens is the pivot around which the atlas and head rotate.'),
'manubrium':('Thorax','Upper part of the sternum. Clavicles and first ribs articulate with it; sternocleidomastoid and sternohyoid arise from it.'),
'body of sternum':('Thorax','Middle part of the breastbone. Ribs 2–7 connect to it via costal cartilage.'),
'xiphoid process':('Thorax','Small lower tip of the sternum. Attachment for the diaphragm and rectus abdominis.'),
'clavicle':('Arm','Collarbone. The only bony link between the arm and the trunk, holding the shoulder out to the side.'),
'scapula':('Arm','Shoulder blade. Glides over the ribcage; 17 muscles attach to it, including the rotator cuff.'),
'humerus':('Arm','Upper arm bone. Its head forms the shoulder joint, its condyles the elbow.'),
'radius':('Arm','Thumb-side forearm bone. Rotates around the ulna for pronation and supination.'),
'ulna':('Arm','Little-finger-side forearm bone. Its olecranon is the point of the elbow, where triceps inserts.'),
'hip bone':('Pelvis & leg','Ilium, ischium and pubis fused. Its acetabulum forms the hip socket; it anchors the glutes, hip flexors, adductors and hamstrings.'),
'femur':('Pelvis & leg','Thigh bone, the longest and strongest bone. The greater trochanter anchors the deep hip rotators and gluteus medius and minimus.'),
'patella':('Pelvis & leg','Kneecap. A sesamoid bone in the quadriceps tendon that increases the quadriceps lever arm.'),
'tibia':('Pelvis & leg','Shin bone, carrying most body weight below the knee. Its tuberosity receives the patellar ligament.'),
'fibula':('Pelvis & leg','Slender lateral leg bone. Carries little weight; anchors the fibular muscles and biceps femoris and forms the outer ankle.'),
'talus':('Foot','Ankle bone between leg and foot. No muscles attach to it.'),
'calcaneus':('Foot','Heel bone, the largest tarsal. Receives the calcaneal (Achilles) tendon.'),
'navicular bone (foot)':('Foot','Boat-shaped tarsal on the inner foot; main insertion of tibialis posterior.'),
'cuboid bone':('Foot','Tarsal on the outer foot; the fibularis longus tendon runs in a groove under it.'),
'sesamoid bone (foot)':('Foot','Small bones in the flexor hallucis brevis tendons under the big toe joint.'),
'pisiform':('Hand','Pea-shaped carpal inside the flexor carpi ulnaris tendon.')}
CARPAL={'scaphoid','lunate','triquetrum','pisiform','trapezium','trapezoid','capitate','hamate'}
TARSAL_CUNEI=re.compile(r'(medial|intermediate|lateral) cuneiform bone')
def info(n):
    n=n.replace(' of foot',' (foot)')
    if n in SKULL: return ['Skull',SKULL[n]]
    if n in OTHER: return list(OTHER[n])
    m=re.match(r'(\w+) (cervical|thoracic|lumbar) vertebra',n)
    if m:
        t=m.group(2); i=ORD[m.group(1)]
        d={'cervical':'Seven cervical vertebrae form the neck; their transverse processes have holes for the vertebral arteries.',
           'thoracic':'Twelve thoracic vertebrae form the upper back; each articulates with a pair of ribs.',
           'lumbar':'Five lumbar vertebrae form the lower back and have the largest bodies, carrying most upper-body weight.'}[t]
        return ['Spine',t[0].upper()+str(i)+' vertebra. '+d]
    m=re.match(r'(\w+) rib',n)
    if m:
        i=ORD[m.group(1)]; typ='a true rib, joined directly to the sternum' if i<=7 else ('a false rib, joined to the sternum through the cartilage above' if i<=10 else 'a floating rib with no front attachment')
        return ['Thorax','Rib '+str(i)+', '+typ+'. Intercostal muscles span the gaps between ribs.']
    if n in CARPAL: return ['Hand','One of the eight carpal (wrist) bones.']
    if 'metacarpal' in n: return ['Hand','Metacarpal: one of five long bones of the palm.']
    if 'metatarsal' in n: return ['Foot','Metatarsal: one of five long bones of the forefoot.']
    if TARSAL_CUNEI.match(n): return ['Foot','Cuneiform: one of three wedge-shaped tarsal bones forming the transverse arch.']
    if 'phalanx' in n:
        return ['Hand' if ('finger' in n or 'thumb' in n) else 'Foot','Phalanx: a bone of a finger or toe. Thumb and big toe have two, the other digits three.']
    raise Exception('no info '+n)
