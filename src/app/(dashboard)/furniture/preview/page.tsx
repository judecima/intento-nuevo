import { FurniturePreview } from '@/components/furniture';
import { PageHeader } from '@/components/ui/page-header';
import { generateFurniture } from '@/lib/furniture';

export default function FurniturePreviewPage() {
  const model = generateFurniture('cabinet_base_120_2p3c', {
    width: 1200,
    height: 870,
    depth: 600,
    thickness: 18,
    hasBack: true,
    hasShelf: true,
    hinges: {
      mounting: 'overlay',
      openingAngle: 110,
      softClose: true,
    },
  });

  return (
    <section className="page">
      <PageHeader
        eyebrow="Muebles a medida"
        title="Vista 3D · cabinet_base_120_2p3c"
        description="Smoke visual del modelo paramétrico único: la misma geometría alimenta el visor 3D, el despiece y la optimización."
      />

      <FurniturePreview model={model} color="roble_claro" />
    </section>
  );
}
