# Módulo de muebles paramétricos

Genera muebles a partir de medidas: piezas 3D para el visor, lista de corte con cantos y veta, herrajes contados y la entrada lista para el optimizador de intento-nuevo.

El motor geométrico no depende de Next, React ni three.js. En intento-nuevo vive en `src/lib/furniture` y el adapter usa el `OptimizationInput` canónico de `@/lib/optimizer`.

## Uso

```ts
import { generateFurniture, cutList, hardwareList, toOptimizationInputs } from '@/lib/furniture';

const bajo = generateFurniture('cabinet_base_120_2p3c', { width: 1200, height: 870, depth: 600, thickness: 18, hasBack: true, hasShelf: true });
const alacena = generateFurniture('cabinet_wall_120_3p', { width: 1200, height: 600, depth: 320, thickness: 18, hasBack: true, hasShelf: true });

cutList([bajo, alacena]);      // piezas agrupadas (material, medidas, cantos, veta)
hardwareList([bajo, alacena]); // herrajes totales por SKU
toOptimizationInputs([bajo, alacena], {
  materials: {
    body: { id: 'mel-18', description: 'Melamina 18', hasGrain: false, thickness: 18, board: { width: 2750, height: 1830 } },
    back: { id: 'mdf-5', description: 'MDF 5 mm', hasGrain: false, thickness: 5, board: { width: 2600, height: 1830 } },
  },
  kerf: 4.5, trim: { x: 10, y: 10 },
}); // un OptimizationInput por material real
```

`generateFurniture` lanza `FurnitureValidationError` (con `issues`) si las medidas están fuera de rango o si el modelo no pasa los chequeos geométricos.

Por defecto `backThickness` y `drawerBottomThickness` son **5 mm**. Ambos se pueden sobrescribir mediante `BuildConfig`. Si `back` y `drawerBottom` se asignan al mismo material físico, el adapter los agrupa en una sola optimización MDF 5 mm, separada de los tableros de 18 mm.

## Estructura

| Archivo | Qué hace |
|---|---|
| `core/types.ts` | Tipos. `FurniturePart` es compatible con el `Part` del visor. |
| `core/config.ts` | Reglas constructivas: luces, holgura de correderas (13 mm), largos comerciales de correderas, tipo de tapacanto, regla de bisagras, tornillos por unión. Se sobrescriben por maderera. |
| `core/builder.ts` | `panel()`: crea cada tablero desde su caja 3D y deriva el corte. El listado no puede contradecir al 3D. |
| `core/assemblies.ts` | Cuerpos, fondo, divisores, estantes, puertas y cajones. Toda la geometría constructiva vive acá. |
| `core/validate.ts` | Rangos de medidas y chequeos: superposiciones, corte vs 3D, veta, holgura de correderas, correderas contadas. |
| `core/bom.ts` | Lista de corte, herrajes y metros de tapacanto. |
| `templates/*.ts` | Las 21 plantillas, escritas solo con los conjuntos de `assemblies`. |
| `registry.ts` | Tipo → plantilla, con rangos de medidas admitidos. |
| `adapters/optimizer.ts` | Conversión a `OptimizationInput` del optimizador. |

## Convenciones

- **Veta:** `cutLargo` siempre sigue la veta. Al optimizador va como `width` (a lo largo de la placa). Si el material tiene veta y la pieza la necesita, `canRotate: false`.
- **Cantos:** `top`/`bottom` son los cantos paralelos al largo; `left`/`right`, los de los extremos. Es la convención de `edges`/`edgeTypes` del optimizador.
- **Medidas:** se entregan terminadas. Si el optimizador descuenta el espesor del canto grueso, lo hace a partir de `edgeTypes`.
- **Herrajes:** cada par de correderas se cuenta una vez (el riel derecho es solo visual, `qty: 0`).

## Bisagras

`params.hinges` (opcional; si se omite, usa `config.hinges`):

| Campo | Valores | Efecto |
|---|---|---|
| `mounting` | `overlay` (defecto) / `inset` | Superpuesta o embutida. Embutida cambia medidas de puertas y frentes de cajón, retira estantes y acorta cajones. |
| `openingAngle` | `95` / `110` (defecto) / `165` | Solo herraje y animación. Los ángulos ofrecidos se limitan con `config.hingeAngles`. |
| `softClose` | `true` (defecto) / `false` | Solo herraje. |

El tipo de bisagra de cada puerta se deduce: sobre lateral exterior → **recta**; sobre divisor compartido → **semicodo**; embutida → **codo**. El SKU queda como `hinge-35-{tipo}-{ángulo}[-sc]`. La alacena rebatible mantiene su bisagra propia y pistones.

Luces: superpuesta usa `gaps.outer` y `gaps.between`; embutida usa `gaps.inset` (2 mm) contra las caras interiores.

## Validación

```bash
npm run test:furniture
```

Cubre las 21 plantillas nominales y el sentinel `cabinet_base_120_2p3c`. Para exigir el camino V2/Auto/Rust, construir primero el addon Rust y ejecutar el test con `REQUIRE_RUST_PATTERN_GENERATOR=1`.

La validación es geométrica. Antes de vender una plantilla, fabricarla y armarla al menos una vez.
