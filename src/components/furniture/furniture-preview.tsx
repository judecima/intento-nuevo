'use client';

import { useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Stack,
  Typography,
} from '@mui/material';

import type { FurnitureModel } from '@/lib/furniture';
import type { FurnitureViewerColor } from '@/lib/furniture/three/viewer-theme';

import {
  FurnitureViewer,
  type FurnitureViewerHandle,
} from './furniture-viewer';

export interface FurniturePreviewProps {
  model: FurnitureModel;
  color?: FurnitureViewerColor;
  height?: number;
}

export function FurniturePreview({
  model,
  color = 'blanco',
  height = 560,
}: FurniturePreviewProps) {
  const viewerRef = useRef<FurnitureViewerHandle>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const selected = model.parts.find((part) => part.id === selectedPartId) ?? null;

  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <ButtonGroup size="small" variant="outlined">
          {model.hasDoors && (
            <>
              <Button onClick={() => viewerRef.current?.openDoors()}>Abrir puertas</Button>
              <Button onClick={() => viewerRef.current?.closeDoors()}>Cerrar puertas</Button>
            </>
          )}
          {model.hasDrawers && (
            <>
              <Button onClick={() => viewerRef.current?.openDrawers()}>Abrir cajones</Button>
              <Button onClick={() => viewerRef.current?.closeDrawers()}>Cerrar cajones</Button>
            </>
          )}
        </ButtonGroup>

        <ButtonGroup size="small" variant="outlined">
          <Button onClick={() => viewerRef.current?.explode()}>Explotar</Button>
          <Button onClick={() => viewerRef.current?.reset()}>Rearmar</Button>
          <Button onClick={() => viewerRef.current?.fitCamera()}>Centrar</Button>
        </ButtonGroup>
      </Stack>

      <Box
        sx={{
          height,
          minHeight: 420,
          overflow: 'hidden',
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'grey.100',
        }}
      >
        <FurnitureViewer
          ref={viewerRef}
          model={model}
          color={color}
          onPartSelect={setSelectedPartId}
        />
      </Box>

      {selected ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body2">Seleccionado: {selected.name}</Typography>
          {selected.material && <Chip size="small" label={selected.material} />}
          {!selected.isHardware && (
            <Chip
              size="small"
              variant="outlined"
              label={`${selected.cutLargo} × ${selected.cutAncho} × ${selected.cutEspesor} mm`}
            />
          )}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Hacé clic sobre una pieza para identificarla. Arrastrá para rotar y usá la rueda para acercar.
        </Typography>
      )}
    </Stack>
  );
}
