'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react';

import type { FurnitureModel } from '@/lib/furniture';
import { FurnitureSceneManager } from '@/lib/furniture/three/scene-manager';
import type { FurnitureViewerColor } from '@/lib/furniture/three/viewer-theme';

export interface FurnitureViewerHandle {
  openDoors: () => void;
  closeDoors: () => void;
  openDrawers: () => void;
  closeDrawers: () => void;
  explode: (factor?: number) => void;
  reset: () => void;
  fitCamera: () => void;
  getScreenshot: () => string;
}

export interface FurnitureViewerProps {
  model: FurnitureModel;
  color?: FurnitureViewerColor;
  className?: string;
  style?: CSSProperties;
  onPartSelect?: (partId: string | null) => void;
}

export const FurnitureViewer = forwardRef<FurnitureViewerHandle, FurnitureViewerProps>(
  function FurnitureViewer(
    {
      model,
      color = 'blanco',
      className,
      style,
      onPartSelect,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const managerRef = useRef<FurnitureSceneManager | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        openDoors: () => managerRef.current?.setDoors(true),
        closeDoors: () => managerRef.current?.setDoors(false),
        openDrawers: () => managerRef.current?.setDrawers(true),
        closeDrawers: () => managerRef.current?.setDrawers(false),
        explode: (factor = 1) => managerRef.current?.explodeView(factor),
        reset: () => managerRef.current?.resetAssembly(),
        fitCamera: () => managerRef.current?.fitCameraToFurniture(),
        getScreenshot: () => managerRef.current?.getScreenshot() ?? '',
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const manager = new FurnitureSceneManager(container, { onPartSelect });
      managerRef.current = manager;
      manager.buildFurniture(model.parts, color);

      return () => {
        manager.dispose();
        managerRef.current = null;
      };
    }, []);

    useEffect(() => {
      managerRef.current?.setOnPartSelect(onPartSelect);
    }, [onPartSelect]);

    useEffect(() => {
      managerRef.current?.buildFurniture(model.parts, color);
    }, [model, color]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 420,
          touchAction: 'none',
          ...style,
        }}
        aria-label="Vista 3D del mueble"
      />
    );
  },
);
