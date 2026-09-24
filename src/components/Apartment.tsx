import * as THREE from "three";
import type { InteractableDef, PlacedItem } from "@/game/types";
import interactablesData from "@/data/interactables.json";

export const LIVING = { x0: 0, x1: 6, z0: 0, z1: 5, h: 2.72 };
export const BEDROOM = { x0: 6, x1: 10, z0: 0.5, z1: 4.5, h: 2.72 };
const WALL_T = 0.08;

export type AABB = { min: THREE.Vector3; max: THREE.Vector3 };

export type ApartmentWorld = {
  group: THREE.Group;
  interactables: InteractableDef[];
  proxies: Map<string, THREE.Object3D>;
  walls: AABB[];
  floorMeshes: THREE.Mesh[];
  wallMeshes: THREE.Mesh[];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  lamps: THREE.PointLight[];
  cityDay: THREE.Mesh;
  cityNight: THREE.Mesh;
  windowGlass: THREE.Mesh;
  photoPlane: THREE.Mesh;
  placeGroup: THREE.Group;
  placedMeshes: Map<string, THREE.Object3D>;
  hoverOutline: THREE.Mesh;
  setDayNight: (sun: number, night: boolean, lampOn: boolean) => void;
  syncPlaced: (items: PlacedItem[]) => void;
  setPhoto: (texture: THREE.Texture | null, index: number) => void;
  dispose: () => void;
};

function tex(loader: THREE.TextureLoader, url: string, repeatX = 1, repeatY = 1) {
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

export function createApartment(scene: THREE.Scene): ApartmentWorld {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const floorMap = tex(loader, "/textures/floor.jpg", 6, 5);
  const wallMap = tex(loader, "/textures/wall.jpg", 3, 1.4);
  const fabricMap = tex(loader, "/textures/fabric.jpg", 2, 2);
  const cityDayMap = tex(loader, "/textures/city-dusk.jpg", 1, 1);
  const cityNightMap = tex(loader, "/textures/city-night.jpg", 1, 1);
  cityDayMap.wrapS = cityDayMap.wrapT = THREE.ClampToEdgeWrapping;
  cityNightMap.wrapS = cityNightMap.wrapT = THREE.ClampToEdgeWrapping;

  const mats = {
    floor: new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.72, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.86, metalness: 0 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.62, map: floorMap }),
    fabric: new THREE.MeshStandardMaterial({ map: fabricMap, roughness: 0.9, color: 0xd9cbb6 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x8a7460, roughness: 0.88 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9b3aa, roughness: 0.35, metalness: 0.55 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.55 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x4f6d52, roughness: 0.7 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd7e6f0,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      transmission: 0.6,
      thickness: 0.02,
    }),
    emissive: new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: 0xffc07a,
      emissiveIntensity: 0.8,
    }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.5 }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xf4eee4, roughness: 0.85 }),
  };

  const group = new THREE.Group();
  group.name = "apartment";
  scene.add(group);

  const floorMeshes: THREE.Mesh[] = [];
  const wallMeshes: THREE.Mesh[] = [];
  const walls: AABB[] = [];
  const proxies = new Map<string, THREE.Object3D>();

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    parent: THREE.Object3D = group,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Floors
  const livingFloor = addBox(6, 0.06, 5, 3, -0.03, 2.5, mats.floor);
  const bedFloor = addBox(4, 0.06, 4, 8, -0.03, 2.5, mats.floor);
  floorMeshes.push(livingFloor, bedFloor);

  // Ceiling
  addBox(6, 0.06, 5, 3, LIVING.h, 2.5, mats.ceiling);
  addBox(4, 0.06, 4, 8, LIVING.h, 2.5, mats.ceiling);

  const wallBox = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0 = 0,
    y1 = LIVING.h,
  ) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const h = y1 - y0;
    const mesh = addBox(Math.max(w, 0.04), h, Math.max(d, 0.04), (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, mats.wall);
    wallMeshes.push(mesh);
    walls.push({
      min: new THREE.Vector3(Math.min(x0, x1) - 0.02, y0, Math.min(z0, z1) - 0.02),
      max: new THREE.Vector3(Math.max(x0, x1) + 0.02, y1, Math.max(z0, z1) + 0.02),
    });
    return mesh;
  };

  // Living exterior walls with window hole on z=0 between x=1.4..4.6, y=0.9..2.25
  wallBox(-WALL_T, 0, 0, 5); // west
  wallBox(0, 6, 5, 5 + WALL_T); // south
  wallBox(0, 1.4, -WALL_T, 0); // north left of window
  wallBox(4.6, 6, -WALL_T, 0); // north right of window
  wallBox(1.4, 4.6, -WALL_T, 0, 0, 0.9); // under window
  wallBox(1.4, 4.6, -WALL_T, 0, 2.25, LIVING.h); // over window
  // Shared wall at x=6 with door z=2.1..3.2
  wallBox(6 - WALL_T / 2, 6 + WALL_T / 2, 0.5, 2.1);
  wallBox(6 - WALL_T / 2, 6 + WALL_T / 2, 3.2, 4.5);
  wallBox(6 - WALL_T / 2, 6 + WALL_T / 2, 2.1, 3.2, 2.15, LIVING.h);
  // Bedroom walls
  wallBox(10, 10 + WALL_T, 0.5, 4.5);
  wallBox(6, 10, 0.5 - WALL_T, 0.5);
  wallBox(6, 10, 4.5, 4.5 + WALL_T);
  wallBox(6, 6 + WALL_T, 0, 0.5);
  wallBox(6, 6 + WALL_T, 4.5, 5);

  // Window glass + city
  const glass = addBox(3.15, 1.32, 0.03, 3.0, 1.57, 0.02, mats.glass);
  const cityDay = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), new THREE.MeshBasicMaterial({ map: cityDayMap }));
  cityDay.position.set(3, 1.45, -1.6);
  cityDay.rotation.y = 0;
  group.add(cityDay);
  const cityNight = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.2),
    new THREE.MeshBasicMaterial({ map: cityNightMap, transparent: true, opacity: 0 }),
  );
  cityNight.position.set(3, 1.45, -1.58);
  group.add(cityNight);
  // Window frame
  addBox(3.3, 0.06, 0.08, 3, 0.9, 0.04, mats.frame);
  addBox(3.3, 0.06, 0.08, 3, 2.25, 0.04, mats.frame);
  addBox(0.06, 1.4, 0.08, 1.42, 1.57, 0.04, mats.frame);
  addBox(0.06, 1.4, 0.08, 4.58, 1.57, 0.04, mats.frame);
  addBox(0.04, 1.4, 0.06, 3, 1.57, 0.04, mats.frame);

  // Kitchen run along west wall
  addBox(0.7, 0.9, 3.2, 0.45, 0.45, 2.9, mats.wood); // counter body
  addBox(0.72, 0.06, 3.22, 0.45, 0.93, 2.9, mats.white); // counter top
  addBox(0.62, 1.7, 0.62, 0.48, 0.85, 4.38, mats.white); // fridge
  addBox(0.5, 0.08, 0.5, 0.48, 1.74, 4.38, mats.metal);
  addBox(0.4, 0.04, 0.4, 0.55, 0.96, 2.32, mats.metal); // stove
  addBox(0.28, 0.08, 0.22, 0.55, 0.88, 1.52, mats.metal); // sink basin
  const kettle = addBox(0.12, 0.16, 0.12, 0.95, 1.08, 3.15, mats.metal);

  // Couch
  addBox(1.85, 0.38, 0.82, 3.35, 0.22, 3.68, mats.fabric);
  addBox(1.85, 0.42, 0.18, 3.35, 0.55, 4.02, mats.fabricDark);
  addBox(0.18, 0.42, 0.78, 2.5, 0.55, 3.68, mats.fabricDark);
  addBox(0.18, 0.42, 0.78, 4.2, 0.55, 3.68, mats.fabricDark);
  addBox(0.4, 0.12, 0.32, 2.95, 0.48, 3.55, mats.fabric);
  addBox(0.4, 0.12, 0.32, 3.75, 0.48, 3.55, mats.fabric);

  // Coffee table + laptop
  addBox(1.1, 0.08, 0.55, 3.35, 0.32, 2.72, mats.wood);
  addBox(0.04, 0.28, 0.04, 2.9, 0.16, 2.52, mats.wood);
  addBox(0.04, 0.28, 0.04, 3.8, 0.16, 2.52, mats.wood);
  addBox(0.04, 0.28, 0.04, 2.9, 0.16, 2.92, mats.wood);
  addBox(0.04, 0.28, 0.04, 3.8, 0.16, 2.92, mats.wood);
  addBox(0.32, 0.02, 0.22, 3.35, 0.38, 2.72, mats.metal);
  addBox(0.32, 0.18, 0.01, 3.35, 0.48, 2.62, mats.metal);

  // Rug
  const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 1.6), mats.fabric);
  rug.position.set(3.35, 0.02, 2.95);
  rug.receiveShadow = true;
  group.add(rug);

  // Gift box
  addBox(0.32, 0.22, 0.32, 5.28, 0.14, 4.42, mats.wood);
  addBox(0.34, 0.04, 0.08, 5.28, 0.26, 4.42, mats.emissive);

  // Plant
  addBox(0.16, 0.18, 0.16, 5.32, 0.12, 0.72, mats.soil);
  const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.plant);
  foliage.position.set(5.32, 0.48, 0.72);
  foliage.castShadow = true;
  group.add(foliage);

  // Bookshelf
  addBox(0.34, 1.6, 0.7, 5.55, 0.8, 3.38, mats.wood);
  addBox(0.28, 0.18, 0.22, 5.42, 1.2, 3.22, mats.fabricDark);
  addBox(0.2, 0.26, 0.08, 5.4, 0.7, 3.5, mats.white);

  // Radio on a small shelf
  addBox(0.4, 0.08, 0.24, 5.42, 1.05, 2.18, mats.wood);
  addBox(0.22, 0.12, 0.12, 5.42, 1.16, 2.18, mats.metal);

  // Lamp
  addBox(0.18, 0.04, 0.18, 1.42, 0.04, 3.95, mats.metal);
  addBox(0.04, 1.35, 0.04, 1.42, 0.72, 3.95, mats.metal);
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 12), mats.emissive);
  lampShade.position.set(1.42, 1.45, 3.95);
  group.add(lampShade);

  // TV
  addBox(0.7, 0.42, 0.06, 4.55, 0.62, 0.22, mats.frame);
  addBox(0.62, 0.34, 0.02, 4.55, 0.62, 0.26, new THREE.MeshStandardMaterial({ color: 0x1a2228, emissive: 0x223344, emissiveIntensity: 0.2 }));

  // Calendar
  addBox(0.28, 0.36, 0.02, 5.88, 1.55, 4.72, mats.white);

  // Cushion
  addBox(0.46, 0.14, 0.46, 2.15, 0.1, 3.55, mats.fabric);

  // Door
  addBox(0.06, 2.1, 0.7, 6.0, 1.05, 2.65, mats.wood);

  // Bedroom: bed
  addBox(1.7, 0.28, 2.1, 8.55, 0.22, 2.45, mats.wood);
  addBox(1.55, 0.16, 1.95, 8.55, 0.42, 2.45, mats.sheet);
  addBox(0.5, 0.14, 0.32, 8.2, 0.54, 1.62, mats.sheet);
  addBox(0.5, 0.14, 0.32, 8.9, 0.54, 1.62, mats.sheet);

  // Wardrobe
  addBox(0.5, 1.9, 0.9, 6.58, 0.95, 4.12, mats.wood);
  addBox(0.02, 1.6, 0.4, 6.84, 1.0, 4.12, mats.frame);

  // Nightstand
  addBox(0.4, 0.42, 0.36, 9.52, 0.24, 1.48, mats.wood);
  addBox(0.1, 0.16, 0.1, 9.52, 0.52, 1.48, mats.emissive);

  // Mirror
  addBox(0.04, 1.1, 0.5, 6.22, 1.35, 1.05, mats.metal);
  addBox(0.02, 1.0, 0.42, 6.25, 1.35, 1.05, new THREE.MeshStandardMaterial({ color: 0xc5d0d6, metalness: 0.7, roughness: 0.12 }));

  // Photo frame on bedroom north wall
  addBox(0.62, 0.42, 0.04, 8.5, 1.35, 0.56, mats.frame);
  const photoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.34),
    new THREE.MeshBasicMaterial({ map: loader.load("/photos/living.jpg") }),
  );
  (photoPlane.material as THREE.MeshBasicMaterial).map!.colorSpace = THREE.SRGBColorSpace;
  photoPlane.position.set(8.5, 1.35, 0.59);
  group.add(photoPlane);

  // Baseboards as thin boxes (visual only)
  addBox(6, 0.08, 0.03, 3, 0.04, 0.04, mats.wood);
  addBox(6, 0.08, 0.03, 3, 0.04, 4.97, mats.wood);

  const interactables = interactablesData as InteractableDef[];
  const proxyGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const proxyMat = new THREE.MeshBasicMaterial({
    color: 0xc8ccd4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  for (const it of interactables) {
    const p = new THREE.Mesh(proxyGeo, proxyMat);
    p.position.set(it.position[0], it.position[1], it.position[2]);
    p.userData.interactableId = it.id;
    p.name = `proxy:${it.id}`;
    group.add(p);
    proxies.set(it.id, p);
  }
  kettle.userData.interactableId = "kettle";

  const hoverOutline = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xc8ccd4,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    }),
  );
  hoverOutline.visible = false;
  scene.add(hoverOutline);

  const hemi = new THREE.HemisphereLight(0xc9d6e2, 0x3d3228, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c2, 1.1);
  sun.position.set(4, 8, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);

  const lamps: THREE.PointLight[] = [];
  const addLamp = (x: number, y: number, z: number, color: number, intensity: number) => {
    const l = new THREE.PointLight(color, intensity, 6.5, 2);
    l.position.set(x, y, z);
    scene.add(l);
    lamps.push(l);
  };
  addLamp(1.42, 1.55, 3.95, 0xffc07a, 0.9);
  addLamp(0.7, 1.6, 2.9, 0xffe0b0, 0.45);
  addLamp(8.55, 1.35, 1.48, 0xffd0a0, 0.55);
  addLamp(3.2, 2.2, 2.4, 0xf2e4cc, 0.25);

  const placeGroup = new THREE.Group();
  group.add(placeGroup);
  const placedMeshes = new Map<string, THREE.Object3D>();

  const setDayNight = (sunAmt: number, night: boolean, lampOn: boolean) => {
    sun.intensity = 0.15 + sunAmt * 1.15;
    sun.color.set(night ? 0x8aa0c8 : 0xffe2b8);
    hemi.intensity = 0.28 + sunAmt * 0.5;
    hemi.color.set(night ? 0x8a9bb8 : 0xd9e4f0);
    (cityNight.material as THREE.MeshBasicMaterial).opacity = night ? 1 : 0;
    (cityDay.material as THREE.MeshBasicMaterial).opacity = night ? 0 : 1;
    const lampI = lampOn ? (night ? 1.15 : 0.45) : 0.05;
    lamps[0]!.intensity = lampI;
    lamps[1]!.intensity = lampOn ? 0.4 + (night ? 0.3 : 0) : 0.08;
    lamps[2]!.intensity = lampOn ? 0.5 + (night ? 0.35 : 0) : 0.08;
    mats.emissive.emissiveIntensity = lampOn ? 0.9 : 0.05;
  };

  const makeDecor = (item: PlacedItem) => {
    const g = new THREE.Group();
    g.position.set(item.position[0], item.position[1], item.position[2]);
    g.rotation.y = item.rotationY;
    const id = item.itemId;
    if (id === "floor_lamp") {
      addBox(0.12, 0.04, 0.12, 0, 0.02, 0, mats.metal, g);
      addBox(0.03, 0.9, 0.03, 0, 0.48, 0, mats.metal, g);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 10), mats.emissive);
      s.position.y = 1.0;
      g.add(s);
    } else if (id === "potted_fern") {
      addBox(0.12, 0.12, 0.12, 0, 0.06, 0, mats.soil, g);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.plant);
      f.position.y = 0.28;
      g.add(f);
    } else if (id === "tea_candle") {
      addBox(0.08, 0.06, 0.08, 0, 0.04, 0, mats.white, g);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), mats.emissive);
      f.position.y = 0.09;
      g.add(f);
    } else if (id === "wool_rug") {
      const r = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.9), mats.fabric);
      r.position.y = 0.015;
      g.add(r);
    } else if (id === "floor_cushion") {
      addBox(0.4, 0.12, 0.4, 0, 0.07, 0, mats.fabric, g);
    } else if (id === "ceramic_vase") {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10), mats.white);
      v.position.y = 0.12;
      g.add(v);
    } else if (id === "book_stack") {
      addBox(0.22, 0.04, 0.16, 0, 0.04, 0, mats.fabricDark, g);
      addBox(0.2, 0.04, 0.15, 0.02, 0.08, 0, mats.wood, g);
      addBox(0.18, 0.04, 0.14, 0, 0.12, 0.01, mats.white, g);
    } else if (id === "glass_jar") {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), mats.glass);
      v.position.y = 0.08;
      g.add(v);
    } else if (id === "wall_poster" || id === "hanging_frame") {
      addBox(0.5, 0.36, 0.03, 0, 0, 0, mats.frame, g);
    } else if (id === "fairy_lights") {
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mats.emissive);
        b.position.set(-0.25 + i * 0.1, Math.sin(i) * 0.05, 0);
        g.add(b);
      }
    } else if (id === "paper_mobile") {
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), mats.sheet);
        p.position.set(Math.sin(i) * 0.12, -i * 0.08, Math.cos(i) * 0.08);
        g.add(p);
      }
    } else {
      addBox(0.2, 0.2, 0.2, 0, 0.1, 0, mats.wood, g);
    }
    return g;
  };

  const syncPlaced = (items: PlacedItem[]) => {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.uid);
      if (!placedMeshes.has(it.uid)) {
        const m = makeDecor(it);
        placeGroup.add(m);
        placedMeshes.set(it.uid, m);
      } else {
        const m = placedMeshes.get(it.uid)!;
        m.position.set(it.position[0], it.position[1], it.position[2]);
        m.rotation.y = it.rotationY;
      }
    }
    for (const [uid, m] of placedMeshes) {
      if (!seen.has(uid)) {
        placeGroup.remove(m);
        placedMeshes.delete(uid);
      }
    }
  };

  const photoMaps = [
    loader.load("/photos/living.jpg"),
    loader.load("/photos/bedroom.jpg"),
    loader.load("/photos/kitchen.jpg"),
  ];
  photoMaps.forEach((m) => {
    m.colorSpace = THREE.SRGBColorSpace;
  });

  const setPhoto = (texture: THREE.Texture | null, index: number) => {
    const mat = photoPlane.material as THREE.MeshBasicMaterial;
    mat.map = texture ?? photoMaps[index % photoMaps.length]!;
    mat.needsUpdate = true;
  };

  const dispose = () => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    scene.remove(group);
    scene.remove(hemi);
    scene.remove(sun);
    lamps.forEach((l) => scene.remove(l));
    scene.remove(hoverOutline);
  };

  return {
    group,
    interactables,
    proxies,
    walls,
    floorMeshes,
    wallMeshes,
    sun,
    hemi,
    lamps,
    cityDay,
    cityNight,
    windowGlass: glass,
    photoPlane,
    placeGroup,
    placedMeshes,
    hoverOutline,
    setDayNight,
    syncPlaced,
    setPhoto,
    dispose,
  };
}

export function collidePlayer(
  pos: THREE.Vector3,
  walls: AABB[],
  radius: number,
) {
  // Keep inside apartment bounds
  pos.x = THREE.MathUtils.clamp(pos.x, 0.28, 9.72);
  pos.z = THREE.MathUtils.clamp(pos.z, 0.28, 4.72);
  // Bedroom z bounds if in bedroom
  if (pos.x > 6.15) {
    pos.z = THREE.MathUtils.clamp(pos.z, 0.72, 4.28);
  }
  for (const w of walls) {
    const nx = THREE.MathUtils.clamp(pos.x, w.min.x - radius, w.max.x + radius);
    const nz = THREE.MathUtils.clamp(pos.z, w.min.z - radius, w.max.z + radius);
    // if inside expanded box on XZ
    const insideX = pos.x > w.min.x - radius && pos.x < w.max.x + radius;
    const insideZ = pos.z > w.min.z - radius && pos.z < w.max.z + radius;
    if (insideX && insideZ && pos.y < w.max.y && pos.y > w.min.y) {
      const dxL = Math.abs(pos.x - (w.min.x - radius));
      const dxR = Math.abs(pos.x - (w.max.x + radius));
      const dzL = Math.abs(pos.z - (w.min.z - radius));
      const dzR = Math.abs(pos.z - (w.max.z + radius));
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) pos.x = w.min.x - radius;
      else if (m === dxR) pos.x = w.max.x + radius;
      else if (m === dzL) pos.z = w.min.z - radius;
      else pos.z = w.max.z + radius;
    }
    void nx;
    void nz;
  }
  // Door gap at x=6, z=2.15-3.15 — allow crossing
  const inDoor = pos.z > 2.18 && pos.z < 3.12 && pos.x > 5.6 && pos.x < 6.4;
  if (!inDoor && pos.x > 5.85 && pos.x < 6.15) {
    if (pos.z <= 2.18 || pos.z >= 3.12) {
      pos.x = pos.x < 6 ? 5.82 : 6.18;
    }
  }
}
