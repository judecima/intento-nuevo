'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { FurniturePart } from '../core/types';
import {
  FURNITURE_VIEWER_COLORS,
  resolveFurniturePartAppearance,
  type FurnitureViewerColor,
} from './viewer-theme';

export interface FurnitureSceneManagerOptions {
  onPartSelect?: (partId: string | null) => void;
}

export class FurnitureSceneManager {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly furnitureGroup = new THREE.Group();
  private readonly partsMap = new Map<string, THREE.Object3D>();
  private readonly itemStates = new Map<string, boolean>();
  private readonly animationOffsets = new Map<string, number>();
  private readonly drawerTravelByGroup = new Map<string, number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private resizeObserver: ResizeObserver | null = null;
  private animationFrame: number | null = null;
  private disposed = false;
  private onPartSelect?: (partId: string | null) => void;

  private readonly colors = {
    outline: 0x444444,
    background: 0xf1f5f9,
    thinMdf: 0xc8c8c8,
    hinge: 0x9a9a9a,
    rail: 0x8a8a8a,
    pistonBody: 0x1f1f1f,
    pistonRod: 0xd9d9d9,
    highlight: 0x4a90e2,
  };

  constructor(private readonly container: HTMLElement, options: FurnitureSceneManagerOptions = {}) {
    this.onPartSelect = options.onPartSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.colors.background);

    const { width, height } = this.containerSize();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    this.camera.position.set(1500, 1000, 1500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(1000, 2000, 1500);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    this.scene.add(dirLight);

    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(this.furnitureGroup);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.resize);
    }

    this.animate();
  }

  setOnPartSelect(callback?: (partId: string | null) => void) {
    this.onPartSelect = callback;
  }

  buildFurniture(parts: FurniturePart[], color: FurnitureViewerColor) {
    this.clearFurniture();
    this.drawerTravelByGroup.clear();

    for (const part of parts) {
      if (part.type !== 'drawer') continue;
      const groupId = part.groupId ?? part.id;
      const previous = this.drawerTravelByGroup.get(groupId) ?? 0;
      this.drawerTravelByGroup.set(
        groupId,
        Math.max(previous, Math.min(500, Math.max(120, part.depth * 0.8))),
      );
    }

    const baseColor = new THREE.Color(FURNITURE_VIEWER_COLORS[color]);
    const interiorColor = baseColor.clone().offsetHSL(0, 0, 0.1);

    for (const part of parts) {
      if (part.type === 'piston-body' && part.pistonConfig) {
        this.createPiston(part);
        continue;
      }

      const geometry = this.createGeometry(part);
      const material = this.createMaterial(part, baseColor, interiorColor);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (!part.isHardware) {
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: this.colors.outline,
          transparent: true,
          opacity: 0.5,
        });
        mesh.add(new THREE.LineSegments(edges, lineMaterial));
      }

      this.decorateObject(mesh, part);

      if (this.isDoor(part) && part.pivot) {
        const pivot = part.pivot;
        const group = new THREE.Group();
        group.position.set(pivot.x, pivot.y, pivot.z);
        mesh.position.set(part.x - pivot.x, part.y - pivot.y, part.z - pivot.z);
        group.add(mesh);
        this.decorateObject(group, part);
        this.furnitureGroup.add(group);
        this.partsMap.set(part.id, group);
      } else {
        mesh.position.set(part.x, part.y, part.z);
        mesh.userData.originalPosition = mesh.position.clone();
        mesh.userData.explodeOffset = new THREE.Vector3();
        this.furnitureGroup.add(mesh);
        this.partsMap.set(part.id, mesh);
      }
    }

    this.fitCameraToFurniture();
  }

  setDoors(open: boolean) {
    this.partsMap.forEach((object, id) => {
      if (this.isDoorType(object.userData.type)) this.toggleDoor(id, open);
    });
  }

  setDrawers(open: boolean) {
    const groups = new Set<string>();
    this.partsMap.forEach((object, id) => {
      if (object.userData.type === 'drawer') groups.add(object.userData.groupId || id);
    });
    groups.forEach((groupId) => this.itemStates.set(groupId, open));
  }

  explodeView(factor = 1) {
    this.partsMap.forEach((object) => {
      const original = object.userData.originalPosition as THREE.Vector3 | undefined;
      if (!original) return;
      const center = this.furnitureCenter();
      const direction = original.clone().sub(center);
      if (direction.lengthSq() > 0) direction.normalize();
      const explodeOffset = direction.multiplyScalar(Math.max(0, factor) * 300);
      object.userData.explodeOffset = explodeOffset;
      this.applyAnimatedPosition(object);
    });
    this.fitCameraToFurniture();
  }

  resetAssembly() {
    this.itemStates.clear();
    this.animationOffsets.clear();
    this.partsMap.forEach((object) => {
      object.userData.explodeOffset = new THREE.Vector3();
      object.rotation.set(0, 0, 0);
      this.applyAnimatedPosition(object, 0);
    });
    this.fitCameraToFurniture();
  }

  fitCameraToFurniture() {
    if (this.furnitureGroup.children.length === 0) return;
    const box = new THREE.Box3().setFromObject(this.furnitureGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;
    const direction = new THREE.Vector3(1, 0.7, 1).normalize();

    this.camera.position.copy(direction.multiplyScalar(distance).add(center));
    this.controls.target.copy(center);
    this.controls.update();
  }

  getScreenshot(): string {
    if (this.disposed || this.furnitureGroup.children.length === 0) return '';

    const originalPosition = this.camera.position.clone();
    const originalTarget = this.controls.target.clone();
    const box = new THREE.Box3().setFromObject(this.furnitureGroup);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const distance = Math.max(size.x, size.y, size.z, 1) * 2.5;

    this.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
    this.controls.target.copy(center);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const image = this.renderer.domElement.toDataURL('image/png');

    this.camera.position.copy(originalPosition);
    this.controls.target.copy(originalTarget);
    this.controls.update();
    return image;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);

    this.clearFurniture();
    this.disposeObject(this.scene);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.partsMap.clear();
    this.itemStates.clear();
    this.animationOffsets.clear();
    this.drawerTravelByGroup.clear();
  }

  private containerSize() {
    return {
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
    };
  }

  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.containerSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updateAnimations();
    this.updatePistons();
    this.renderer.render(this.scene, this.camera);
  };

  private onPointerDown = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(this.furnitureGroup.children, true)[0];
    if (!hit) {
      this.onPartSelect?.(null);
      return;
    }

    let object: THREE.Object3D = hit.object;
    while (object.parent && object.parent !== this.furnitureGroup) object = object.parent;

    const id = String(object.userData.id ?? '');
    const groupId = String(object.userData.groupId || id);
    const type = String(object.userData.type ?? '');

    this.highlightObject(object);
    this.onPartSelect?.(id || null);

    if (this.isDoorType(type) && id) {
      this.toggleDoor(id, !this.itemStates.get(id));
    } else if (type === 'drawer' && groupId) {
      this.itemStates.set(groupId, !this.itemStates.get(groupId));
    }
  };

  private toggleDoor(id: string, open: boolean) {
    const object = this.partsMap.get(id);
    if (!object) return;

    this.itemStates.set(id, open);
    const angle = THREE.MathUtils.degToRad(
      Math.min(165, Math.max(0, Number(object.userData.openingAngle ?? 90))),
    );

    if (object.userData.type === 'door-left') object.rotation.y = open ? -angle : 0;
    else if (object.userData.type === 'door-right') object.rotation.y = open ? angle : 0;
    else if (object.userData.type === 'door-flip') object.rotation.x = open ? -angle : 0;
  }

  private updateAnimations() {
    const groupOffsets = new Map<string, number>();

    this.itemStates.forEach((open, groupId) => {
      if (!this.drawerTravelByGroup.has(groupId)) return;
      const current = this.animationOffsets.get(groupId) ?? 0;
      const target = open ? this.drawerTravelByGroup.get(groupId) ?? 360 : 0;
      const next = Math.abs(target - current) > 0.1 ? current + (target - current) * 0.15 : target;
      this.animationOffsets.set(groupId, next);
      groupOffsets.set(groupId, next);
    });

    this.partsMap.forEach((object, id) => {
      if (object.userData.type !== 'drawer') return;
      const groupId = object.userData.groupId || id;
      this.applyAnimatedPosition(object, groupOffsets.get(groupId) ?? this.animationOffsets.get(groupId) ?? 0);
    });
  }

  private applyAnimatedPosition(object: THREE.Object3D, drawerOffset?: number) {
    const original = object.userData.originalPosition as THREE.Vector3 | undefined;
    if (!original) return;
    const explode = (object.userData.explodeOffset as THREE.Vector3 | undefined) ?? new THREE.Vector3();
    object.position.copy(original).add(explode);
    if (object.userData.type === 'drawer') object.position.z += drawerOffset ?? 0;
  }

  private updatePistons() {
    this.partsMap.forEach((piston) => {
      if (piston.userData.type !== 'piston-body' || !piston.userData.config) return;

      const config = piston.userData.config as NonNullable<FurniturePart['pistonConfig']>;
      const door = this.partsMap.get(config.doorId);
      if (!door || door.children.length === 0) return;

      const doorMesh = door.children[0];
      const rod = piston.getObjectByName('rod');
      const anchor = doorMesh.localToWorld(
        new THREE.Vector3(
          config.anchorPuertaLocal.x,
          config.anchorPuertaLocal.y,
          config.anchorPuertaLocal.z,
        ),
      );

      piston.lookAt(anchor);
      const distance = piston.position.distanceTo(anchor);

      if (rod) {
        const cylinderLength = config.lengthClosed * 0.6;
        const baseRodLength = Math.max(1, config.lengthClosed * 0.4);
        const extension = Math.max(1, distance - cylinderLength);
        rod.scale.z = extension / baseRodLength;
      }
    });
  }

  private createGeometry(part: FurniturePart): THREE.BufferGeometry {
    if (part.isHardware && part.name.toLowerCase().includes('bisagra')) {
      const geometry = new THREE.CylinderGeometry(17.5, 17.5, 12, 24);
      geometry.rotateZ(Math.PI / 2);
      return geometry;
    }
    return new THREE.BoxGeometry(part.width, part.height, part.depth);
  }

  private createMaterial(
    part: FurniturePart,
    baseColor: THREE.Color,
    interiorColor: THREE.Color,
  ): THREE.MeshStandardMaterial {
    const appearance = resolveFurniturePartAppearance(part);
    switch (appearance) {
      case 'thin-mdf':
        return new THREE.MeshStandardMaterial({ color: this.colors.thinMdf, roughness: 0.9 });
      case 'hinge':
        return new THREE.MeshStandardMaterial({ color: this.colors.hinge, roughness: 0.2, metalness: 0.8 });
      case 'rail':
        return new THREE.MeshStandardMaterial({ color: this.colors.rail, roughness: 0.2, metalness: 0.8 });
      case 'piston-body':
        return new THREE.MeshStandardMaterial({ color: this.colors.pistonBody, roughness: 0.8, metalness: 0.2 });
      case 'piston-rod':
        return new THREE.MeshStandardMaterial({ color: this.colors.pistonRod, roughness: 0.1, metalness: 1 });
      case 'interior':
        return new THREE.MeshStandardMaterial({ color: interiorColor, roughness: 0.7, metalness: 0.05 });
      default:
        return new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.7, metalness: 0.05 });
    }
  }

  private createPiston(part: FurniturePart) {
    const config = part.pistonConfig;
    if (!config) return;

    const group = new THREE.Group();
    group.position.set(config.anchorMueble.x, config.anchorMueble.y, config.anchorMueble.z);

    const cylinderLength = config.lengthClosed * 0.6;
    const rodLength = config.lengthClosed * 0.4;

    const cylinderGeometry = new THREE.CylinderGeometry(5, 5, cylinderLength, 16);
    cylinderGeometry.rotateX(Math.PI / 2);
    cylinderGeometry.translate(0, 0, cylinderLength / 2);
    group.add(
      new THREE.Mesh(
        cylinderGeometry,
        new THREE.MeshStandardMaterial({ color: this.colors.pistonBody, roughness: 0.9 }),
      ),
    );

    const rodGeometry = new THREE.CylinderGeometry(3, 3, rodLength, 16);
    rodGeometry.rotateX(Math.PI / 2);
    rodGeometry.translate(0, 0, rodLength / 2);
    const rod = new THREE.Mesh(
      rodGeometry,
      new THREE.MeshStandardMaterial({ color: this.colors.pistonRod, roughness: 0.1, metalness: 1 }),
    );
    rod.name = 'rod';
    rod.position.z = cylinderLength;
    group.add(rod);

    group.userData.id = part.id;
    group.userData.groupId = part.groupId;
    group.userData.type = 'piston-body';
    group.userData.config = config;
    group.userData.originalPosition = group.position.clone();
    group.userData.explodeOffset = new THREE.Vector3();

    this.furnitureGroup.add(group);
    this.partsMap.set(part.id, group);
  }

  private decorateObject(object: THREE.Object3D, part: FurniturePart) {
    object.userData.type = part.type;
    object.userData.id = part.id;
    object.userData.groupId = part.groupId;
    object.userData.openingAngle = part.openingAngle;
    if (object.userData.originalPosition == null) {
      object.userData.originalPosition = new THREE.Vector3(part.x, part.y, part.z);
    }
    object.userData.explodeOffset = new THREE.Vector3();
  }

  private highlightObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      const materials = Array.isArray(material) ? material : [material];
      for (const candidate of materials) {
        if (!(candidate instanceof THREE.MeshStandardMaterial)) continue;
        const oldEmissive = candidate.emissive.getHex();
        const oldIntensity = candidate.emissiveIntensity;
        candidate.emissive.setHex(this.colors.highlight);
        candidate.emissiveIntensity = 0.4;
        window.setTimeout(() => {
          if (this.disposed) return;
          candidate.emissive.setHex(oldEmissive);
          candidate.emissiveIntensity = oldIntensity;
        }, 300);
      }
    });
  }

  private furnitureCenter() {
    const box = new THREE.Box3().setFromObject(this.furnitureGroup);
    const center = new THREE.Vector3();
    if (!box.isEmpty()) box.getCenter(center);
    return center;
  }

  private clearFurniture() {
    while (this.furnitureGroup.children.length > 0) {
      const child = this.furnitureGroup.children[0];
      this.furnitureGroup.remove(child);
      this.disposeObject(child);
    }
    this.partsMap.clear();
    this.itemStates.clear();
    this.animationOffsets.clear();
    this.drawerTravelByGroup.clear();
    this.onPartSelect?.(null);
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      const disposable = child as THREE.Mesh | THREE.LineSegments;
      if ('geometry' in disposable && disposable.geometry) disposable.geometry.dispose();
      if ('material' in disposable && disposable.material) {
        const materials = Array.isArray(disposable.material) ? disposable.material : [disposable.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private isDoor(part: FurniturePart) {
    return this.isDoorType(part.type);
  }

  private isDoorType(type: unknown): type is 'door-left' | 'door-right' | 'door-flip' {
    return type === 'door-left' || type === 'door-right' || type === 'door-flip';
  }
}
