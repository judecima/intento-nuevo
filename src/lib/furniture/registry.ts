import type { TemplateSpec } from './core/types';
import { kitchenBase, kitchenCooktop, kitchenDrawers, kitchenWall } from './templates/kitchen';
import { bookshelf, closet, wallFlip } from './templates/storage';
import { desk, DESK_HEIGHT, RACK_HEIGHT, tvRack } from './templates/living';
import { catalog } from './templates/catalog';

const r = (min: number, max: number) => ({ min, max });
const fixed = (v: number) => ({ min: v, max: v });
const THICK = [15, 18, 25];

const BASE_H = r(700, 950);
const BASE_D = r(450, 650);
const WALL_H = r(300, 1000);
const WALL_D = r(250, 400);

export const TEMPLATES: Record<string, TemplateSpec> = {
  bajoMesada: { type: 'bajoMesada', label: 'Bajo mesada 2 puertas', ranges: { width: r(400, 1200), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: kitchenBase, summary: 'Bajo mesada con amarres para mesada y dos puertas.' },
  alacena: { type: 'alacena', label: 'Alacena 2 puertas', ranges: { width: r(400, 1200), height: WALL_H, depth: WALL_D }, thicknesses: THICK, build: kitchenWall, summary: 'Alacena con tapa y base, dos puertas.' },
  'bajomesada-cajonera': { type: 'bajomesada-cajonera', label: 'Cajonera bajo mesada', ranges: { width: r(300, 900), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: kitchenDrawers, summary: 'Cajonera de 3 cajones con correderas telescópicas.' },
  'porta-anafe': { type: 'porta-anafe', label: 'Porta anafe', ranges: { width: r(600, 1000), height: BASE_H, depth: r(500, 650) }, thicknesses: THICK, build: kitchenCooktop, summary: 'Módulo bajo anafe: frente fijo superior y dos puertas.' },
  placard: { type: 'placard', label: 'Placard', ranges: { width: r(800, 1800), height: r(1500, 2600), depth: r(450, 650) }, thicknesses: THICK, build: closet, summary: 'Placard con dos cajones inferiores, dos puertas y barral.' },
  biblioteca: { type: 'biblioteca', label: 'Biblioteca', ranges: { width: r(400, 1200), height: r(600, 2400), depth: r(200, 450) }, thicknesses: THICK, build: bookshelf, summary: 'Biblioteca con estantes fijos cada ~350 mm.' },
  alacenaFlip: { type: 'alacenaFlip', label: 'Alacena rebatible', ranges: { width: r(400, 1200), height: r(250, 450), depth: WALL_D }, thicknesses: THICK, build: wallFlip, summary: 'Alacena con puerta rebatible y pistón a gas.' },
  escritorio: { type: 'escritorio', label: 'Escritorio', ranges: { width: r(900, 1800), height: fixed(DESK_HEIGHT), depth: r(450, 800) }, thicknesses: THICK, build: desk, summary: 'Escritorio con cajonera de 3 cajones.' },
  rackTV: { type: 'rackTV', label: 'Rack TV', ranges: { width: r(900, 2200), height: fixed(RACK_HEIGHT), depth: r(350, 550) }, thicknesses: THICK, build: tvRack, summary: 'Rack de TV con dos cajones.' },

  cabinet_base_120_2p3c: { type: 'cabinet_base_120_2p3c', label: 'Bajo mesada 120 · 2 puertas + 3 cajones', ranges: { width: r(1000, 1300), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_base_120_2p3c'), summary: 'Catálogo: 2 puertas y cajonera de 400.' },
  cabinet_base_140_3p3c: { type: 'cabinet_base_140_3p3c', label: 'Bajo mesada 140 · 3 puertas + 3 cajones', ranges: { width: r(1300, 1600), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_base_140_3p3c'), summary: 'Catálogo: 3 puertas y cajonera de 400.' },
  cabinet_base_single_60_1p: { type: 'cabinet_base_single_60_1p', label: 'Bajo mesada 60 · 1 puerta', ranges: { width: r(300, 650), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_base_single_60_1p'), summary: 'Catálogo: una puerta.' },
  cabinet_base_double_80_2p: { type: 'cabinet_base_double_80_2p', label: 'Bajo mesada 80 · 2 puertas', ranges: { width: r(600, 1000), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_base_double_80_2p'), summary: 'Catálogo: dos puertas.' },
  cabinet_base_3p: { type: 'cabinet_base_3p', label: 'Bajo mesada 3 puertas', ranges: { width: r(1000, 1500), height: BASE_H, depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_base_3p'), summary: 'Catálogo: tres puertas con divisor.' },
  cabinet_wall_60_1p: { type: 'cabinet_wall_60_1p', label: 'Alacena 60 · 1 puerta', ranges: { width: r(300, 650), height: WALL_H, depth: WALL_D }, thicknesses: THICK, build: catalog('cabinet_wall_60_1p'), summary: 'Catálogo: alacena de una puerta.' },
  cabinet_wall_120_3p: { type: 'cabinet_wall_120_3p', label: 'Alacena 120 · 3 puertas', ranges: { width: r(1000, 1300), height: WALL_H, depth: WALL_D }, thicknesses: THICK, build: catalog('cabinet_wall_120_3p'), summary: 'Catálogo: alacena de tres puertas.' },
  cabinet_wall_140_3p: { type: 'cabinet_wall_140_3p', label: 'Alacena 140 · 3 puertas', ranges: { width: r(1300, 1600), height: WALL_H, depth: WALL_D }, thicknesses: THICK, build: catalog('cabinet_wall_140_3p'), summary: 'Catálogo: alacena de tres puertas.' },
  cabinet_wall_3p: { type: 'cabinet_wall_3p', label: 'Alacena 3 puertas', ranges: { width: r(1000, 1500), height: WALL_H, depth: WALL_D }, thicknesses: THICK, build: catalog('cabinet_wall_3p'), summary: 'Catálogo: alacena de tres puertas.' },
  cabinet_hood_60: { type: 'cabinet_hood_60', label: 'Alacena campana', ranges: { width: r(500, 900), height: r(250, 600), depth: WALL_D }, thicknesses: THICK, build: catalog('cabinet_hood_60'), summary: 'Catálogo: módulo para campana.' },
  cabinet_pantry_60_2p: { type: 'cabinet_pantry_60_2p', label: 'Despensero 60', ranges: { width: r(400, 650), height: r(1800, 2400), depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_pantry_60_2p'), summary: 'Catálogo: torre despensero con 4 estantes.' },
  cabinet_microwave_60: { type: 'cabinet_microwave_60', label: 'Torre horno/microondas 60', ranges: { width: r(560, 650), height: r(1800, 2400), depth: BASE_D }, thicknesses: THICK, build: catalog('cabinet_microwave_60'), summary: 'Catálogo: torre con nicho de 450 mm.' },
};

export const TEMPLATE_TYPES = Object.keys(TEMPLATES);
